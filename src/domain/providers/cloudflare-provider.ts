import { parseDomainName } from "../normalize";
import { isRestrictedExtension } from "../tlds";
import type { DomainAvailabilityProvider, DomainCheckResult } from "../types";
import {
  buildAvailabilityResult,
  normalizeTld,
  runBulkLimited,
} from "./provider-utils";

const CLOUDFLARE_BATCH_LIMIT = 20;

type EnvReader = (name: string) => string | undefined;

type CloudflareProviderOptions = {
  fetcher?: typeof fetch;
  env?: EnvReader;
};

type CloudflareDomainResult = {
  name?: string;
  registrable?: boolean;
  reason?: string;
  tier?: string;
  pricing?: {
    currency?: string;
    registration_cost?: string;
    renewal_cost?: string;
  };
};

type CloudflareResponse = {
  success?: boolean;
  errors?: Array<{ code?: number | string; message?: string }>;
  result?: {
    domains?: CloudflareDomainResult[];
  };
};

function defaultEnv(name: string) {
  return process.env[name]?.trim();
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function registrarUrl(domain: string) {
  return `https://domains.cloudflare.com/?domain=${encodeURIComponent(domain)}`;
}

function cloudflareErrorSummary(body: CloudflareResponse) {
  return body.errors?.map((error) => error.message || error.code).filter(Boolean).join("; ");
}

export class CloudflareAvailabilityProvider implements DomainAvailabilityProvider {
  name = "CloudflareAvailabilityProvider";

  private readonly fetcher: typeof fetch;
  private readonly env: EnvReader;

  constructor(options: CloudflareProviderOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.env = options.env ?? defaultEnv;
  }

  supportsTld(tld: string) {
    return this.isConfigured() && normalizeTld(tld).length > 0 && !isRestrictedExtension(tld);
  }

  async check(domain: string): Promise<DomainCheckResult> {
    return (await this.checkBulk([domain]))[0];
  }

  async checkBulk(domains: string[]): Promise<DomainCheckResult[]> {
    if (!this.isConfigured()) {
      return runBulkLimited(domains, async (domain) => this.notConfiguredResult(domain));
    }

    const results: DomainCheckResult[] = [];

    for (let index = 0; index < domains.length; index += CLOUDFLARE_BATCH_LIMIT) {
      const batch = domains.slice(index, index + CLOUDFLARE_BATCH_LIMIT);
      results.push(...(await this.checkBatch(batch)));
    }

    return results;
  }

  isConfigured() {
    return Boolean(this.env("CLOUDFLARE_ACCOUNT_ID") && this.env("CLOUDFLARE_API_TOKEN"));
  }

  private async checkBatch(domains: string[]): Promise<DomainCheckResult[]> {
    const validDomains = domains.map((domain) => parseDomainName(domain));
    const invalidResults = new Map<string, DomainCheckResult>();
    const requestDomains: string[] = [];

    for (const parts of validDomains) {
      if (!parts.valid) {
        invalidResults.set(
          parts.domain || parts.sld,
          buildAvailabilityResult({
            domain: parts.domain || parts.sld,
            status: "invalid",
            confidence: "high",
            source: "registrar_api",
            providerName: this.name,
            premium: false,
          }),
        );
      } else if (isRestrictedExtension(parts.tld)) {
        invalidResults.set(
          parts.domain,
          buildAvailabilityResult({
            domain: parts.domain,
            status: "restricted",
            confidence: "high",
            source: "registrar_api",
            providerName: this.name,
            premium: false,
            rawSummary:
              "Restricted extension; registrar availability cannot bypass eligibility validation.",
            errorCode: "RESTRICTED_TLD",
          }),
        );
      } else {
        requestDomains.push(parts.domain);
      }
    }

    if (requestDomains.length === 0) {
      return domains.map((domain) => {
        const parts = parseDomainName(domain);
        return invalidResults.get(parts.domain || parts.sld) ?? this.unknownResult(domain);
      });
    }

    const accountId = this.env("CLOUDFLARE_ACCOUNT_ID") ?? "";
    const baseUrl =
      this.env("CLOUDFLARE_API_BASE_URL") ?? "https://api.cloudflare.com/client/v4";
    const endpoint = `${baseUrl.replace(/\/+$/, "")}/accounts/${encodeURIComponent(
      accountId,
    )}/registrar/domain-check`;

    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.env("CLOUDFLARE_API_TOKEN") ?? ""}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ domains: requestDomains }),
      });

      if (response.status === 429) {
        return domains.map((domain) =>
          buildAvailabilityResult({
            domain,
            status: "rate_limited",
            confidence: "high",
            source: "registrar_api",
            providerName: this.name,
            premium: false,
            rawSummary: "Cloudflare Registrar API returned HTTP 429.",
            errorCode: "CLOUDFLARE_RATE_LIMITED",
            errorMessage: "Cloudflare rate limited the lookup.",
          }),
        );
      }

      let body: CloudflareResponse = {};

      try {
        body = (await response.json()) as CloudflareResponse;
      } catch {
        body = {};
      }

      if (!response.ok || body.success === false) {
        const summary = cloudflareErrorSummary(body);

        return domains.map((domain) =>
          buildAvailabilityResult({
            domain,
            status: "unknown",
            confidence: "low",
            source: "registrar_api",
            providerName: this.name,
            premium: false,
            rawSummary:
              summary || `Cloudflare Registrar API returned HTTP ${response.status}.`,
            errorCode: "CLOUDFLARE_HTTP_ERROR",
            errorMessage:
              summary || `Cloudflare Registrar API returned HTTP ${response.status}.`,
          }),
        );
      }

      const byDomain = new Map(
        (body.result?.domains ?? [])
          .filter((item): item is CloudflareDomainResult & { name: string } =>
            Boolean(item.name),
          )
          .map((item) => [item.name.toLowerCase(), item]),
      );

      return domains.map((domain) => {
        const parts = parseDomainName(domain);
        const invalid = invalidResults.get(parts.domain || parts.sld);

        if (invalid) {
          return invalid;
        }

        const item = byDomain.get(parts.domain);
        return item ? this.resultFromItem(parts.domain, item) : this.emptyResult(parts.domain);
      });
    } catch (error) {
      return domains.map((domain) =>
        buildAvailabilityResult({
          domain,
          status: "unknown",
          confidence: "low",
          source: "registrar_api",
          providerName: this.name,
          premium: false,
          rawSummary:
            error instanceof Error
              ? `Cloudflare lookup failed: ${error.message}`
              : "Cloudflare lookup failed for an unknown reason.",
          errorCode: "CLOUDFLARE_LOOKUP_FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Unknown Cloudflare lookup failure.",
        }),
      );
    }
  }

  private resultFromItem(domain: string, item: CloudflareDomainResult) {
    const pricing = item.pricing;
    const registration = toNumber(pricing?.registration_cost);
    const renewal = toNumber(pricing?.renewal_cost);
    const premium = item.tier === "premium" || item.reason === "domain_premium";

    if (item.registrable) {
      return buildAvailabilityResult({
        domain,
        status: premium ? "premium_available" : "available_confirmed",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium,
        priceRegistration: registration,
        priceRenewal: renewal,
        currency: pricing?.currency,
        registrarUrl: registrarUrl(domain),
        rawSummary: premium
          ? "Cloudflare Registrar API reports the domain as premium registrable."
          : "Cloudflare Registrar API reports real-time standard availability.",
      });
    }

    if (item.reason === "domain_unavailable") {
      return buildAvailabilityResult({
        domain,
        status: "taken_confirmed",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        registrarUrl: registrarUrl(domain),
        rawSummary:
          "Cloudflare Registrar API reports the domain is already registered, reserved, or otherwise unavailable.",
        errorCode: "CLOUDFLARE_DOMAIN_UNAVAILABLE",
      });
    }

    if (item.reason === "domain_premium") {
      return buildAvailabilityResult({
        domain,
        status: "premium_available",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: true,
        registrarUrl: registrarUrl(domain),
        rawSummary:
          "Cloudflare reports a premium domain, but premium registration is not supported by its API.",
        errorCode: "CLOUDFLARE_DOMAIN_PREMIUM",
      });
    }

    if (item.reason === "extension_disallows_registration") {
      return buildAvailabilityResult({
        domain,
        status: "restricted",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary:
          "Cloudflare reports this extension currently disallows new registrations.",
        errorCode: "CLOUDFLARE_EXTENSION_DISALLOWS_REGISTRATION",
      });
    }

    if (
      item.reason === "extension_not_supported" ||
      item.reason === "extension_not_supported_via_api"
    ) {
      return buildAvailabilityResult({
        domain,
        status: "manual_check_required",
        confidence: "medium",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary:
          "Cloudflare Registrar API does not support automated checks for this extension.",
        errorCode: "CLOUDFLARE_EXTENSION_UNSUPPORTED",
        errorMessage: item.reason,
      });
    }

    return buildAvailabilityResult({
      domain,
      status: "unknown",
      confidence: "low",
      source: "registrar_api",
      providerName: this.name,
      premium: false,
      rawSummary:
        item.reason ? `Cloudflare returned ${item.reason}.` : "Cloudflare response was inconclusive.",
      errorCode: "CLOUDFLARE_INCONCLUSIVE",
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
      rawSummary: "Cloudflare Registrar credentials are not configured.",
      errorCode: "CLOUDFLARE_NOT_CONFIGURED",
      errorMessage:
        "Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to enable Cloudflare checks.",
    });
  }

  private emptyResult(domain: string) {
    return buildAvailabilityResult({
      domain,
      status: "unknown",
      confidence: "low",
      source: "registrar_api",
      providerName: this.name,
      premium: false,
      rawSummary: "Cloudflare response did not include this domain.",
      errorCode: "CLOUDFLARE_EMPTY_RESULT",
    });
  }

  private unknownResult(domain: string) {
    return buildAvailabilityResult({
      domain,
      status: "unknown",
      confidence: "low",
      source: "registrar_api",
      providerName: this.name,
      premium: false,
      rawSummary: "Cloudflare lookup was inconclusive.",
      errorCode: "CLOUDFLARE_INCONCLUSIVE",
    });
  }
}

export const cloudflareProvider = new CloudflareAvailabilityProvider();
