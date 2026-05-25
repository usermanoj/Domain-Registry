import Redis from "ioredis";
import { ledgerForResult } from "@/domain/evidence-ledger";
import type { DomainCheckResult, ProviderMode, Recommendation } from "@/domain/types";

type SearchRunRecord = {
  id: string;
  query: string;
  mode: ProviderMode;
  extensions: string[];
  checkedAt: string;
  results: DomainCheckResult[];
  recommendations: Recommendation[];
};

type PreferenceAction = "saved" | "rejected" | "opened_registrar" | "exported";

type PreferenceEvent = {
  action: PreferenceAction;
  domain: string;
  name: string;
  extension: string;
  createdAt: string;
  weight?: number;
};

type StoreHealth = {
  configured: boolean;
  backend: "redis" | "memory";
  status: "ready" | "degraded";
};

const memorySearchRuns = new Map<string, SearchRunRecord>();
const memoryPreferenceEvents: PreferenceEvent[] = [];
let redisClient: Redis | null | undefined;

function redisUrl() {
  return process.env.REDIS_URL?.trim();
}

function maxStoredSearchRuns() {
  const parsed = Number(process.env.PERSISTED_SEARCH_RUN_LIMIT);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
}

function getRedis() {
  if (!redisUrl()) {
    return null;
  }

  if (redisClient !== undefined) {
    return redisClient;
  }

  try {
    redisClient = new Redis(redisUrl() ?? "", {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  } catch {
    redisClient = null;
  }

  return redisClient;
}

async function writeRedisJson(key: string, value: unknown, ttlSeconds?: number) {
  const redis = getRedis();

  if (!redis) {
    return false;
  }

  try {
    if (ttlSeconds) {
      await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
    } else {
      await redis.set(key, JSON.stringify(value));
    }

    return true;
  } catch {
    return false;
  }
}

function searchRunKey(id: string) {
  return `domain-intelligence:search:${id}`;
}

function evidenceKey(domain: string) {
  return `domain-intelligence:evidence:${domain}`;
}

function preferenceKey(name: string) {
  return `domain-intelligence:preferences:${name}`;
}

export async function recordSearchRun(record: SearchRunRecord) {
  const ttlSeconds = Math.max(
    60,
    Number(process.env.PERSISTED_SEARCH_TTL_SECONDS ?? 60 * 60 * 24 * 30),
  );
  const ledgers = record.results.map((result) => ledgerForResult(result));
  const persisted = await writeRedisJson(
    searchRunKey(record.id),
    {
      ...record,
      evidenceLedgers: ledgers,
    },
    ttlSeconds,
  );

  if (persisted) {
    const redis = getRedis();

    try {
      await redis?.lpush("domain-intelligence:search:index", record.id);
      await redis?.ltrim("domain-intelligence:search:index", 0, maxStoredSearchRuns() - 1);
      await Promise.all(
        ledgers.map((ledger) =>
          writeRedisJson(evidenceKey(ledger.domain), ledger, ttlSeconds),
        ),
      );
      return;
    } catch {
      // Fall through to memory backup below.
    }
  }

  memorySearchRuns.set(record.id, record);

  if (memorySearchRuns.size > maxStoredSearchRuns()) {
    const oldest = memorySearchRuns.keys().next().value as string | undefined;

    if (oldest) {
      memorySearchRuns.delete(oldest);
    }
  }
}

export async function recordPreferenceEvent(event: Omit<PreferenceEvent, "createdAt">) {
  const createdAt = new Date().toISOString();
  const payload: PreferenceEvent = {
    ...event,
    createdAt,
  };
  const persisted = await writeRedisJson(
    `${preferenceKey(event.name)}:${createdAt}:${event.action}`,
    payload,
    60 * 60 * 24 * 365,
  );

  if (persisted) {
    try {
      await getRedis()?.lpush(preferenceKey(event.name), JSON.stringify(payload));
      await getRedis()?.ltrim(preferenceKey(event.name), 0, 499);
      return;
    } catch {
      // Fall through to memory backup below.
    }
  }

  memoryPreferenceEvents.push(payload);

  if (memoryPreferenceEvents.length > 2_000) {
    memoryPreferenceEvents.splice(0, memoryPreferenceEvents.length - 2_000);
  }
}

export function persistenceHealth(): StoreHealth {
  const configured = Boolean(redisUrl());

  return {
    configured,
    backend: configured && getRedis() ? "redis" : "memory",
    status: configured && !getRedis() ? "degraded" : "ready",
  };
}
