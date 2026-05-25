import { assessBrandRisk } from "./brand-risk";
import type { DomainCheckResult, Recommendation } from "./types";

export type AudiencePersona = "founder" | "enterprise_buyer" | "developer" | "investor";

export type AudienceScore = {
  persona: AudiencePersona;
  score: number;
  verdict: string;
};

const PERSONA_LABELS: Record<AudiencePersona, string> = {
  founder: "Founder",
  enterprise_buyer: "Enterprise buyer",
  developer: "Developer",
  investor: "Domain investor",
};

function extensionFit(persona: AudiencePersona, extension: string) {
  const tld = extension.toLowerCase();

  if (persona === "enterprise_buyer") return tld === "com" ? 16 : tld === "ai" ? 10 : 4;
  if (persona === "developer") return ["ai", "dev", "app", "io"].includes(tld) ? 14 : 5;
  if (persona === "investor") return ["com", "ai"].includes(tld) ? 16 : 6;
  return ["com", "ai", "co"].includes(tld) ? 12 : 6;
}

function verdictFor(score: number, persona: AudiencePersona) {
  const label = PERSONA_LABELS[persona];

  if (score >= 84) return `${label}: strong fit`;
  if (score >= 70) return `${label}: usable`;
  if (score >= 55) return `${label}: mixed`;
  return `${label}: weak`;
}

export function runAudienceTest(
  result: DomainCheckResult,
  recommendation?: Recommendation,
): AudienceScore[] {
  const risk = assessBrandRisk(result.name);
  const brandScore = recommendation?.brandScore ?? 55;
  const shortness = result.name.length <= 10 ? 12 : result.name.length <= 14 ? 6 : -6;
  const clarity = risk.spellingRisk === "low" ? 10 : -8;

  return (["founder", "enterprise_buyer", "developer", "investor"] as const).map(
    (persona) => {
      const score = Math.max(
        0,
        Math.min(
          100,
          Math.round(
            brandScore * 0.62 +
              risk.score * 0.18 +
              extensionFit(persona, result.extension) +
              shortness +
              clarity,
          ),
        ),
      );

      return {
        persona,
        score,
        verdict: verdictFor(score, persona),
      };
    },
  );
}

export function audienceConsensus(scores: AudienceScore[]) {
  if (scores.length === 0) {
    return { score: 0, label: "No audience score" };
  }

  const score = Math.round(scores.reduce((total, item) => total + item.score, 0) / scores.length);

  return {
    score,
    label: score >= 80 ? "Strong audience fit" : score >= 65 ? "Audience-fit ok" : "Audience-fit risk",
  };
}
