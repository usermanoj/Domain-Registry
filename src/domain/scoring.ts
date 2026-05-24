import { getExtensionQuality, statusRank } from "./tlds";
import type {
  DomainCheckResult,
  Recommendation,
  RecommendationSubscores,
} from "./types";

const VOWELS = new Set(["a", "e", "i", "o", "u"]);
const INDIAN_ROOTS = ["satya", "karma", "dharma", "veda", "artha", "bodhi", "daksha", "nadi"];
const AI_TERMS = ["ai", "agent", "data", "flow", "ops", "auto", "logic", "mind", "signal"];
const ENTERPRISE_TERMS = ["systems", "suite", "cloud", "logic", "base", "works", "labs", "hq"];

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
  return /(.)\1{2,}/.test(name) || /[bcdfghjklmnpqrstvwxyz]{5,}/.test(name);
}

export function scoreName(
  name: string,
  stack: DomainCheckResult[] = [],
): Recommendation {
  const normalized = name.toLowerCase();
  const length = normalized.length;
  const transitions = countTransitions(normalized);
  const vowelRatio = length ? [...normalized].filter((char) => VOWELS.has(char)).length / length : 0;
  const hasHyphenOrNumber = /[-0-9]/.test(normalized);
  const indianDepth = INDIAN_ROOTS.some((root) => normalized.includes(root)) ? 88 : 38;
  const aiNative = AI_TERMS.some((term) => normalized.includes(term)) ? 86 : 52;
  const enterprise = ENTERPRISE_TERMS.some((term) => normalized.includes(term)) ? 84 : 60;
  const availableCount = stack.filter((result) =>
    ["available_confirmed", "premium_available"].includes(result.status),
  ).length;
  const stackQuality = stack.length
    ? stack.reduce(
        (total, result) =>
          total +
          getExtensionQuality(result.extension) *
            (result.status === "available_confirmed"
              ? 1
              : result.status === "premium_available"
                ? 0.78
                : result.status === "taken_confirmed"
                  ? 0.15
                  : 0.3),
        0,
      ) / stack.length
    : 55;
  const extensionQuality = stack.length
    ? Math.max(...stack.map((result) => getExtensionQuality(result.extension)))
    : 55;
  const availabilityConfidence = stack.length
    ? Math.max(...stack.map((result) => statusRank(result.status)))
    : 45;

  const subscores: RecommendationSubscores = {
    memorability: clamp(96 - Math.abs(length - 7) * 6 - (hasHyphenOrNumber ? 14 : 0)),
    pronunciationEase: clamp(46 + transitions * 9 + vowelRatio * 34 - (hasRepeatedRuns(normalized) ? 24 : 0)),
    spellingClarity: clamp(92 - (hasHyphenOrNumber ? 24 : 0) - (/(q|x|z).*(q|x|z)/.test(normalized) ? 12 : 0)),
    brandStrength: clamp(58 + (length >= 5 && length <= 12 ? 24 : 0) + (availableCount > 1 ? 8 : 0)),
    enterpriseCredibility: clamp(enterprise),
    spiritualIndianDepth: clamp(indianDepth),
    aiNativeFeel: clamp(aiNative),
    domainStackQuality: clamp(stackQuality),
    riskOfConfusion: clamp((hasHyphenOrNumber ? 28 : 8) + (length > 14 ? 18 : 0) + (hasRepeatedRuns(normalized) ? 16 : 0)),
    length: clamp(100 - Math.abs(length - 8) * 7),
    extensionQuality: clamp(extensionQuality),
    availabilityConfidence: clamp(availabilityConfidence),
  };

  const brandScore = clamp(
    subscores.memorability * 0.12 +
      subscores.pronunciationEase * 0.11 +
      subscores.spellingClarity * 0.1 +
      subscores.brandStrength * 0.12 +
      subscores.enterpriseCredibility * 0.09 +
      subscores.spiritualIndianDepth * 0.06 +
      subscores.aiNativeFeel * 0.1 +
      subscores.domainStackQuality * 0.14 +
      (100 - subscores.riskOfConfusion) * 0.07 +
      subscores.length * 0.04 +
      subscores.extensionQuality * 0.03 +
      subscores.availabilityConfidence * 0.02,
  );

  const strengths = [
    subscores.memorability >= 78 ? "memorable" : "",
    subscores.pronunciationEase >= 78 ? "easy to say" : "",
    subscores.aiNativeFeel >= 78 ? "AI-native" : "",
    subscores.domainStackQuality >= 78 ? "strong domain stack" : "",
    subscores.spiritualIndianDepth >= 78 ? "Indic depth" : "",
  ].filter(Boolean);

  return {
    name: normalized,
    brandScore,
    subscores,
    explanation:
      strengths.length > 0
        ? `${normalized} is ${strengths.slice(0, 3).join(", ")} with a ${brandScore}/100 composite score.`
        : `${normalized} is viable but needs a stronger domain stack or clearer brand signal.`,
  };
}

export function rankRecommendations(recommendations: Recommendation[]) {
  return [...recommendations].sort((a, b) => b.brandScore - a.brandScore);
}
