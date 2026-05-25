import { appraiseDomain } from "./appraisal";
import { assessBrandRisk } from "./brand-risk";
import { audienceConsensus, runAudienceTest } from "./audience-testing";
import { ledgerForResult } from "./evidence-ledger";
import { getMarketComparableReport, type MarketComparableReport } from "./market-comparables";
import { checkBrandHandleSignals } from "./social-handles";
import { checkUsptoTrademarkRisk } from "./trademark-risk";
import type {
  DomainCheckResult,
  DomainIntelligenceSignal,
  DomainIntelligenceSummary,
  Recommendation,
} from "./types";

type ExternalSignals = {
  nameSignals: DomainIntelligenceSignal[];
  market?: MarketComparableReport;
};

type ExternalSignalCacheEntry = {
  expiresAt: number;
  signals: DomainIntelligenceSignal[];
};

type AttachLiveOptions = {
  enabled?: boolean;
  maxDistinctNames?: number;
};

const externalSignalCache = new Map<string, ExternalSignalCacheEntry>();
const DEFAULT_EXTERNAL_SIGNAL_TTL_MS = 6 * 60 * 60 * 1_000;

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function recommendationByName(recommendations: Recommendation[]) {
  return new Map(recommendations.map((item) => [item.name, item]));
}

function confidenceScore(result: DomainCheckResult) {
  if (result.status === "available_confirmed" && result.source === "registrar_api") return 96;
  if (result.status === "premium_available" && result.source === "registrar_api") return 90;
  if (result.status === "taken_confirmed") return result.source === "registrar_api" ? 92 : 78;
  if (result.status === "manual_check_required") return 52;
  if (result.status === "rate_limited") return 38;
  if (result.status === "unknown") return 30;
  return 20;
}

function cacheTtlMs() {
  const parsed = Number(process.env.BRAND_INTELLIGENCE_CACHE_TTL_MS);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_EXTERNAL_SIGNAL_TTL_MS;
}

function externalSignalEnabled() {
  return process.env.ENABLE_LIVE_BRAND_INTELLIGENCE !== "false";
}

function scoreImpact(signals: DomainIntelligenceSignal[]) {
  return signals.reduce((total, signal) => total + (signal.scoreImpact ?? 0), 0);
}

function signalWarnings(signals: DomainIntelligenceSignal[]) {
  return signals
    .filter((signal) => signal.status === "conflict" || signal.kind === "trademark")
    .filter((signal) => signal.status !== "clear")
    .map((signal) => signal.detail);
}

function baseSignals({
  result,
  audienceLabel,
  confidence,
}: {
  result: DomainCheckResult;
  audienceLabel: string;
  confidence: number;
}): DomainIntelligenceSignal[] {
  const checkedAt = result.checkedAt;

  return [
    {
      kind: "availability",
      label:
        result.source === "registrar_api"
          ? "Registrar evidence"
          : result.source === "mock"
            ? "Mock evidence"
            : "Supporting evidence",
      status:
        result.status === "available_confirmed" && result.source === "registrar_api"
          ? "clear"
          : result.status === "taken_confirmed"
            ? "conflict"
            : result.status === "manual_check_required"
              ? "manual_check"
              : "unknown",
      confidence: result.confidence,
      source: result.providerName,
      detail: result.rawSummary ?? "Availability signal recorded.",
      checkedAt,
      scoreImpact: Math.round((confidence - 60) / 8),
    },
    {
      kind: "audience",
      label: audienceLabel,
      status: "partial",
      confidence: "medium",
      source: "Audience fit model",
      detail: `Audience-fit model classified this name as ${audienceLabel.toLowerCase()}.`,
      checkedAt,
      scoreImpact: 2,
    },
  ];
}

function rankingReasons({
  brandScore,
  confidence,
  riskScore,
  valuationUsd,
  launchReadiness,
  signals,
}: {
  brandScore: number;
  confidence: number;
  riskScore: number;
  valuationUsd: number;
  launchReadiness: number;
  signals: DomainIntelligenceSignal[];
}) {
  const reasons = [
    `Brand ${brandScore}/100`,
    `Availability confidence ${confidence}/100`,
    `Risk ${riskScore}/100`,
    `Value $${valuationUsd}`,
    `Launch readiness ${launchReadiness}/100`,
    ...signals
      .filter((signal) => signal.status === "clear" || signal.status === "conflict")
      .map((signal) => signal.label),
  ];

  return Array.from(new Set(reasons)).slice(0, 7);
}

