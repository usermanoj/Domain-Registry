import { describe, expect, it } from "vitest";
import {
  generateNameCandidates,
  normalizeGenerationStyle,
  transformName,
} from "../generator";
import { scoreName } from "../scoring";

describe("candidate generation", () => {
  it("creates deterministic variants across requested styles", () => {
    const result = generateNameCandidates({
      seed: "trust, action, data, agentic AI, automation, revenue, efficiency",
      limit: 50,
      styles: ["sanskrit_hindi", "enterprise", "short", "acronym"],
    });

    expect(result.seedTerms).toContain("trust");
    expect(result.candidates.length).toBeGreaterThan(8);
    expect(result.candidates.some((candidate) => candidate.name.includes("satya"))).toBe(true);
    expect(result.candidates.some((candidate) => candidate.style === "acronym")).toBe(true);
  });

  it("generates the requested count of unique names across core styles", () => {
    const result = generateNameCandidates({
      seed: "trust action data automation revenue flow intelligence",
      limit: 40,
      minLength: 5,
      maxLength: 12,
      styles: [
        "sanskrit_hindi",
        "enterprise",
        "bizarre_brandable",
        "ai_native",
        "agentic_automation",
        "data_analytics",
        "workflow_ops",
        "revenue_growth",
      ],
    });

    expect(result.candidates).toHaveLength(40);
    expect(new Set(result.candidates.map((candidate) => candidate.name)).size).toBe(40);
    expect(result.candidates.some((candidate) => candidate.style === "sanskrit_hindi")).toBe(true);
    expect(result.candidates.some((candidate) => candidate.style === "enterprise")).toBe(true);
    expect(result.candidates.some((candidate) => candidate.style === "bizarre_brandable")).toBe(true);
  });

  it("accepts prompt-style labels and applies length/text filters", () => {
    expect(normalizeGenerationStyle("Sanskrit/Hindi")).toBe("sanskrit_hindi");
    expect(normalizeGenerationStyle("AI-native")).toBe("ai_native");

    const result = generateNameCandidates({
      seed: "trust, data, automation",
      limit: 30,
      styles: ["ai_native", "data_analytics"],
      minLength: 5,
      maxLength: 9,
      mustInclude: "a",
      avoidLetters: "z",
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((candidate) => candidate.name.length >= 5)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.name.length <= 9)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.name.includes("a"))).toBe(true);
    expect(result.candidates.every((candidate) => !candidate.name.includes("z"))).toBe(true);
  });

  it("scores generated candidates with the recommendation engine", () => {
    const result = generateNameCandidates({
      seed: "trust, automation, intelligence",
      limit: 10,
      styles: ["sanskrit_hindi", "ai_native"],
    });
    const scores = result.candidates.map((candidate) => scoreName(candidate.name));

    expect(scores).toHaveLength(10);
    expect(scores.every((score) => score.brandScore >= 0 && score.brandScore <= 100)).toBe(true);
  });

  it("filters generic and famous AI brand-adjacent names", () => {
    const result = generateNameCandidates({
      seed: "openai, chatgpt, data, workflow",
      limit: 50,
      styles: ["ai_native", "workflow_ops"],
    });

    expect(result.candidates.every((candidate) => !candidate.name.includes("openai"))).toBe(true);
    expect(result.candidates.every((candidate) => !candidate.name.includes("chatgpt"))).toBe(true);
    expect(result.candidates.every((candidate) => candidate.name !== "data")).toBe(true);
  });

  it("creates transformations for an input name", () => {
    const transformed = transformName("aptava");

    expect(transformed.map((candidate) => candidate.name)).toContain("aptavaai");
    expect(transformed.some((candidate) => candidate.rationale.includes("Sanskrit"))).toBe(true);
  });
});
