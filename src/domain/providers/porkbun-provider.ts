import { parseDomainName } from "../normalize";
import { isRestrictedExtension } from "../tlds";
import type { DomainAvailabilityProvider } from "../types";
import {
  buildAvailabilityResult,
  normalizeTld,
  runBulkLimited,
} from "./provider-utils";

type EnvReader = (name: string) => string | undefined;

type PorkbunProviderOptions = {
  fetcher?: typeof fetch;
  env?: EnvReader;
};

type PorkbunCheckResponse = {
  status?: string;
  message?: string;
  code?: string;
  ttlRemaining?: number;
  response?: {
    avail?: string;
    price?: string;
    regularPrice?: string;
    premium?: string;
    additional?: {
      renewal?: {
        price?: string;
        regularPrice?: string;
      };
    };
  };
};

function defaultEnv(name: string) {
  return process.env[name]?.trim();
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isYes(value: unknown) {
  return String(value ?? "").toLowerCase() === "yes";
}

function registrarUrl(domain: string) {
  return `https://porkbun.com/checkout/search?q=${encodeURIComponent(domain)}`;
}

export class PorkbunAvailabilityProvider implements DomainAvailabilityProvider {
  name = "PorkbunAvailabilityProvider";

  private readonly fetcher: typeof fetch;
  private readonly env: EnvReader;

  constructor(options: PorkbunProviderOptions = {}) {
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
      return this.notConfiguredResult(parts.domain);
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
          "Restricted extension; registrar availability cannot bypass eligibility validation.",
        errorCode: "RESTRICTED_TLD",
      });
    }

    const endpoint = `${this.apiBaseUrl()}/domain/checkDomain/${encodeURIComponent(parts.domain)}`;

    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          apikey: this.env("PORKBUN_API_KEY") ?? "",
          secretapikey: this.env("PORKBUN_SECRET_API_KEY") ?? "",
        }),
      });

      let body: PorkbunCheckResponse = {};

      try {
        body = (await response.json()) as PorkbunCheckResponse;
      } catch {
        body = {};
      }

      if (response.status === 429 || body.code === "RATE_LIMIT_EXCEEDED") {
        return buildAvailabilityResult({
          domain: parts.domain,
          status: "rate_limited",
          confidence: "high",
          source: "registrar_api",
          providerName: this.name,
          premium: false,
          rawSummary: body.message || "Porkbun API rate limited the lookup.",
          errorCode: "PORKBUN_RATE_LIMITED",
          errorMessage: body.ttlRemaining
            ? `Retry after about ${body.ttlRemaining} seconds.`
            : body.message,
        });
      }

      if (!response.ok || body.status === "ERROR") {
        return this.errorResult(parts.domain, response.status, body);
      }

      return this.resultFromBody(parts.domain, body);
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
            ? `Porkbun lookup failed: ${error.message}`
            : "Porkbun lookup failed for an unknown reason.",
        errorCode: "PORKBUN_LOOKUP_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Unknown Porkbun lookup failure.",
      });
    }
  }

  async checkBulk(domains: string[]) {
    const concurrency = Math.max(
      1,
      Math.min(4, Number(this.env("PORKBUN_CHECK_CONCURRENCY") ?? 1) || 1),
    );

    return runBulkLimited(domains, (domain) => this.check(domain), concurrency);
  }

  isConfigured() {
    return Boolean(this.env("PORKBUN_API_KEY") && this.env("PORKBUN_SECRET_API_KEY"));
  }

  private apiBaseUrl() {
    return (
      this.env("PORKBUN_API_BASE_URL") ?? "https://api.porkbun.com/api/json/v3"
    ).replace(/\/+$/, "");
  }

  private resultFromBody(domain: string, body: PorkbunCheckResponse) {
    const response = body.response;

    if (!response) {
      return buildAvailabilityResult({
        domain,
        status: "unknown",
        confidence: "low",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary: "Porkbun response did not include a response object.",
        errorCode: "PORKBUN_EMPTY_RESULT",
      });
    }

    const premium = isYes(response.premium);
    const price = toNumber(response.price ?? response.regularPrice);
    const renewal = toNumber(
      response.additional?.renewal?.price ?? response.additional?.renewal?.regularPrice,
    );

    if (isYes(response.avail)) {
      return buildAvailabilityResult({
        domain,
        status: premium ? "premium_available" : "available_confirmed",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium,
        priceRegistration: price,
        priceRenewal: renewal,
        currency: price || renewal ? "USD" : undefined,
        registrarUrl: registrarUrl(domain),
        rawSummary: premium
          ? "Porkbun reports the domain is available as a premium name."
          : "Porkbun reports the domain is available for registration.",
      });
    }

    if (response.avail === "no") {
      return buildAvailabilityResult({
        domain,
        status: "taken_confirmed",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        registrarUrl: registrarUrl(domain),
        rawSummary: "Porkbun reports the domain is not available for registration.",
        errorCode: "PORKBUN_DOMAIN_UNAVAILABLE",
      });
    }

    return buildAvailabilityResult({
      domain,
      status: "unknown",
      confidence: "low",
      source: "registrar_api",
      providerName: this.name,
      premium: false,
      rawSummary: "Porkbun response did not include a recognizable availability value.",
      errorCode: "PORKBUN_INCONCLUSIVE",
    });
  }

  private errorResult(domain: string, status: number, body: PorkbunCheckResponse) {
    if (body.code === "INVALID_DOMAIN") {
      return buildAvailabilityResult({
        domain,
        status: "invalid",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary: body.message || "Porkbun rejected the domain as invalid.",
        errorCode: "PORKBUN_INVALID_DOMAIN",
        errorMessage: body.message,
      });
    }

    if (body.code === "DOMAIN_NOT_AVAILABLE") {
      return buildAvailabilityResult({
        domain,
        status: "taken_confirmed",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary: body.message || "Porkbun reports the domain is not available.",
        errorCode: "PORKBUN_DOMAIN_UNAVAILABLE",
        errorMessage: body.message,
      });
    }

    return buildAvailabilityResult({
      domain,
      status: status === 403 ? "manual_check_required" : "unknown",
      confidence: status === 403 ? "medium" : "low",
      source: "registrar_api",
      providerName: this.name,
      premium: false,
      rawSummary: body.message || `Porkbun API returned HTTP ${status}.`,
      errorCode: body.code || "PORKBUN_HTTP_ERROR",
      errorMessage: body.message,
    });
  }

  private notConfiguredResult(domain: string) {
    return buildAvailabilityResult({
      domain,
      status: "manual_check_required",
      confidence: "medium",
      source: "manual",
      providerName: this.name,
      premium: false,
      rawSummary: "Porkbun API credentials are not configured.",
      errorCode: "PORKBUN_NOT_CONFIGURED",
      errorMessage:
        "Set PORKBUN_API_KEY and PORKBUN_SECRET_API_KEY to enable Porkbun checks.",
    });
  }
}

export const porkbunProvider = new PorkbunAvailabilityProvider();
