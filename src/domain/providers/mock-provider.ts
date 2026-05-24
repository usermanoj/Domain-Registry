import { defaultPriceForExtension, isRestrictedExtension } from "../tlds";
import type { DomainAvailabilityProvider } from "../types";
import {
  buildAvailabilityResult,
  normalizeTld,
  runBulkLimited,
} from "./provider-utils";

function hash(value: string) {
  let result = 0;

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }

  return result;
}

export class MockAvailabilityProvider implements DomainAvailabilityProvider {
  name = "MockAvailabilityProvider";

  supportsTld(tld: string) {
    return normalizeTld(tld).length > 0;
  }

  async check(domain: string) {
    const normalizedDomain = domain.toLowerCase();
    const tld = normalizeTld(normalizedDomain.split(".").slice(1).join("."));

    if (isRestrictedExtension(tld)) {
      return buildAvailabilityResult({
        domain: normalizedDomain,
        status: "restricted",
        confidence: "high",
        source: "mock",
        providerName: this.name,
        premium: false,
        rawSummary:
          "Mock provider marks restricted extensions as eligibility-restricted.",
        errorCode: "RESTRICTED_TLD",
        errorMessage: "Restricted extension requires manual eligibility validation.",
      });
    }

    const value = hash(normalizedDomain);
    const price = defaultPriceForExtension(tld);

    if (value % 29 === 0) {
      return buildAvailabilityResult({
        domain: normalizedDomain,
        status: "manual_check_required",
        confidence: "medium",
        source: "mock",
        providerName: this.name,
        rawSummary:
          "Deterministic mock policy marked this domain as requiring manual verification.",
        errorCode: "MOCK_MANUAL_CHECK",
      });
    }

    if (value % 17 === 0 || /prime|premium|elite/.test(normalizedDomain)) {
      const premiumPrice = 2480 + (value % 800);

      return buildAvailabilityResult({
        domain: normalizedDomain,
        status: "premium_available",
        confidence: "high",
        source: "mock",
        providerName: this.name,
        premium: true,
        priceRegistration: premiumPrice,
        priceRenewal: price?.amount,
        currency: "USD",
        rawSummary: "Deterministic mock provider indicates premium availability.",
      });
    }

    if (value % 7 === 0) {
      return buildAvailabilityResult({
        domain: normalizedDomain,
        status: "taken_confirmed",
        confidence: "high",
        source: "mock",
        providerName: this.name,
        premium: false,
        rawSummary: "Deterministic mock provider confirms the domain is taken.",
      });
    }

    return buildAvailabilityResult({
      domain: normalizedDomain,
      status: "available_confirmed",
      confidence: "high",
      source: "mock",
      providerName: this.name,
      premium: false,
      priceRegistration: price?.amount,
      priceRenewal: price?.amount,
      currency: price?.currency,
      rawSummary: "Deterministic mock provider confirms standard availability.",
    });
  }

  async checkBulk(domains: string[]) {
    return runBulkLimited(domains, (domain) => this.check(domain));
  }
}

export const mockProvider = new MockAvailabilityProvider();
