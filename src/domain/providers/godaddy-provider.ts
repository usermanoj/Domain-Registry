import { parseDomainName } from "../normalize";
import { isRestrictedExtension } from "../tlds";
import type { DomainAvailabilityProvider, DomainCheckResult } from "../types";
import {
  buildAvailabilityResult,
  normalizeTld,
  runBulkLimited,
} from "./provider-utils";

const GODADDY_BULK_LIMIT = 500;

type EnvReader = (name: string) => string | undefined;

type GoDaddyProviderOptions = {
  fetcher?: typeof fetch;
  env?: EnvReader;
};

type GoDaddyAvailabilityItem = {
  domain?: string;
  available?: boolean;
  definitive?: boolean;
  price?: number;
  currency?: string;
  period?: number;
};

type GoDaddyAvailabilityError = {
  domain?: string;
  code?: string;
  message?: string;
  status?: number;
};

type GoDaddyBulkResponse = {
  domains?: GoDaddyAvailabilityItem[];
  errors?: GoDaddyAvailabilityError[];
};

function defaultEnv(name: string) {
  return process.env[name]?.trim();
}

function moneyFromMicroUnits(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed / 1_000_000 : undefined;
}

function isTrue(value: unknown) {
  return value === true || value === "true" || value === "TRUE";
}

function registrarUrl(domain: string) {
  return `https://www.godaddy.com/domainsearch/find?domainToCheck=${encodeURIComponent(domain)}`;
}

export class GoDaddyAvailabilityProvider implements DomainAvailabilityProvider {
  name = "GoDaddyAvailabilityProvider";

  private readonly fetcher: typeof fetch;
  private readonly env: EnvReader;

  constructor(options: GoDaddyProviderOptions = {}) {
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

    for (let index = 0; index < domains.length; index += GODADDY_BULK_LIMIT) {
      const batch = domains.slice(index, index + GODADDY_BULK_LIMIT);
      results.push(...(await this.checkBatch(batch)));
    }

    return results;
  }

  isConfigured() {
    return Boolean(this.env("GODADDY_API_KEY") && this.env("GODADDY_API_SECRET"));
  }

