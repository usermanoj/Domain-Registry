import { appraiseDomain } from "./appraisal";
import { assessBrandRisk } from "./brand-risk";
import type { DomainCheckResult, Recommendation } from "./types";

export type PortfolioInsight = {
  totalDomains: number;
  confirmedAvailable: number;
  manualReview: number;
  estimatedPortfolioValueUsd: number;
  averageLaunchReadiness: number;
  extensionMix: Record<string, number>;
  warnings: string[];
};

export type PortfolioSharePayload = {
  title: string;
  generatedAt: string;
  domains: Array<{
    domain: string;
    status: string;
    provider: string;
    estimatedUsd: number;
    launchReadiness: number;
    registrarUrl?: string;
  }>;
  insight: PortfolioInsight;
};

function recommendationByName(recommendations: Recommendation[]) {
  return new Map(recommendations.map((item) => [item.name, item]));
}

export function buildPortfolioInsight(
  results: DomainCheckResult[],
  recommendations: Recommendation[],
): PortfolioInsight {
  const recs = recommendationByName(recommendations);
  const extensionMix: Record<string, number> = {};
  const warnings: string[] = [];
  let estimatedPortfolioValueUsd = 0;
  let launchReadinessTotal = 0;

  for (const result of results) {
    extensionMix[result.extension] = (extensionMix[result.extension] ?? 0) + 1;
    estimatedPortfolioValueUsd += appraiseDomain(
      result,
      recs.get(result.name),
      assessBrandRisk(result.name),
    ).estimatedUsd;
    launchReadinessTotal += result.intelligence?.launchReadiness ?? 0;
  }

  const manualReview = results.filter((result) =>
    ["manual_check_required", "unknown", "rate_limited", "restricted"].includes(result.status),
  ).length;

  if (manualReview > 0) {
    warnings.push(`${manualReview} domains need manual or checkout review.`);
  }

  if ((extensionMix.com ?? 0) === 0 && results.length > 0) {
    warnings.push("No .com option in portfolio; enterprise recall may be weaker.");
  }

  return {
    totalDomains: results.length,
    confirmedAvailable: results.filter(
      (result) => result.status === "available_confirmed" && result.source === "registrar_api",
    ).length,
    manualReview,
    estimatedPortfolioValueUsd,
    averageLaunchReadiness: results.length
      ? Math.round(launchReadinessTotal / results.length)
      : 0,
    extensionMix,
    warnings,
  };
}

export function buildPortfolioSharePayload({
  title,
  results,
  recommendations,
}: {
  title: string;
  results: DomainCheckResult[];
  recommendations: Recommendation[];
}): PortfolioSharePayload {
  const recs = recommendationByName(recommendations);

  return {
    title,
    generatedAt: new Date().toISOString(),
    domains: results.map((result) => {
      const appraisal = appraiseDomain(result, recs.get(result.name));

      return {
        domain: result.domain,
        status: result.status,
        provider: result.providerName,
        estimatedUsd: appraisal.estimatedUsd,
        launchReadiness: result.intelligence?.launchReadiness ?? 0,
        registrarUrl: result.registrarUrl,
      };
    }),
    insight: buildPortfolioInsight(results, recommendations),
  };
}
