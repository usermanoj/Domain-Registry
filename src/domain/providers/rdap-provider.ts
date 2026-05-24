import { request as httpsRequest } from "node:https";
import { parseDomainName } from "../normalize";
import { getRootTld, isRestrictedExtension } from "../tlds";
import type { DomainAvailabilityProvider, DomainCheckResult } from "../types";
import {
  buildAvailabilityResult,
  normalizeTld,
  runBulkLimited,
} from "./provider-utils";

const RDAP_BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const RDAP_TIMEOUT_MS = 8_000;
const RESULT_CACHE_TTL_MS = 5 * 60 * 1_000;
const TLS_FALLBACK_CODES = new Set([
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
]);

type RdapBootstrap = {
  services: [string[], string[]][];
};

type CachedResult = {
  expiresAt: number;
  result: DomainCheckResult;
};

type RDAPProviderOptions = {
  fetcher?: typeof fetch;
  bootstrapUrl?: string;
  timeoutMs?: number;
  cacheTtlMs?: number;
};

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function tlsErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return "";
  }

  const direct = "code" in error ? (error as { code?: unknown }).code : undefined;
  const cause =
    "cause" in error && error.cause && typeof error.cause === "object" && "code" in error.cause
      ? (error.cause as { code?: unknown }).code
      : undefined;

  return String(direct ?? cause ?? "");
}

async function rdapFetchWithTlsFallback(
  fetcher: typeof fetch,
  url: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetcher(url, init);
  } catch (error) {
    if (fetcher !== fetch || !TLS_FALLBACK_CODES.has(tlsErrorCode(error))) {
      throw error;
    }

    return insecureRdapFetch(url, init);
  }
}

function insecureRdapFetch(url: string, init: RequestInit) {
  return new Promise<Response>((resolve, reject) => {
    const req = httpsRequest(
      url,
      {
        method: init.method ?? "GET",
        headers: init.headers as Record<string, string> | undefined,
        rejectUnauthorized: false,
      },
      (res) => {
        const chunks: Buffer[] = [];

        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 0,
              statusText: res.statusMessage,
              headers: res.headers as HeadersInit,
            }),
          );
        });
      },
    );

    req.on("error", reject);
    init.signal?.addEventListener("abort", () => {
      req.destroy(new DOMException("Aborted", "AbortError"));
    });
    req.end();
  });
}

function summarizeRdapBody(body: unknown) {
  if (!body || typeof body !== "object") {
    return "RDAP response returned a domain object.";
  }

  const rdap = body as {
    ldhName?: string;
    objectClassName?: string;
    status?: string[];
    events?: Array<{ eventAction?: string; eventDate?: string }>;
  };
  const parts = [
    rdap.objectClassName ? `objectClass=${rdap.objectClassName}` : "",
    rdap.ldhName ? `ldhName=${rdap.ldhName}` : "",
    rdap.status?.length ? `status=${rdap.status.join("|")}` : "",
    rdap.events?.length
      ? `events=${rdap.events
          .slice(0, 3)
          .map((event) => `${event.eventAction}:${event.eventDate}`)
          .join("|")}`
      : "",
  ].filter(Boolean);

  return parts.length > 0
    ? parts.join("; ")
    : "RDAP response returned a domain object.";
}

export class RDAPAvailabilityProvider implements DomainAvailabilityProvider {
  name = "RDAPAvailabilityProvider";

  private bootstrapPromise: Promise<RdapBootstrap> | null = null;
  private resultCache = new Map<string, CachedResult>();
  private readonly fetcher: typeof fetch;
  private readonly bootstrapUrl: string;
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;

  constructor(options: RDAPProviderOptions = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.bootstrapUrl = options.bootstrapUrl ?? RDAP_BOOTSTRAP_URL;
    this.timeoutMs = options.timeoutMs ?? RDAP_TIMEOUT_MS;
    this.cacheTtlMs = options.cacheTtlMs ?? RESULT_CACHE_TTL_MS;
  }

  supportsTld(tld: string) {
    const normalized = normalizeTld(tld);
    return normalized.length > 0 && !isRestrictedExtension(normalized);
  }

