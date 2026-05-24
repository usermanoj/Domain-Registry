import { parseDomainName } from "../normalize";
import { isRestrictedExtension } from "../tlds";
import type { DomainAvailabilityProvider } from "../types";
import {
  buildAvailabilityResult,
  normalizeTld,
  runBulkLimited,
} from "./provider-utils";

const GOVERNMENT_MILITARY_RESTRICTED = new Set([
  "edu",
  "gov",
  "mil",
  "int",
  "gov.sg",
  "edu.sg",
]);

export class RestrictedTldProvider implements DomainAvailabilityProvider {
  name = "RestrictedTldProvider";

  supportsTld(tld: string) {
    const normalized = normalizeTld(tld);
    return GOVERNMENT_MILITARY_RESTRICTED.has(normalized) || isRestrictedExtension(normalized);
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

    const isKnownRestricted = this.supportsTld(parts.tld);

    return buildAvailabilityResult({
      domain: parts.domain,
      status: isKnownRestricted ? "restricted" : "manual_check_required",
      confidence: isKnownRestricted ? "high" : "medium",
      source: "manual",
      providerName: this.name,
      premium: false,
      rawSummary: isKnownRestricted
        ? `.${parts.tld} is eligibility-restricted and cannot be treated as generally available.`
        : `.${parts.tld} requires manual policy review.`,
      errorCode: isKnownRestricted ? "RESTRICTED_TLD" : "TLD_POLICY_REVIEW_REQUIRED",
      errorMessage: "Manual eligibility validation is required before registration.",
    });
  }

  async checkBulk(domains: string[]) {
    return runBulkLimited(domains, (domain) => this.check(domain));
  }
}

export const restrictedTldProvider = new RestrictedTldProvider();
