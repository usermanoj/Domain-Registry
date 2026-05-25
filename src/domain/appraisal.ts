import { assessBrandRisk, type BrandRiskReport } from "./brand-risk";
import type { MarketComparableReport } from "./market-comparables";
import { getExtensionQuality } from "./tlds";
import type { DomainCheckResult, Recommendation } from "./types";

export type AppraisalReport = {
  estimatedUsd: number;
  band: "registration" | "starter" | "premium" | "ultra";
  confidence: "low" | "medium" | "high";
  drivers: string[];
};

function statusMultiplier(result: DomainCheckResult) {
  if (result.status === "available_confirmed") return 1;
  if (result.status === "premium_available") return 1.8;
  if (result.status === "taken_confirmed") return 0.45;
  if (result.status === "manual_check_required") return 0.65;
  return 0.4;
}

function extensionMultiplier(extension: string) {
  const normalized = extension.toLowerCase();

  if (normalized === "com") return 2.2;
  if (normalized === "ai") return 1.9;
  if (normalized === "io") return 1.25;
  if (normalized === "co") return 1.12;
  if (["app", "dev"].includes(normalized)) return 1.05;
  if (["sg", "com.sg"].includes(normalized)) return 1;
  return 0.8;
}

function bandForValue(value: number): AppraisalReport["band"] {
  if (value >= 25_000) return "ultra";
  if (value >= 2_500) return "premium";
  if (value >= 250) return "starter";
  return "registration";
}

export function appraiseDomain(
  result: DomainCheckResult,
  recommendation?: Recommendation,
  risk: BrandRiskReport = assessBrandRisk(result.name),
  market?: MarketComparableReport,
): AppraisalReport {
  const brandScore = recommendation?.brandScore ?? 55;
  const extensionQuality = getExtensionQuality(result.extension);
  const lengthScore = Math.max(0, 24 - result.name.length) * 4;
  const base =
    35 +
    brandScore * 5.5 +
    extensionQuality * 3.2 +
    lengthScore +
    (result.premium ? 950 : 0);
  const riskPenalty = (100 - risk.score) * 9;
  const providerPrice = result.priceRegistration
    ? result.priceRegistration * (result.premium ? 1.1 : 3)
    : 0;
  const heuristicEstimated = Math.max(
    result.priceRegistration ?? 20,
    Math.round(
      (base - riskPenalty) *
        statusMultiplier(result) *
        extensionMultiplier(result.extension) +
        providerPrice,
    ),
  );
  const estimated = market?.estimateUsd
    ? Math.max(
        result.priceRegistration ?? 20,
        Math.round(heuristicEstimated * 0.65 + market.estimateUsd * 0.35),
      )
    : heuristicEstimated;
  const drivers = [
    `${result.extension.toUpperCase()} extension quality`,
    `${brandScore}/100 brand score`,
  ];

  if (result.name.length <= 10) {
    drivers.push("short name");
  }

  if (risk.score < 75) {
    drivers.push("brand-risk discount");
  }

  if (result.premium) {
    drivers.push("premium registrar signal");
  }

  if (market?.estimateUsd) {
    drivers.push("comparable sales");
  }

  return {
    estimatedUsd: estimated,
    band: bandForValue(estimated),
    confidence:
      market?.signal.confidence === "medium"
        ? "medium"
        : result.source === "registrar_api" && result.confidence === "high"
        ? "high"
        : result.status === "manual_check_required"
          ? "medium"
          : "low",
    drivers,
  };
}
