import {
  assessNameQuality,
  generateCommercialNameCandidates,
  rankCommercialNameCandidatesForExtension,
  scoreCommercialNameCandidate,
  type NameQualityAssessment,
} from "./name-quality";
import { preferenceBoost, type PreferenceProfile } from "./preference-learning";
import { normalizeBaseName } from "./normalize";
import { rankRecommendations, scoreName } from "./scoring";
import { getExtensionQuality } from "./tlds";
import type {
  DomainCheckResponse,
  DomainCheckResult,
  ProviderMode,
  Recommendation,
} from "./types";

export const RECOMMENDATION_TARGET_OPTIONS = [10, 20, 50, 100] as const;
export const RECOMMENDATION_TIME_BUDGET_OPTIONS = [2, 3, 4, 5] as const;
export const DEFAULT_RECOMMENDATION_TARGET = 20;
export const MAX_RECOMMENDATION_TARGET = 100;
export const DEFAULT_RECOMMENDATION_QUOTAS: Record<string, number> = {
  ai: 10,
  com: 10,
};

export type RecommendationTarget = (typeof RECOMMENDATION_TARGET_OPTIONS)[number];
export type RecommendationTimeBudgetMinutes =
  (typeof RECOMMENDATION_TIME_BUDGET_OPTIONS)[number];

export type RecommendationQuota = {
  extension: string;
  quota: number;
};

export type RecommendationPlan = {
  target: number;
  quotas: RecommendationQuota[];
  selectedExtensions: string[];
};

export type NamingMode = "balanced" | "brandable" | "keyword";

export type RecommendationConstraints = {
  maxWords?: number;
  allowSemanticAlternatives?: boolean;
  mustIncludeSeed?: boolean;
};

export type RecommendationCandidate = {
  name: string;
  score: number;
  method: string;
  intent: string;
  quality: NameQualityAssessment;
};

export type RecommendationEngineDiagnostics = {
  seed: string;
  intent: string;
  candidateCount: number;
  checkedCount: number;
  elapsedMs: number;
  exhaustedTimeBudget: boolean;
  quotaSummary: string;
};

export type RecommendationEngineResponse = {
  results: DomainCheckResult[];
  recommendations: Recommendation[];
  checkedCount: number;
  elapsedMs: number;
  diagnostics: RecommendationEngineDiagnostics;
};

export type RecommendationCheckBatch = (
  names: string[],
  extensions: string[],
) => Promise<DomainCheckResponse>;

export type RecommendationEngineRequest = {
  seedName: string;
  selectedExtensions: string[];
  recommendationPlan: RecommendationPlan;
  timeBudgetMs: number;
  existingResults: DomainCheckResult[];
  existingRecommendations: Recommendation[];
  checkAvailability: RecommendationCheckBatch;
  mode?: ProviderMode;
  namingMode?: NamingMode;
  constraints?: RecommendationConstraints;
  preferenceProfile?: PreferenceProfile;
  shouldContinue?: () => boolean;
};

const RECOMMENDATION_EXTENSION_PRIORITY = [
  "ai",
  "com",
  "tech",
  "io",
  "co",
  "app",
  "dev",
  "sg",
  "com.sg",
  "net",
  "education",
  "edu",
];
const ALTERNATIVE_CANDIDATE_CHECK_LIMIT = 2_000;
const RECOMMENDATION_BATCH_SIZE = 20;
const MAX_RECOMMENDATION_BATCHES = 80;
const AI_RECOMMENDATION_BATCH_DELAY_MS = 500;
const REGISTRAR_SIGNAL_PROBE_BATCHES = 1;
const NOISY_TERMS = new Set(["ops", "cloud", "grid", "works", "command", "control", "engine"]);
const STRONG_SUFFIXES = [
  "base",
  "hub",
  "forge",
  "pilot",
  "vault",
  "signal",
  "flow",
  "lens",
  "stack",
  "labs",
  "suite",
  "market",
  "guard",
  "logic",
];
const ACTION_PREFIXES = [
  "ask",
  "run",
  "get",
  "build",
  "secure",
  "scale",
  "trust",
  "ship",
  "find",
  "use",
];
const COMMERCIAL_FRAGMENTS = [
  ...STRONG_SUFFIXES,
  ...ACTION_PREFIXES,
  "agent",
  "operator",
  "assistant",
  "autopilot",
  "task",
  "action",
  "data",
  "signal",
  "metric",
  "insight",
  "query",
  "atlas",
  "graph",
  "stream",
  "enterprise",
  "business",
  "company",
  "scale",
  "trust",
  "govern",
  "venture",
];
const EMPTY_PREFERENCE_PROFILE: PreferenceProfile = {
  preferredFragments: {},
  rejectedFragments: {},
  preferredLength: 10,
  preferredExtensions: {},
  sampleSize: 0,
};

