import { buildDomainInputs, composeDomain, parseDomainName } from "./normalize";
import { mockProvider } from "./providers/mock-provider";
import { namecheapProvider } from "./providers/namecheap-provider";
import { buildAvailabilityResult, runBulkLimited } from "./providers/provider-utils";
import { rdapProvider } from "./providers/rdap-provider";
import { restrictedTldProvider } from "./providers/restricted-tld-provider";
import { sgProvider } from "./providers/sg-provider";
import { rankRecommendations, scoreName } from "./scoring";
import type {
  DomainAvailabilityProvider,
  DomainCheckResponse,
  DomainCheckResult,
  ProviderMode,
} from "./types";

const CONCURRENCY = 8;

function providersForMode(mode: ProviderMode): DomainAvailabilityProvider[] {
  if (mode === "mock") {
    return [restrictedTldProvider, mockProvider];
  }

  if (mode === "live") {
    return [restrictedTldProvider, sgProvider, namecheapProvider, rdapProvider];
  }

  return [
    restrictedTldProvider,
    sgProvider,
    namecheapProvider,
    rdapProvider,
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

      const result = await provider.check(parts.domain);

      if (result.status !== "unknown") {
        return result;
      }
    }

    return manualResult(
      parts.domain,
      "No provider in the configured chain returned a conclusive result.",
    );
  }

  async checkBulk(domains: string[]) {
    return runBulkLimited(domains, (domain) => this.check(domain), CONCURRENCY);
  }
}

export function createAvailabilityEngine(mode: ProviderMode) {
  return new DomainAvailabilityEngine(providersForMode(mode));
}

export async function checkDomains({
  names,
  extensions,
  mode = "mock",
}: {
  names: string[];
  extensions: string[];
  mode?: ProviderMode;
}): Promise<DomainCheckResponse> {
  const now = new Date();
  const inputs = buildDomainInputs(names, extensions);
  const engine = createAvailabilityEngine(mode);
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

  return {
    checkedAt: now.toISOString(),
    mode,
    results,
    recommendations,
  };
}