export function buildDomainIntelligenceSummary(
  result: DomainCheckResult,
  recommendation?: Recommendation,
  external?: ExternalSignals,
): DomainIntelligenceSummary {
  const risk = assessBrandRisk(result.name);
  const appraisal = appraiseDomain(result, recommendation, risk, external?.market);
  const audience = audienceConsensus(runAudienceTest(result, recommendation));
  const ledger = ledgerForResult(result);
  const brandScore = recommendation?.brandScore ?? 55;
  const externalSignals = [
    ...(external?.nameSignals ?? []),
    ...(external?.market ? [external.market.signal] : []),
  ];
  const adjustedRiskScore = clamp(risk.score + scoreImpact(externalSignals));
  const confidence = clamp(
    confidenceScore(result) +
      externalSignals.filter((signal) => signal.status === "clear").length * 2 -
      externalSignals.filter((signal) => signal.status === "unknown").length,
  );
  const commercialScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        brandScore * 0.52 +
          audience.score * 0.22 +
          adjustedRiskScore * 0.16 +
          confidence * 0.1,
      ),
    ),
  );
  const launchReadiness = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        commercialScore * 0.45 +
          confidence * 0.25 +
          adjustedRiskScore * 0.2 +
          (result.status === "available_confirmed" ? 10 : 0),
      ),
    ),
  );
  const signals = [
    ...baseSignals({
      result,
      audienceLabel: audience.label,
      confidence,
    }),
    ...externalSignals,
  ];
  const warnings = [
    ...risk.warnings,
    ...signalWarnings(externalSignals),
    ...ledger.conflicts.map((conflict) => conflict.message),
  ];
  const labels = [
    ...risk.labels,
    audience.label,
    appraisal.band === "registration" ? "Affordable" : `${appraisal.band} value`,
    ...externalSignals
      .filter((signal) => signal.status === "clear")
      .map((signal) => signal.label),
  ];

  if (ledger.registrarEvidence.length > 1) {
    labels.push("Multi-registrar evidence");
  }

  return {
    commercialScore,
    riskScore: adjustedRiskScore,
    confidenceScore: confidence,
    valuationUsd: appraisal.estimatedUsd,
    launchReadiness,
    labels: Array.from(new Set(labels)).slice(0, 5),
    warnings: Array.from(new Set(warnings)).slice(0, 4),
    reasons: rankingReasons({
      brandScore,
      confidence,
      riskScore: adjustedRiskScore,
      valuationUsd: appraisal.estimatedUsd,
      launchReadiness,
      signals,
    }),
    signals: signals.slice(0, 10),
  };
}

export function attachDomainIntelligence(
  results: DomainCheckResult[],
  recommendations: Recommendation[],
) {
  const recs = recommendationByName(recommendations);

  return results.map((result) => ({
    ...result,
    intelligence: buildDomainIntelligenceSummary(result, recs.get(result.name)),
  }));
}

async function getNameExternalSignals(name: string) {
  const normalized = name.toLowerCase();
  const cached = externalSignalCache.get(normalized);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.signals;
  }

  const [trademark, handles] = await Promise.allSettled([
    checkUsptoTrademarkRisk(name),
    checkBrandHandleSignals(name),
  ]);
  const signals = [
    ...(trademark.status === "fulfilled" ? [trademark.value.signal] : []),
    ...(handles.status === "fulfilled" ? handles.value : []),
  ];

  externalSignalCache.set(normalized, {
    expiresAt: now + cacheTtlMs(),
    signals,
  });

  return signals;
}

export async function attachLiveDomainIntelligence(
  results: DomainCheckResult[],
  recommendations: Recommendation[],
  options: AttachLiveOptions = {},
) {
  const recs = recommendationByName(recommendations);
  const enabled = options.enabled ?? externalSignalEnabled();
  const base = attachDomainIntelligence(results, recommendations);

  if (!enabled || process.env.NODE_ENV === "test") {
    return base;
  }

  const requestedDistinctNames = Number(
    process.env.LIVE_BRAND_INTELLIGENCE_NAME_LIMIT ?? options.maxDistinctNames ?? 12,
  );
  const maxDistinctNames = Math.max(
    1,
    Math.min(Number.isFinite(requestedDistinctNames) ? requestedDistinctNames : 12, 50),
  );
  const names = Array.from(new Set(base.map((result) => result.name)))
    .sort((left, right) => (recs.get(right)?.brandScore ?? 0) - (recs.get(left)?.brandScore ?? 0))
    .slice(0, maxDistinctNames);
  const allowedNames = new Set(names);
  const signalsByName = new Map(
    await Promise.all(names.map(async (name) => [name, await getNameExternalSignals(name)] as const)),
  );

  return Promise.all(
    base.map(async (result) => {
      if (!allowedNames.has(result.name)) {
        return result;
      }

      const recommendation = recs.get(result.name);
      const market = await getMarketComparableReport(result, recommendation);

      return {
        ...result,
        intelligence: buildDomainIntelligenceSummary(result, recommendation, {
          nameSignals: signalsByName.get(result.name) ?? [],
          market,
        }),
      };
    }),
  );
}
