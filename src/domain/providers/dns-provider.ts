import { Resolver, resolve4, resolve6, resolveNs } from "node:dns/promises";
import { parseDomainName } from "../normalize";
import { isRestrictedExtension } from "../tlds";
import type { DomainAvailabilityProvider } from "../types";
import {
  buildAvailabilityResult,
  normalizeTld,
  runBulkLimited,
} from "./provider-utils";

const FALLBACK_RESOLVERS = ["1.1.1.1", "8.8.8.8"];
const DNS_EMPTY_CODES = new Set(["ENODATA", "ENOTFOUND", "ENODOMAIN", "NXDOMAIN"]);
const DNS_RETRY_CODES = new Set(["ECONNREFUSED", "ETIMEOUT", "EAI_AGAIN", "ESERVFAIL"]);

type DnsLookup = (domain: string) => Promise<string[]>;

type DNSProviderOptions = {
  resolveNs?: DnsLookup;
  resolve4?: DnsLookup;
  resolve6?: DnsLookup;
};

function errorCode(error: unknown) {
  return typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
}

function withPublicResolver(method: "resolveNs" | "resolve4" | "resolve6") {
  return async (domain: string) => {
    const systemLookup =
      method === "resolveNs" ? resolveNs : method === "resolve4" ? resolve4 : resolve6;

    try {
      return await systemLookup(domain);
    } catch (error) {
      if (!DNS_RETRY_CODES.has(errorCode(error))) {
        throw error;
      }

      const resolver = new Resolver();
      resolver.setServers(FALLBACK_RESOLVERS);
      return resolver[method](domain);
    }
  };
}

export class DNSAvailabilityProvider implements DomainAvailabilityProvider {
  name = "DNSAvailabilityProvider";
  private readonly lookupNs: DnsLookup;
  private readonly lookup4: DnsLookup;
  private readonly lookup6: DnsLookup;

  constructor(options: DNSProviderOptions = {}) {
    this.lookupNs = options.resolveNs ?? withPublicResolver("resolveNs");
    this.lookup4 = options.resolve4 ?? withPublicResolver("resolve4");
    this.lookup6 = options.resolve6 ?? withPublicResolver("resolve6");
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
        source: "dns",
        providerName: this.name,
        premium: false,
      });
    }

    if (isRestrictedExtension(parts.tld)) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "restricted",
        confidence: "high",
        source: "dns",
        providerName: this.name,
        premium: false,
        rawSummary:
          "Restricted TLD; DNS evidence is not a substitute for eligibility validation.",
        errorCode: "RESTRICTED_TLD",
      });
    }

    const evidence: string[] = [];
    const emptyCodes: string[] = [];
    const errors: string[] = [];

    for (const [label, lookup] of [
      ["NS", this.lookupNs],
      ["A", this.lookup4],
      ["AAAA", this.lookup6],
    ] as const) {
      try {
        const records = await lookup(parts.domain);

        if (records.length > 0) {
          evidence.push(`${label}=${records.slice(0, 4).join("|")}`);
        }
      } catch (error) {
        const code = errorCode(error);

        if (DNS_EMPTY_CODES.has(code)) {
          emptyCodes.push(`${label}:${code}`);
        } else {
          errors.push(`${label}:${code || "DNS_LOOKUP_FAILED"}`);
        }
      }
    }

    if (evidence.length > 0) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "taken_confirmed",
        confidence: "medium",
        source: "dns",
        providerName: this.name,
        premium: false,
        rawSummary:
          `DNS records exist (${evidence.join("; ")}). This is treated only as taken evidence; registrar/RDAP confirmation is still recommended.`,
      });
    }

    return buildAvailabilityResult({
      domain: parts.domain,
      status: "unknown",
      confidence: "low",
      source: "dns",
      providerName: this.name,
      premium: false,
      rawSummary:
        "DNS lookup found no usable registration evidence. Absence of DNS is not evidence of availability.",
      errorCode: errors.length > 0 ? "DNS_LOOKUP_FAILED" : "DNS_NO_REGISTRATION_EVIDENCE",
      errorMessage: [...emptyCodes, ...errors].join("; ") || undefined,
    });
  }

  async checkBulk(domains: string[]) {
    return runBulkLimited(domains, (domain) => this.check(domain));
  }
}

export const dnsProvider = new DNSAvailabilityProvider();