type SearchIntent = {
  key: string;
  confidence: number;
  roots: string[];
  curated: string[];
  nouns: string[];
  actions: string[];
};

const INTENT_PROFILES: Record<string, SearchIntent> = {
  agent: {
    key: "agent",
    confidence: 0.9,
    roots: ["operator", "assistant", "autopilot", "task", "action", "workflow"],
    curated: [
      "operatorpilot",
      "operatorbase",
      "operatorhub",
      "assistantforge",
      "assistantbase",
      "taskpilot",
      "actionforge",
      "autopilotbase",
      "workflowpilot",
      "agentforge",
      "agentpilot",
      "agentbase",
    ],
    nouns: ["pilot", "base", "forge", "hub", "signal", "suite", "desk"],
    actions: ["ask", "run", "build", "use", "ship"],
  },
  data: {
    key: "data",
    confidence: 0.9,
    roots: ["signal", "metric", "insight", "query", "atlas", "vault", "graph", "stream"],
    curated: [
      "datasignal",
      "datavault",
      "dataforge",
      "datapilot",
      "signalbase",
      "metricbase",
      "queryhub",
      "graphpilot",
      "streamforge",
      "insightforge",
      "atlasdata",
      "vaultdata",
    ],
    nouns: ["signal", "vault", "pilot", "forge", "lens", "hub", "atlas"],
    actions: ["ask", "query", "find", "map", "trust"],
  },
  enterprise: {
    key: "enterprise",
    confidence: 0.9,
    roots: ["business", "company", "scale", "trust", "govern", "venture", "workforce"],
    curated: [
      "enterprisebase",
      "enterpriseforge",
      "enterprisepilot",
      "enterprisesuite",
      "enterprisestack",
      "businessbase",
      "businessforge",
      "scalehub",
      "trustsuite",
      "governhub",
      "venturebase",
      "companypilot",
    ],
    nouns: ["suite", "base", "forge", "pilot", "stack", "hub", "signal"],
    actions: ["scale", "secure", "trust", "build", "govern"],
  },
};

const GENERIC_INTENT: SearchIntent = {
  key: "general",
  confidence: 0.45,
  roots: ["signal", "pilot", "forge", "base", "hub", "lens", "vault", "flow"],
  curated: [],
  nouns: ["base", "hub", "forge", "pilot", "signal", "lens", "vault"],
  actions: ["ask", "run", "get", "build", "scale", "trust"],
};

