import { describe, expect, it } from "vitest";
import { checkDomains, DomainAvailabilityEngine } from "../availability-engine";
import { MockAvailabilityProvider, mockProvider } from "../providers/mock-provider";
import { NamecheapAvailabilityProvider } from "../providers/namecheap-provider";
import { RDAPAvailabilityProvider } from "../providers/rdap-provider";
import { RestrictedTldProvider } from "../providers/restricted-tld-provider";
import { SGAvailabilityProvider } from "../providers/sg-provider";

describe("provider adapters and engine", () => {
  it("mock provider returns normalized status without DNS checks", async () => {
    const result = await mockProvider.check("aptava.ai");

    expect(result.providerName).toBe("MockAvailabilityProvider");
    expect(result.source).toBe("mock");
    expect(result.status).toMatch(
      /available_confirmed|taken_confirmed|premium_available|manual_check_required/,
    );
    expect(["high", "medium", "low"]).toContain(result.confidence);
  });

  it("marks .edu as restricted at the engine layer", async () => {
    const response = await checkDomains({
      names: ["aptava"],
      extensions: ["edu"],
      mode: "mock",
    });

    expect(response.results[0].status).toBe("restricted");
    expect(response.results[0].confidence).toBe("high");
    expect(response.results[0].rules[0].label).toBe(".edu eligibility");
  });

  it("returns recommendations grouped by base name", async () => {
    const response = await checkDomains({
      names: ["aptava"],
      extensions: ["ai", "com", "sg"],
      mode: "mock",
    });

    expect(response.results).toHaveLength(3);
    expect(response.recommendations[0].name).toBe("aptava");
  });

  it("returns invalid for invalid domains", async () => {
    const engine = new DomainAvailabilityEngine([new MockAvailabilityProvider()]);

    await expect(engine.check("-bad.ai")).resolves.toMatchObject({
      status: "invalid",
      confidence: "high",
    });
  });

  it("RDAP uses bootstrap, maps 200 to taken, and caches results", async () => {
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
        ldhName: "aptava.test",
        status: ["active"],
      });
    };
    const provider = new RDAPAvailabilityProvider({
      fetcher: fetcher as typeof fetch,
      bootstrapUrl: "https://iana.example.test/dns.json",
    });

    const first = await provider.check("aptava.test");
    const second = await provider.check("aptava.test");

    expect(first).toMatchObject({
      status: "taken_confirmed",
      confidence: "high",
      source: "rdap",
    });
    expect(second.status).toBe("taken_confirmed");
    expect(calls.filter((url) => url.includes("/domain/"))).toHaveLength(1);
  });

  it("RDAP maps 404 to medium-confidence available and 429 to rate limited", async () => {
    let domainStatus = 404;
    const fetcher = async (url: string | URL | Request) => {
      if (String(url).includes("dns.json")) {
        return Response.json({
          services: [[["test"], ["https://rdap.example.test"]]],
        });
      }

      return new Response("", { status: domainStatus });
    };
    const provider = new RDAPAvailabilityProvider({
      fetcher: fetcher as typeof fetch,
      bootstrapUrl: "https://iana.example.test/dns.json",
      cacheTtlMs: 0,
    });

    await expect(provider.check("open.test")).resolves.toMatchObject({
      status: "available_confirmed",
      confidence: "medium",
      source: "rdap",
    });

    domainStatus = 429;

    await expect(provider.check("limited.test")).resolves.toMatchObject({
      status: "rate_limited",
      source: "rdap",
      errorCode: "RDAP_RATE_LIMITED",
    });
  });

  it("RDAP unsupported TLDs become manual checks", async () => {
    const provider = new RDAPAvailabilityProvider({
      fetcher: (async () =>
        Response.json({
          services: [[["com"], ["https://rdap.example.test"]]],
        })) as typeof fetch,
      bootstrapUrl: "https://iana.example.test/dns.json",
    });

    await expect(provider.check("aptava.unsupported")).resolves.toMatchObject({
      status: "manual_check_required",
      source: "manual",
      errorCode: "RDAP_UNSUPPORTED_TLD",
    });
  });

  it("Namecheap gracefully disables when credentials are absent", async () => {
    const provider = new NamecheapAvailabilityProvider({
      env: () => undefined,
      fetcher: (() => {
        throw new Error("fetch should not be called");
      }) as typeof fetch,
    });

    expect(provider.supportsTld("com")).toBe(false);
    await expect(provider.check("aptava.com")).resolves.toMatchObject({
      status: "manual_check_required",
      source: "manual",
      errorCode: "NAMECHEAP_NOT_CONFIGURED",
    });
  });

  it("Namecheap parses premium API responses", async () => {
    const env = (name: string) =>
      ({
        NAMECHEAP_API_USER: "user",
        NAMECHEAP_API_KEY: "key",
        NAMECHEAP_USERNAME: "user",
        NAMECHEAP_CLIENT_IP: "127.0.0.1",
        NAMECHEAP_API_BASE_URL: "https://api.example.test/xml.response",
      })[name];
    const fetcher = (async () =>
      new Response(`<?xml version="1.0" encoding="UTF-8"?>
        <ApiResponse Status="OK">
          <CommandResponse Type="namecheap.domains.check">
            <DomainCheckResult Domain="aptava.com" Available="true" IsPremiumName="true" PremiumRegistrationPrice="1999.50" PremiumRenewalPrice="99.00" />
          </CommandResponse>
        </ApiResponse>`)) as typeof fetch;
    const provider = new NamecheapAvailabilityProvider({ env, fetcher });

    await expect(provider.check("aptava.com")).resolves.toMatchObject({
      status: "premium_available",
      confidence: "high",
      source: "registrar_api",
      premium: true,
      priceRegistration: 1999.5,
      priceRenewal: 99,
    });
  });

  it("Namecheap parses taken API responses", async () => {
    const env = (name: string) =>
      ({
        NAMECHEAP_API_USER: "user",
        NAMECHEAP_API_KEY: "key",
        NAMECHEAP_USERNAME: "user",
        NAMECHEAP_CLIENT_IP: "127.0.0.1",
        NAMECHEAP_API_BASE_URL: "https://api.example.test/xml.response",
      })[name];
    const fetcher = (async () =>
      new Response(`<?xml version="1.0" encoding="UTF-8"?>
        <ApiResponse Status="OK">
          <CommandResponse Type="namecheap.domains.check">
            <DomainCheckResult Domain="aptava.com" Available="false" IsPremiumName="false" />
          </CommandResponse>
        </ApiResponse>`)) as typeof fetch;
    const provider = new NamecheapAvailabilityProvider({ env, fetcher });

    await expect(provider.check("aptava.com")).resolves.toMatchObject({
      status: "taken_confirmed",
      confidence: "high",
      source: "registrar_api",
      premium: false,
    });
  });

  it("SG provider returns manual check metadata without configured registrar API", async () => {
    const provider = new SGAvailabilityProvider({ env: () => undefined });

    await expect(provider.check("aptava.com.sg")).resolves.toMatchObject({
      status: "manual_check_required",
      source: "manual",
      errorCode: "SG_REGISTRAR_NOT_CONFIGURED",
    });
  });

  it("restricted provider covers government and military TLDs", async () => {
    const provider = new RestrictedTldProvider();

    await expect(provider.check("agency.gov")).resolves.toMatchObject({
      status: "restricted",
      confidence: "high",
      errorCode: "RESTRICTED_TLD",
    });
  });
});
