import type { DomainCheckResult } from "./types";

type CacheEntry = {
  expiresAt: number;
  result: DomainCheckResult;
};

type SchedulerOptions = {
  ttlMs?: number;
  concurrency?: number;
  now?: () => number;
};

const DEFAULT_TTL_MS =
  process.env.NODE_ENV === "test"
    ? 0
    : Math.max(0, Number(process.env.DEFAULT_CACHE_TTL_HOURS ?? 0) || 0) * 60 * 60 * 1_000;

function cacheKey(providerName: string, domain: string) {
  return `${providerName}:${domain.toLowerCase()}`;
}

export class DomainLookupScheduler {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<DomainCheckResult>>();

  async runBulk(
    providerName: string,
    domains: string[],
    worker: (domains: string[]) => Promise<DomainCheckResult[]>,
    options: SchedulerOptions = {},
  ) {
    const now = options.now ?? Date.now;
    const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    const results = new Map<string, DomainCheckResult>();
    const missing: string[] = [];

    for (const domain of domains) {
      const key = cacheKey(providerName, domain);
      const cached = this.cache.get(key);

      if (cached && cached.expiresAt > now()) {
        results.set(domain.toLowerCase(), cached.result);
      } else if (this.inFlight.has(key)) {
        const result = await this.inFlight.get(key);

        if (result) {
          results.set(domain.toLowerCase(), result);
        }
      } else {
        missing.push(domain);
      }
    }

    if (missing.length > 0) {
      const chunks = chunk(missing, Math.max(1, options.concurrency ?? missing.length));
      const resolvedChunks = await Promise.all(chunks.map((items) => worker(items)));
      const resolved = resolvedChunks.flat();

      for (const result of resolved) {
        const key = cacheKey(providerName, result.domain);

        results.set(result.domain.toLowerCase(), result);

        if (ttlMs > 0 && ["available_confirmed", "taken_confirmed", "premium_available"].includes(result.status)) {
          this.cache.set(key, {
            expiresAt: now() + ttlMs,
            result,
          });
        }
      }
    }

    return domains.map((domain) => results.get(domain.toLowerCase())).filter(
      (result): result is DomainCheckResult => Boolean(result),
    );
  }

  clear() {
    this.cache.clear();
    this.inFlight.clear();
  }
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

export const domainLookupScheduler = new DomainLookupScheduler();
