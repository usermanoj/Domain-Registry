import { fetchWithTlsFallback } from "./fetch-with-tls-fallback";
import { normalizeBaseName } from "./normalize";
import type { DomainIntelligenceSignal } from "./types";

type Fetcher = typeof fetch;
type EnvReader = (name: string) => string | undefined;

type HandleCheckOptions = {
  fetcher?: Fetcher;
  env?: EnvReader;
  timeoutMs?: number;
};

type AppleSearchResponse = {
  resultCount?: number;
  results?: Array<{
    trackName?: string;
    sellerName?: string;
    bundleId?: string;
    trackViewUrl?: string;
  }>;
};

type YouTubeSearchResponse = {
  items?: Array<{
    snippet?: {
      channelTitle?: string;
      title?: string;
    };
  }>;
};

const DEFAULT_TIMEOUT_MS = 2_500;
const MANUAL_PLATFORMS = [
  {
    label: "LinkedIn",
    url: (handle: string) => `https://www.linkedin.com/company/${handle}/`,
  },
  {
    label: "Product Hunt",
    url: (handle: string) => `https://www.producthunt.com/products/${handle}`,
  },
];

function defaultEnv(name: string) {
  return process.env[name]?.trim();
}

function envNumber(env: EnvReader, name: string, fallback: number) {
  const parsed = Number(env(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function handleFor(name: string) {
  return normalizeBaseName(name).replace(/[^a-z0-9-]+/g, "").slice(0, 30);
}

function exact(value: string | undefined, handle: string) {
  return normalizeBaseName(value ?? "").replace(/[^a-z0-9]+/g, "") ===
    handle.replace(/[^a-z0-9]+/g, "");
}

function signal({
  kind = "handle",
  label,
  status,
  confidence,
  source,
  detail,
  checkedAt,
  url,
  scoreImpact,
  metadata,
}: Omit<DomainIntelligenceSignal, "kind"> & {
  kind?: DomainIntelligenceSignal["kind"];
}): DomainIntelligenceSignal {
  return {
    kind,
    label,
    status,
    confidence,
    source,
    detail,
    checkedAt,
    url,
    scoreImpact,
    metadata,
  };
}

function withTimeout(timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function checkGitHubHandle(
  handle: string,
  checkedAt: string,
  fetcher: Fetcher,
  env: EnvReader,
  timeoutMs: number,
) {
  const timeout = withTimeout(timeoutMs);
  const url = `https://github.com/${handle}`;

  try {
    const headers: Record<string, string> = {
      accept: "application/vnd.github+json",
      "x-github-api-version": "2022-11-28",
    };
    const token = env("GITHUB_TOKEN");

    if (token) {
      headers.authorization = `Bearer ${token}`;
    }

    const response = await fetchWithTlsFallback(
      fetcher,
      `https://api.github.com/users/${encodeURIComponent(handle)}`,
      {
        headers,
        signal: timeout.signal,
      },
    );

    if (response.status === 404) {
      return signal({
        label: "GitHub clear",
        status: "clear",
        confidence: "medium",
        source: "GitHub REST API",
        detail: `GitHub username ${handle} was not found.`,
        checkedAt,
        url,
        scoreImpact: 5,
      });
    }

    if (response.ok) {
      return signal({
        label: "GitHub taken",
        status: "conflict",
        confidence: "high",
        source: "GitHub REST API",
        detail: `GitHub username ${handle} is already in use.`,
        checkedAt,
        url,
        scoreImpact: -9,
      });
    }

    return signal({
      label: "GitHub unknown",
      status: response.status === 403 || response.status === 429 ? "partial" : "unknown",
      confidence: "low",
      source: "GitHub REST API",
      detail: `GitHub lookup returned HTTP ${response.status}.`,
      checkedAt,
      url,
      scoreImpact: -2,
      metadata: { httpStatus: response.status },
    });
  } catch (error) {
    return signal({
      label: "GitHub unknown",
      status: "unknown",
      confidence: "low",
      source: "GitHub REST API",
      detail:
        error instanceof Error
          ? `GitHub handle lookup failed: ${error.message}`
          : "GitHub handle lookup failed.",
      checkedAt,
      url,
      scoreImpact: -2,
    });
  } finally {
    timeout.clear();
  }
}

async function checkXHandle(
  handle: string,
  checkedAt: string,
  fetcher: Fetcher,
  env: EnvReader,
  timeoutMs: number,
) {
  const url = `https://x.com/${handle}`;
  const token = env("X_BEARER_TOKEN");

  if (!token) {
    return signal({
      label: "X manual",
      status: "manual_check",
      confidence: "low",
      source: "X API",
      detail: "Set X_BEARER_TOKEN to enable X username lookup.",
      checkedAt,
      url,
      scoreImpact: -1,
    });
  }

  const timeout = withTimeout(timeoutMs);

  try {
    const response = await fetchWithTlsFallback(
      fetcher,
      `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}?user.fields=username,verified`,
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
        signal: timeout.signal,
      },
    );

    if (response.status === 404) {
      return signal({
        label: "X clear",
        status: "clear",
        confidence: "medium",
        source: "X API",
        detail: `X username ${handle} was not found.`,
        checkedAt,
        url,
        scoreImpact: 4,
      });
    }

    if (response.ok) {
      return signal({
        label: "X taken",
        status: "conflict",
        confidence: "high",
        source: "X API",
        detail: `X username ${handle} is already in use.`,
        checkedAt,
        url,
        scoreImpact: -8,
      });
    }

    return signal({
      label: "X unknown",
      status: response.status === 429 ? "partial" : "unknown",
      confidence: "low",
      source: "X API",
      detail: `X lookup returned HTTP ${response.status}.`,
      checkedAt,
      url,
      scoreImpact: -2,
      metadata: { httpStatus: response.status },
    });
  } catch (error) {
    return signal({
      label: "X unknown",
      status: "unknown",
      confidence: "low",
      source: "X API",
      detail:
        error instanceof Error
          ? `X handle lookup failed: ${error.message}`
          : "X handle lookup failed.",
      checkedAt,
      url,
      scoreImpact: -2,
    });
  } finally {
    timeout.clear();
  }
}

async function checkYouTubeHandle(
  handle: string,
  checkedAt: string,
  fetcher: Fetcher,
  env: EnvReader,
  timeoutMs: number,
) {
  const key = env("YOUTUBE_API_KEY");
  const url = `https://www.youtube.com/@${handle}`;

  if (!key) {
    return signal({
      label: "YouTube manual",
      status: "manual_check",
      confidence: "low",
      source: "YouTube Data API",
      detail: "Set YOUTUBE_API_KEY to search YouTube channel names.",
      checkedAt,
      url,
      scoreImpact: -1,
    });
  }

  const timeout = withTimeout(timeoutMs);

  try {
    const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
    endpoint.searchParams.set("part", "snippet");
    endpoint.searchParams.set("type", "channel");
    endpoint.searchParams.set("maxResults", "5");
    endpoint.searchParams.set("q", handle);
    endpoint.searchParams.set("key", key);
    const response = await fetchWithTlsFallback(fetcher, endpoint, { signal: timeout.signal });
    const body = await readJson<YouTubeSearchResponse>(response);

    if (!response.ok) {
      return signal({
        label: "YouTube unknown",
        status: response.status === 403 || response.status === 429 ? "partial" : "unknown",
        confidence: "low",
        source: "YouTube Data API",
        detail: `YouTube lookup returned HTTP ${response.status}.`,
        checkedAt,
        url,
        scoreImpact: -2,
        metadata: { httpStatus: response.status },
      });
    }

    const match = (body?.items ?? []).find((item) =>
      exact(item.snippet?.channelTitle ?? item.snippet?.title, handle),
    );

    return signal({
      label: match ? "YouTube conflict" : "YouTube low conflict",
      status: match ? "conflict" : "clear",
      confidence: match ? "medium" : "low",
      source: "YouTube Data API",
      detail: match
        ? "YouTube returned an exact channel-name match."
        : "No exact YouTube channel-name match was returned.",
      checkedAt,
      url,
      scoreImpact: match ? -5 : 2,
    });
  } catch (error) {
    return signal({
      label: "YouTube unknown",
      status: "unknown",
      confidence: "low",
      source: "YouTube Data API",
      detail:
        error instanceof Error
          ? `YouTube lookup failed: ${error.message}`
          : "YouTube lookup failed.",
      checkedAt,
      url,
      scoreImpact: -2,
    });
  } finally {
    timeout.clear();
  }
}

async function checkAppleAppStore(
  handle: string,
  checkedAt: string,
  fetcher: Fetcher,
  env: EnvReader,
  timeoutMs: number,
) {
  const timeout = withTimeout(timeoutMs);
  const country = env("APPLE_APP_STORE_COUNTRY") ?? "us";
  const url = `https://apps.apple.com/search?term=${encodeURIComponent(handle)}`;

  try {
    const endpoint = new URL("https://itunes.apple.com/search");
    endpoint.searchParams.set("media", "software");
    endpoint.searchParams.set("entity", "software");
    endpoint.searchParams.set("limit", "5");
    endpoint.searchParams.set("country", country);
    endpoint.searchParams.set("term", handle);
    const response = await fetchWithTlsFallback(fetcher, endpoint, { signal: timeout.signal });
    const body = await readJson<AppleSearchResponse>(response);

    if (!response.ok) {
      return signal({
        kind: "app_store",
        label: "App Store unknown",
        status: "unknown",
        confidence: "low",
        source: "Apple iTunes Search API",
        detail: `Apple app lookup returned HTTP ${response.status}.`,
        checkedAt,
        url,
        scoreImpact: -2,
        metadata: { httpStatus: response.status },
      });
    }

    const match = (body?.results ?? []).find((item) => exact(item.trackName, handle));

    return signal({
      kind: "app_store",
      label: match ? "App Store conflict" : "App Store low conflict",
      status: match ? "conflict" : "clear",
      confidence: match ? "medium" : "low",
      source: "Apple iTunes Search API",
      detail: match
        ? `Apple App Store returned an exact app-name match from ${match.sellerName ?? "an app publisher"}.`
        : "No exact Apple App Store app-name match was returned.",
      checkedAt,
      url: match?.trackViewUrl ?? url,
      scoreImpact: match ? -6 : 2,
      metadata: match
        ? {
            bundleId: match.bundleId ?? null,
            sellerName: match.sellerName ?? null,
          }
        : undefined,
    });
  } catch (error) {
    return signal({
      kind: "app_store",
      label: "App Store unknown",
      status: "unknown",
      confidence: "low",
      source: "Apple iTunes Search API",
      detail:
        error instanceof Error
          ? `Apple app lookup failed: ${error.message}`
          : "Apple app lookup failed.",
      checkedAt,
      url,
      scoreImpact: -2,
    });
  } finally {
    timeout.clear();
  }
}

function manualPlatformSignals(handle: string, checkedAt: string) {
  return MANUAL_PLATFORMS.map((platform) =>
    signal({
      label: `${platform.label} manual`,
      status: "manual_check",
      confidence: "low",
      source: `${platform.label} public profile`,
      detail: `${platform.label} availability requires manual or partner/API verification.`,
      checkedAt,
      url: platform.url(handle),
      scoreImpact: -1,
    }),
  );
}

export async function checkBrandHandleSignals(
  name: string,
  options: HandleCheckOptions = {},
) {
  const env = options.env ?? defaultEnv;
  const fetcher = options.fetcher ?? fetch;
  const checkedAt = new Date().toISOString();
  const handle = handleFor(name);
  const timeoutMs = options.timeoutMs ??
    envNumber(env, "BRAND_HANDLE_CHECK_TIMEOUT_MS", DEFAULT_TIMEOUT_MS);

  if (!handle || handle.length < 3) {
    return [
      signal({
        label: "Handles manual",
        status: "manual_check",
        confidence: "low",
        source: "Brand handle checker",
        detail: "Name is too short for reliable automated handle checks.",
        checkedAt,
        scoreImpact: -3,
      }),
    ];
  }

  const checks = await Promise.allSettled([
    checkGitHubHandle(handle, checkedAt, fetcher, env, timeoutMs),
    checkXHandle(handle, checkedAt, fetcher, env, timeoutMs),
    checkYouTubeHandle(handle, checkedAt, fetcher, env, timeoutMs),
    checkAppleAppStore(handle, checkedAt, fetcher, env, timeoutMs),
  ]);
  const resolved = checks
    .filter((item): item is PromiseFulfilledResult<DomainIntelligenceSignal> =>
      item.status === "fulfilled",
    )
    .map((item) => item.value);

  return [...resolved, ...manualPlatformSignals(handle, checkedAt)];
}
