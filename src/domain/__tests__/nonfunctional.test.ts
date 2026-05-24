import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkDomains, DomainAvailabilityEngine } from "../availability-engine";
import { RDAPAvailabilityProvider } from "../providers/rdap-provider";
import { checkRequestSchema } from "../schemas";
import type { DomainAvailabilityProvider } from "../types";

describe("non-functional safeguards", () => {
  it("supports a 1,000-name bulk request within the synchronous cap", async () => {
    const names = Array.from({ length: 1_000 }, (_, index) => `bulkname${index}`);
    const parsed = checkRequestSchema.safeParse({
      names,
      extensions: ["ai"],
      mode: "mock",
    });
    const startedAt = performance.now();
    const response = await checkDomains({
      names,
      extensions: ["ai"],
      mode: "mock",
    });

    expect(parsed.success).toBe(true);
    expect(response.results).toHaveLength(1_000);
    expect(performance.now() - startedAt).toBeLessThan(8_000);
  });

  it("reuses cached RDAP checks within the TTL", async () => {
    const calls: string[] = [];
    const fetcher = async (url: string | URL | Request) => {
      calls.push(String(url));

      if (String(url).includes("dns.json")) {
        return Response.json({
          services: [[["test"], ["https://rdap.example.test"]]],
        });
      }

      return Response.json({
        objectClassName: "domain",
        ldhName: "cached.test",
      });
    };
    const provider = new RDAPAvailabilityProvider({
      fetcher: fetcher as typeof fetch,
      bootstrapUrl: "https://iana.example.test/dns.json",
      cacheTtlMs: 60_000,
    });

    await provider.check("cached.test");
    await provider.check("cached.test");

    expect(calls.filter((url) => url.includes("/domain/"))).toHaveLength(1);
  });

  it("keeps registrar API key names out of client component source", () => {
    const clientSource = readFileSync(
      "src/components/domain-intelligence-studio.tsx",
      "utf8",
    );

    expect(clientSource).not.toContain("NAMECHEAP_API_KEY");
    expect(clientSource).not.toContain("NAMECHEAP_API_USER");
    expect(clientSource).not.toContain("SG_REGISTRAR_API_KEY");
  });

  it("provider failures do not crash the availability engine", async () => {
    const failingProvider: DomainAvailabilityProvider = {
      name: "BrokenProvider",
      supportsTld: () => true,
      check: async () => {
        throw new Error("boom");
      },
      checkBulk: async () => {
        throw new Error("boom");
      },
    };
    const engine = new DomainAvailabilityEngine([failingProvider]);

    await expect(engine.check("aptava.ai")).resolves.toMatchObject({
      status: "manual_check_required",
    });
  });
});
