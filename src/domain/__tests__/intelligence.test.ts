import { describe, expect, it } from "vitest";
import { appraiseDomain } from "../appraisal";
import { assessBrandRisk } from "../brand-risk";
import { runAudienceTest } from "../audience-testing";
import { attachDomainIntelligence } from "../domain-intelligence";
import { buildEvidenceLedger, toEvidenceRecord } from "../evidence-ledger";
import { getMarketComparableReport } from "../market-comparables";
import {
  buildProviderRoutePlan,
  getProviderCapabilities,
} from "../provider-capabilities";
import {
  learnPreferenceProfile,
  preferenceBoost,
} from "../preference-learning";
import { checkBrandHandleSignals } from "../social-handles";
import { checkUsptoTrademarkRisk } from "../trademark-risk";
import { DomainLookupScheduler } from "../lookup-scheduler";
import { buildPortfolioInsight, buildPortfolioSharePayload } from "../portfolio-intelligence";
import { buildExportRows } from "../export";
import { scoreName } from "../scoring";
import type { DomainCheckResult } from "../types";

function result(
  domain: string,
  status: DomainCheckResult["status"] = "available_confirmed",
  providerName = "RegistrarQuorumProvider",
): DomainCheckResult {
  const [name, ...extensionParts] = domain.split(".");
  const extension = extensionParts.join(".");

  return {
    id: domain,
    domain,
    name,
    sld: name,
    tld: extension,
    extension,
    status,
    confidence: "high",
    source: "registrar_api",
    providerName,
    checkedAt: "2026-05-25T00:00:00.000Z",
    premium: false,
    registrarUrl: `https://example.test/${domain}`,
    rules: [],
  };
}

describe("domain intelligence layers", () => {
  it("plans provider routes from configured capabilities", () => {
    const env = (name: string) =>
      ({
        CLOUDFLARE_ACCOUNT_ID: "account",
        CLOUDFLARE_API_TOKEN: "token",
      })[name];
    const capabilities = getProviderCapabilities(env);
    const plan = buildProviderRoutePlan("com", capabilities);

    expect(plan.primary.map((item) => item.id)).toContain("cloudflare");
    expect(plan.supporting.map((item) => item.id)).toEqual(
      expect.arrayContaining(["rdap", "whois", "dns"]),
    );
    expect(plan.totalConfiguredRegistrars).toBeGreaterThan(0);
  });

  it("detects registrar evidence conflicts", () => {
    const available = result("aptava.com", "available_confirmed", "RegistrarA");
    const taken = result("aptava.com", "taken_confirmed", "RegistrarB");
    const ledger = buildEvidenceLedger("aptava.com", [
      toEvidenceRecord(available),
      toEvidenceRecord(taken),
    ]);

    expect(ledger.conflicts[0]).toMatchObject({
      kind: "availability_conflict",
      severity: "high",
    });
  });

  it("scores brand risk and audience fit deterministically", () => {
    const clean = assessBrandRisk("signalpilot");
    const risky = assessBrandRisk("openaisignal");
    const audience = runAudienceTest(result("signalpilot.ai"), scoreName("signalpilot"));

    expect(clean.score).toBeGreaterThan(risky.score);
    expect(risky.trademarkRisk).toBe("high");
    expect(audience).toHaveLength(4);
    expect(audience[0].score).toBeGreaterThan(0);
  });

  it("learns preference boosts from saved and rejected names", () => {
    const profile = learnPreferenceProfile([
      { name: "signalpilot.ai", action: "saved", weight: 2 },
      { name: "datavault.com", action: "opened_registrar" },
      { name: "clunkygrid.ai", action: "rejected", weight: 2 },
    ]);

    expect(preferenceBoost("signalbase", "ai", profile)).toBeGreaterThan(
      preferenceBoost("gridbase", "ai", profile),
    );
  });

  it("caches conclusive provider lookups inside the scheduler", async () => {
    const scheduler = new DomainLookupScheduler();
    let calls = 0;
    const worker = async (domains: string[]) => {
      calls += 1;
      return domains.map((domain) => result(domain));
    };

    await scheduler.runBulk("TestProvider", ["cachetest.com"], worker, {
      ttlMs: 10_000,
      now: () => 1,
    });
    await scheduler.runBulk("TestProvider", ["cachetest.com"], worker, {
      ttlMs: 10_000,
      now: () => 2,
    });

    expect(calls).toBe(1);
  });

  it("attaches valuation, launch readiness, and export fields", () => {
    const baseResults = [result("signalpilot.ai"), result("manualdata.com", "manual_check_required")];
    const recommendations = baseResults.map((item) => scoreName(item.name, [item]));
    const enriched = attachDomainIntelligence(baseResults, recommendations);
    const insight = buildPortfolioInsight(enriched, recommendations);
    const share = buildPortfolioSharePayload({
      title: "Founder shortlist",
      results: enriched,
      recommendations,
    });
    const rows = buildExportRows(enriched, recommendations);

    expect(enriched[0].intelligence?.commercialScore).toBeGreaterThan(0);
    expect(appraiseDomain(enriched[0], recommendations[0]).estimatedUsd).toBeGreaterThan(0);
    expect(insight.totalDomains).toBe(2);
    expect(share.domains[0].estimatedUsd).toBeGreaterThan(0);
    expect(rows[0].commercialScore).not.toBe("");
    expect(rows[0].launchReadiness).not.toBe("");
  });

  it("maps live USPTO trademark search hits into brand-risk signals", async () => {
    const report = await checkUsptoTrademarkRisk("openai", {
      fetcher: async () =>
        new Response(
          JSON.stringify({
            hits: {
              totalValue: 1,
              hits: [
                {
                  id: "99025123",
                  source: {
                    id: "99025123",
                    wordmark: "OPENAI",
                    alive: true,
                    internationalClass: ["IC 009", "IC 042"],
                  },
                },
              ],
            },
          }),
        ),
    });

    expect(report.signal.status).toBe("conflict");
    expect(report.exactLiveMatchCount).toBe(1);
    expect(report.softwareClassMatchCount).toBe(1);
  });

  it("checks handle and app-store signals without blocking on unavailable credentials", async () => {
    const signals = await checkBrandHandleSignals("signalpilot", {
      fetcher: async (input) => {
        const url = String(input);

        if (url.includes("api.github.com")) {
          return new Response("{}", { status: 404 });
        }

        if (url.includes("itunes.apple.com")) {
          return new Response(JSON.stringify({ resultCount: 0, results: [] }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        return new Response("{}", { status: 404 });
      },
      env: () => undefined,
    });

    expect(signals.map((signal) => signal.label)).toContain("GitHub clear");
    expect(signals.map((signal) => signal.label)).toContain("X manual");
    expect(signals.map((signal) => signal.label)).toContain("LinkedIn manual");
    expect(signals.some((signal) => signal.kind === "app_store")).toBe(true);
  });

  it("adds comparable-market signal when a relevant benchmark exists", async () => {
    const domain = result("agent.ai");
    const report = await getMarketComparableReport(domain, scoreName(domain.name, [domain]));

    expect(report.signal.kind).toBe("market_comparable");
    expect(report.comparables.length).toBeGreaterThan(0);
    expect(report.estimateUsd).toBeGreaterThan(0);
  });
});
