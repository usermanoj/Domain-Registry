import { parseDomainName } from "../normalize";
import { toEvidenceRecord } from "../evidence-ledger";
import type { DomainAvailabilityProvider, DomainCheckResult } from "../types";
import { buildAvailabilityResult, normalizeTld } from "./provider-utils";
import { cloudflareProvider } from "./cloudflare-provider";
import { godaddyProvider } from "./godaddy-provider";
import { namecheapProvider } from "./namecheap-provider";
import { porkbunProvider } from "./porkbun-provider";

const REGISTRAR_PROVIDER_PRIORITY = [
  "CloudflareAvailabilityProvider",
  "GoDaddyAvailabilityProvider",
  "PorkbunAvailabilityProvider",
  "NamecheapAvailabilityProvider",
];
const REGISTRAR_PROVIDERS = [
  cloudflareProvider,
  godaddyProvider,
  porkbunProvider,
  namecheapProvider,
];

function providerRank(providerName: string) {
  const index = REGISTRAR_PROVIDER_PRIORITY.indexOf(providerName);
  return index === -1 ? REGISTRAR_PROVIDER_PRIORITY.length : index;
}

function shortProviderName(providerName: string) {
  return providerName
    .replace(/AvailabilityProvider$/, "")
    .replace(/Provider$/, "")
    .replace(/Registrar$/, "");
}

function resultSummary(result: DomainCheckResult) {
  const detail = result.errorCode ? `:${result.errorCode}` : "";
  return `${shortProviderName(result.providerName)}=${result.status}${detail}`;
}

function hasRegistrarSignal(result: DomainCheckResult) {
  return result.source === "registrar_api";
}

function bestSignal(results: DomainCheckResult[]) {
  return [...results].sort((left, right) => {
    const priceDelta =
      (left.priceRegistration ?? Number.POSITIVE_INFINITY) -
      (right.priceRegistration ?? Number.POSITIVE_INFINITY);

    if (Number.isFinite(priceDelta) && priceDelta !== 0) {
      return priceDelta;
    }

    return providerRank(left.providerName) - providerRank(right.providerName);
  })[0];
}

function withEvidence(result: DomainCheckResult, signals: DomainCheckResult[]) {
  return {
    ...result,
    evidence: signals.map(toEvidenceRecord),
  };
}

export class RegistrarQuorumProvider implements DomainAvailabilityProvider {
  name = "RegistrarQuorumProvider";

  constructor(private readonly providers: DomainAvailabilityProvider[]) {}

  supportsTld(tld: string) {
    const normalized = normalizeTld(tld);
    return normalized.length > 0 && this.providers.some((provider) => provider.supportsTld(normalized));
  }

  async check(domain: string) {
    return (await this.checkBulk([domain]))[0];
  }

  async checkBulk(domains: string[]) {
    const signalsByDomain = new Map<string, DomainCheckResult[]>();
    const providers = this.providers.filter((provider) =>
      domains.some((domain) => {
        const parts = parseDomainName(domain);
        return parts.valid && provider.supportsTld(parts.tld);
      }),
    );

    await Promise.all(
      providers.map(async (provider) => {
        const providerDomains = domains
          .map((domain) => parseDomainName(domain))
          .filter((parts) => parts.valid && provider.supportsTld(parts.tld))
          .map((parts) => parts.domain);

        if (providerDomains.length === 0) {
          return;
        }

        try {
          const results = await provider.checkBulk(providerDomains);

          for (const result of results) {
            signalsByDomain.set(result.domain, [
              ...(signalsByDomain.get(result.domain) ?? []),
              result,
            ]);
          }
        } catch {
          for (const domain of providerDomains) {
            signalsByDomain.set(domain, [
              ...(signalsByDomain.get(domain) ?? []),
              buildAvailabilityResult({
                domain,
                status: "unknown",
                confidence: "low",
                source: "registrar_api",
                providerName: provider.name,
                premium: false,
                rawSummary: `${provider.name} failed during bulk lookup.`,
                errorCode: "REGISTRAR_PROVIDER_FAILED",
              }),
            ]);
          }
        }
      }),
    );

    return domains.map((domain) => {
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

      return this.aggregate(parts.domain, signalsByDomain.get(parts.domain) ?? []);
    });
  }