  async check(domain: string) {
    const parts = parseDomainName(domain);

    if (!parts.valid) {
      return buildAvailabilityResult({
        domain,
        status: "invalid",
        confidence: "high",
        source: "rdap",
        providerName: this.name,
        premium: false,
      });
    }

    if (isRestrictedExtension(parts.tld)) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "restricted",
        confidence: "high",
        source: "rdap",
        providerName: this.name,
        premium: false,
        rawSummary:
          "Restricted TLD; RDAP lookup is not a substitute for eligibility validation.",
        errorCode: "RESTRICTED_TLD",
        errorMessage: "Restricted extension requires manual validation.",
      });
    }

    const cached = this.resultCache.get(parts.domain);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    let bootstrap: RdapBootstrap;

    try {
      bootstrap = await this.getBootstrap();
    } catch (error) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "unknown",
        confidence: "low",
        source: "rdap",
        providerName: this.name,
        premium: false,
        rawSummary:
          error instanceof Error
            ? `RDAP bootstrap failed: ${error.message}`
            : "RDAP bootstrap failed for an unknown reason.",
        errorCode: "RDAP_BOOTSTRAP_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Unknown RDAP bootstrap failure.",
      });
    }

    const baseUrl = this.findServiceBase(bootstrap, parts.tld);

    if (!baseUrl) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "manual_check_required",
        confidence: "medium",
        source: "manual",
        providerName: this.name,
        premium: false,
        rawSummary:
          "IANA RDAP bootstrap does not expose a domain RDAP service for this TLD.",
        errorCode: "RDAP_UNSUPPORTED_TLD",
        errorMessage: "Use registrar or registry manual lookup.",
      });
    }

    const timeout = withTimeout(this.timeoutMs);

    try {
      const response = await rdapFetchWithTlsFallback(
        this.fetcher,
        `${baseUrl}/domain/${encodeURIComponent(parts.domain)}`,
        {
          headers: {
            accept: "application/rdap+json, application/json",
          },
          signal: timeout.signal,
        },
      );
      const result = await this.resultFromResponse(parts.domain, baseUrl, response);
      this.resultCache.set(parts.domain, {
        expiresAt: Date.now() + this.cacheTtlMs,
        result,
      });
      return result;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return buildAvailabilityResult({
          domain: parts.domain,
          status: "rate_limited",
          confidence: "low",
          source: "rdap",
          providerName: this.name,
          premium: false,
          rawSummary: "RDAP request timed out.",
          errorCode: "RDAP_TIMEOUT",
          errorMessage: "RDAP provider did not respond before the timeout.",
        });
      }

      return buildAvailabilityResult({
        domain: parts.domain,
        status: "unknown",
        confidence: "low",
        source: "rdap",
        providerName: this.name,
        premium: false,
        rawSummary:
          error instanceof Error
            ? `RDAP lookup failed: ${error.message}`
            : "RDAP lookup failed for an unknown reason.",
        errorCode: "RDAP_LOOKUP_FAILED",
        errorMessage:
          error instanceof Error ? error.message : "Unknown RDAP lookup failure.",
      });
    } finally {
      timeout.clear();
    }
  }

  async checkBulk(domains: string[]) {
    return runBulkLimited(domains, (domain) => this.check(domain));
  }

  private async getBootstrap() {
    if (!this.bootstrapPromise) {
      this.bootstrapPromise = rdapFetchWithTlsFallback(this.fetcher, this.bootstrapUrl, {
        next: { revalidate: 86_400 },
      }).then(async (response) => {
        if (!response.ok) {
          throw new Error(`RDAP bootstrap failed with HTTP ${response.status}`);
        }

        return (await response.json()) as RdapBootstrap;
      }).catch((error) => {
        this.bootstrapPromise = null;
        throw error;
      });
    }

    return this.bootstrapPromise;
  }

  private findServiceBase(bootstrap: RdapBootstrap, tld: string) {
    const rootTld = getRootTld(tld);
    const service = bootstrap.services.find(([tlds]) =>
      tlds.some((item) => item.toLowerCase() === rootTld),
    );

    return service?.[1]?.[0]?.replace(/\/+$/, "");
  }

  private async resultFromResponse(
    domain: string,
    baseUrl: string,
    response: Response,
  ) {
    if (response.status === 200) {
      let body: unknown;

      try {
        body = await response.json();
      } catch {
        body = undefined;
      }

      return buildAvailabilityResult({
        domain,
        status: "taken_confirmed",
        confidence: "high",
        source: "rdap",
        providerName: this.name,
        premium: false,
        rawSummary: summarizeRdapBody(body),
      });
    }

    if (response.status === 404) {
      return buildAvailabilityResult({
        domain,
        status: "available_confirmed",
        confidence: "medium",
        source: "rdap",
        providerName: this.name,
        premium: false,
        rawSummary:
          "RDAP returned 404/not found. This is treated as available only with medium confidence; registrar confirmation is recommended before purchase.",
      });
    }

    if (response.status === 429) {
      return buildAvailabilityResult({
        domain,
        status: "rate_limited",
        confidence: "high",
        source: "rdap",
        providerName: this.name,
        premium: false,
        rawSummary: "RDAP provider returned HTTP 429.",
        errorCode: "RDAP_RATE_LIMITED",
        errorMessage: "RDAP provider rate limited the lookup.",
      });
    }

    if (response.status === 401 || response.status === 403) {
      return buildAvailabilityResult({
        domain,
        status: "manual_check_required",
        confidence: "medium",
        source: "manual",
        providerName: this.name,
        premium: false,
        rawSummary: `RDAP endpoint ${baseUrl} denied lookup with HTTP ${response.status}.`,
        errorCode: "RDAP_ACCESS_DENIED",
        errorMessage: "Manual registrar verification is required.",
      });
    }

    return buildAvailabilityResult({
      domain,
      status: "unknown",
      confidence: "low",
      source: "rdap",
      providerName: this.name,
      premium: false,
      rawSummary: `RDAP provider returned HTTP ${response.status}.`,
      errorCode: "RDAP_UNEXPECTED_STATUS",
      errorMessage: `Unexpected RDAP HTTP status ${response.status}.`,
    });
  }
}

export const rdapProvider = new RDAPAvailabilityProvider();
