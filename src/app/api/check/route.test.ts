import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/check", () => {
  it("checks a base name across contract extensions", async () => {
    const response = await POST(
      new Request("http://localhost/api/check", {
        method: "POST",
        body: JSON.stringify({
          name: "aptava",
          extensions: ["ai", "com", "sg", "com.sg"],
          providers: ["auto"],
          forceRefresh: false,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.queryId).toEqual(expect.any(String));
    expect(payload.results).toHaveLength(4);
    expect(payload.results.map((result: { domain: string }) => result.domain)).toEqual([
      "aptava.ai",
      "aptava.com",
      "aptava.sg",
      "aptava.com.sg",
    ]);
    expect(payload.summary).toEqual(
      expect.objectContaining({
        availableCount: expect.any(Number),
        takenCount: expect.any(Number),
        unknownCount: expect.any(Number),
      }),
    );
  });

  it("checks a single domain", async () => {
    const response = await POST(
      new Request("http://localhost/api/check", {
        method: "POST",
        body: JSON.stringify({
          domain: "aptava.ai",
          mode: "mock",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.queryId).toEqual(expect.any(String));
    expect(payload.results).toHaveLength(1);
    expect(payload.results[0].domain).toBe("aptava.ai");
    expect(payload.summary.bestDomain === null || typeof payload.summary.bestDomain === "string").toBe(
      true,
    );
  });

  it("checks exact bulk domains without cross-product expansion", async () => {
    const response = await POST(
      new Request("http://localhost/api/check", {
        method: "POST",
        body: JSON.stringify({
          domains: ["aptava.ai", "mybrand.com.sg"],
          mode: "mock",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.summary).toEqual(expect.any(Object));
    expect(payload.results.map((result: { domain: string }) => result.domain)).toEqual([
      "aptava.ai",
      "mybrand.com.sg",
    ]);
  });

  it("rejects unknown catalog extensions unless custom mode is enabled", async () => {
    const rejected = await POST(
      new Request("http://localhost/api/check", {
        method: "POST",
        body: JSON.stringify({
          names: ["aptava"],
          extensions: ["notreal"],
          mode: "mock",
        }),
      }),
    );
    const accepted = await POST(
      new Request("http://localhost/api/check", {
        method: "POST",
        body: JSON.stringify({
          names: ["aptava"],
          extensions: ["notreal"],
          mode: "mock",
          allowCustomExtensions: true,
        }),
      }),
    );

    expect(rejected.status).toBe(400);
    expect(accepted.status).toBe(200);
  });
});