  private aggregate(domain: string, signals: DomainCheckResult[]) {
    const registrarSignals = signals.filter(hasRegistrarSignal);
    const summary = registrarSignals.length
      ? `Registrar APIs checked: ${registrarSignals.map(resultSummary).join("; ")}.`
      : "No configured registrar API returned a signal.";
    const available = registrarSignals.filter((result) => result.status === "available_confirmed");
    const premium = registrarSignals.filter((result) => result.status === "premium_available");
    const taken = registrarSignals.filter((result) => result.status === "taken_confirmed");
    const restricted = registrarSignals.filter((result) => result.status === "restricted");
    const rateLimited = registrarSignals.filter((result) => result.status === "rate_limited");
    const manual = registrarSignals.filter((result) => result.status === "manual_check_required");

    if ((available.length > 0 || premium.length > 0) && taken.length > 0) {
      return withEvidence(buildAvailabilityResult({
        domain,
        status: "manual_check_required",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary: `${summary} Conflicting registrar signals require manual checkout verification.`,
        errorCode: "REGISTRAR_SIGNAL_CONFLICT",
        errorMessage:
          "At least one registrar API reported availability while another reported unavailable.",
      }), registrarSignals);
    }

    if (taken.length > 0) {
      return withEvidence(buildAvailabilityResult({
        domain,
        status: "taken_confirmed",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        registrarUrl: bestSignal(taken)?.registrarUrl,
        rawSummary: summary,
        errorCode: "REGISTRAR_DOMAIN_UNAVAILABLE",
      }), registrarSignals);
    }

    if (available.length > 0) {
      const signal = bestSignal(available);

      return withEvidence(buildAvailabilityResult({
        domain,
        status: "available_confirmed",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        priceRegistration: signal?.priceRegistration,
        priceRenewal: signal?.priceRenewal,
        currency: signal?.currency,
        registrarUrl: signal?.registrarUrl,
        rawSummary: summary,
      }), registrarSignals);
    }

    if (premium.length > 0) {
      const signal = bestSignal(premium);

      return withEvidence(buildAvailabilityResult({
        domain,
        status: "premium_available",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: true,
        priceRegistration: signal?.priceRegistration,
        priceRenewal: signal?.priceRenewal,
        currency: signal?.currency,
        registrarUrl: signal?.registrarUrl,
        rawSummary: summary,
      }), registrarSignals);
    }

    if (restricted.length > 0) {
      return withEvidence(buildAvailabilityResult({
        domain,
        status: "restricted",
        confidence: "high",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary: summary,
        errorCode: "REGISTRAR_EXTENSION_RESTRICTED",
      }), registrarSignals);
    }

    if (manual.length > 0) {
      return withEvidence(buildAvailabilityResult({
        domain,
        status: "manual_check_required",
        confidence: "medium",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary: summary,
        errorCode: "REGISTRAR_MANUAL_CHECK_REQUIRED",
      }), registrarSignals);
    }

    if (rateLimited.length > 0) {
      return withEvidence(buildAvailabilityResult({
        domain,
        status: "rate_limited",
        confidence: "medium",
        source: "registrar_api",
        providerName: this.name,
        premium: false,
        rawSummary: summary,
        errorCode: "REGISTRAR_RATE_LIMITED",
      }), registrarSignals);
    }

    return withEvidence(buildAvailabilityResult({
      domain,
      status: "unknown",
      confidence: "low",
      source: "registrar_api",
      providerName: this.name,
      premium: false,
      rawSummary: summary,
      errorCode: "REGISTRAR_INCONCLUSIVE",
    }), registrarSignals);
  }
}

export function configuredRegistrarProviderNames(extensions: string[] = []) {
  const normalizedExtensions = extensions.map(normalizeTld).filter(Boolean);

  return REGISTRAR_PROVIDERS.filter((provider) =>
    normalizedExtensions.length === 0
      ? provider.supportsTld("com")
      : normalizedExtensions.some((extension) => provider.supportsTld(extension)),
  ).map((provider) => shortProviderName(provider.name));
}

export function hasConfiguredRegistrarProvider(extensions: string[] = []) {
  return configuredRegistrarProviderNames(extensions).length > 0;
}

export const registrarQuorumProvider = new RegistrarQuorumProvider(REGISTRAR_PROVIDERS);
