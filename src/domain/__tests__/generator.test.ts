import { describe, expect, it } from "vitest";
import { generateNameCandidates, transformName } from "../generator";

describe("candidate generation", () => {
  it("creates deterministic variants across requested styles", () => {
    const result = generateNameCandidates({
      seed: "trust, action, data, agentic AI, automation, revenue, efficiency",
      limit: 50,
      styles: ["sanskrit", "western", "short", "acronym"],
    });

    expect(result.seedTerms).toContain("trust");
    expect(result.candidates.length).toBeGreaterThan(8);
    expect(result.candidates.some((candidate) => candidate.name.includes("satya"))).toBe(true);
    expect(result.candidates.some((candidate) => candidate.style === "acronym")).toBe(true);
  });

  it("creates transformations for an input name", () => {
    const transformed = transformName("aptava");

    expect(transformed.map((candidate) => candidate.name)).toContain("aptavaai");
    expect(transformed.some((candidate) => candidate.rationale.includes("Sanskrit"))).toBe(true);
  });
});
