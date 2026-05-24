import { describe, expect, it } from "vitest";
import { rankRecommendations, scoreName } from "../scoring";
import type { DomainCheckResult } from "../types";

const baseResult: DomainCheckResult = {
  id: "satyaflow.ai",
  name: "satyaflow",
  domain: "satyaflow.ai",
  sld: "satyaflow",
  tld: "ai",
  extension: "ai",
  status: "available_confirmed",
  confidence: "high",
  providerName: "mock",
  source: "mock",
  checkedAt: new Date("2026-05-22T00:00:00Z").toISOString(),
  premium: false,
  rules: [],
};

describe("recommendation scoring", () => {
  it("rewards AI-native Indic names with available domain stacks", () => {
    const score = scoreName("satyaflow", [
      baseResult,
      { ...baseResult, id: "satyaflow.com", domain: "satyaflow.com", extension: "com" },
    ]);

    expect(score.brandScore).toBeGreaterThan(75);
    expect(score.subscores.spiritualIndianDepth).toBeGreaterThan(80);
    expect(score.subscores.spiritualDepth).toBe(score.subscores.spiritualIndianDepth);
    expect(score.subscores.aiRelevance).toBeGreaterThan(80);
    expect(score.subscores.extensionAvailability).toBeGreaterThan(80);
    expect(score.subscores.domainStackQuality).toBeGreaterThan(80);
  });

  it("ranks a strong .ai + .com + .sg stack higher than a partial stack", () => {
    const fullStack = scoreName("satyaflow", [
      baseResult,
      { ...baseResult, id: "satyaflow.com", domain: "satyaflow.com", extension: "com" },
      { ...baseResult, id: "satyaflow.sg", domain: "satyaflow.sg", extension: "sg" },
    ]);
    const partialStack = scoreName("satyaflow", [
      {
        ...baseResult,
        id: "satyaflow.dev",
        domain: "satyaflow.dev",
        extension: "dev",
        status: "unknown",
      },
    ]);

    expect(fullStack.brandScore).toBeGreaterThan(partialStack.brandScore);
  });

  it("penalizes unknown availability and prioritizes confirmed availability", () => {
    const confirmed = scoreName("medhaops", [baseResult]);
    const unknown = scoreName("medhaops", [
      { ...baseResult, status: "unknown", confidence: "low" },
    ]);
    const ranked = rankRecommendations([unknown, confirmed]);

    expect(confirmed.brandScore).toBeGreaterThan(unknown.brandScore);
    expect(ranked[0]).toBe(confirmed);
  });

  it("penalizes difficult pronunciation", () => {
    const easy = scoreName("satyaflow");
    const difficult = scoreName("xqztprm");

    expect(easy.subscores.pronunciation).toBeGreaterThan(
      difficult.subscores.pronunciation,
    );
    expect(easy.brandScore).toBeGreaterThan(difficult.brandScore);
  });
});
