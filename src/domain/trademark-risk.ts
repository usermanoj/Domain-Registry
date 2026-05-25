import { fetchWithTlsFallback } from "./fetch-with-tls-fallback";
import { normalizeBaseName } from "./normalize";
import type { DomainIntelligenceSignal } from "./types";

type Fetcher = typeof fetch;
type EnvReader = (name: string) => string | undefined;

type TrademarkRiskOptions = {
  fetcher?: Fetcher;
  env?: EnvReader;
  timeoutMs?: number;
};

type UsptoSearchHit = {
  id?: string;
  source?: {
    id?: string;
    wordmark?: string;
    ownerName?: string[];
    internationalClass?: string[];
    alive?: boolean;
    registered?: boolean;
    statusDescription?: string;
  };
};

type UsptoSearchResponse = {
  hits?: {
    totalValue?: number;
    hits?: UsptoSearchHit[];
  };
};

export type TrademarkRiskReport = {
  signal: DomainIntelligenceSignal;
  liveMatchCount: number;
  exactLiveMatchCount: number;
  softwareClassMatchCount: number;
};

const DEFAULT_TIMEOUT_MS = 3_500;
const USPTO_SEARCH_ENDPOINT = "https://tmsearch.uspto.gov/prod-stage-v1-0-0/tmsearch";
const USPTO_SEARCH_URL = "https://tmsearch.uspto.gov/search/search-information";
const SOFTWARE_RELATED_CLASSES = new Set(["009", "035", "038", "041", "042", "045"]);

function defaultEnv(name: string) {
  return process.env[name]?.trim();
}

function normalizeMark(value: string) {
  return normalizeBaseName(value).replace(/[^a-z0-9]+/g, "");
}

