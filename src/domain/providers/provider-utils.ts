import { parseDomainName } from "../normalize";
import { getExtensionRules, getRegistrarUrl } from "../tlds";
import type {
  AvailabilitySource,
  AvailabilityStatus,
  ConfidenceLevel,
  DomainCheckResult,
} from "../types";

export const PROVIDER_CONCURRENCY = 8;

export function normalizeTld(tld: string) {
  return tld.trim().toLowerCase().replace(/^\.+|\.+$/g, "");
}

export function buildAvailabilityResult({
  domain,
  status,
  confidence,
  source,
  providerName,
  checkedAt = new Date(),
  priceRegistration,
  priceRenewal,
  currency,
  premium = false,
  registrarUrl,
  rawSummary,
  errorCode,
  errorMessage,
}: {
  domain: string;
  status: AvailabilityStatus;
  confidence: ConfidenceLevel;
  source: AvailabilitySource;
  providerName: string;
  checkedAt?: Date;
  priceRegistration?: number;
  priceRenewal?: number;
  currency?: string;
  premium?: boolean;
  registrarUrl?: string;
  rawSummary?: string;
  errorCode?: string;
  errorMessage?: string;
}): DomainCheckResult {
  const parts = parseDomainName(domain);
  const tld = parts.tld;

  return {
    domain: parts.domain || domain.toLowerCase(),
    sld: parts.sld,
    tld,
    status: parts.valid ? status : "invalid",
    confidence: parts.valid ? confidence : "high",
    source,
    providerName,
    checkedAt: checkedAt.toISOString(),
    priceRegistration,
    priceRenewal,
    currency,
    premium,
    registrarUrl: registrarUrl ?? (parts.valid ? getRegistrarUrl(parts.domain, tld) : undefined),
    rawSummary: parts.valid ? rawSummary : "Domain failed syntactic validation.",
    errorCode: parts.valid ? errorCode : "INVALID_DOMAIN",
    errorMessage: parts.valid ? errorMessage : "Domain is not a valid registrable name.",
    id: parts.domain || domain.toLowerCase(),
    name: parts.sld,
    extension: tld,
    rules: parts.valid ? getExtensionRules(tld) : [],
  };
}

export async function runBulkLimited<T>(
  items: string[],
  worker: (item: string) => Promise<T>,
  concurrency = PROVIDER_CONCURRENCY,
) {
  const results: T[] = [];
  let index = 0;

  async function run() {
    while (index < items.length) {
      const currentIndex = index;
      index += 1;
      results[currentIndex] = await worker(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}
