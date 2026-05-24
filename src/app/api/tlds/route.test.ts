import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("GET /api/tlds", () => {
  it("returns catalog extensions with restricted metadata", async () => {
    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tld: "ai",
          label: ".ai",
          supportedProviders: expect.arrayContaining(["mock"]),
          defaultEnabled: true,
        }),
        expect.objectContaining({
          tld: "edu",
          restricted: true,
          requiresEligibility: true,
        }),
        expect.objectContaining({
          tld: "com.sg",
          category: "singapore",
          requiresEligibility: true,
        }),
      ]),
    );
  });
});
