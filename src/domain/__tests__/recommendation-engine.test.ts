import { describe, expect, it } from "vitest";
import {
  buildBalancedRecommendationQuotas,
  buildRecommendationPlan,
  findAvailableDomainRecommendations,
  generateRecommendationCandidates,
  isRegistrarAvailable,
} from "../recommendation-engine";
import { assessNameQuality } from "../name-quality";
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

  it("rejects shallow SaaS filler before availability checks", () => {
    for (const name of ["agentops", "datacloud", "enterprisegrid", "opsagentbase", "scalehq"]) {
      expect(
        assessNameQuality("agent", name, {
          maxMorphemes: 2,
          allowFillerTerms: false,
        }).accepted,
      ).toBe(false);
    }

    expect(
      assessNameQuality("agent", "operatorpilot", {
        intentRoots: ["operator", "assistant", "autopilot", "task", "action"],
        maxMorphemes: 2,
      }).accepted,
    ).toBe(true);
  });

  it("keeps golden related searches commercially clean before availability checks", () => {
    const goldenSeeds = [
      {
        seedName: "agent",
        relatedPattern: /agent|operator|assistant|autopilot|task|action|workflow/,
      },
      {
        seedName: "data",
        relatedPattern: /data|signal|metric|insight|query|atlas|vault|graph|stream/,
      },
      {
        seedName: "enterprise",
        relatedPattern: /enterprise|business|company|scale|trust|govern|venture|workforce/,
      },
    ];

    for (const { seedName, relatedPattern } of goldenSeeds) {
      const { candidates } = generateRecommendationCandidates({
        seedName,
        limit: 80,
        constraints: {
          maxWords: 2,
          allowSemanticAlternatives: true,
          mustIncludeSeed: false,
        },
      });
      const topCandidates = candidates.slice(0, 30);
      const topNames = topCandidates.map((candidate) => candidate.name);
      const quality = topCandidates.map((candidate) =>
        assessNameQuality(seedName, candidate.name, {
          method: candidate.method,
          maxMorphemes: 2,
          allowFillerTerms: false,
        }),
      );

      expect(topCandidates.length).toBeGreaterThanOrEqual(30);
      expect(topCandidates.every((candidate) => candidate.intent === seedName)).toBe(true);
      expect(topNames.filter((name) => relatedPattern.test(name)).length).toBeGreaterThanOrEqual(20);
      expect(topNames.every((name) => !/(ops|cloud|grid|works|hq)/.test(name))).toBe(true);
      expect(quality.every((item) => item.accepted)).toBe(true);
      expect(quality.filter((item) => item.name.length <= 12).length).toBeGreaterThanOrEqual(24);
      expect(quality.every((item) => item.morphemeCount <= 2)).toBe(true);
      expect(new Set(topCandidates.map((candidate) => candidate.quality.family)).size).toBeGreaterThanOrEqual(3);
    }
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
