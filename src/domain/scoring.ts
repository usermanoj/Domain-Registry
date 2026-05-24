import { getExtensionQuality, statusRank } from "./tlds";
import type {
  DomainCheckResult,
  Recommendation,
  RecommendationSubscores,
} from "./types";

const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const SPIRITUAL_ROOTS = [
  "apta",
  "vishwas",
  "shraddha",
  "nishtha",
  "satya",
  "ritam",
  "kriya",
  "karya",
  "karma",
  "yukti",
  "tarka",
  "pramana",
  "medha",
  "vivek",
  "veda",
  "pravah",
  "nadi",
  "dhara",
  "niti",
  "niyam",
  "dharma",
  "tejas",
  "ojas",
  "prana",
  "bodhi",
  "artha",
  "daksha",
  "yantra",
  "doot",
];
const AI_TERMS = ["ai", "agent", "auto", "bot", "cog", "data", "flow", "iq", "logic", "mind", "neural", "ops", "pilot", "signal", "syn"];
const ENTERPRISE_TERMS = ["base", "cloud", "grid", "hq", "labs", "logic", "signal", "suite", "systems", "works"];
const DATA_AUTOMATION_TERMS = [
  "agent",
  "analytics",
  "auto",
  "data",
  "flow",
  "graph",
  "loop",
  "metric",
  "ops",
  "pilot",
  "signal",
  "workflow",
  "yantra",
];
const FAMOUS_AI_BRANDS = [
  "openai",
  "chatgpt",
  "anthropic",
  "claude",
  "gemini",
  "deepmind",
  "perplexity",
  "mistral",
  "copilot",
  "midjourney",
  "huggingface",
  "characterai",
  "jasper",
  "grok",
];
const GENERIC_TERMS = new Set([
  "ai",
  "agent",
  "analytics",
  "app",
  "automation",
  "business",
  "data",
  "growth",
  "ops",
  "platform",
  "revenue",
  "software",
  "solution",
  "workflow",
]);

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function countTransitions(name: string) {
  let transitions = 0;

  for (let index = 1; index < name.length; index += 1) {
    if (VOWELS.has(name[index]) !== VOWELS.has(name[index - 1])) {
      transitions += 1;
    }
  }

  return transitions;
}

function hasRepeatedRuns(name: string) {
  return /(.)\1{2,}/.test(name) || /[bcdfghjklmnpqrstvwxyz]{4,}/.test(name);
}

function termScore(name: string, terms: string[], base: number, hit: number) {
  const hits = terms.filter((term) => name.includes(term)).length;
  return clamp(base + Math.min(hit, hits * hit));
}

function isCloseToFamousBrand(name: string) {
  return FAMOUS_AI_BRANDS.some((brand) => name === brand || name.includes(brand));
}

function availabilityScore(stack: DomainCheckResult[]) {
  if (stack.length === 0) {
    return 45;
  }

  const best = Math.max(...stack.map((result) => statusRank(result.status)));
  const available = stack.filter((result) =>
    ["available_confirmed", "premium_available"].includes(result.status),
  ).length;

  return clamp(best * 0.72 + (available / stack.length) * 28);
}

function domainStackQuality(stack: DomainCheckResult[]) {
  if (stack.length === 0) {
    return 55;
  }

  return clamp(
    stack.reduce((total, result) => {
      const availabilityMultiplier =
        result.status === "available_confirmed"
          ? 1
          : result.status === "premium_available"
            ? 0.8
            : result.status === "taken_confirmed"
              ? 0.15
              : result.status === "restricted"
                ? 0.22
                : 0.32;

      return total + getExtensionQuality(result.extension) * availabilityMultiplier;
    }, 0) / stack.length,
  );
}

