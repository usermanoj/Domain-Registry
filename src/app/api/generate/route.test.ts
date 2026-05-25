import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/generate", () => {
  it("generates contract candidates with checked domains", async () => {
    const response = await POST(
      new Request("http://localhost/api/generate", {
        method: "POST",
        body: JSON.stringify({
          seedWords: ["trust", "data", "agentic AI"],
          style: ["Trusted Enterprise", "AI-native", "bizarre"],
          minLength: 5,
          maxLength: 10,
          count: 10,
          extensions: ["ai"],
          providers: ["mock"],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.candidates.length).toBeGreaterThan(0);
    expect(payload.candidates[0]).toEqual(
      expect.objectContaining({
        name: expect.any(String),
        meaning: expect.any(String),
        style: expect.any(String),
        brandScore: expect.any(Number),
        domains: expect.any(Array),
      }),
    );
    expect(payload.candidates[0].domains[0].domain).toMatch(/\.ai$/);
    expect(payload.recommendations.length).toBeGreaterThan(0);
  });
});
