import { fetchWithTlsFallback } from "./fetch-with-tls-fallback";
import { normalizeBaseName } from "./normalize";
import type { DomainCheckResult, DomainIntelligenceSignal, Recommendation } from "./types";

type Fetcher = typeof fetch;
type EnvReader = (name: string) => string | undefined;

export type DomainSaleComparable = {
  domain: string;
  name: string;
  extension: string;
  priceUsd: number;
  soldAt?: string;
  venue?: string;
};

export type MarketComparableReport = {
  signal: DomainIntelligenceSignal;
  comparables: DomainSaleComparable[];
  estimateUsd?: number;
};

type MarketOptions = {
  fetcher?: Fetcher;
  env?: EnvReader;
};

const DEFAULT_COMPARABLES: DomainSaleComparable[] = [
  {
    domain: "data.ai",
    name: "data",
    extension: "ai",
    priceUsd: 30_000,
    venue: "benchmark",
  },
  {
    domain: "agent.ai",
    name: "agent",
    extension: "ai",
    priceUsd: 60_000,
    venue: "benchmark",
  },
  {
    domain: "pilot.com",
    name: "pilot",
    extension: "com",
    priceUsd: 175_000,
    venue: "benchmark",
  },
  {
    domain: "signal.com",
    name: "signal",
    extension: "com",
    priceUsd: 250_000,
    venue: "benchmark",
  },
];

function defaultEnv(name: string) {
  return process.env[name]?.trim();
}

function compact(value: string) {
  return normalizeBaseName(value).replace(/[^a-z0-9]+/g, "");
}

function parseComparableRows(raw: string): DomainSaleComparable[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.toLowerCase().startsWith("domain,"))
    .map((line) => {
      const [domain = "", price = "", venue = "", soldAt = ""] = line
        .split(",")
        .map((part) => part.trim());
      const [name = "", ...extensionParts] = domain.toLowerCase().split(".");
      const priceUsd = Number(price.replace(/[$_ ]/g, ""));

      return {
        domain: domain.toLowerCase(),
        name: compact(name),
        extension: extensionParts.join("."),
        priceUsd: Number.isFinite(priceUsd) ? priceUsd : 0,
        venue,
        soldAt,
      };
    })
    .filter((item) => item.domain && item.name && item.extension && item.priceUsd > 0);
}

async function loadLocalComparables(path: string) {
  try {
    const fs = await import("node:fs/promises");
    return parseComparableRows(await fs.readFile(path, "utf8"));
  } catch {
    return [];
  }
}

async function loadRemoteComparables(url: string, fetcher: Fetcher) {
  try {
    const response = await fetchWithTlsFallback(fetcher, url, {
      headers: {
        accept: "text/csv, application/json;q=0.9",
      },
    });

    if (!response.ok) {
      return [];
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
      const body = (await response.json()) as unknown;

      if (!Array.isArray(body)) {
        return [];
      }

      return body
        .map((item) => item as Partial<DomainSaleComparable>)
        .filter((item): item is DomainSaleComparable =>
          Boolean(item.domain && item.name && item.extension && item.priceUsd),
        );
    }

    return parseComparableRows(await response.text());
  } catch {
    return [];
  }
}

async function loadComparables(env: EnvReader, fetcher: Fetcher) {
  const localPath = env("DOMAIN_SALES_DATA_PATH");
  const remoteUrl = env("DOMAIN_SALES_COMPARABLES_URL");
  const local = localPath ? await loadLocalComparables(localPath) : [];
  const remote = remoteUrl ? await loadRemoteComparables(remoteUrl, fetcher) : [];

  return [...local, ...remote, ...DEFAULT_COMPARABLES];
}

function comparableScore(result: DomainCheckResult, comparable: DomainSaleComparable) {
  const name = compact(result.name);
  let score = 0;

  if (result.extension === comparable.extension) score += 28;
  if (name === comparable.name) score += 38;
  if (name.includes(comparable.name) || comparable.name.includes(name)) score += 18;
  score += Math.max(0, 20 - Math.abs(name.length - comparable.name.length) * 3);

  return score;
}

function median(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length === 0) return undefined;
  return sorted.length % 2
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export async function getMarketComparableReport(
  result: DomainCheckResult,
  recommendation?: Recommendation,
  options: MarketOptions = {},
): Promise<MarketComparableReport> {
  const env = options.env ?? defaultEnv;
  const fetcher = options.fetcher ?? fetch;
  const checkedAt = new Date().toISOString();
  const comparables = (await loadComparables(env, fetcher))
    .map((item) => ({ item, score: comparableScore(result, item) }))
    .filter(({ score }) => score >= 28)
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ item }) => item);
  const comparableMedian = median(comparables.map((item) => item.priceUsd));
  const brandScore = recommendation?.brandScore ?? 55;
  const estimateUsd = comparableMedian
    ? Math.max(20, Math.round(comparableMedian * (0.45 + brandScore / 220)))
    : undefined;

  if (comparables.length === 0 || !estimateUsd) {
    return {
      signal: {
        kind: "market_comparable",
        label: "Market heuristic",
        status: "unknown",
        confidence: "low",
        source: "Comparable sales adapter",
        detail:
          "No configured comparable-sale match was found; valuation remains heuristic.",
        checkedAt,
        scoreImpact: 0,
      },
      comparables: [],
    };
  }

  return {
    signal: {
      kind: "market_comparable",
      label: "Comparable-informed",
      status: "partial",
      confidence: env("DOMAIN_SALES_DATA_PATH") || env("DOMAIN_SALES_COMPARABLES_URL")
        ? "medium"
        : "low",
      source: "Comparable sales adapter",
      detail: `Valuation anchored to ${comparables.length} comparable sale${comparables.length === 1 ? "" : "s"}.`,
      checkedAt,
      scoreImpact: Math.min(8, Math.round(brandScore / 20)),
      metadata: {
        estimateUsd,
        comparableCount: comparables.length,
        topComparable: comparables[0]?.domain ?? null,
      },
    },
    comparables,
    estimateUsd,
  };
}