function envNumber(env: EnvReader, name: string, fallback: number) {
  const parsed = Number(env(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function classCode(value: string) {
  const match = value.match(/\d{3}/);
  return match ? match[0] : value.padStart(3, "0");
}

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function usptoQuery(name: string) {
  const compact = normalizeMark(name);

  if (!compact) {
    return "";
  }

  return `CM:${compact} AND LD:true`;
}

function usptoRequestBody(name: string) {
  const query = usptoQuery(name);

  return {
    query: {
      bool: {
        must: [
          {
            query_string: {
              query,
              default_operator: "OR",
            },
          },
        ],
      },
    },
    size: 8,
    from: 0,
    track_total_hits: true,
  };
}

function buildSignal({
  label,
  status,
  confidence,
  detail,
  checkedAt,
  scoreImpact,
  metadata,
}: Pick<
  DomainIntelligenceSignal,
  "label" | "status" | "confidence" | "detail" | "checkedAt" | "scoreImpact" | "metadata"
>): DomainIntelligenceSignal {
  return {
    kind: "trademark",
    label,
    status,
    confidence,
    source: "USPTO Trademark Search",
    detail,
    checkedAt,
    url: USPTO_SEARCH_URL,
    scoreImpact,
    metadata,
  };
}

export async function checkUsptoTrademarkRisk(
  name: string,
  options: TrademarkRiskOptions = {},
): Promise<TrademarkRiskReport> {
  const env = options.env ?? defaultEnv;
  const fetcher = options.fetcher ?? fetch;
  const checkedAt = new Date().toISOString();
  const compact = normalizeMark(name);
  const timeoutMs = options.timeoutMs ??
    envNumber(env, "TRADEMARK_CHECK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);

  if (compact.length < 3) {
    return {
      signal: buildSignal({
        label: "USPTO manual",
        status: "manual_check",
        confidence: "low",
        detail: "Name is too short for a reliable automated trademark screening.",
        checkedAt,
        scoreImpact: -6,
      }),
      liveMatchCount: 0,
      exactLiveMatchCount: 0,
      softwareClassMatchCount: 0,
    };
  }

  const endpoint = env("USPTO_TRADEMARK_SEARCH_URL") ?? USPTO_SEARCH_ENDPOINT;
  const timeout = withTimeout(timeoutMs);

  try {
    const response = await fetchWithTlsFallback(fetcher, endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(usptoRequestBody(compact)),
      signal: timeout.signal,
    });

    let body: UsptoSearchResponse = {};

    try {
      body = (await response.json()) as UsptoSearchResponse;
    } catch {
      body = {};
    }

    if (!response.ok) {
      return {
        signal: buildSignal({
          label: "USPTO unknown",
          status: response.status === 429 ? "partial" : "unknown",
          confidence: "low",
          detail: `USPTO trademark lookup returned HTTP ${response.status}.`,
          checkedAt,
          scoreImpact: response.status === 429 ? -8 : -4,
          metadata: { httpStatus: response.status },
        }),
        liveMatchCount: 0,
        exactLiveMatchCount: 0,
        softwareClassMatchCount: 0,
      };
    }

    const hits = body.hits?.hits ?? [];
    const liveMatchCount = body.hits?.totalValue ?? hits.length;
    const exactHits = hits.filter((hit) => normalizeMark(hit.source?.wordmark ?? "") === compact);
    const softwareHits = hits.filter((hit) =>
      (hit.source?.internationalClass ?? [])
        .map(classCode)
        .some((code) => SOFTWARE_RELATED_CLASSES.has(code)),
    );
    const exactLiveMatchCount = exactHits.length;
    const softwareClassMatchCount = softwareHits.length;
    const topHit = exactHits[0] ?? softwareHits[0] ?? hits[0];
    const topMark = topHit?.source?.wordmark;
    const topClasses = topHit?.source?.internationalClass?.slice(0, 4).join(", ");

    if (exactLiveMatchCount > 0 && softwareClassMatchCount > 0) {
      return {
        signal: buildSignal({
          label: "Trademark conflict",
          status: "conflict",
          confidence: "high",
          detail: `Live USPTO match${exactLiveMatchCount > 1 ? "es" : ""} found for ${topMark ?? compact} in software-adjacent classes.`,
          checkedAt,
          scoreImpact: -34,
          metadata: {
            liveMatchCount,
            exactLiveMatchCount,
            softwareClassMatchCount,
            topSerial: topHit?.source?.id ?? topHit?.id ?? null,
            topClasses: topClasses ?? null,
          },
        }),
        liveMatchCount,
        exactLiveMatchCount,
        softwareClassMatchCount,
      };
    }

    if (liveMatchCount > 0) {
      return {
        signal: buildSignal({
          label: "Trademark caution",
          status: "partial",
          confidence: "medium",
          detail: `USPTO returned ${liveMatchCount} live trademark record${liveMatchCount === 1 ? "" : "s"} containing this term.`,
          checkedAt,
          scoreImpact: exactLiveMatchCount > 0 ? -22 : -12,
          metadata: {
            liveMatchCount,
            exactLiveMatchCount,
            softwareClassMatchCount,
            topSerial: topHit?.source?.id ?? topHit?.id ?? null,
          },
        }),
        liveMatchCount,
        exactLiveMatchCount,
        softwareClassMatchCount,
      };
    }

    return {
      signal: buildSignal({
        label: "USPTO clear",
        status: "clear",
        confidence: "medium",
        detail: "No live USPTO wordmark match was returned for the screened term.",
        checkedAt,
        scoreImpact: 6,
        metadata: { liveMatchCount: 0 },
      }),
      liveMatchCount: 0,
      exactLiveMatchCount: 0,
      softwareClassMatchCount: 0,
    };
  } catch (error) {
    return {
      signal: buildSignal({
        label: "USPTO unknown",
        status: "unknown",
        confidence: "low",
        detail:
          error instanceof Error
            ? `USPTO trademark lookup failed: ${error.message}`
            : "USPTO trademark lookup failed.",
        checkedAt,
        scoreImpact: -4,
      }),
      liveMatchCount: 0,
      exactLiveMatchCount: 0,
      softwareClassMatchCount: 0,
    };
  } finally {
    timeout.clear();
  }
}