  private async checkBatch(domains: string[]): Promise<DomainCheckResult[]> {
    const partsByDomain = new Map(
      domains.map((domain) => {
        const parts = parseDomainName(domain);
        return [parts.domain || domain.toLowerCase(), parts] as const;
      }),
    );
    const requestDomains = domains
      .map((domain) => parseDomainName(domain))
      .filter((parts) => parts.valid && !isRestrictedExtension(parts.tld))
      .map((parts) => parts.domain);
    const preResults = new Map<string, DomainCheckResult>();

    for (const domain of domains) {
      const parts = parseDomainName(domain);

      if (!parts.valid) {
        preResults.set(
          parts.domain || domain.toLowerCase(),
          buildAvailabilityResult({
            domain,
            status: "invalid",
            confidence: "high",
            source: "registrar_api",
            providerName: this.name,
            premium: false,
          }),
        );
      } else if (isRestrictedExtension(parts.tld)) {
        preResults.set(
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
      }
    }

    if (requestDomains.length === 0) {
      return domains.map((domain) => {
        const key = parseDomainName(domain).domain || domain.toLowerCase();
        return preResults.get(key) ?? this.unknownResult(domain);
      });
    }

    const baseUrl = this.apiBaseUrl();
    const endpoint = new URL(`${baseUrl}/v1/domains/available`);
    endpoint.searchParams.set("checkType", this.env("GODADDY_CHECK_TYPE") ?? "FULL");

    try {
      const response = await this.fetcher(endpoint, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: `sso-key ${this.env("GODADDY_API_KEY") ?? ""}:${
            this.env("GODADDY_API_SECRET") ?? ""
          }`,
          "content-type": "application/json",
        },
        body: JSON.stringify(requestDomains),
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
            rawSummary: "GoDaddy Domains API returned HTTP 429.",
            errorCode: "GODADDY_RATE_LIMITED",
            errorMessage: "GoDaddy rate limited the lookup.",
          }),
        );
      }

      let body: GoDaddyBulkResponse | GoDaddyAvailabilityItem | GoDaddyAvailabilityError = {};

      try {
        body = (await response.json()) as GoDaddyBulkResponse;
      } catch {
        body = {};
      }

      if (!response.ok && response.status !== 203) {
        return domains.map((domain) =>
          this.errorResult(domain, response.status, body as GoDaddyAvailabilityError),
        );
      }

      const responseItems = Array.isArray((body as GoDaddyBulkResponse).domains)
        ? (body as GoDaddyBulkResponse).domains ?? []
        : [body as GoDaddyAvailabilityItem];
      const responseErrors = (body as GoDaddyBulkResponse).errors ?? [];
      const itemByDomain = new Map(
        responseItems
          .filter((item): item is GoDaddyAvailabilityItem & { domain: string } =>
            Boolean(item.domain),
          )
          .map((item) => [item.domain.toLowerCase(), item]),
      );
      const errorByDomain = new Map(
        responseErrors
          .filter((item): item is GoDaddyAvailabilityError & { domain: string } =>
            Boolean(item.domain),
          )
          .map((item) => [item.domain.toLowerCase(), item]),
      );

      return domains.map((domain) => {
        const parts = partsByDomain.get(parseDomainName(domain).domain || domain.toLowerCase());
        const key = parts?.domain || domain.toLowerCase();
        const preResult = preResults.get(key);

        if (preResult) {
          return preResult;
        }

        const item = itemByDomain.get(key);

        if (item) {
          return this.resultFromItem(key, item);
        }

        const itemError = errorByDomain.get(key);
        return itemError
          ? this.errorResult(key, itemError.status ?? response.status, itemError)
          : this.emptyResult(key);
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
              ? `GoDaddy lookup failed: ${error.message}`
              : "GoDaddy lookup failed for an unknown reason.",
          errorCode: "GODADDY_LOOKUP_FAILED",
          errorMessage:
            error instanceof Error ? error.message : "Unknown GoDaddy lookup failure.",
        }),
      );
    }
  }

  private apiBaseUrl() {
    const explicit = this.env("GODADDY_API_BASE_URL");

    if (explicit) {
      return explicit.replace(/\/+$/, "");
    }

    return isTrue(this.env("GODADDY_USE_OTE"))
      ? "https://api.ote-godaddy.com"
      : "https://api.godaddy.com";
  }

  private resultFromItem(domain: string, item: GoDaddyAvailabilityItem) {
    if (item.available && item.definitive) {
      return buildAvailabilityResult({
        domain,
        status: "available_confirmed",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        priceRegistration: moneyFromMicroUnits(item.price),
        currency: item.currency,
        registrarUrl: registrarUrl(domain),
        rawSummary:
          "GoDaddy Domains API reports the domain is available and definitively verified.",
      });
    }

    if (item.available) {
      return buildAvailabilityResult({
        domain,
        status: "manual_check_required",
        confidence: "medium",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        priceRegistration: moneyFromMicroUnits(item.price),
        currency: item.currency,
        registrarUrl: registrarUrl(domain),
        rawSummary:
          "GoDaddy reports availability, but the response was not definitively verified with the registry.",
        errorCode: "GODADDY_NON_DEFINITIVE_AVAILABLE",
        errorMessage: "Open registrar checkout before treating this as available.",
      });
    }

    return buildAvailabilityResult({
      domain,
      status: "taken_confirmed",
      confidence: item.definitive ? "high" : "medium",
      source: "registrar_api",
      providerName: this.name,
      premium: false,
      registrarUrl: registrarUrl(domain),
      rawSummary: item.definitive
        ? "GoDaddy Domains API reports the domain is not available."
        : "GoDaddy reports the domain is not available, without definitive registry verification.",
      errorCode: item.definitive ? "GODADDY_DOMAIN_UNAVAILABLE" : "GODADDY_NON_DEFINITIVE_TAKEN",
    });
  }

  private errorResult(domain: string, status: number, error: GoDaddyAvailabilityError) {
    if (status === 429) {
      return buildAvailabilityResult({
        domain,
        status: "rate_limited",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary: error.message || "GoDaddy rate limited the lookup.",
        errorCode: error.code || "GODADDY_RATE_LIMITED",
        errorMessage: error.message,
      });
    }

    if (status === 422) {
      return buildAvailabilityResult({
        domain,
        status: "manual_check_required",
        confidence: "medium",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary: error.message || "GoDaddy could not process this domain.",
        errorCode: error.code || "GODADDY_UNPROCESSABLE_DOMAIN",
        errorMessage: error.message,
      });
    }

    return buildAvailabilityResult({
      domain,
      status: "unknown",
      confidence: "low",
      source: "registrar_api",
      providerName: this.name,
      premium: false,
      rawSummary: error.message || `GoDaddy Domains API returned HTTP ${status}.`,
      errorCode: error.code || "GODADDY_HTTP_ERROR",
      errorMessage: error.message,
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
      rawSummary: "GoDaddy API credentials are not configured.",
      errorCode: "GODADDY_NOT_CONFIGURED",
      errorMessage:
        "Set GODADDY_API_KEY and GODADDY_API_SECRET to enable GoDaddy checks.",
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
      rawSummary: "GoDaddy response did not include this domain.",
      errorCode: "GODADDY_EMPTY_RESULT",
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
      rawSummary: "GoDaddy lookup was inconclusive.",
      errorCode: "GODADDY_INCONCLUSIVE",
    });
  }
}

export const godaddyProvider = new GoDaddyAvailabilityProvider();
