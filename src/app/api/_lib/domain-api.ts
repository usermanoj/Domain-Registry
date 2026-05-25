import { NextResponse } from "next/server";
import { z } from "zod";
import { checkDomains, createAvailabilityEngine } from "@/domain/availability-engine";
import {
  attachDomainIntelligence,
  attachLiveDomainIntelligence,
} from "@/domain/domain-intelligence";
import { buildExportRows, toCsv, toXlsxBuffer } from "@/domain/export";
import {
  generateNameCandidates,
  normalizeGenerationStyles,
} from "@/domain/generator";
import {
  composeDomain,
  normalizeBaseName,
  normalizeExtension,
  parseDomainName,
} from "@/domain/normalize";
import { rankRecommendations, scoreName } from "@/domain/scoring";
import { providerModeSchema } from "@/domain/schemas";
import {
  DEFAULT_EXTENSIONS,
  TLD_CATALOG,
  getExtensionQuality,
  validateCatalogExtension,
} from "@/domain/tlds";
import type {
  DomainCheckResult,
  GeneratedCandidate,
  GenerationStyle,
  ProviderMode,
  Recommendation,
} from "@/domain/types";

export type ApiErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "UNPROCESSABLE_ENTITY"
  | "INTERNAL_ERROR";

export type PublicCheckSummary = {
  availableCount: number;
  takenCount: number;
  unknownCount: number;
  bestDomain: string | null;
};

export type ContractCandidate = {
  name: string;
  meaning: string;
  style: string;
  brandScore: number;
  domains: DomainCheckResult[];
};

const providerSelectionSchema = z.array(z.string().min(1)).min(1).max(8);

export const publicCheckRequestSchema = z
  .object({
    name: z.string().min(1).optional(),
    names: z.array(z.string().min(1)).min(1).max(1_000).optional(),
    domain: z.string().min(1).optional(),
    domains: z.array(z.string().min(1)).min(1).max(5_000).optional(),
    extensions: z
      .array(z.string().min(1))
      .min(1)
      .max(50)
      .default(["ai", "com", "sg", "com.sg"]),
    providers: providerSelectionSchema.default(["auto"]),
    forceRefresh: z.boolean().default(false),
    allowCustomExtensions: z.boolean().default(false),
    includeExternalIntelligence: z.boolean().default(false),
    mode: providerModeSchema.optional(),
  })
  .passthrough()
  .transform((value) => {
    const names = [
      ...(value.name ? [value.name] : []),
      ...(value.names ?? []),
    ]
      .map(normalizeBaseName)
      .filter(Boolean);

    const domains = [
      ...(value.domain ? [value.domain] : []),
      ...(value.domains ?? []),
    ];

    return {
      ...value,
      names: Array.from(new Set(names)),
      domains,
      extensions: Array.from(
        new Set(value.extensions.map(normalizeExtension).filter(Boolean)),
      ),
      mode: providerModeFromProviders(value.providers, value.mode),
    };
  })
  .refine((value) => value.names.length > 0 || value.domains.length > 0, {
    message: "Provide either name/names or domain/domains.",
    path: ["name"],
  })
  .refine((value) => value.extensions.length > 0, {
    message: "At least one extension is required.",
    path: ["extensions"],
  })
  .refine(
    (value) =>
      value.extensions.every(
        (extension) =>
          validateCatalogExtension(extension, {
            allowCustom: value.allowCustomExtensions,
          }).valid,
      ),
    {
      message:
        "One or more extensions are not in the configured TLD catalog. Enable custom extensions to proceed.",
      path: ["extensions"],
    },
  )
  .refine((value) => value.domains.every((domain) => parseDomainName(domain).valid), {
    message: "One or more exact domains are invalid.",
    path: ["domains"],
  })
  .refine(
    (value) =>
      value.domains.length > 0 ||
      value.names.length * value.extensions.length <= 5_000,
    {
      message:
        "Synchronous checks are capped at 5,000 combinations. Use /api/check-bulk for larger runs.",
      path: ["names"],
    },
  );

