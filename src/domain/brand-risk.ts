import { normalizeBaseName } from "./normalize";

export type BrandRiskReport = {
  score: number;
  trademarkRisk: "low" | "medium" | "high";
  spellingRisk: "low" | "medium" | "high";
  famousBrandRisk: "low" | "medium" | "high";
  socialHandleRisk: "low" | "medium" | "high";
  warnings: string[];
  labels: string[];
};

const FAMOUS_BRAND_TERMS = [
  "google",
  "amazon",
  "apple",
  "meta",
  "facebook",
  "instagram",
  "microsoft",
  "openai",
  "chatgpt",
  "claude",
  "anthropic",
  "gemini",
  "deepmind",
  "perplexity",
  "mistral",
  "tesla",
  "stripe",
  "salesforce",
  "oracle",
  "adobe",
  "nvidia",
];

const REGULATED_TERMS = [
  "bank",
  "insurance",
  "broker",
  "medical",
  "clinic",
  "law",
  "legal",
  "university",
  "gov",
];

function compact(value: string) {
  return normalizeBaseName(value).replace(/-/g, "");
}

function hasHardConsonantRun(value: string) {
  return /[bcdfghjklmnpqrstvwxyz]{5,}/.test(value);
}

function hasAmbiguousCharacters(value: string) {
  return /0|1|l|i/.test(value) && /o|0|l|1|i/.test(value);
}

export function assessBrandRisk(name: string): BrandRiskReport {
  const normalized = compact(name);
  const warnings: string[] = [];
  const labels: string[] = [];
  let score = 100;

  const famousHit = FAMOUS_BRAND_TERMS.find(
    (brand) => normalized === brand || normalized.includes(brand),
  );

  if (famousHit) {
    score -= 45;
    warnings.push(`Contains or closely overlaps a famous brand term: ${famousHit}.`);
  }

  const regulatedHit = REGULATED_TERMS.find((term) => normalized.includes(term));

  if (regulatedHit) {
    score -= 14;
    warnings.push(`Contains regulated or policy-sensitive wording: ${regulatedHit}.`);
  }

  if (normalized.length > 14) {
    score -= Math.min(18, normalized.length - 14);
    warnings.push("Long names are harder to remember, say, and use as handles.");
  } else {
    labels.push("Concise");
  }

  if (hasHardConsonantRun(normalized)) {
    score -= 16;
    warnings.push("Pronunciation risk: hard consonant cluster.");
  }

  if (hasAmbiguousCharacters(normalized)) {
    score -= 10;
    warnings.push("Spelling risk: visually ambiguous characters.");
  }

  if (/[^a-z]/.test(normalized)) {
    score -= 12;
    warnings.push("Non-letter characters can reduce recall and voice clarity.");
  }

  const repeated = /(.)\1{2,}/.test(normalized);

  if (repeated) {
    score -= 8;
    warnings.push("Repeated character sequence may look accidental.");
  }

  if (warnings.length === 0) {
    labels.push("Low brand risk");
  }

  const finalScore = Math.max(0, Math.min(100, score));

  return {
    score: finalScore,
    trademarkRisk: famousHit ? "high" : regulatedHit ? "medium" : "low",
    spellingRisk:
      hasHardConsonantRun(normalized) || hasAmbiguousCharacters(normalized)
        ? "medium"
        : "low",
    famousBrandRisk: famousHit ? "high" : "low",
    socialHandleRisk: normalized.length > 15 ? "medium" : "low",
    warnings,
    labels,
  };
}
