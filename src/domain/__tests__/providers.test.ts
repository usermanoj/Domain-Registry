import { describe, expect, it } from "vitest";
import { checkDomains, DomainAvailabilityEngine } from "../availability-engine";
import { MockAvailabilityProvider, mockProvider } from "../providers/mock-provider";
import { NamecheapAvailabilityProvider } from "../providers/namecheap-provider";
import { CloudflareAvailabilityProvider } from "../providers/cloudflare-provider";
import { DNSAvailabilityProvider } from "../providers/dns-provider";
import { GoDaddyAvailabilityProvider } from "../providers/godaddy-provider";
import { PorkbunAvailabilityProvider } from "../providers/porkbun-provider";
import { buildAvailabilityResult } from "../providers/provider-utils";
import { RegistrarQuorumProvider } from "../providers/registrar-quorum-provider";
import { RDAPAvailabilityProvider } from "../providers/rdap-provider";
import { RestrictedTldProvider } from "../providers/restricted-tld-provider";
import { SGAvailabilityProvider } from "../providers/sg-provider";
import { WHOISAvailabilityProvider } from "../providers/whois-provider";
import type { DomainAvailabilityProvider } from "../types";

describe("provider adapters and engine", () => {
  it("mock provider returns normalized status without DNS checks", async () => {
    const result = await mockProvider.check("aptava.ai");
    const repeated = await mockProvider.check("aptava.ai");

    expect(result.providerName).toBe("MockAvailabilityProvider");
    expect(result.source).toBe("mock");
    expect(repeated.status).toBe(result.status);
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

  it("falls back when a provider returns unknown or throws", async () => {
    const failingProvider: DomainAvailabilityProvider = {
      name: "FailingProvider",
      supportsTld: () => true,
      check: async () => {
        throw new Error("provider down");
      },
      checkBulk: async () => {
        throw new Error("provider down");
      },
    };
    const unknownProvider: DomainAvailabilityProvider = {
      name: "UnknownProvider",
      supportsTld: () => true,
      check: async (domain) =>
        buildAvailabilityResult({
          domain,
          status: "unknown",
          confidence: "low",
          source: "manual",
          providerName: "UnknownProvider",
          premium: false,
        }),
      checkBulk: async (domains) => Promise.all(domains.map((domain) => unknownProvider.check(domain))),
    };
    const fallbackProvider: DomainAvailabilityProvider = {
      name: "FallbackProvider",
      supportsTld: () => true,
      check: async (domain) =>
        buildAvailabilityResult({
          domain,
          status: "available_confirmed",
          confidence: "high",
          source: "mock",
          providerName: "FallbackProvider",
          premium: false,
        }),
      checkBulk: async (domains) => Promise.all(domains.map((domain) => fallbackProvider.check(domain))),
    };
    const engine = new DomainAvailabilityEngine([
      failingProvider,
      unknownProvider,
      fallbackProvider,
    ]);

    await expect(engine.check("aptava.ai")).resolves.toMatchObject({
      status: "available_confirmed",
      providerName: "FallbackProvider",
    });
  });

  it("falls back when a provider is rate limited", async () => {
    const rateLimitedProvider: DomainAvailabilityProvider = {
      name: "RateLimitedProvider",
      supportsTld: () => true,
      check: async (domain) =>
        buildAvailabilityResult({
          domain,
          status: "rate_limited",
          confidence: "medium",
          source: "rdap",
          providerName: "RateLimitedProvider",
          premium: false,
          errorCode: "RDAP_RATE_LIMITED",
        }),
      checkBulk: async (domains) => Promise.all(domains.map((domain) => rateLimitedProvider.check(domain))),
    };
    const fallbackProvider: DomainAvailabilityProvider = {
      name: "FallbackProvider",
      supportsTld: () => true,
      check: async (domain) =>
        buildAvailabilityResult({
          domain,
          status: "available_confirmed",
          confidence: "medium",
          source: "whois",
          providerName: "FallbackProvider",
          premium: false,
        }),
      checkBulk: async (domains) => Promise.all(domains.map((domain) => fallbackProvider.check(domain))),
    };
    const engine = new DomainAvailabilityEngine([rateLimitedProvider, fallbackProvider]);

    await expect(engine.check("aptava.ai")).resolves.toMatchObject({
      status: "available_confirmed",
      providerName: "FallbackProvider",
    });
  });

  it("continues past registry not-found signals and returns manual check when no registrar confirms", async () => {
    const rdapNotFoundProvider: DomainAvailabilityProvider = {
      name: "RdapNotFoundProvider",
      supportsTld: () => true,
      check: async (domain) =>
        buildAvailabilityResult({
          domain,
          status: "manual_check_required",
          confidence: "medium",
          source: "rdap",
          providerName: "RdapNotFoundProvider",
          premium: false,
          errorCode: "RDAP_NOT_FOUND_REQUIRES_REGISTRAR",
        }),
      checkBulk: async (domains) => Promise.all(domains.map((domain) => rdapNotFoundProvider.check(domain))),
    };
    const dnsUnknownProvider: DomainAvailabilityProvider = {
      name: "DnsUnknownProvider",
      supportsTld: () => true,
      check: async (domain) =>
        buildAvailabilityResult({
          domain,
          status: "unknown",
          confidence: "low",
          source: "dns",
          providerName: "DnsUnknownProvider",
          premium: false,
        }),
      checkBulk: async (domains) => Promise.all(domains.map((domain) => dnsUnknownProvider.check(domain))),
    };
    const engine = new DomainAvailabilityEngine([
      rdapNotFoundProvider,
      dnsUnknownProvider,
    ]);

    await expect(engine.check("venturehub.ai")).resolves.toMatchObject({
      status: "manual_check_required",
      source: "rdap",
      errorCode: "RDAP_NOT_FOUND_REQUIRES_REGISTRAR",
    });
  });

  it("unsupported TLDs become manual checks when no provider supports them", async () => {
    const engine = new DomainAvailabilityEngine([
      {
        name: "NoSupportProvider",
        supportsTld: () => false,
        check: async () => {
          throw new Error("should not be called");
        },
        checkBulk: async () => [],
      },
    ]);

    await expect(engine.check("aptava.unsupported")).resolves.toMatchObject({
      status: "manual_check_required",
      providerName: "DomainAvailabilityEngine",
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

  it("RDAP maps 404 to registrar-required manual check and 429 to rate limited", async () => {
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
      status: "manual_check_required",
      confidence: "medium",
      source: "rdap",
      errorCode: "RDAP_NOT_FOUND_REQUIRES_REGISTRAR",
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

  it("WHOIS maps .ai not-found responses to registrar-required manual checks", async () => {
    const provider = new WHOISAvailabilityProvider({
      query: async (domain) =>
        domain === "open.ai"
          ? "Domain Name: open.ai\r\nRegistry Domain ID: example"
          : "Domain not found.\r\n>>> Last update of WHOIS database <<<",
    });

    await expect(provider.check("agentdatahq.ai")).resolves.toMatchObject({
      status: "manual_check_required",
      confidence: "medium",
      source: "whois",
      errorCode: "WHOIS_NOT_FOUND_REQUIRES_REGISTRAR",
    });
    await expect(provider.check("open.ai")).resolves.toMatchObject({
      status: "taken_confirmed",
      confidence: "high",
      source: "whois",
    });
  });

  it("DNS provider only confirms taken evidence and never availability", async () => {
    const provider = new DNSAvailabilityProvider({
      resolveNs: async () => ["ns1.example.test"],
      resolve4: async () => {
        throw Object.assign(new Error("no address"), { code: "ENODATA" });
      },
      resolve6: async () => {
        throw Object.assign(new Error("no address"), { code: "ENODATA" });
      },
    });

    await expect(provider.check("enterprise.ai")).resolves.toMatchObject({
      status: "taken_confirmed",
      confidence: "medium",
      source: "dns",
    });
  });

  it("DNS provider returns unknown when DNS has no registration evidence", async () => {
    const provider = new DNSAvailabilityProvider({
      resolveNs: async () => {
        throw Object.assign(new Error("no ns"), { code: "ENODATA" });
      },
      resolve4: async () => {
        throw Object.assign(new Error("no address"), { code: "ENODATA" });
      },
      resolve6: async () => {
        throw Object.assign(new Error("no address"), { code: "ENODATA" });
      },
    });

    await expect(provider.check("probably-open.test")).resolves.toMatchObject({
      status: "unknown",
      confidence: "low",
      source: "dns",
      errorCode: "DNS_NO_REGISTRATION_EVIDENCE",
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

  it("Cloudflare parses registrar availability, premium, and unsupported responses", async () => {
    const env = (name: string) =>
      ({
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_API_TOKEN: "token",
        CLOUDFLARE_API_BASE_URL: "https://api.example.test/client/v4",
      })[name];
    const fetcher = (async () =>
      Response.json({
        success: true,
        result: {
          domains: [
            {
              name: "openbrand.com",
              registrable: true,
              tier: "standard",
              pricing: {
                currency: "USD",
                registration_cost: "8.57",
                renewal_cost: "8.57",
              },
            },
            {
              name: "premiumbrand.com",
              registrable: false,
              tier: "premium",
              reason: "domain_premium",
            },
            {
              name: "unknownbrand.sg",
              registrable: false,
              reason: "extension_not_supported_via_api",
            },
          ],
        },
      })) as typeof fetch;
    const provider = new CloudflareAvailabilityProvider({ env, fetcher });

    await expect(provider.check("openbrand.com")).resolves.toMatchObject({
      status: "available_confirmed",
      source: "registrar_api",
      priceRegistration: 8.57,
    });
    await expect(provider.check("premiumbrand.com")).resolves.toMatchObject({
      status: "premium_available",
      premium: true,
      errorCode: "CLOUDFLARE_DOMAIN_PREMIUM",
    });
    await expect(provider.check("unknownbrand.sg")).resolves.toMatchObject({
      status: "manual_check_required",
      errorCode: "CLOUDFLARE_EXTENSION_UNSUPPORTED",
    });
  });

  it("GoDaddy requires definitive availability before confirming available", async () => {
    const env = (name: string) =>
      ({
        GODADDY_API_KEY: "key",
        GODADDY_API_SECRET: "secret",
        GODADDY_API_BASE_URL: "https://api.example.test",
      })[name];
    const fetcher = (async () =>
      Response.json({
        domains: [
          {
            domain: "definite.com",
            available: true,
            definitive: true,
            price: 12990000,
            currency: "USD",
          },
          {
            domain: "maybe.com",
            available: true,
            definitive: false,
          },
          {
            domain: "taken.com",
            available: false,
            definitive: true,
          },
        ],
      })) as typeof fetch;
    const provider = new GoDaddyAvailabilityProvider({ env, fetcher });
    const results = await provider.checkBulk(["definite.com", "maybe.com", "taken.com"]);

    expect(results[0]).toMatchObject({
      status: "available_confirmed",
      priceRegistration: 12.99,
    });
    expect(results[1]).toMatchObject({
      status: "manual_check_required",
      errorCode: "GODADDY_NON_DEFINITIVE_AVAILABLE",
    });
    expect(results[2]).toMatchObject({
      status: "taken_confirmed",
      confidence: "high",
    });
  });

  it("Porkbun parses standard, premium, and taken API responses", async () => {
    const env = (name: string) =>
      ({
        PORKBUN_API_KEY: "key",
        PORKBUN_SECRET_API_KEY: "secret",
        PORKBUN_API_BASE_URL: "https://api.example.test/api/json/v3",
      })[name];
    const fetcher = (async (url: string | URL | Request) => {
      const domain = String(url).split("/").pop();

      if (domain === "standard.com") {
        return Response.json({
          status: "SUCCESS",
          response: {
            avail: "yes",
            premium: "no",
            price: "9.73",
            additional: { renewal: { price: "10.37" } },
          },
        });
      }

      if (domain === "premium.com") {
        return Response.json({
          status: "SUCCESS",
          response: { avail: "yes", premium: "yes", price: "899.00" },
        });
      }

      return Response.json({
        status: "SUCCESS",
        response: { avail: "no", premium: "no" },
      });
    }) as typeof fetch;
    const provider = new PorkbunAvailabilityProvider({ env, fetcher });

    await expect(provider.check("standard.com")).resolves.toMatchObject({
      status: "available_confirmed",
      priceRegistration: 9.73,
      priceRenewal: 10.37,
    });
    await expect(provider.check("premium.com")).resolves.toMatchObject({
      status: "premium_available",
      premium: true,
      priceRegistration: 899,
    });
    await expect(provider.check("taken.com")).resolves.toMatchObject({
      status: "taken_confirmed",
    });
  });

  it("registrar quorum blocks conflicting availability signals", async () => {
    const availableProvider: DomainAvailabilityProvider = {
      name: "AvailableRegistrar",
      supportsTld: () => true,
      check: async (domain) =>
        buildAvailabilityResult({
          domain,
          status: "available_confirmed",
          confidence: "high",
          source: "registrar_api",
          providerName: "AvailableRegistrar",
          premium: false,
        }),
      checkBulk: async (domains) => Promise.all(domains.map((domain) => availableProvider.check(domain))),
    };
    const takenProvider: DomainAvailabilityProvider = {
      name: "TakenRegistrar",
      supportsTld: () => true,
      check: async (domain) =>
        buildAvailabilityResult({
          domain,
          status: "taken_confirmed",
          confidence: "high",
          source: "registrar_api",
          providerName: "TakenRegistrar",
          premium: false,
        }),
      checkBulk: async (domains) => Promise.all(domains.map((domain) => takenProvider.check(domain))),
    };
    const provider = new RegistrarQuorumProvider([availableProvider, takenProvider]);

    await expect(provider.check("conflict.com")).resolves.toMatchObject({
      status: "manual_check_required",
      confidence: "high",
      source: "registrar_api",
      errorCode: "REGISTRAR_SIGNAL_CONFLICT",
      evidence: expect.arrayContaining([
        expect.objectContaining({ providerName: "AvailableRegistrar" }),
        expect.objectContaining({ providerName: "TakenRegistrar" }),
      ]),
    });
  });

  it("bulk engine uses provider bulk checks while preserving fallback order", async () => {
    const calls: string[][] = [];
    const bulkProvider: DomainAvailabilityProvider = {
      name: "BulkRegistrar",
      supportsTld: (tld) => tld === "com",
      check: async (domain) =>
        buildAvailabilityResult({
          domain,
          status: "available_confirmed",
          confidence: "high",
          source: "registrar_api",
          providerName: "BulkRegistrar",
          premium: false,
        }),
      checkBulk: async (domains) => {
        calls.push(domains);
        return Promise.all(domains.map((domain) => bulkProvider.check(domain)));
      },
    };
    const engine = new DomainAvailabilityEngine([bulkProvider]);
    const results = await engine.checkBulk(["alpha.com", "beta.com"]);

    expect(calls).toEqual([["alpha.com", "beta.com"]]);
    expect(results).toHaveLength(2);
    expect(results.every((result) => result.status === "available_confirmed")).toBe(true);
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