export function scoreName(
  name: string,
  stack: DomainCheckResult[] = [],
): Recommendation {
  const normalized = name.toLowerCase();
  const length = normalized.length;
  const transitions = countTransitions(normalized);
  const vowelRatio = length
    ? [...normalized].filter((char) => VOWELS.has(char)).length / length
    : 0;
  const hasHyphenOrNumber = /[-0-9]/.test(normalized);
  const repeatedRuns = hasRepeatedRuns(normalized);
  const genericPenalty = GENERIC_TERMS.has(normalized) ? 34 : 0;
  const famousPenalty = isCloseToFamousBrand(normalized) ? 42 : 0;
  const availableCount = stack.filter((result) =>
    ["available_confirmed", "premium_available"].includes(result.status),
  ).length;
  const extensionQuality = stack.length
    ? Math.max(...stack.map((result) => getExtensionQuality(result.extension)))
    : 55;
  const extensionAvailability = availabilityScore(stack);

  const pronunciation = clamp(
    44 +
      transitions * 8 +
      vowelRatio * 34 -
      (repeatedRuns ? 26 : 0) -
      (vowelRatio < 0.18 || vowelRatio > 0.78 ? 16 : 0),
  );
  const memorability = clamp(
    98 - Math.abs(length - 7) * 6 - (hasHyphenOrNumber ? 16 : 0) - (repeatedRuns ? 12 : 0),
  );
  const spiritualDepth = termScore(normalized, SPIRITUAL_ROOTS, 34, 54);
  const aiRelevance = termScore(normalized, AI_TERMS, 48, 42);
  const enterpriseCredibility = termScore(normalized, ENTERPRISE_TERMS, 56, 32);
  const dataAutomationRelevance = termScore(normalized, DATA_AUTOMATION_TERMS, 46, 44);
  const uniqueness = clamp(
    76 +
      (length >= 5 && length <= 12 ? 14 : 0) +
      (/x|q|v|z/.test(normalized) ? 4 : 0) -
      genericPenalty -
      famousPenalty -
      (hasHyphenOrNumber ? 16 : 0),
  );
  const shortness = clamp(100 - Math.max(0, length - 6) * 7 - Math.max(0, 5 - length) * 8);
  const stackQuality = domainStackQuality(stack);
  const spellingClarity = clamp(
    92 - (hasHyphenOrNumber ? 24 : 0) - (/(q|x|z).*(q|x|z)/.test(normalized) ? 12 : 0),
  );
  const brandStrength = clamp(
    52 +
      (length >= 5 && length <= 12 ? 22 : 0) +
      (availableCount > 1 ? 8 : 0) +
      (uniqueness >= 80 ? 8 : 0),
  );
  const riskOfConfusion = clamp(
    (hasHyphenOrNumber ? 28 : 8) +
      (length > 14 ? 18 : 0) +
      (repeatedRuns ? 18 : 0) +
      genericPenalty * 0.5 +
      famousPenalty,
  );

  const subscores: RecommendationSubscores = {
    memorability,
    pronunciation,
    pronunciationEase: pronunciation,
    aiRelevance,
    spellingClarity,
    brandStrength,
    enterpriseCredibility,
    uniqueness,
    spiritualDepth,
    spiritualIndianDepth: spiritualDepth,
    dataAutomationRelevance,
    shortness,
    extensionAvailability,
    aiNativeFeel: aiRelevance,
    domainStackQuality: stackQuality,
    riskOfConfusion,
    length: shortness,
    extensionQuality: clamp(extensionQuality),
    availabilityConfidence: extensionAvailability,
  };

  const brandScore = clamp(
    subscores.memorability * 0.1 +
      subscores.pronunciation * 0.1 +
      subscores.aiRelevance * 0.1 +
      subscores.enterpriseCredibility * 0.08 +
      subscores.uniqueness * 0.1 +
      subscores.spiritualDepth * 0.07 +
      subscores.dataAutomationRelevance * 0.1 +
      subscores.shortness * 0.08 +
      subscores.extensionAvailability * 0.12 +
      subscores.domainStackQuality * 0.1 +
      subscores.spellingClarity * 0.03 +
      (100 - subscores.riskOfConfusion) * 0.02,
  );

  const strengths = [
    subscores.memorability >= 78 ? "memorable" : "",
    subscores.pronunciation >= 78 ? "easy to say" : "",
    subscores.aiRelevance >= 78 ? "AI-relevant" : "",
    subscores.enterpriseCredibility >= 78 ? "enterprise credible" : "",
    subscores.uniqueness >= 82 ? "distinctive" : "",
    subscores.spiritualDepth >= 78 ? "rooted in Indic meaning" : "",
    subscores.dataAutomationRelevance >= 78 ? "strong for data and automation" : "",
    subscores.domainStackQuality >= 78 ? "backed by a strong domain stack" : "",
  ].filter(Boolean);

  return {
    name: normalized,
    brandScore,
    subscores,
    explanation:
      strengths.length > 0
        ? `${normalized} is ${strengths.slice(0, 4).join(", ")} with a ${brandScore}/100 composite score.`
        : `${normalized} is viable, but the score is held back by pronunciation, genericness, or domain-stack constraints.`,
  };
}

export function rankRecommendations(recommendations: Recommendation[]) {
  return [...recommendations].sort((a, b) => b.brandScore - a.brandScore);
}