function compactName(value: string) {
  return normalizeBaseName(value).replace(/-/g, "");
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function hasNoisyTerm(name: string, seed: string) {
  return [...NOISY_TERMS].some((term) => name.includes(term) && !seed.includes(term));
}

function commercialFragmentCount(name: string) {
  return COMMERCIAL_FRAGMENTS.filter((fragment) => name.includes(fragment)).length;
}

function blend(left: string, right: string, maxLength = 12) {
  const l = compactName(left);
  const r = compactName(right);

  if (!l && !r) {
    return "";
  }

  for (let size = Math.min(l.length, r.length, 4); size >= 2; size -= 1) {
    if (l.endsWith(r.slice(0, size))) {
      return `${l}${r.slice(size)}`.slice(0, maxLength);
    }
  }

  return `${l.slice(0, Math.ceil(l.length / 2))}${r.slice(Math.floor(r.length / 2))}`
    .slice(0, maxLength);
}

function detectIntent(seedName: string): SearchIntent {
  const seed = compactName(seedName);
  const direct = INTENT_PROFILES[seed];

  if (direct) {
    return direct;
  }

  const partial = Object.values(INTENT_PROFILES).find((profile) => seed.includes(profile.key));

  if (partial) {
    return {
      ...partial,
      confidence: 0.72,
    };
  }

  return {
    ...GENERIC_INTENT,
    roots: unique([seed, ...GENERIC_INTENT.roots]).filter(Boolean),
  };
}

function addCandidate(
  candidates: Map<string, Omit<RecommendationCandidate, "score">>,
  seed: string,
  intent: SearchIntent,
  value: string,
  method: string,
  constraints: RecommendationConstraints,
) {
  const name = compactName(value);
  const maxWords = constraints.maxWords ?? 2;
  const quality = assessNameQuality(seed, name, {
    method,
    intentRoots: intent.roots,
    curatedNames: intent.curated,
    maxMorphemes: maxWords,
    allowFillerTerms: false,
    mustIncludeSeed: constraints.mustIncludeSeed,
  });

  if (!quality.accepted) return;

  candidates.set(name, candidates.get(name) ?? { name, method, intent: intent.key, quality });
}

function scoreEngineCandidate(
  seedName: string,
  name: string,
  intent: SearchIntent,
  extension?: string,
  method?: string,
) {
  const seed = compactName(seedName);
  const quality = assessNameQuality(seedName, name, {
    method,
    extension,
    intentRoots: intent.roots,
    curatedNames: intent.curated,
    maxMorphemes: 2,
    allowFillerTerms: false,
  });

  if (!quality.accepted) {
    return 0;
  }

  const baseScore = scoreCommercialNameCandidate(seedName, name, extension);
  const brandScore = scoreName(name).brandScore;
  const length = name.length;
  const semanticHit = intent.roots.some((root) => name.includes(root));
  const curatedHit = intent.curated.includes(name);
  const seedHit = seed.length > 0 && name.includes(seed);
  const conciseBonus = length <= 10 ? 14 : length <= 13 ? 8 : 0;
  const relationBonus = curatedHit ? 18 : semanticHit ? 12 : seedHit ? 9 : 0;
  const complexityPenalty = Math.max(0, commercialFragmentCount(name) - 2) * 8;
  const noisePenalty = hasNoisyTerm(name, seed) ? 24 : 0;
  const softFillerPenalty = quality.warnings.some((warning) => warning.startsWith("soft_filler"))
    ? 10
    : 0;

  return Math.max(
    0,
    Math.round(
      quality.score * 0.68 +
        baseScore * 0.12 +
        brandScore * 0.14 +
        conciseBonus +
        relationBonus -
        complexityPenalty -
        noisePenalty -
        softFillerPenalty,
    ),
  );
}

export function generateRecommendationCandidates({
  seedName,
  limit = ALTERNATIVE_CANDIDATE_CHECK_LIMIT,
  namingMode = "balanced",
  constraints = {},
}: {
  seedName: string;
  limit?: number;
  namingMode?: NamingMode;
  constraints?: RecommendationConstraints;
}) {
  const seed = compactName(seedName);
  const intent = detectIntent(seedName);
  const candidates = new Map<string, Omit<RecommendationCandidate, "score">>();
  const allowSemantic = constraints.allowSemanticAlternatives ?? true;

  if (!seed) {
    return {
      intent,
      candidates: [] as RecommendationCandidate[],
    };
  }

  for (const name of generateCommercialNameCandidates(seedName, Math.min(limit, 600))) {
    addCandidate(candidates, seed, intent, name, "commercial", constraints);
  }

  for (const name of intent.curated) {
    addCandidate(candidates, seed, intent, name, "curated", constraints);
  }

  const roots = allowSemantic ? unique([seed, ...intent.roots]) : [seed];
  const nouns = namingMode === "brandable"
    ? intent.nouns.filter((noun) => noun.length <= 6)
    : intent.nouns;

  for (const root of roots) {
    for (const noun of nouns) {
      addCandidate(candidates, seed, intent, `${root}${noun}`, "compound", constraints);
      if (!root.includes(noun) && namingMode !== "keyword") {
        addCandidate(candidates, seed, intent, `${noun}${root}`, "compound", constraints);
      }
    }

    for (const action of intent.actions) {
      addCandidate(candidates, seed, intent, `${action}${root}`, "action", constraints);
    }
  }

  if (namingMode !== "keyword") {
    for (const root of roots.slice(0, 10)) {
      for (const noun of nouns.slice(0, 4)) {
        addCandidate(candidates, seed, intent, blend(root, noun, 11), "brandable", constraints);
      }
    }
  }

  const ranked = Array.from(candidates.values())
    .map((candidate) => ({
      ...candidate,
      score: scoreEngineCandidate(seedName, candidate.name, intent, undefined, candidate.method),
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score;

      return scoreDelta === 0 ? left.name.localeCompare(right.name) : scoreDelta;
    });

  return {
    intent,
    candidates: ranked.slice(0, Math.max(1, Math.min(limit, ALTERNATIVE_CANDIDATE_CHECK_LIMIT))),
  };
}

export function rankRecommendationCandidatesForExtension(
  seedName: string,
  candidates: RecommendationCandidate[],
  extension: string,
  preferenceProfile?: PreferenceProfile,
) {
  const names = candidates.map((candidate) => candidate.name);
  const commercialRanked = rankCommercialNameCandidatesForExtension(seedName, names, extension);
  const candidateByName = new Map(candidates.map((candidate) => [candidate.name, candidate]));
  const intent = detectIntent(seedName);

  return commercialRanked
    .map((name) => {
      const candidate = candidateByName.get(name);
      const quality = assessNameQuality(seedName, name, {
        method: candidate?.method,
        extension,
        intentRoots: intent.roots,
        curatedNames: intent.curated,
        maxMorphemes: 2,
        allowFillerTerms: false,
      });

      return { name, candidate, quality };
    })
    .filter(({ quality }) => quality.accepted)
    .sort((left, right) => {
      const profile = preferenceProfile ?? EMPTY_PREFERENCE_PROFILE;
      const leftRank =
        scoreEngineCandidate(seedName, left.name, intent, extension, left.candidate?.method) +
        (left.candidate?.score ?? 0) * 0.2 +
        preferenceBoost(left.name, extension, profile);
      const rightRank =
        scoreEngineCandidate(seedName, right.name, intent, extension, right.candidate?.method) +
        (right.candidate?.score ?? 0) * 0.2 +
        preferenceBoost(right.name, extension, profile);
      const scoreDelta = rightRank - leftRank;

      return scoreDelta === 0 ? left.name.localeCompare(right.name) : scoreDelta;
    })
    .map(({ name }) => name);
}

export function isMockAvailabilityResult(result: DomainCheckResult) {
  return result.source === "mock" || result.providerName.toLowerCase().includes("mock");
}

export function isRegistrarAvailable(result: DomainCheckResult) {
  return (
    result.status === "available_confirmed" &&
    result.source === "registrar_api" &&
    !isMockAvailabilityResult(result)
  );
}

function preferredNameBoost(name: string, preferredName?: string) {
  return preferredName && name === preferredName ? 18 : 0;
}

function commercialExtensionBoost(extension: string) {
  const normalized = extension.toLowerCase();

  if (normalized === "ai") return 18;
  if (normalized === "com") return 16;
  if (normalized === "io") return 5;
  if (normalized === "co") return 4;
  if (normalized === "app") return 2;
  if (normalized === "dev") return 1;
  return 0;
}

function rankAvailableDomainResults(
  results: DomainCheckResult[],
  recommendations: Recommendation[],
  preferredName?: string,
) {
  const scoreByName = new Map(
    recommendations.map((recommendation) => [
      recommendation.name,
      recommendation.brandScore,
    ]),
  );

  return [...results]
    .filter(isRegistrarAvailable)
    .sort((left, right) => {
      const seed = preferredName ?? "";
      const leftRank =
        (scoreByName.get(left.name) ?? 0) +
        scoreCommercialNameCandidate(seed, left.name, left.extension) * 0.3 +
        getExtensionQuality(left.extension) * 0.35 +
        commercialExtensionBoost(left.extension) +
        preferredNameBoost(left.name, preferredName);
      const rightRank =
        (scoreByName.get(right.name) ?? 0) +
        scoreCommercialNameCandidate(seed, right.name, right.extension) * 0.3 +
        getExtensionQuality(right.extension) * 0.35 +
        commercialExtensionBoost(right.extension) +
        preferredNameBoost(right.name, preferredName);
      const scoreDelta = rightRank - leftRank;

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return getExtensionQuality(right.extension) - getExtensionQuality(left.extension);
    });
}

export function prioritizeAvailableDomainResults(
  results: DomainCheckResult[],
  recommendations: Recommendation[],
  recommendationPlan: RecommendationPlan,
  preferredName?: string,
) {
  const ranked = rankAvailableDomainResults(results, recommendations, preferredName);
  const byExtension = (extension: string) =>
    ranked.filter((result) => result.extension.toLowerCase() === extension);
  const quotaExtensions = new Set(
    recommendationPlan.quotas.map((item) => item.extension.toLowerCase()),
  );
  const selectedExtensions = new Set(
    recommendationPlan.selectedExtensions.map((extension) => extension.toLowerCase()),
  );
  const selected: DomainCheckResult[] = [];
  const selectedDomains = new Set<string>();

  function pushResults(nextResults: DomainCheckResult[], cap = recommendationPlan.target) {
    for (const result of nextResults) {
      if (
        selected.length >= recommendationPlan.target ||
        selectedDomains.has(result.domain) ||
        cap <= 0
      ) {
        continue;
      }

      selected.push(result);
      selectedDomains.add(result.domain);
      cap -= 1;
    }
  }

  for (const { extension, quota } of recommendationPlan.quotas) {
    pushResults(byExtension(extension), quota);
  }

  pushResults(
    ranked.filter((result) => quotaExtensions.has(result.extension.toLowerCase())),
  );
  pushResults(
    ranked.filter(
      (result) =>
        selectedExtensions.has(result.extension.toLowerCase()) &&
        !quotaExtensions.has(result.extension.toLowerCase()),
    ),
  );
  pushResults(
    ranked.filter((result) => !selectedExtensions.has(result.extension.toLowerCase())),
  );

  return selected;
}

function availabilityCountsByExtension(results: DomainCheckResult[]) {
  return results.filter(isRegistrarAvailable).reduce(
    (counts, result) => {
      const extension = result.extension.toLowerCase();

      counts[extension] = (counts[extension] ?? 0) + 1;

      return counts;
    },
    {} as Record<string, number>,
  );
}

function chunkList<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function currentTimeMs() {
  return Date.now();
}

function extensionSearchDepth(extension: string) {
  const normalized = extension.toLowerCase();

  if (normalized === "com") return 30;
  if (normalized === "ai") return 10;
  return 12;
}

export function sortRecommendationExtensions(extensions: string[]) {
  const priority = new Map(
    RECOMMENDATION_EXTENSION_PRIORITY.map((extension, index) => [extension, index]),
  );

  return [...extensions].sort((left, right) => {
    const leftRank = priority.get(left.toLowerCase()) ?? 999;
    const rightRank = priority.get(right.toLowerCase()) ?? 999;

    return leftRank === rightRank ? left.localeCompare(right) : leftRank - rightRank;
  });
}

export function clampRecommendationQuota(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(MAX_RECOMMENDATION_TARGET, Math.round(value)));
}

export function buildBalancedRecommendationQuotas(
  selectedExtensions: string[],
  target: number,
) {
  const selected = new Set(selectedExtensions.map((extension) => extension.toLowerCase()));
  const preferred = ["ai", "com"].filter((extension) => selected.has(extension));
  const recipients = preferred.length
    ? preferred
    : sortRecommendationExtensions(selectedExtensions).slice(0, Math.min(selectedExtensions.length, 4));
  const quotas: Record<string, number> = {};

  if (recipients.length === 0) {
    return quotas;
  }

  const baseQuota = Math.floor(target / recipients.length);
  let remainder = target % recipients.length;

  for (const extension of recipients) {
    quotas[extension] = baseQuota + (remainder > 0 ? 1 : 0);
    remainder -= 1;
  }

  return quotas;
}

export function buildRecommendationPlan(
  selectedExtensions: string[],
  recommendationQuotas: Record<string, number>,
): RecommendationPlan {
  const sortedExtensions = sortRecommendationExtensions(selectedExtensions);
  const quotas = sortedExtensions
    .map((extension) => ({
      extension,
      quota: clampRecommendationQuota(recommendationQuotas[extension] ?? 0),
    }))
    .filter((item) => item.quota > 0);
  const sourceQuotas =
    quotas.length > 0
      ? quotas
      : Object.entries(buildBalancedRecommendationQuotas(sortedExtensions, DEFAULT_RECOMMENDATION_TARGET))
          .map(([extension, quota]) => ({ extension, quota }));
  let remaining = MAX_RECOMMENDATION_TARGET;
  const cappedQuotas: RecommendationQuota[] = [];

  for (const item of sourceQuotas) {
    const quota = Math.min(item.quota, remaining);

    if (quota > 0) {
      cappedQuotas.push({ extension: item.extension, quota });
      remaining -= quota;
    }

    if (remaining <= 0) {
      break;
    }
  }

  const target = cappedQuotas.reduce((total, item) => total + item.quota, 0);

  return {
    target: Math.max(1, target),
    quotas: cappedQuotas,
    selectedExtensions: sortedExtensions,
  };
}

export function recommendationPlanSummary(recommendationPlan: RecommendationPlan) {
  return recommendationPlan.quotas
    .map(({ extension, quota }) => `${quota} .${extension}`)
    .join(" / ");
}

function mergeRecommendations(
  first: Recommendation[],
  second: Recommendation[],
) {
  const byName = new Map(first.map((recommendation) => [
    recommendation.name,
    recommendation,
  ]));

  for (const recommendation of second) {
    if (!byName.has(recommendation.name)) {
      byName.set(recommendation.name, recommendation);
    }
  }

  return Array.from(byName.values());
}

async function checkRecommendationExtensionBatches({
  seedName,
  candidates,
  extension,
  quota,
  deadline,
  checkAvailability,
  shouldContinue,
  preferenceProfile,
}: {
  seedName: string;
  candidates: RecommendationCandidate[];
  extension: string;
  quota: number;
  deadline: number;
  checkAvailability: RecommendationCheckBatch;
  shouldContinue: () => boolean;
  preferenceProfile?: PreferenceProfile;
}) {
  const rankedNames = rankRecommendationCandidatesForExtension(
    seedName,
    candidates,
    extension,
    preferenceProfile,
  );
  const maxBatches = Math.min(
    MAX_RECOMMENDATION_BATCHES,
    Math.ceil(
      Math.max(
        quota * extensionSearchDepth(extension),
        RECOMMENDATION_BATCH_SIZE,
      ) / RECOMMENDATION_BATCH_SIZE,
    ),
    Math.ceil(rankedNames.length / RECOMMENDATION_BATCH_SIZE),
  );
  const batches = chunkList(rankedNames, RECOMMENDATION_BATCH_SIZE).slice(0, maxBatches);
  let results: DomainCheckResult[] = [];
  let recommendations: Recommendation[] = [];
  let checkedCount = 0;

  for (let index = 0; index < batches.length; index += 1) {
    if (!shouldContinue() || currentTimeMs() >= deadline) {
      break;
    }

    const payload = await checkAvailability(batches[index], [extension]);
    const hasRegistrarSignal = payload.results.some(
      (result) => result.source === "registrar_api",
    );

    results = [...results, ...payload.results];
    recommendations = mergeRecommendations(recommendations, payload.recommendations);
    checkedCount += payload.results.length;

    if (
      payload.capabilities?.registrarAvailability === false &&
      !hasRegistrarSignal &&
      index + 1 >= REGISTRAR_SIGNAL_PROBE_BATCHES
    ) {
      break;
    }

    if ((availabilityCountsByExtension(results)[extension.toLowerCase()] ?? 0) >= quota) {
      break;
    }

    if (extension.toLowerCase() === "ai" && index < batches.length - 1) {
      await delay(AI_RECOMMENDATION_BATCH_DELAY_MS);
    }
  }

  return { results, recommendations, checkedCount };
}

export async function findAvailableDomainRecommendations({
  seedName,
  selectedExtensions,
  recommendationPlan,
  timeBudgetMs,
  existingResults,
  existingRecommendations,
  checkAvailability,
  namingMode = "balanced",
  constraints = {
    maxWords: 2,
    allowSemanticAlternatives: true,
    mustIncludeSeed: false,
  },
  preferenceProfile,
  shouldContinue = () => true,
}: RecommendationEngineRequest): Promise<RecommendationEngineResponse> {
  const startedAt = currentTimeMs();
  const deadline = startedAt + Math.max(1_000, timeBudgetMs);
  const seed = compactName(seedName);
  const generated = generateRecommendationCandidates({
    seedName,
    namingMode,
    constraints,
  });
  const existingNames = new Set([
    seed,
    ...existingResults.map((result) => result.name),
  ]);
  const candidates = generated.candidates.filter(
    (candidate) => !existingNames.has(candidate.name),
  );
  let alternativeResults: DomainCheckResult[] = [];
  let alternativeRecommendations: Recommendation[] = [];
  let checkedCount = 0;

  if (!seed || candidates.length === 0 || selectedExtensions.length === 0) {
    const elapsedMs = currentTimeMs() - startedAt;

    return {
      results: [],
      recommendations: [],
      checkedCount: 0,
      elapsedMs,
      diagnostics: {
        seed,
        intent: generated.intent.key,
        candidateCount: 0,
        checkedCount: 0,
        elapsedMs,
        exhaustedTimeBudget: false,
        quotaSummary: recommendationPlanSummary(recommendationPlan),
      },
    };
  }

  for (const { extension, quota } of recommendationPlan.quotas) {
    if (!shouldContinue() || currentTimeMs() >= deadline) {
      break;
    }

    const payload = await checkRecommendationExtensionBatches({
      seedName,
      candidates,
      extension,
      quota,
      deadline,
      checkAvailability,
      shouldContinue,
      preferenceProfile,
    });

    alternativeResults = [...alternativeResults, ...payload.results];
    alternativeRecommendations = mergeRecommendations(
      alternativeRecommendations,
      payload.recommendations,
    );
    checkedCount += payload.checkedCount;
  }

  const available = prioritizeAvailableDomainResults(
    alternativeResults,
    alternativeRecommendations,
    recommendationPlan,
    seedName,
  );

  const availableNames = new Set(available.map((result) => result.name));
  const recommendationByName = new Map(
    alternativeRecommendations.map((recommendation) => [
      recommendation.name,
      recommendation,
    ]),
  );
  const seedRecommendationByName = new Map(
    existingRecommendations.map((recommendation) => [
      recommendation.name,
      recommendation,
    ]),
  );
  const recommendations = rankRecommendations(
    Array.from(availableNames)
      .map((name) => recommendationByName.get(name) ?? seedRecommendationByName.get(name))
      .filter((recommendation): recommendation is Recommendation => Boolean(recommendation)),
  );
  const elapsedMs = currentTimeMs() - startedAt;

  return {
    results: available,
    recommendations,
    checkedCount,
    elapsedMs,
    diagnostics: {
      seed,
      intent: generated.intent.key,
      candidateCount: candidates.length,
      checkedCount,
      elapsedMs,
      exhaustedTimeBudget: currentTimeMs() >= deadline,
      quotaSummary: recommendationPlanSummary(recommendationPlan),
    },
  };
}
