import { XMLParser } from "fast-xml-parser";
import { parseDomainName } from "../normalize";
import { isRestrictedExtension } from "../tlds";
import type { DomainAvailabilityProvider } from "../types";
import {
  buildAvailabilityResult,
  normalizeTld,
  runBulkLimited,
} from "./provider-utils";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
});

type EnvReader = (name: string) => string | undefined;

type NamecheapProviderOptions = {
  fetcher?: typeof fetch;
  env?: EnvReader;
};

function defaultEnv(name: string) {
  return process.env[name]?.trim();
}

function isTrue(value: unknown) {
  return value === true || value === "true" || value === "True" || value === "TRUE";
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractDomainCheckResults(parsed: unknown) {
  const apiResponse = parsed as {
    ApiResponse?: {
      Errors?: {
        Error?: unknown;
      };
      CommandResponse?: {
        DomainCheckResult?: unknown;
      };
    };
  };

  const error = apiResponse.ApiResponse?.Errors?.Error;

  if (error) {
    const message =
      typeof error === "object" && error !== null && "#text" in error
        ? String((error as { "#text": unknown })["#text"])
        : String(error);
    throw new Error(message);
  }

  const checkResult = apiResponse.ApiResponse?.CommandResponse?.DomainCheckResult;

  if (Array.isArray(checkResult)) {
    return checkResult as Record<string, unknown>[];
  }

  return checkResult ? [checkResult as Record<string, unknown>] : [];
}

export class NamecheapAvailabilityProvider implements DomainAvailabilityProvider {
  name = "NamecheapAvailabilityProvider";

  private readonly fetcher: typeof fetch;
  private readonly env: EnvReader;

  constructor(options: NamecheapProviderOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.env = options.env ?? defaultEnv;
  }

  supportsTld(tld: string) {
    return this.isConfigured() && normalizeTld(tld).length > 0 && !isRestrictedExtension(tld);
  }

  async check(domain: string) {
    const parts = parseDomainName(domain);

    if (!parts.valid) {
      return buildAvailabilityResult({
        domain,
        status: "invalid",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
      });
    }

    if (!this.isConfigured()) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "manual_check_required",
        confidence: "medium",
        source: "manual",
        providerName: this.name,
        premium: false,
        rawSummary: "Namecheap credentials are not configured.",
        errorCode: "NAMECHEAP_NOT_CONFIGURED",
        errorMessage:
          "Set NAMECHEAP_API_USER, NAMECHEAP_API_KEY, NAMECHEAP_USERNAME, and NAMECHEAP_CLIENT_IP to enable registrar API checks.",
      });
    }

    if (isRestrictedExtension(parts.tld)) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "restricted",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary:
          "Restricted extension; registrar API availability cannot bypass eligibility validation.",
        errorCode: "RESTRICTED_TLD",
      });
    }

    const endpoint =
      this.env("NAMECHEAP_API_BASE_URL") ??
      (process.env.NODE_ENV === "production"
        ? "https://api.namecheap.com/xml.response"
        : "https://api.sandbox.namecheap.com/xml.response");
    const params = new URLSearchParams({
      ApiUser: this.env("NAMECHEAP_API_USER") ?? "",
      ApiKey: this.env("NAMECHEAP_API_KEY") ?? "",
      UserName: this.env("NAMECHEAP_USERNAME") ?? "",
      ClientIp: this.env("NAMECHEAP_CLIENT_IP") ?? "",
      Command: "namecheap.domains.check",
      DomainList: parts.domain,
    });

    try {
      const response = await this.fetcher(`${endpoint}?${params.toString()}`);

      if (response.status === 429) {
        return buildAvailabilityResult({
          domain: parts.domain,
          status: "rate_limited",
          confidence: "high",
          source: "registrar_api",
          providerName: this.name,
          premium: false,
          rawSummary: "Namecheap API returned HTTP 429.",
          errorCode: "NAMECHEAP_RATE_LIMITED",
          errorMessage: "Namecheap API rate limited the lookup.",
        });
      }

      if (!response.ok) {
        return buildAvailabilityResult({
          domain: parts.domain,
          status: "unknown",
          confidence: "low",
          source: "registrar_api",
          providerName: this.name,
          premium: false,
          rawSummary: `Namecheap API returned HTTP ${response.status}.`,
          errorCode: "NAMECHEAP_HTTP_ERROR",
          errorMessage: `Namecheap API returned HTTP ${response.status}.`,
        });
      }

      const xml = await response.text();
      const parsed = parser.parse(xml);
      const results = extractDomainCheckResults(parsed);
      const item = results.find(
        (candidate) =>
          String(candidate.Domain ?? "").toLowerCase() === parts.domain,
      ) ?? results[0];

      if (!item) {
        return buildAvailabilityResult({
          domain: parts.domain,
          status: "unknown",
          confidence: "low",
          source: "registrar_api",
          providerName: this.name,
          premium: false,
          rawSummary: "Namecheap API response did not contain DomainCheckResult.",
          errorCode: "NAMECHEAP_EMPTY_RESULT",
          errorMessage: "Missing DomainCheckResult in Namecheap response.",
        });
      }

      const available = isTrue(item.Available);
      const premium = isTrue(item.IsPremiumName);
      const premiumRegistration = toNumber(item.PremiumRegistrationPrice);
      const premiumRenewal = toNumber(item.PremiumRenewalPrice);
      const standardPrice = toNumber(item.RegistrationPrice);
      const renewalPrice = toNumber(item.RenewalPrice);

      if (premium && available) {
        return buildAvailabilityResult({
          domain: parts.domain,
          status: "premium_available",
          confidence: "high",
          source: "registrar_api",
          providerName: this.name,
          premium: true,
          priceRegistration: premiumRegistration ?? standardPrice,
          priceRenewal: premiumRenewal ?? renewalPrice,
          currency: "USD",
          rawSummary: "Namecheap domains.check reports premium availability.",
        });
      }

      return buildAvailabilityResult({
        domain: parts.domain,
        status: available ? "available_confirmed" : "taken_confirmed",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        priceRegistration: available ? standardPrice : undefined,
        priceRenewal: available ? renewalPrice : undefined,
        currency: available && (standardPrice || renewalPrice) ? "USD" : undefined,
        rawSummary: available
          ? "Namecheap domains.check reports standard availability."
          : "Namecheap domains.check reports the domain is not available.",
      });
    } catch (error) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "unknown",
        confidence: "low",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary:
          error instanceof Error
            ? `Namecheap lookup failed: ${error.message}`
            : "Namecheap lookup failed for an unknown reason.",
        errorCode: "NAMECHEAP_LOOKUP_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Unknown Namecheap lookup failure.",
      });
    }
  }

  async checkBulk(domains: string[]) {
    if (!this.isConfigured()) {
      return runBulkLimited(domains, (domain) => this.check(domain));
    }

    return runBulkLimited(domains, (domain) => this.check(domain));
  }

  isConfigured() {
    return Boolean(
      this.env("NAMECHEAP_API_USER") &&
        this.env("NAMECHEAP_API_KEY") &&
        this.env("NAMECHEAP_USERNAME") &&
        this.env("NAMECHEAP_CLIENT_IP"),
    );
  }
}

export const namecheapProvider = new NamecheapAvailabilityProvider();
