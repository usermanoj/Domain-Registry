import { describe, expect, it } from "vitest";
import {
  persistenceHealth,
  recordPreferenceEvent,
  recordSearchRun,
} from "./intelligence-store";
import type { DomainCheckResult } from "@/domain/types";

function result(domain: string): DomainCheckResult {
  const [name, extension] = domain.split(".");

  return {
    id: domain,
    domain,
    name,
    sld: name,
    tld: extension,
    extension,
    status: "available_confirmed",
    confidence: "high",
    source: "registrar_api",
    providerName: "TestRegistrar",
    checkedAt: "2026-05-25T00:00:00.000Z",
    premium: false,
    rules: [],
  };
}

describe("intelligence persistence store", () => {
  it("records search and preference events with memory fallback", async () => {
    await recordSearchRun({
      id: "qry_test",
      query: "signalpilot",
      mode: "live",
      extensions: ["ai"],
      checkedAt: "2026-05-25T00:00:00.000Z",
      results: [result("signalpilot.ai")],
      recommendations: [],
    });
    await recordPreferenceEvent({
      action: "saved",
      domain: "signalpilot.ai",
      name: "signalpilot",
      extension: "ai",
      weight: 2,
    });

    expect(persistenceHealth()).toMatchObject({
      backend: "memory",
      status: "ready",
    });
  });
});
