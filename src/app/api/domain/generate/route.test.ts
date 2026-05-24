import { describe, expect, it } from "vitest";
import { POST } from "./route";

describe("POST /api/domain/generate", () => {
  it("generates candidates, checks selected TLDs, and returns top 20 recommendations", async () => {
    const response = await POST(
      new Request("http://localhost/api/domain/generate", {
        method: "POST",
        body: JSON.stringify({
          seed: "trust, action, data, automation",
          styles: ["Sanskrit/Hindi", "AI-native", "workflow/ops"],
          minLength: 5,
          maxLength: 12,
          limit: 12,
          extensions: ["ai", "com"],
          mode: "mock",
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.candidates.length).toBeGreaterThan(0);
    expect(payload.results).toHaveLength(payload.candidates.length * 2);
    expect(payload.recommendations.length).toBeLessThanOrEqual(20);
    expect(payload.recommendations[0].explanation).toContain("/100");
  });
});
