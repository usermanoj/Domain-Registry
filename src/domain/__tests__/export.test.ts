import { describe, expect, it } from "vitest";
import { buildExportRows, toCsv, toXlsxBuffer } from "../export";
import type { DomainCheckResult, Recommendation } from "../types";

const result: DomainCheckResult = {
  id: "aptava.ai",
  name: "aptava",
  domain: "aptava.ai",
  sld: "aptava",
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

const recommendation: Recommendation = {
  name: "aptava",
  brandScore: 82,
  explanation: "Good candidate.",
  subscores: {
    memorability: 80,
    pronunciationEase: 80,
    spellingClarity: 80,
    brandStrength: 80,
    enterpriseCredibility: 80,
    spiritualIndianDepth: 50,
    aiNativeFeel: 80,
    domainStackQuality: 80,
    riskOfConfusion: 10,
    length: 80,
    extensionQuality: 90,
    availabilityConfidence: 100,
  },
};

describe("export helpers", () => {
  it("exports CSV and real XLSX bytes", () => {
    const rows = buildExportRows([result], [recommendation]);
    const csv = toCsv(rows);
    const xlsx = toXlsxBuffer(rows);

    expect(csv).toContain("aptava.ai");
    expect(csv).toContain("82");
    expect(String.fromCharCode(xlsx[0], xlsx[1])).toBe("PK");
  });
});