export const publicBulkCheckRequestSchema = z
  .object({
    names: z.array(z.string().min(1)).min(1).max(1_000),
    extensions: z.array(z.string().min(1)).min(1).max(50),
    providers: providerSelectionSchema.default(["auto"]),
    forceRefresh: z.boolean().default(false),
    allowCustomExtensions: z.boolean().default(false),
    mode: providerModeSchema.optional(),
  })
  .transform((value) => ({
    ...value,
    names: Array.from(
      new Set(value.names.map(normalizeBaseName).filter(Boolean)),
    ),
    extensions: Array.from(
      new Set(value.extensions.map(normalizeExtension).filter(Boolean)),
    ),
    mode: providerModeFromProviders(value.providers, value.mode),
  }))
  .refine((value) => value.names.length > 0, {
    message: "At least one valid name is required.",
    path: ["names"],
  })
  .refine((value) => value.extensions.length > 0, {
    message: "At least one extension is required.",
    path: ["extensions"],
  })
  .refine(
    (value) =>
      value.extensions.every(
        (extension) =>
          validateCatalogExtension(extension, {
            allowCustom: value.allowCustomExtensions,
          }).valid,
      ),
    {
      message:
        "One or more extensions are not in the configured TLD catalog. Enable custom extensions to proceed.",
      path: ["extensions"],
    },
  );

export const publicGenerateRequestSchema = z
  .object({
    seedWords: z.array(z.string().min(1)).min(1).max(80).optional(),
    seed: z.string().min(1).max(1_000).optional(),
    style: z.array(z.string().min(1)).min(1).max(16).optional(),
    styles: z.array(z.string().min(1)).min(1).max(16).optional(),
    minLength: z.coerce.number().int().min(3).max(20).default(5),
    maxLength: z.coerce.number().int().min(3).max(24).default(10),
    count: z.coerce.number().int().min(1).max(300).optional(),
    limit: z.coerce.number().int().min(1).max(300).optional(),
    allowedLetters: z.string().max(80).optional().default(""),
    avoidLetters: z.string().max(80).optional().default(""),
    mustInclude: z.string().max(80).optional().default(""),
    mustAvoid: z.string().max(80).optional().default(""),
    extensions: z
      .array(z.string().min(1))
      .min(1)
      .max(50)
      .default(["ai", "com", "sg"]),
    providers: providerSelectionSchema.default(["auto"]),
    forceRefresh: z.boolean().default(false),
    allowCustomExtensions: z.boolean().default(false),
    mode: providerModeSchema.optional(),
  })
  .transform((value) => {
    const seedWords = value.seedWords?.length
      ? value.seedWords
      : value.seed
        ? value.seed.split(/[,;\n]+/)
        : [];
    const styles = normalizeGenerationStyles(
      (value.style ?? value.styles) as Array<GenerationStyle | string> | undefined,
    );
    const minLength = Math.min(value.minLength, value.maxLength);
    const maxLength = Math.max(value.minLength, value.maxLength);

    return {
      ...value,
      seedWords: seedWords.map((word) => word.trim()).filter(Boolean),
      styles,
      minLength,
      maxLength,
      count: value.count ?? value.limit ?? 80,
      extensions: Array.from(
        new Set(value.extensions.map(normalizeExtension).filter(Boolean)),
      ),
      mode: providerModeFromProviders(value.providers, value.mode),
    };
  })
  .refine((value) => value.seedWords.length > 0, {
    message: "At least one seed word is required.",
    path: ["seedWords"],
  })
  .refine((value) => value.extensions.length > 0, {
    message: "At least one extension is required.",
    path: ["extensions"],
  })
  .refine(
    (value) =>
      value.extensions.every(
        (extension) =>
          validateCatalogExtension(extension, {
            allowCustom: value.allowCustomExtensions,
          }).valid,
      ),
    {
      message:
        "One or more extensions are not in the configured TLD catalog. Enable custom extensions to proceed.",
      path: ["extensions"],
    },
  )
  .refine((value) => value.count * value.extensions.length <= 5_000, {
    message: "Generated domain checks are capped at 5,000 combinations.",
    path: ["count"],
  });

