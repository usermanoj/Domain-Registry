import { parseDomainName } from "../normalize";
import type { DomainAvailabilityProvider } from "../types";
import {
  buildAvailabilityResult,
  normalizeTld,
  runBulkLimited,
} from "./provider-utils";

type EnvReader = (name: string) => string | undefined;

function defaultEnv(name: string) {
  return process.env[name]?.trim();
}

export class SGAvailabilityProvider implements DomainAvailabilityProvider {
  name = "SGAvailabilityProvider";

  private readonly env: EnvReader;

  constructor(options: { env?: EnvReader } = {}) {
    this.env = options.env ?? defaultEnv;
  }

  supportsTld(tld: string) {
    return ["sg", "com.sg"].includes(normalizeTld(tld));
  }

  async check(domain: string) {
    const parts = parseDomainName(domain);

    if (!parts.valid) {
      return buildAvailabilityResult({
        domain,
        status: "invalid",
        confidence: "high",
        source: "manual",
        providerName: this.name,
        premium: false,
      });
    }

    if (!this.supportsTld(parts.tld)) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "manual_check_required",
        confidence: "low",
        source: "manual",
        providerName: this.name,
        premium: false,
        rawSummary: "SG provider only handles .sg and .com.sg.",
        errorCode: "SG_UNSUPPORTED_TLD",
      });
    }

    if (!this.isRegistrarConfigured()) {
      return buildAvailabilityResult({
        domain: parts.domain,
        status: "manual_check_required",
        confidence: "medium",
        source: "manual",
        providerName: this.name,
        premium: false,
        registrarUrl: `https://www.sgnic.sg/domain-search?domain=${encodeURIComponent(parts.domain)}`,
        rawSummary:
          ".sg and .com.sg checks require SGNIC/accredited registrar integration. No SG registrar API is configured.",
        errorCode: "SG_REGISTRAR_NOT_CONFIGURED",
        errorMessage:
          "Configure an accredited Singapore registrar adapter before claiming availability.",
      });
    }

    return buildAvailabilityResult({
      domain: parts.domain,
      status: "manual_check_required",
      confidence: "medium",
      source: "manual",
      providerName: this.name,
      premium: false,
      registrarUrl: `https://www.sgnic.sg/domain-search?domain=${encodeURIComponent(parts.domain)}`,
      rawSummary:
        "SG registrar credentials are present, but no registrar-specific parser has been implemented for this scaffold.",
      errorCode: "SG_REGISTRAR_ADAPTER_TODO",
      errorMessage:
        "Integrate the chosen SG accredited registrar API response parser.",
    });
  }

  async checkBulk(domains: string[]) {
    return runBulkLimited(domains, (domain) => this.check(domain));
  }

  private isRegistrarConfigured() {
    return Boolean(this.env("SG_REGISTRAR_API_URL") && this.env("SG_REGISTRAR_API_KEY"));
  }
}

export const sgProvider = new SGAvailabilityProvider();
