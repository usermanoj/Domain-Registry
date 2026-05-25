import { Socket } from "node:net";
import { parseDomainName } from "../normalize";
import { getRootTld, isRestrictedExtension } from "../tlds";
import type { DomainAvailabilityProvider } from "../types";
import {
  buildAvailabilityResult,
  normalizeTld,
  runBulkLimited,
} from "./provider-utils";

const WHOIS_TIMEOUT_MS = 10_000;
const WHOIS_CONCURRENCY = 2;
const WHOIS_SERVERS = new Map<string, string>([
  ["ai", "whois.nic.ai"],
  ["com", "whois.verisign-grs.com"],
  ["net", "whois.verisign-grs.com"],
]);

type WhoisProviderOptions = {
  query?: (domain: string, server: string) => Promise<string>;
  timeoutMs?: number;
};

function isRateLimitedWhois(body: string) {
  return /rate limit|too many queries|exceeded|error 1015/i.test(body);
}

function isAvailableWhois(domain: string, body: string) {
  return (
    /domain not found\.?/i.test(body) ||
    new RegExp(`No match for ["']?${domain.replace(/\./g, "\\.")}["']?`, "i").test(body) ||
    /no data found/i.test(body)
  );
}

function isTakenWhois(domain: string, body: string) {
  return (
    new RegExp(`Domain Name:\\s*${domain.replace(/\./g, "\\.")}`, "i").test(body) ||
    /Registry Domain ID:/i.test(body)
  );
}

function summarizeWhoisBody(body: string) {
  return body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
    .join("; ");
}

function defaultWhoisQuery(domain: string, server: string, timeoutMs = WHOIS_TIMEOUT_MS) {
  return new Promise<string>((resolve, reject) => {
    const socket = new Socket();
    let body = "";
    let settled = false;

    function finish(error?: Error) {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();

      if (error) {
        reject(error);
      } else {
        resolve(body);
      }
    }

    socket.setTimeout(timeoutMs);
    socket.connect(43, server, () => {
      socket.write(`${domain}\r\n`);
    });
    socket.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });
    socket.on("end", () => finish());
    socket.on("timeout", () => finish(new Error("WHOIS request timed out.")));
    socket.on("error", finish);
  });
}

export class WHOISAvailabilityProvider implements DomainAvailabilityProvider {
  name = "WHOISAvailabilityProvider";

  private readonly query: (domain: string, server: string) => Promise<string>;
  private readonly timeoutMs: number;

  constructor(options: WhoisProviderOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? WHOIS_TIMEOUT_MS;
    this.query =
      options.query ?? ((domain, server) => defaultWhoisQuery(domain, server, this.timeoutMs));
  }

  supportsTld(tld: string) {
    const normalized = normalizeTld(getRootTld(tld));
    return WHOIS_SERVERS.has(normalized) && !isRestrictedExtension(normalized);
  }

  async check(domain: string) {
    const parts = parseDomainName(domain);

    if (!parts.valid) {
      return buildAvailabilityResult({
        domain,
        status: "invalid",
        confidence: "high",
        source: "whois",
        providerName: this.name,
        premium: false,
      });
    }

    if (isRestrictedExtension(parts.tld)) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "restricted",
        confidence: "high",
        source: "whois",
        providerName: this.name,
        premium: false,
        rawSummary:
          "Restricted TLD; WHOIS lookup is not a substitute for eligibility validation.",
        errorCode: "RESTRICTED_TLD",
      });
    }

    const server = WHOIS_SERVERS.get(getRootTld(parts.tld));

    if (!server) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "manual_check_required",
        confidence: "medium",
        source: "manual",
        providerName: this.name,
        premium: false,
        rawSummary: "No WHOIS fallback server is configured for this TLD.",
        errorCode: "WHOIS_UNSUPPORTED_TLD",
      });
    }

    try {
      const body = await this.query(parts.domain, server);

      if (isAvailableWhois(parts.domain, body)) {
        return buildAvailabilityResult({
          domain: parts.domain,
          status: "manual_check_required",
          confidence: "medium",
          source: "whois",
          providerName: this.name,
          premium: false,
          rawSummary:
            "WHOIS returned no matching domain record. Registrar checkout is required before treating the domain as available.",
          errorCode: "WHOIS_NOT_FOUND_REQUIRES_REGISTRAR",
          errorMessage:
            "WHOIS not-found cannot confirm purchase availability for this domain.",
        });
      }

      if (isTakenWhois(parts.domain, body)) {
        return buildAvailabilityResult({
          domain: parts.domain,
          status: "taken_confirmed",
          confidence: "high",
          source: "whois",
          providerName: this.name,
          premium: false,
          rawSummary: summarizeWhoisBody(body),
        });
      }

      if (isRateLimitedWhois(body)) {
        return buildAvailabilityResult({
          domain: parts.domain,
          status: "rate_limited",
          confidence: "medium",
          source: "whois",
          providerName: this.name,
          premium: false,
          rawSummary: "WHOIS server rate limited the lookup.",
          errorCode: "WHOIS_RATE_LIMITED",
          errorMessage: "WHOIS server rate limited the lookup.",
        });
      }

      return buildAvailabilityResult({
        domain: parts.domain,
        status: "unknown",
        confidence: "low",
        source: "whois",
        providerName: this.name,
        premium: false,
        rawSummary: summarizeWhoisBody(body) || "WHOIS response was inconclusive.",
        errorCode: "WHOIS_INCONCLUSIVE",
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown WHOIS lookup failure.";

      return buildAvailabilityResult({
        domain: parts.domain,
        status: message.toLowerCase().includes("timed out") ? "rate_limited" : "unknown",
        confidence: "low",
        source: "whois",
        providerName: this.name,
        premium: false,
        rawSummary: `WHOIS lookup failed: ${message}`,
        errorCode: message.toLowerCase().includes("timed out")
          ? "WHOIS_TIMEOUT"
          : "WHOIS_LOOKUP_FAILED",
        errorMessage: message,
      });
    }
  }

  async checkBulk(domains: string[]) {
    return runBulkLimited(domains, (domain) => this.check(domain), WHOIS_CONCURRENCY);
  }
}

export const whoisProvider = new WHOISAvailabilityProvider();
