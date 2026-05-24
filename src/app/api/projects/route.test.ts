import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";

describe("POST /api/projects", () => {
  it("creates a saved project shell", async () => {
    const response = await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Founder shortlist",
          description: "AI domain candidates",
          domains: ["aptava.ai", "satyaflow.com"],
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.id).toEqual(expect.any(String));
    expect(payload.name).toBe("Founder shortlist");
    expect(payload.domains).toEqual(["aptava.ai", "satyaflow.com"]);
    expect(payload.createdAt).toEqual(expect.any(String));
    expect(payload.updatedAt).toEqual(expect.any(String));
  });

  it("lists saved projects", async () => {
    await POST(
      new Request("http://localhost/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: "Comparison set",
          domains: ["aptora.ai"],
          notes: "Looks credible.",
          preferredRegistrar: "Namecheap",
        }),
      }),
    );

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.projects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Comparison set",
          domains: ["aptora.ai"],
          notes: "Looks credible.",
          preferredRegistrar: "Namecheap",
        }),
      ]),
    );
  });
});
