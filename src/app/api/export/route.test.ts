import { describe, expect, it } from "vitest";
import { POST } from "./route";

const result = {
  id: "aptava.ai",
  domain: "aptava.ai",
  sld: "aptava",
  tld: "ai",
  name: "aptava",
  extension: "ai",
  status: "available_confirmed",
  confidence: "high",
  source: "mock",
  providerName: "MockAvailabilityProvider",
  checkedAt: "2026-05-24T00:00:00.000Z",
  priceRegistration: 79,
  priceRenewal: 79,
  currency: "USD",
  premium: false,
  registrarUrl: "https://example.com/register/aptava.ai",
  rules: [],
};

describe("POST /api/export", () => {
  it("exports CSV", async () => {
    const response = await POST(
      new Request("http://localhost/api/export", {
        method: "POST",
        body: JSON.stringify({
          format: "csv",
          filename: "founder-shortlist",
          results: [result],
          recommendations: [{ name: "aptava", brandScore: 87 }],
        }),
      }),
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(text).toContain("domain,name,extension,status");
    expect(text).toContain("aptava.ai,aptava,ai,available_confirmed");
  });

  it("exports JSON rows", async () => {
    const response = await POST(
      new Request("http://localhost/api/export", {
        method: "POST",
        body: JSON.stringify({
          format: "json",
          results: [result],
          recommendations: [{ name: "aptava", brandScore: 87 }],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.rows[0]).toEqual(
      expect.objectContaining({
        domain: "aptava.ai",
        brandScore: "87",
      }),
    );
  });
});
