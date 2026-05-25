import { describe, expect, it } from "vitest";
import {
  buildBalancedRecommendationQuotas,
  buildRecommendationPlan,
  findAvailableDomainRecommendations,
  generateRecommendationCandidates,
  isRegistrarAvailable,
} from "../recommendation-engine";
import { scoreName } from "../scoring";
import type {
  DomainCheckResponse,
  DomainCheckResult,
  Recommendation,
} from "../types";

function fakeResult(
  name: string,
  extension: string,
  status: DomainCheckResult["status"] = "available_confirmed",
): DomainCheckResult {
  const domain = `${name}.${extension}`;

  return {
    id: domain,
    name,
    domain,
    sld: name,
    tld: extension,
    extension,
    status,
    confidence: "high",
    providerName: "TestAvailabilityProvider",
    source: "registrar_api",
    checkedAt: new Date("2026-05-25T00:00:00Z").toISOString(),
    premium: false,
    rules: [],
    registrarUrl: `https://example.test/register/${domain}`,
  };
}

function recommendationsFor(results: DomainCheckResult[]) {
  const byName = new Map<string, DomainCheckResult[]>();

  for (const result of results) {
    byName.set(result.name, [...(byName.get(result.name) ?? []), result]);
  }

  return Array.from(byName.entries()).map(([name, stack]) => scoreName(name, stack));
}

describe("domain recommendation engine", () => {
  it("builds default and balanced extension quotas", () => {
    const defaultPlan = buildRecommendationPlan(["com", "ai", "io"], {
      ai: 10,
      com: 10,
    });

    expect(defaultPlan.target).toBe(20);
    expect(defaultPlan.quotas).toEqual([
      { extension: "ai", quota: 10 },
      { extension: "com", quota: 10 },
    ]);

    expect(buildBalancedRecommendationQuotas(["io", "co", "app"], 10)).toEqual({
      io: 4,
      co: 3,
      app: 3,
    });
  });

  it("generates semantic candidates without noisy filler terms", () => {
    const { candidates } = generateRecommendationCandidates({
      seedName: "agent",
      limit: 80,
      constraints: {
        maxWords: 2,
        allowSemanticAlternatives: true,
        mustIncludeSeed: false,
      },
    });
    const names = candidates.map((candidate) => candidate.name);
    const topNames = names.slice(0, 40);

    expect(candidates.length).toBeGreaterThan(20);
    expect(topNames.some((name) => /operator|assistant|autopilot|task|action/.test(name))).toBe(true);
    expect(topNames.every((name) => !/(ops|cloud|grid|works)/.test(name))).toBe(true);
    expect(names).not.toContain("agentops");
  });

  it("checks ranked candidates by extension quota and returns the requested split", async () => {
    const plan = buildRecommendationPlan(["ai", "com"], {
      ai: 2,
      com: 2,
    });
    const calls: Array<{ names: string[]; extensions: string[] }> = [];
    const checkAvailability = async (
      names: string[],
      extensions: string[],
    ): Promise<DomainCheckResponse> => {
      calls.push({ names, extensions });

      const results = names.flatMap((name) =>
        extensions.map((extension) => fakeResult(name, extension)),
      );
      const recommendations: Recommendation[] = recommendationsFor(results);

      return {
        checkedAt: new Date("2026-05-25T00:00:00Z").toISOString(),
        mode: "live",
        results,
        recommendations,
      };
    };

    const response = await findAvailableDomainRecommendations({
      seedName: "data",
      selectedExtensions: ["ai", "com"],
      recommendationPlan: plan,
      timeBudgetMs: 30_000,
      existingResults: [],
      existingRecommendations: [],
      checkAvailability,
    });

    const counts = response.results.reduce<Record<string, number>>((acc, result) => {
      acc[result.extension] = (acc[result.extension] ?? 0) + 1;
      return acc;
    }, {});

    expect(response.results).toHaveLength(4);
    expect(counts).toEqual({ ai: 2, com: 2 });
    expect(response.results.every(isRegistrarAvailable)).toBe(true);
    expect(calls.map((call) => call.extensions)).toEqual([["ai"], ["com"]]);
    expect(response.diagnostics.candidateCount).toBeGreaterThan(20);
    expect(response.checkedCount).toBeGreaterThanOrEqual(4);
  });

  it("preserves the requested quota extensions instead of filling with fallback TLDs", async () => {
    const plan = buildRecommendationPlan(["ai", "com", "app", "dev"], {
      ai: 1,
      com: 1,
    });
    const calls: Array<{ names: string[]; extensions: string[] }> = [];
    let comChecks = 0;
    const checkAvailability = async (
      names: string[],
      extensions: string[],
    ): Promise<DomainCheckResponse> => {
      calls.push({ names, extensions });

      const results = names.flatMap((name, index) =>
        extensions.map((extension) => {
          if (extension === "com") {
            comChecks += 1;
            return fakeResult(
              name,
              extension,
              comChecks > 20 && index === 0 ? "available_confirmed" : "taken_confirmed",
            );
          }

          return fakeResult(name, extension);
        }),
      );

      return {
        checkedAt: new Date("2026-05-25T00:00:00Z").toISOString(),
        mode: "live",
        results,
        recommendations: recommendationsFor(results),
      };
    };

    const response = await findAvailableDomainRecommendations({
      seedName: "agent",
      selectedExtensions: ["ai", "com", "app", "dev"],
      recommendationPlan: plan,
      timeBudgetMs: 30_000,
      existingResults: [],
      existingRecommendations: [],
      checkAvailability,
    });

    expect(response.results.map((result) => result.extension).sort()).toEqual(["ai", "com"]);
    expect(calls.map((call) => call.extensions)).toEqual([["ai"], ["com"], ["com"]]);
    expect(calls.some((call) => call.extensions.includes("app"))).toBe(false);
    expect(calls.some((call) => call.extensions.includes("dev"))).toBe(false);
  });
});
