import { buildDomainInputs, composeDomain, parseDomainName } from "./normalize";
import {
  attachDomainIntelligence,
  attachLiveDomainIntelligence,
} from "./domain-intelligence";
import { domainLookupScheduler } from "./lookup-scheduler";
import { mockProvider } from "./providers/mock-provider";
import { buildAvailabilityResult } from "./providers/provider-utils";
import { dnsProvider } from "./providers/dns-provider";
import {
  configuredRegistrarProviderNames,
  registrarQuorumProvider,
} from "./providers/registrar-quorum-provider";
import { rdapProvider } from "./providers/rdap-provider";
import { restrictedTldProvider } from "./providers/restricted-tld-provider";
import { sgProvider } from "./providers/sg-provider";
import { whoisProvider } from "./providers/whois-provider";
import { rankRecommendations, scoreName } from "./scoring";
import type {
  DomainAvailabilityProvider,
  DomainCheckResponse,
  DomainCheckResult,
  ProviderMode,
} from "./types";

function providersForMode(mode: ProviderMode): DomainAvailabilityProvider[] {
  if (mode === "mock") {
    return [restrictedTldProvider, mockProvider];
  }

  if (mode === "live") {
    return [
      restrictedTldProvider,
      sgProvider,
      registrarQuorumProvider,
      rdapProvider,
      whoisProvider,
      dnsProvider,
    ];
  }

  return [
    restrictedTldProvider,
    sgProvider,
    registrarQuorumProvider,
    rdapProvider,
    whoisProvider,
    dnsProvider,
    mockProvider,
  ];
}

function manualResult(domain: string, rawSummary: string): DomainCheckResult {
  return buildAvailabilityResult({
    domain,
    status: "manual_check_required",
    confidence: "medium",
    source: "manual",
    providerName: "DomainAvailabilityEngine",
    premium: false,
    rawSummary,
    errorCode: "NO_PROVIDER_RESULT",
    errorMessage: "No configured provider could produce a conclusive result.",
  });
}

export class DomainAvailabilityEngine {
  constructor(private readonly providers: DomainAvailabilityProvider[]) {}

  async check(domain: string) {
    const parts = parseDomainName(domain);
    let rateLimitedResult: DomainCheckResult | null = null;
    let manualCheckResult: DomainCheckResult | null = null;

    if (!parts.valid) {
      return buildAvailabilityResult({
        domain,
        status: "invalid",
        confidence: "high",
        source: "manual",
        providerName: "DomainAvailabilityEngine",
        premium: false,
      });
    }

    for (const provider of this.providers) {
      if (!provider.supportsTld(parts.tld)) {
        continue;
      }

      let result: DomainCheckResult;

      try {
        result = await provider.check(parts.domain);
      } catch {
        continue;
      }

      if (result.status === "rate_limited") {
        rateLimitedResult ??= result;
        continue;
      }

      if (result.status === "manual_check_required") {
        manualCheckResult ??= result;
        continue;
      }

      if (result.status !== "unknown") {
        return result;
      }
    }

    if (manualCheckResult) {
      return manualCheckResult;
    }

    if (rateLimitedResult) {
      return rateLimitedResult;
    }

    return manualResult(
      parts.domain,
      "No provider in the configured chain returned a conclusive result.",
    );
  }

  async checkBulk(domains: string[]) {
    const results: Array<DomainCheckResult | undefined> = new Array(domains.length);
    const pending = new Set<number>();
    const manualResults = new Map<number, DomainCheckResult>();
    const rateLimitedResults = new Map<number, DomainCheckResult>();
    const parsedDomains = domains.map((domain) => parseDomainName(domain));

    parsedDomains.forEach((parts, index) => {
      if (!parts.valid) {
        results[index] = buildAvailabilityResult({
          domain: domains[index],
          status: "invalid",
          confidence: "high",
          source: "manual",
          providerName: "DomainAvailabilityEngine",
          premium: false,
        });
      } else {
        pending.add(index);
      }
    });

    for (const provider of this.providers) {
      const providerIndexes = Array.from(pending).filter((index) =>
        provider.supportsTld(parsedDomains[index].tld),
      );

      if (providerIndexes.length === 0) {
        continue;
      }

      let providerResults: DomainCheckResult[];

      try {
        providerResults = await domainLookupScheduler.runBulk(
          provider.name,
          providerIndexes.map((index) => parsedDomains[index].domain),
          (batch) => provider.checkBulk(batch),
          { concurrency: providerIndexes.length },
        );
      } catch {
        continue;
      }

      const providerResultByDomain = new Map(
        providerResults.map((result) => [result.domain, result]),
      );

      for (const index of providerIndexes) {
        const result = providerResultByDomain.get(parsedDomains[index].domain);

        if (!result) {
          continue;
        }

        if (result.status === "rate_limited") {
          rateLimitedResults.set(index, result);
          continue;
        }

        if (result.status === "manual_check_required") {
          if (!manualResults.has(index)) {
            manualResults.set(index, result);
          }
          continue;
        }

        if (result.status !== "unknown") {
          results[index] = result;
          pending.delete(index);
        }
      }
    }

    for (const index of pending) {
      results[index] =
        manualResults.get(index) ??
        rateLimitedResults.get(index) ??
        manualResult(
          parsedDomains[index].domain,
          "No provider in the configured chain returned a conclusive result.",
        );
    }

    return results.map((result, index) =>
      result ??
      manualResult(
        parsedDomains[index].domain || domains[index],
        "No provider in the configured chain returned a conclusive result.",
      ),
    );
  }
}

export function createAvailabilityEngine(mode: ProviderMode) {
  return new DomainAvailabilityEngine(providersForMode(mode));
}

export async function checkDomains({
  names,
  extensions,
  mode = "mock",
  includeExternalIntelligence = false,
}: {
  names: string[];
  extensions: string[];
  mode?: ProviderMode;
  includeExternalIntelligence?: boolean;
}): Promise<DomainCheckResponse> {
  const now = new Date();
  const inputs = buildDomainInputs(names, extensions);
  const engine = createAvailabilityEngine(mode);
  const configuredRegistrarProviders =
    mode === "mock" ? ["Mock"] : configuredRegistrarProviderNames(extensions);
  const results = await engine.checkBulk(
    inputs.map((input) => composeDomain(input.name, input.extension)),
  );
  const groupedByName = new Map<string, DomainCheckResult[]>();

  for (const result of results) {
    groupedByName.set(result.name, [
      ...(groupedByName.get(result.name) ?? []),
      result,
    ]);
  }

  const recommendations = rankRecommendations(
    Array.from(groupedByName.entries()).map(([name, stack]) => scoreName(name, stack)),
  );
  const resultsWithIntelligence = includeExternalIntelligence
    ? await attachLiveDomainIntelligence(results, recommendations, {
        enabled: mode !== "mock",
      })
    : attachDomainIntelligence(results, recommendations);

  return {
    checkedAt: now.toISOString(),
    mode,
    capabilities: {
      registrarAvailability: mode === "mock" || configuredRegistrarProviders.length > 0,
      configuredRegistrarProviders,
    },
    results: resultsWithIntelligence,
    recommendations,
  };
}
