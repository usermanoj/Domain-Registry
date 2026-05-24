import { describe, expect, it } from "vitest";
import { scoreName } from "../scoring";
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
    expect(score.subscores.domainStackQuality).toBeGreaterThan(80);
  });
});