export const projectRequestSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(1_000).optional().default(""),
  domains: z.array(z.string().min(1)).max(1_000).optional().default([]),
  shortlist: z.array(z.string().min(1)).max(1_000).optional().default([]),
  notes: z.string().max(5_000).optional().default(""),
  preferredRegistrar: z.string().max(120).optional().default(""),
});

export const exportRequestSchema = z.object({
  format: z.enum(["csv", "xlsx", "json"]).default("csv"),
  results: z.array(z.unknown()).default([]),
  recommendations: z.array(z.unknown()).default([]),
  filename: z.string().max(120).optional().default("domain-export"),
});

export function apiError(
  message: string,
  status = 400,
  code: ApiErrorCode = "BAD_REQUEST",
  issues: unknown[] = [],
) {
  return NextResponse.json(
    {
      error: message,
      code,
      issues,
    },
    { status },
  );
}

export function validationError(message: string, issues: unknown[]) {
  return apiError(message, 400, "BAD_REQUEST", issues);
}

export async function readJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export function newApiId(prefix: string) {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}_${randomId}`;
}

export function providerModeFromProviders(
  providers: string[] = ["auto"],
  explicitMode?: ProviderMode,
): ProviderMode {
  if (explicitMode) {
    return explicitMode;
  }

  const normalized = providers.map((provider) => provider.toLowerCase());

  if (normalized.includes("mock")) {
    return "mock";
  }

  if (
    normalized.includes("auto") ||
    normalized.some((provider) =>
      [
        "rdap",
        "namecheap",
        "cloudflare",
        "godaddy",
        "porkbun",
        "registrar_api",
        "registrar",
      ].includes(provider),
    )
  ) {
    return "live";
  }

  return "hybrid";
}

export function summarizeResults(results: DomainCheckResult[]): PublicCheckSummary {
  const availableCount = results.filter(
    (result) => result.status === "available_confirmed" && result.source === "registrar_api",
  ).length;
  const takenCount = results.filter(
    (result) => result.status === "taken_confirmed",
  ).length;
  const unknownCount = results.filter(
    (result) =>
      result.source === "mock" ||
      ["unknown", "manual_check_required", "rate_limited", "invalid", "restricted"].includes(
        result.status,
      ),
  ).length;
  const bestDomain =
    [...results]
      .filter((result) =>
        ["available_confirmed", "premium_available"].includes(result.status) &&
        result.source === "registrar_api",
      )
      .sort((left, right) => {
        const availabilityDelta =
          (right.status === "available_confirmed" ? 100 : 80) -
          (left.status === "available_confirmed" ? 100 : 80);

        if (availabilityDelta !== 0) {
          return availabilityDelta;
        }

        return getExtensionQuality(right.tld) - getExtensionQuality(left.tld);
      })[0]?.domain ?? null;

  return {
    availableCount,
    takenCount,
    unknownCount,
    bestDomain,
  };
}

export async function runPublicDomainCheck({
  names,
  extensions,
  domains,
  mode,
  includeExternalIntelligence = false,
}: {
  names: string[];
  extensions: string[];
  domains?: string[];
  mode: ProviderMode;
  includeExternalIntelligence?: boolean;
}) {
  if (domains?.length) {
    const engine = createAvailabilityEngine(mode);
    const results = await engine.checkBulk(domains);
    const groupedByName = groupResultsByName(results);
    const recommendations = rankRecommendations(
      Array.from(groupedByName.entries()).map(([name, stack]) => scoreName(name, stack)),
    );

    return includeExternalIntelligence
      ? attachLiveDomainIntelligence(results, recommendations, {
          enabled: mode !== "mock",
        })
      : attachDomainIntelligence(results, recommendations);
  }

  const checked = await checkDomains({
    names,
    extensions,
    mode,
    includeExternalIntelligence,
  });

  return checked.results;
}

export async function generateContractCandidates({
  seedWords,
  styles,
  minLength,
  maxLength,
  count,
  allowedLetters,
  avoidLetters,
  mustInclude,
  mustAvoid,
  extensions,
  mode,
}: {
  seedWords: string[];
  styles: GenerationStyle[];
  minLength: number;
  maxLength: number;
  count: number;
  allowedLetters: string;
  avoidLetters: string;
  mustInclude: string;
  mustAvoid: string;
  extensions: string[];
  mode: ProviderMode;
}) {
  const generated = generateNameCandidates({
    seed: seedWords.join(", "),
    styles,
    minLength,
    maxLength,
    limit: count,
    allowedLetters,
    avoidLetters,
    mustInclude,
    mustAvoid,
  });
  const checked = await checkDomains({
    names: generated.candidates.map((candidate) => candidate.name),
    extensions,
    mode,
  });
  const domainsByName = groupResultsByName(checked.results);
  const candidates = generated.candidates.map((candidate) =>
    toContractCandidate(candidate, domainsByName.get(candidate.name) ?? []),
  );
  const recommendations = rankRecommendations(
    candidates.map((candidate) => scoreName(candidate.name, candidate.domains)),
  ).slice(0, 20);

  return {
    candidates: candidates.sort((left, right) => right.brandScore - left.brandScore),
    recommendations,
  };
}

export function groupResultsByName(results: DomainCheckResult[]) {
  const groups = new Map<string, DomainCheckResult[]>();

  for (const result of results) {
    groups.set(result.sld, [...(groups.get(result.sld) ?? []), result]);
  }

  return groups;
}

export function toContractCandidate(
  candidate: GeneratedCandidate,
  domains: DomainCheckResult[],
): ContractCandidate {
  const scored = scoreName(candidate.name, domains);

  return {
    name: candidate.name,
    meaning: candidate.rationale,
    style: candidate.style.replace(/_/g, "-"),
    brandScore: scored.brandScore,
    domains,
  };
}

export function publicTldCatalog() {
  return TLD_CATALOG.map((entry) => {
    const requiresEligibility =
      entry.restricted || entry.extension === "edu" || entry.extension === "com.sg";
    const category = entry.restricted
      ? "restricted"
      : entry.singapore
        ? "singapore"
        : entry.extension === "ai"
          ? "ai"
          : entry.extension === "education"
            ? "education"
            : ["app", "dev", "io", "tech"].includes(entry.extension)
              ? "technology"
              : "general";
    const supportedProviders = entry.restricted
      ? ["manual"]
      : entry.singapore
        ? ["mock", "manual", "rdap", "namecheap", "cloudflare", "godaddy", "porkbun"]
        : ["mock", "rdap", "namecheap", "cloudflare", "godaddy", "porkbun"];

    return {
      tld: entry.extension,
      label: `.${entry.extension}`,
      category,
      restricted: entry.restricted,
      requiresEligibility,
      supportedProviders,
      defaultEnabled: DEFAULT_EXTENSIONS.includes(
        entry.extension as (typeof DEFAULT_EXTENSIONS)[number],
      ),
    };
  });
}

export function exportPayload({
  format,
  results,
  recommendations,
  filename,
}: {
  format: "csv" | "xlsx" | "json";
  results: unknown[];
  recommendations: unknown[];
  filename: string;
}) {
  const rows = buildExportRows(
    results as DomainCheckResult[],
    recommendations as Recommendation[],
  );
  const safeFilename = filename.replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") ||
    "domain-export";

  if (format === "json") {
    return NextResponse.json({
      rows,
      results,
      recommendations,
    });
  }

  if (format === "xlsx") {
    return new NextResponse(toXlsxBuffer(rows), {
      headers: {
        "content-type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${safeFilename}.xlsx"`,
      },
    });
  }

  return new NextResponse(toCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safeFilename}.csv"`,
    },
  });
}

export function domainMatrix(names: string[], extensions: string[]) {
  return names.flatMap((name) =>
    extensions.map((extension) => composeDomain(name, extension)),
  );
}
