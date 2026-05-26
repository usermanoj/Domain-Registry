"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Archive,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  BrainCircuit,
  Check,
  CircleHelp,
  CloudUpload,
  Database,
  Download,
  ExternalLink,
  FileJson,
  FileSpreadsheet,
  Filter,
  Gauge,
  Globe2,
  Layers3,
  Link2,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  Sun,
  Table2,
  WandSparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildExportRows, toCsv, toXlsxBuffer } from "@/domain/export";
import {
  CANONICAL_GENERATION_STYLES,
  GENERATION_STYLE_LABELS,
  transformName,
} from "@/domain/generator";
import {
  assessNameQuality,
  type NameQualityAssessment,
} from "@/domain/name-quality";
import {
  DEFAULT_RECOMMENDATION_QUOTAS,
  DEFAULT_RECOMMENDATION_TARGET,
  MAX_RECOMMENDATION_TARGET,
  RECOMMENDATION_TARGET_OPTIONS,
  RECOMMENDATION_TIME_BUDGET_OPTIONS,
  buildBalancedRecommendationQuotas,
  buildRecommendationPlan,
  clampRecommendationQuota,
  findAvailableDomainRecommendations,
  isMockAvailabilityResult,
  isRegistrarAvailable,
  prioritizeAvailableDomainResults,
  recommendationPlanSummary,
  sortRecommendationExtensions,
  type RecommendationPlan,
  type RecommendationConstraints,
  type NamingMode,
  type RecommendationTarget,
  type RecommendationTimeBudgetMinutes,
} from "@/domain/recommendation-engine";
import { normalizeExtension, splitNames } from "@/domain/normalize";
import { learnPreferenceProfile } from "@/domain/preference-learning";
import { DEFAULT_EXTENSIONS, getExtensionQuality, isKnownExtension } from "@/domain/tlds";
import type {
  AvailabilityStatus,
  DomainCheckResponse,
  DomainCheckResult,
  GeneratedCandidate,
  GenerateNamesResponse,
  GenerationStyle,
  ProviderMode,
  Recommendation,
} from "@/domain/types";

type PageKey = "search" | "results" | "namelab" | "bulk" | "saved" | "settings";
type ResultFilter = "all" | "available" | "premium" | "manual" | "taken" | "favorites";
type SavedDomain = {
  domain: string;
  result: DomainCheckResult;
  recommendation?: Recommendation;
  note: string;
  registrar: string;
};
type SearchOutcome = {
  name: string;
  exactResults: DomainCheckResult[];
  alternativesReady: boolean;
  recommendationPlan: RecommendationPlan;
  registrarAvailability: boolean;
  relatedCandidateCount: number;
};
type RecommendationSearchPreset = "fast" | "balanced" | "deep" | "custom";

const QUICK_EXTENSIONS = ["ai", "com", "tech", "sg", "com.sg", "io", "co", "app", "dev", "net", "education", "edu"];
const INITIAL_EXTENSIONS = ["ai", "com", "sg", "com.sg", "io", "co", "app", "dev"];
const MODES: { value: ProviderMode; label: string }[] = [
  { value: "live", label: "Live" },
  { value: "hybrid", label: "Hybrid" },
  { value: "mock", label: "Mock" },
];
const RECOMMENDATION_SEARCH_PRESETS: Array<{
  value: Exclude<RecommendationSearchPreset, "custom">;
  label: string;
  timeBudgetMinutes: RecommendationTimeBudgetMinutes;
  namingMode: NamingMode;
  allowSemanticAlternatives: boolean;
  mustIncludeSeed: boolean;
}> = [
  {
    value: "fast",
    label: "Fast",
    timeBudgetMinutes: 2,
    namingMode: "balanced",
    allowSemanticAlternatives: true,
    mustIncludeSeed: false,
  },
  {
    value: "balanced",
    label: "Balanced",
    timeBudgetMinutes: 3,
    namingMode: "balanced",
    allowSemanticAlternatives: true,
    mustIncludeSeed: false,
  },
  {
    value: "deep",
    label: "Deep",
    timeBudgetMinutes: 5,
    namingMode: "brandable",
    allowSemanticAlternatives: true,
    mustIncludeSeed: false,
  },
];
const NAMING_MODE_OPTIONS: Array<{ value: NamingMode; label: string }> = [
  { value: "balanced", label: "Balanced" },
  { value: "brandable", label: "Brandable" },
  { value: "keyword", label: "Keyword" },
];
const NAV_ITEMS: { value: PageKey; label: string; icon: React.ElementType }[] = [
  { value: "search", label: "Search", icon: Search },
  { value: "results", label: "Results", icon: BarChart3 },
  { value: "namelab", label: "NameLab", icon: WandSparkles },
  { value: "bulk", label: "Bulk", icon: Table2 },
  { value: "saved", label: "Saved", icon: Archive },
  { value: "settings", label: "Settings", icon: Settings },
];
const STYLE_PRESETS: { label: string; styles: GenerationStyle[]; seed: string }[] = [
  {
    label: "Trusted Enterprise",
    styles: ["enterprise", "sanskrit_hindi"],
    seed: "trust, governance, intelligence, assurance",
  },
  {
    label: "Agentic Automation",
    styles: ["agentic_automation", "workflow_ops", "ai_native"],
    seed: "agentic AI, automation, workflow, action",
  },
  {
    label: "Sanskrit Wisdom",
    styles: ["sanskrit_hindi", "spiritual", "ai_native"],
    seed: "satya, medha, dharma, flow, intelligence",
  },
  {
    label: "Revenue Growth",
    styles: ["revenue_growth", "data_analytics", "enterprise"],
    seed: "revenue, growth, efficiency, analytics",
  },
  {
    label: "Bizarre Brandable",
    styles: ["bizarre_brandable", "ai_native"],
    seed: "trust, intelligence, automation, signal",
  },
  {
    label: "Data Intelligence",
    styles: ["data_analytics", "ai_native", "enterprise"],
    seed: "data, analytics, evidence, intelligence",
  },
];
const FILTERS: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "premium", label: "Premium" },
  { value: "manual", label: "Needs check" },
  { value: "taken", label: "Taken" },
  { value: "favorites", label: "Saved" },
];
const AVAILABLE_CHECKOUT_CAVEAT =
  "Provider-confirmed at check time. Not reserved. Final availability and price must be confirmed at registrar checkout.";

const STATUS_META: Record<
  AvailabilityStatus,
  { label: string; tone: string; dot: string; matrix: string; tooltip: string }
> = {
  available_confirmed: {
    label: "Available",
    tone: "border-emerald-300/35 bg-emerald-300/12 text-emerald-100",
    dot: "bg-emerald-300",
    matrix: "bg-emerald-400/85",
    tooltip: AVAILABLE_CHECKOUT_CAVEAT,
  },
  premium_available: {
    label: "Premium",
    tone: "border-violet-300/45 bg-violet-300/12 text-amber-100",
    dot: "bg-amber-300",
    matrix: "bg-gradient-to-br from-violet-400/85 to-amber-300/85",
    tooltip: "Provider reports this domain can be purchased as a premium name.",
  },
  taken_confirmed: {
    label: "Taken",
    tone: "border-rose-300/35 bg-rose-300/12 text-rose-100",
    dot: "bg-rose-300",
    matrix: "bg-rose-400/75",
    tooltip: "Provider confirmed that the domain is already registered.",
  },
  restricted: {
    label: "Restricted",
    tone: "border-amber-300/35 bg-amber-300/12 text-amber-100",
    dot: "bg-amber-300",
    matrix: "bg-amber-400/75",
    tooltip: "This extension has eligibility or policy restrictions.",
  },
  unknown: {
    label: "Unknown",
    tone: "border-amber-300/35 bg-amber-300/10 text-amber-100",
    dot: "bg-amber-300",
    matrix: "bg-amber-400/55",
    tooltip: "The provider could not produce a conclusive answer.",
  },
  rate_limited: {
    label: "Rate limited",
    tone: "border-amber-300/35 bg-amber-300/10 text-amber-100",
    dot: "bg-amber-300",
    matrix: "bg-amber-500/65",
    tooltip: "The source rate limited this lookup.",
  },
  invalid: {
    label: "Invalid",
    tone: "border-zinc-400/35 bg-zinc-400/10 text-zinc-200",
    dot: "bg-zinc-300",
    matrix: "bg-zinc-500/60",
    tooltip: "The domain name failed validation.",
  },
  manual_check_required: {
    label: "Needs registrar",
    tone: "border-amber-300/35 bg-amber-300/10 text-amber-100",
    dot: "bg-amber-300",
    matrix: "bg-amber-400/60",
    tooltip: "Open a registrar or registry lookup before making any availability claim.",
  },
};

const MOCK_STATUS_META: typeof STATUS_META = {
  ...STATUS_META,
  available_confirmed: {
    label: "Mock only",
    tone: "border-sky-300/35 bg-sky-300/10 text-sky-100",
    dot: "bg-sky-300",
    matrix: "bg-sky-400/45",
    tooltip:
      "This is simulated mock availability for demos/tests. Use Live mode with registrar verification before registration.",
  },
  premium_available: {
    label: "Mock premium",
    tone: "border-sky-300/35 bg-sky-300/10 text-sky-100",
    dot: "bg-sky-300",
    matrix: "bg-sky-400/45",
    tooltip:
      "This is simulated mock premium data. It is not registrar pricing or purchase availability.",
  },
  taken_confirmed: {
    label: "Mock taken",
    tone: "border-sky-300/35 bg-sky-300/10 text-sky-100",
    dot: "bg-sky-300",
    matrix: "bg-sky-400/45",
    tooltip: "This is simulated mock taken data for demos/tests.",
  },
};

const SOURCE_LABELS: Record<DomainCheckResult["source"], string> = {
  registrar_api: "Registrar API",
  rdap: "RDAP",
  whois: "WHOIS",
  dns: "DNS",
  mock: "Mock",
  manual: "Manual",
};
const QUALITY_FAMILY_LABELS: Record<NameQualityAssessment["family"], string> = {
  curated: "Curated",
  semantic_compound: "Semantic",
  keyword_compound: "Keyword",
  verb_noun: "Verb+noun",
  invented_brandable: "Brandable",
  two_morpheme: "Two-part",
  weak: "Weak",
};
const QUALITY_REASON_LABELS: Record<string, string> = {
  short: "Short",
  semantic_match: "Semantic",
  curated_pattern: "Curated",
  brandable_shape: "Brandable",
  two_morpheme: "Two-part",
};

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function scoreForName(name: string, recommendations: Recommendation[]) {
  return recommendations.find((recommendation) => recommendation.name === name);
}

function qualityChipsForName(seedName: string | undefined, name: string) {
  if (!seedName) {
    return [];
  }

  const quality = assessNameQuality(seedName, name, {
    maxMorphemes: 2,
    allowFillerTerms: false,
  });

  if (!quality.accepted) {
    return [];
  }

  return Array.from(
    new Set([
      QUALITY_FAMILY_LABELS[quality.family],
      ...quality.reasons.map((reason) => QUALITY_REASON_LABELS[reason] ?? reason),
    ]),
  ).slice(0, 4);
}

function resultMatchesFilter(
  result: DomainCheckResult,
  filter: ResultFilter,
  saved: Map<string, SavedDomain>,
) {
  if (filter === "all") return true;
  if (filter === "available") return isRegistrarAvailable(result);
  if (filter === "premium") return result.status === "premium_available";
  if (filter === "taken") return result.status === "taken_confirmed";
  if (filter === "manual") {
    return ["manual_check_required", "restricted", "unknown", "rate_limited"].includes(
      result.status,
    );
  }
  if (filter === "favorites") return saved.has(result.domain);
  return true;
}

function relativeCheckedAt(value?: string) {
  if (!value) return "not checked";

  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(delta / 60_000));

  if (minutes < 1) return "checked just now";
  if (minutes === 1) return "checked 1 minute ago";
  if (minutes < 60) return `checked ${minutes} minutes ago`;

  const hours = Math.round(minutes / 60);
  return hours === 1 ? "checked 1 hour ago" : `checked ${hours} hours ago`;
}

function normalizeNameList(input: string) {
  return splitNames(input)
    .map((item) => item.trim())
    .filter(Boolean);
}

function sourceLabel(source: DomainCheckResult["source"]) {
  return SOURCE_LABELS[source] ?? source;
}

function isMockResult(result: DomainCheckResult) {
  return isMockAvailabilityResult(result);
}

function statusMetaForResult(result: DomainCheckResult) {
  return isMockResult(result) ? MOCK_STATUS_META[result.status] : STATUS_META[result.status];
}

function evidenceLabel(result: DomainCheckResult) {
  if (isMockResult(result)) return "Mock simulation";
  if (result.source === "dns") return "DNS evidence";
  if (result.source === "rdap") return "RDAP registry";
  if (result.source === "registrar_api") return "Registrar API";
  if (result.source === "manual") return "Registrar check";
  return sourceLabel(result.source);
}

function evidenceSummary(result: DomainCheckResult) {
  if (isMockResult(result)) {
    return "Demo data only. Verify in Live mode before acting.";
  }

  if (isRegistrarAvailable(result)) {
    return AVAILABLE_CHECKOUT_CAVEAT;
  }

  if (result.source === "dns") {
    return result.status === "taken_confirmed"
      ? "DNS records exist, so this is treated as taken evidence only."
      : "DNS absence is not used as availability proof.";
  }

  if (result.source === "rdap") {
    return result.status === "available_confirmed"
      ? "Registry RDAP returned not found; registrar confirmation is still recommended."
      : "Registry registration data source.";
  }

  if (result.source === "registrar_api") {
    return "Registrar response; strongest availability source in this app.";
  }

  if (result.source === "manual") {
    return "This extension needs a registrar or registry lookup before you can claim availability. Open the registrar link, or configure a registrar API for automated checks.";
  }

  return result.rawSummary ?? "Provider evidence recorded.";
}

function priceLabel(result: DomainCheckResult) {
  return result.priceRegistration
    ? `${result.currency ?? ""} ${result.priceRegistration}`.trim()
    : "";
}

function signalTone(status: string) {
  if (status === "clear") {
    return "border-emerald-200/20 bg-emerald-200/8 text-emerald-100";
  }

  if (status === "conflict") {
    return "border-rose-200/25 bg-rose-200/10 text-rose-100";
  }

  if (status === "manual_check") {
    return "border-amber-200/20 bg-amber-200/8 text-amber-100";
  }

  return "border-white/10 bg-white/[0.045] text-zinc-300";
}

function GlassCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.section
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className={cn(
        "rounded-2xl border border-white/[0.09] bg-white/[0.055] shadow-[0_24px_80px_rgba(0,0,0,0.36)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </motion.section>
  );
}

function IconButton({
  label,
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-45",
        active
          ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100"
          : "border-white/10 bg-white/[0.045] text-zinc-200 hover:border-cyan-300/45 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-200 to-emerald-200 px-5 text-sm font-bold text-slate-950 shadow-[0_18px_52px_rgba(45,212,191,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-4 text-sm font-semibold text-zinc-100 transition hover:border-cyan-300/45 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function DomainIntelligenceStudio() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [activePage, setActivePage] = useState<PageKey>("search");
  const [query, setQuery] = useState("aptava");
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkNames, setBulkNames] = useState("");
  const [seed, setSeed] = useState(
    "trust, action, data, agentic AI, automation, revenue, efficiency",
  );
  const [selectedStyles, setSelectedStyles] = useState(
    () => new Set<GenerationStyle>(["sanskrit_hindi", "enterprise", "ai_native"]),
  );
  const [candidateCount, setCandidateCount] = useState(80);
  const [minLength, setMinLength] = useState(5);
  const [maxLength, setMaxLength] = useState(12);
  const [allowedLetters, setAllowedLetters] = useState("");
  const [avoidLetters, setAvoidLetters] = useState("");
  const [mustInclude, setMustInclude] = useState("");
  const [mustAvoid, setMustAvoid] = useState("");
  const [mode, setMode] = useState<ProviderMode>("live");
  const [selectedExtensions, setSelectedExtensions] = useState(
    () => new Set<string>(INITIAL_EXTENSIONS),
  );
  const [recommendationQuotas, setRecommendationQuotas] = useState<Record<string, number>>(
    () => ({ ...DEFAULT_RECOMMENDATION_QUOTAS }),
  );
  const [recommendationSearchPreset, setRecommendationSearchPreset] =
    useState<RecommendationSearchPreset>("balanced");
  const [recommendationNamingMode, setRecommendationNamingMode] =
    useState<NamingMode>("balanced");
  const [allowSemanticAlternatives, setAllowSemanticAlternatives] = useState(true);
  const [relatedMustIncludeSeed, setRelatedMustIncludeSeed] = useState(false);
  const [recommendationTimeBudgetMinutes, setRecommendationTimeBudgetMinutes] =
    useState<RecommendationTimeBudgetMinutes>(3);
  const [customExtension, setCustomExtension] = useState("");
  const [results, setResults] = useState<DomainCheckResult[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [generated, setGenerated] = useState<GeneratedCandidate[]>([]);
  const [saved, setSaved] = useState<Map<string, SavedDomain>>(() => new Map());
  const [searchOutcome, setSearchOutcome] = useState<SearchOutcome | null>(null);
  const [filter, setFilter] = useState<ResultFilter>("available");
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cacheTtl, setCacheTtl] = useState(300);
  const [rateLimit, setRateLimit] = useState(8);
  const bulkFileRef = useRef<HTMLInputElement | null>(null);
  const searchRunRef = useRef(0);
  const progressResetRef = useRef<number | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    return () => {
      if (progressResetRef.current !== null) {
        window.clearTimeout(progressResetRef.current);
      }
    };
  }, []);

  const extensions = useMemo(
    () => Array.from(selectedExtensions).sort((a, b) => a.localeCompare(b)),
    [selectedExtensions],
  );
  const recommendationPlan = useMemo(
    () => buildRecommendationPlan(extensions, recommendationQuotas),
    [extensions, recommendationQuotas],
  );
  const recommendationConstraints = useMemo<RecommendationConstraints>(
    () => ({
      maxWords: 2,
      allowSemanticAlternatives,
      mustIncludeSeed: relatedMustIncludeSeed,
    }),
    [allowSemanticAlternatives, relatedMustIncludeSeed],
  );
  const activeRecommendationPlan = searchOutcome?.recommendationPlan ?? recommendationPlan;
  const generationStyles = useMemo(
    () => Array.from(selectedStyles),
    [selectedStyles],
  );
  const savedByDomain = saved;
  const filteredResults = useMemo(
    () => results.filter((result) => resultMatchesFilter(result, filter, savedByDomain)),
    [filter, results, savedByDomain],
  );
  const confirmedAvailableResults = useMemo(
    () => results.filter(isRegistrarAvailable),
    [results],
  );
  const groupedByName = useMemo(() => {
    const groups = new Map<string, DomainCheckResult[]>();

    for (const result of results) {
      groups.set(result.name, [...(groups.get(result.name) ?? []), result]);
    }

    return groups;
  }, [results]);
  const availableRecommendations = useMemo(
    () =>
      recommendations.filter((recommendation) =>
        (groupedByName.get(recommendation.name) ?? []).some(isRegistrarAvailable),
      ),
    [groupedByName, recommendations],
  );
  const availableDomainRecommendations = useMemo(
    () =>
      prioritizeAvailableDomainResults(
        confirmedAvailableResults,
        recommendations,
        activeRecommendationPlan,
        searchOutcome?.name,
      ),
    [activeRecommendationPlan, confirmedAvailableResults, recommendations, searchOutcome?.name],
  );
  const exactResultDomains = useMemo(
    () => new Set(searchOutcome?.exactResults.map((result) => result.domain) ?? []),
    [searchOutcome?.exactResults],
  );
  const relatedCandidateRecommendations = useMemo(
    () =>
      searchOutcome
        ? results.filter(
            (result) =>
              !exactResultDomains.has(result.domain) &&
              !isRegistrarAvailable(result) &&
              ["manual_check_required", "unknown", "rate_limited"].includes(result.status),
          )
        : [],
    [exactResultDomains, results, searchOutcome],
  );
  const topRecommendation = availableDomainRecommendations.length
    ? scoreForName(availableDomainRecommendations[0].name, recommendations)
    : relatedCandidateRecommendations.length
      ? scoreForName(relatedCandidateRecommendations[0].name, recommendations)
    : recommendations[0];
  const isRelatedAvailabilityMode = filter === "available" && Boolean(searchOutcome);
  const isRelatedReviewMode =
    filter === "manual" &&
    Boolean(searchOutcome) &&
    availableDomainRecommendations.length === 0 &&
    relatedCandidateRecommendations.length > 0;
  const isFindingAvailableAlternatives =
    Boolean(searchOutcome && !searchOutcome.alternativesReady) &&
    (isRelatedAvailabilityMode || isRelatedReviewMode);
  const domainResultsTotalCount =
    isRelatedAvailabilityMode
      ? activeRecommendationPlan.target
      : isRelatedReviewMode
        ? relatedCandidateRecommendations.length
      : results.length;
  const visibleResults = useMemo(
    () =>
      isRelatedAvailabilityMode
        ? availableDomainRecommendations
        : isRelatedReviewMode
          ? relatedCandidateRecommendations
          : filteredResults,
    [
      availableDomainRecommendations,
      filteredResults,
      isRelatedAvailabilityMode,
      isRelatedReviewMode,
      relatedCandidateRecommendations,
    ],
  );
  const transformed = useMemo(() => transformName(query), [query]);
  const exportRows = useMemo(
    () => buildExportRows(visibleResults, recommendations),
    [recommendations, visibleResults],
  );
  const availableExportRows = useMemo(
    () => buildExportRows(confirmedAvailableResults, recommendations),
    [confirmedAvailableResults, recommendations],
  );
  const allowCustomExtensions = useMemo(
    () => extensions.some((extension) => !isKnownExtension(extension)),
    [extensions],
  );

  function toggleExtension(extension: string) {
    setSelectedExtensions((current) => {
      const next = new Set(current);

      if (next.has(extension)) {
        next.delete(extension);
      } else {
        next.add(extension);
      }

      return next;
    });
  }

  function addCustomExtension() {
    const normalized = normalizeExtension(customExtension);

    if (!normalized) return;

    setSelectedExtensions((current) => new Set([...current, normalized]));
    setCustomExtension("");
  }

  function setRecommendationQuota(extension: string, value: number) {
    setRecommendationQuotas((current) => ({
      ...current,
      [extension]: clampRecommendationQuota(value),
    }));
  }

  function applyRecommendationPreset(target: RecommendationTarget) {
    setRecommendationQuotas(buildBalancedRecommendationQuotas(extensions, target));
  }

  function applyRecommendationSearchPreset(
    preset: Exclude<RecommendationSearchPreset, "custom">,
  ) {
    const config = RECOMMENDATION_SEARCH_PRESETS.find((item) => item.value === preset);

    if (!config) return;

    setRecommendationSearchPreset(config.value);
    setRecommendationTimeBudgetMinutes(config.timeBudgetMinutes);
    setRecommendationNamingMode(config.namingMode);
    setAllowSemanticAlternatives(config.allowSemanticAlternatives);
    setRelatedMustIncludeSeed(config.mustIncludeSeed);
  }

  function updateRecommendationTimeBudget(value: RecommendationTimeBudgetMinutes) {
    setRecommendationSearchPreset("custom");
    setRecommendationTimeBudgetMinutes(value);
  }

  function updateRecommendationNamingMode(value: NamingMode) {
    setRecommendationSearchPreset("custom");
    setRecommendationNamingMode(value);
  }

  function updateAllowSemanticAlternatives(value: boolean) {
    setRecommendationSearchPreset("custom");
    setAllowSemanticAlternatives(value);
  }

  function updateRelatedMustIncludeSeed(value: boolean) {
    setRecommendationSearchPreset("custom");
    setRelatedMustIncludeSeed(value);
  }

  function toggleGenerationStyle(style: GenerationStyle) {
    setSelectedStyles((current) => {
      const next = new Set(current);

      if (next.has(style)) {
        next.delete(style);
      } else {
        next.add(style);
      }

      return next.size ? next : new Set([style]);
    });
  }

  function applyPreset(preset: (typeof STYLE_PRESETS)[number]) {
    setSelectedStyles(new Set(preset.styles));
    setSeed(preset.seed);
  }

  function clearProgressReset() {
    if (progressResetRef.current !== null) {
      window.clearTimeout(progressResetRef.current);
      progressResetRef.current = null;
    }
  }

  function scheduleProgressReset() {
    clearProgressReset();
    progressResetRef.current = window.setTimeout(() => {
      setProgress(0);
      setStatusText("");
      progressResetRef.current = null;
    }, 900);
  }

  async function checkNames(names: string[], nextPage: PageKey = "results") {
    const runId = searchRunRef.current + 1;
    const normalizedNames = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
    const searchRecommendationPlan = recommendationPlan;
    const searchTimeBudgetMs = recommendationTimeBudgetMinutes * 60_000;
    const searchNamingMode = recommendationNamingMode;
    const searchConstraints = recommendationConstraints;

    if (normalizedNames.length === 0 || extensions.length === 0) {
      setError("Add at least one valid name and extension.");
      return;
    }

    searchRunRef.current = runId;
    clearProgressReset();
    setError(null);
    setSearchOutcome(null);
    setIsChecking(true);
    setProgress(12);
    setStatusText("Checking domain stack");

    try {
      const response = await fetch("/api/domain/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          names: normalizedNames,
          extensions,
          mode,
          includeSuggestions: true,
          includeExternalIntelligence: mode === "live" && normalizedNames.length <= 3,
          allowCustomExtensions,
        }),
      });
      const payload = (await response.json()) as DomainCheckResponse & { error?: string };

      if (searchRunRef.current !== runId) {
        return;
      }

      setProgress(78);

      if (!response.ok) {
        throw new Error(payload.error ?? "Domain check failed.");
      }

      const nextRecommendations = payload.recommendations.slice(
        0,
        Math.max(40, searchRecommendationPlan.target * 2),
      );
      const availableResultCount = payload.results.filter(isRegistrarAvailable).length;
      const canConfirmRegistrarAvailability =
        payload.capabilities?.registrarAvailability ?? true;
      const shouldTrackSearchOutcome =
        nextPage === "results" && mode !== "mock" && normalizedNames.length === 1;
      const shouldFindAvailableAlternatives =
        shouldTrackSearchOutcome &&
        availableResultCount < searchRecommendationPlan.target;

      setResults(payload.results);
      setRecommendations(nextRecommendations);
      setSearchOutcome(
        shouldTrackSearchOutcome
          ? {
              name: normalizedNames[0],
              exactResults: payload.results,
              alternativesReady: !shouldFindAvailableAlternatives,
              recommendationPlan: searchRecommendationPlan,
              registrarAvailability: canConfirmRegistrarAvailability,
              relatedCandidateCount: 0,
            }
          : null,
      );
      setFilter(!canConfirmRegistrarAvailability && availableResultCount === 0 ? "manual" : "available");
      setActivePage(nextPage);
      setProgress(100);
      setStatusText("Results ready");
      setIsChecking(false);

      if (
        shouldFindAvailableAlternatives
      ) {
        void appendAvailableAlternatives(
          runId,
          normalizedNames,
          payload.results,
          nextRecommendations,
          searchRecommendationPlan,
          searchTimeBudgetMs,
          searchNamingMode,
          searchConstraints,
        );
      } else {
        scheduleProgressReset();
      }
    } catch (checkError) {
      if (searchRunRef.current !== runId) {
        return;
      }

      setError(checkError instanceof Error ? checkError.message : "Domain check failed.");
      setProgress(0);
      setStatusText("");
      setIsChecking(false);
    }
  }

  async function appendAvailableAlternatives(
    runId: number,
    normalizedNames: string[],
    baseResults: DomainCheckResult[],
    baseRecommendations: Recommendation[],
    searchRecommendationPlan: RecommendationPlan,
    searchTimeBudgetMs: number,
    searchNamingMode: NamingMode,
    searchConstraints: RecommendationConstraints,
  ) {
    if (searchRunRef.current !== runId) {
      return;
    }

    setProgress(86);
    setStatusText("Finding available alternatives");

    try {
      const alternatives = await findAvailableAlternatives(
        runId,
        normalizedNames,
        baseResults,
        baseRecommendations,
        searchRecommendationPlan,
        searchTimeBudgetMs,
        searchNamingMode,
        searchConstraints,
      );

      if (searchRunRef.current !== runId) {
        return;
      }

      const fallbackCandidates =
        alternatives.results.length === 0 ? alternatives.checkedResults : [];
      const nextAlternativeResults =
        alternatives.results.length > 0 ? alternatives.results : fallbackCandidates;

      if (nextAlternativeResults.length > 0) {
        setResults((current) => {
          const existingDomains = new Set(current.map((result) => result.domain));

          return [
            ...current,
            ...nextAlternativeResults.filter((result) => !existingDomains.has(result.domain)),
          ];
        });
        setRecommendations((current) => {
          const existingNames = new Set(current.map((item) => item.name));

          return [
            ...current,
            ...alternatives.recommendations.filter((item) => !existingNames.has(item.name)),
          ].slice(0, Math.max(40, searchRecommendationPlan.target * 2));
        });
        setFilter(alternatives.results.length > 0 ? "available" : "manual");
        if (alternatives.results.length > 0) {
          void enrichLiveIntelligence(
            runId,
            alternatives.results.slice(0, searchRecommendationPlan.target),
            alternatives.recommendations,
            searchRecommendationPlan.target,
          );
        }
        setSearchOutcome((current) =>
          current?.name === normalizedNames[0]
            ? {
                ...current,
                alternativesReady: true,
                relatedCandidateCount: fallbackCandidates.length,
              }
            : current,
        );
        setStatusText(
          alternatives.results.length > 0
            ? "Available recommendations updated"
            : "Related candidates ready",
        );
      } else {
        if (baseResults.filter(isRegistrarAvailable).length === 0) {
          setFilter("manual");
        }
        setSearchOutcome((current) =>
          current?.name === normalizedNames[0]
            ? { ...current, alternativesReady: true }
            : current,
        );
        setStatusText("Results ready");
      }

      setProgress(100);
    } catch {
      if (searchRunRef.current !== runId) {
        return;
      }

      setProgress(100);
      setStatusText("Results ready");
    } finally {
      if (searchRunRef.current === runId) {
        scheduleProgressReset();
      }
    }
  }

  async function findAvailableAlternatives(
    runId: number,
    seedNames: string[],
    existingResults: DomainCheckResult[],
    existingRecommendations: Recommendation[],
    searchRecommendationPlan: RecommendationPlan,
    searchTimeBudgetMs: number,
    searchNamingMode: NamingMode,
    searchConstraints: RecommendationConstraints,
  ) {
    if (
      seedNames.length !== 1 ||
      existingResults.filter(isRegistrarAvailable).length >= searchRecommendationPlan.target ||
      extensions.length === 0
    ) {
      return { results: [], checkedResults: [], recommendations: [] };
    }

    return findAvailableDomainRecommendations({
      seedName: seedNames[0],
      selectedExtensions: extensions,
      recommendationPlan: searchRecommendationPlan,
      timeBudgetMs: searchTimeBudgetMs,
      existingResults,
      existingRecommendations,
      checkAvailability: checkAlternativeBatch,
      namingMode: searchNamingMode,
      constraints: searchConstraints,
      preferenceProfile: learnPreferenceProfile(
        Array.from(saved.values()).map((item) => ({
          name: item.domain,
          action: "saved",
          weight: 2,
        })),
      ),
      shouldContinue: () => searchRunRef.current === runId,
    });
  }

  async function checkAlternativeBatch(names: string[], extensionsToCheck: string[]) {
    const response = await fetch("/api/domain/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        names,
        extensions: extensionsToCheck,
        mode,
        includeSuggestions: true,
        includeExternalIntelligence: false,
        allowCustomExtensions,
      }),
    });
    const payload = (await response.json()) as DomainCheckResponse & { error?: string };

    if (!response.ok) {
      throw new Error(payload.error ?? "Available alternative check failed.");
    }

    return payload;
  }

  async function enrichLiveIntelligence(
    runId: number,
    targetResults: DomainCheckResult[],
    targetRecommendations: Recommendation[],
    maxDistinctNames: number,
  ) {
    if (mode === "mock" || targetResults.length === 0) {
      return;
    }

    try {
      const response = await fetch("/api/domain/intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          results: targetResults,
          recommendations: targetRecommendations,
          maxDistinctNames,
        }),
      });
      const payload = (await response.json()) as {
        results?: DomainCheckResult[];
        error?: string;
      };

      if (!response.ok || !payload.results || searchRunRef.current !== runId) {
        return;
      }

      const byDomain = new Map(payload.results.map((result) => [result.domain, result]));
      setResults((current) =>
        current.map((result) => byDomain.get(result.domain) ?? result),
      );
      setStatusText("Brand intelligence updated");
    } catch {
      // External intelligence is additive; availability results should remain usable.
    }
  }

  async function generateAndCheck() {
    const runId = searchRunRef.current + 1;

    if (extensions.length === 0) {
      setError("Add at least one extension before generating.");
      return;
    }

    searchRunRef.current = runId;
    clearProgressReset();
    setError(null);
    setSearchOutcome(null);
    setIsChecking(true);
    setProgress(10);
    setStatusText("Generating names");

    try {
      const response = await fetch("/api/domain/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seed,
          limit: candidateCount,
          styles: generationStyles,
          minLength,
          maxLength,
          allowedLetters,
          avoidLetters,
          mustInclude,
          mustAvoid,
          extensions,
          mode,
          allowCustomExtensions,
        }),
      });
      const payload = (await response.json()) as GenerateNamesResponse & { error?: string };

      if (searchRunRef.current !== runId) {
        return;
      }

      setProgress(76);

      if (!response.ok) {
        throw new Error(payload.error ?? "Generation failed.");
      }

      setGenerated(payload.candidates);
      setResults(payload.results);
      setRecommendations(payload.recommendations);
      setFilter("available");
      setActivePage("results");
      setProgress(100);
      setStatusText("Generated and checked");
      setIsChecking(false);
      scheduleProgressReset();
    } catch (generationError) {
      if (searchRunRef.current !== runId) {
        return;
      }

      setError(generationError instanceof Error ? generationError.message : "Generation failed.");
      setProgress(0);
      setStatusText("");
      setIsChecking(false);
    }
  }

  function saveResult(result: DomainCheckResult) {
    setSaved((current) => {
      const next = new Map(current);

      if (next.has(result.domain)) {
        next.delete(result.domain);
      } else {
        next.set(result.domain, {
          domain: result.domain,
          result,
          recommendation: scoreForName(result.name, recommendations),
          note: "",
          registrar: result.registrarUrl?.includes("namecheap") ? "Namecheap" : "Preferred",
        });
      }

      return next;
    });
  }

  function updateSaved(domain: string, update: Partial<Pick<SavedDomain, "note" | "registrar">>) {
    setSaved((current) => {
      const next = new Map(current);
      const item = next.get(domain);

      if (item) {
        next.set(domain, { ...item, ...update });
      }

      return next;
    });
  }

  function exportCsv(rows = exportRows, filename = "domain-intelligence.csv") {
    downloadBlob(new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }), filename);
  }

  function exportJson() {
    downloadBlob(
      new Blob([JSON.stringify({ results: visibleResults, recommendations }, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
      "domain-intelligence.json",
    );
  }

  function exportXlsx(rows = exportRows, filename = "domain-intelligence.xlsx") {
    const buffer = toXlsxBuffer(rows);
    downloadBlob(
      new Blob([buffer as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      filename,
    );
  }

  function exportSaved() {
    const rows = buildExportRows(
      Array.from(saved.values()).map((item) => item.result),
      recommendations,
    );
    exportCsv(rows, "founder-shortlist.csv");
  }

  async function handleBulkFile(file?: File) {
    if (!file) return;

    const text = await file.text();
    setBulkNames(text);
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[var(--app-bg)] text-[var(--app-fg)]">
      <div className="pointer-events-none fixed inset-0 bg-[linear-gradient(120deg,rgba(45,212,191,0.09),transparent_24%,rgba(168,85,247,0.08)_55%,transparent_78%)]" />
      <div className="relative mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-4 py-4 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-30 rounded-2xl border border-white/[0.09] bg-black/45 px-3 py-3 shadow-[0_22px_80px_rgba(0,0,0,0.32)] backdrop-blur-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-cyan-200/20 bg-cyan-200/10 text-cyan-100">
                <Layers3 className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold tracking-normal sm:text-xl">
                  Domain Intelligence Studio
                </h1>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-zinc-400">
                  <ShieldCheck className="h-3.5 w-3.5 text-cyan-200" />
                  AI-native naming, availability, and founder-ready shortlists
                </div>
              </div>
            </div>

            <nav className="studio-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.035] p-1">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;

                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setActivePage(item.value)}
                    className={cn(
                      "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition",
                      activePage === item.value
                        ? "bg-white text-slate-950"
                        : "text-zinc-300 hover:bg-white/[0.07] hover:text-white",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-1 rounded-2xl border border-white/10 bg-white/[0.035] p-1 md:flex">
                {MODES.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setMode(item.value)}
                    title={`${item.label} availability mode`}
                    className={cn(
                      "h-9 rounded-xl px-3 text-xs font-bold transition",
                      mode === item.value
                        ? "bg-cyan-200 text-slate-950"
                        : "text-zinc-400 hover:text-white",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <IconButton
                label={theme === "dark" ? "Light theme" : "Dark theme"}
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </IconButton>
            </div>
          </div>

          <AnimatePresence>
            {(progress > 0 || error) && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="mt-3"
              >
                {error ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
                    <span>{error}</span>
                    <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-200 via-emerald-200 to-amber-200"
                        animate={{ width: `${progress}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-zinc-400">{statusText}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <ModeSafetyNotice mode={mode} hasMockResults={results.some(isMockResult)} />
        </header>

        <AnimatePresence mode="wait">
          {activePage === "search" && (
            <motion.div
              key="search"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]"
            >
              <HomeSearch
                query={query}
                setQuery={setQuery}
                bulkMode={bulkMode}
                setBulkMode={setBulkMode}
                bulkNames={bulkNames}
                setBulkNames={setBulkNames}
                selectedExtensions={selectedExtensions}
                toggleExtension={toggleExtension}
                recommendationPlan={recommendationPlan}
                recommendationQuotas={recommendationQuotas}
                setRecommendationQuota={setRecommendationQuota}
                applyRecommendationPreset={applyRecommendationPreset}
                recommendationSearchPreset={recommendationSearchPreset}
                applyRecommendationSearchPreset={applyRecommendationSearchPreset}
                recommendationNamingMode={recommendationNamingMode}
                setRecommendationNamingMode={updateRecommendationNamingMode}
                allowSemanticAlternatives={allowSemanticAlternatives}
                setAllowSemanticAlternatives={updateAllowSemanticAlternatives}
                relatedMustIncludeSeed={relatedMustIncludeSeed}
                setRelatedMustIncludeSeed={updateRelatedMustIncludeSeed}
                recommendationTimeBudgetMinutes={recommendationTimeBudgetMinutes}
                setRecommendationTimeBudgetMinutes={updateRecommendationTimeBudget}
                selectedStyles={selectedStyles}
                toggleGenerationStyle={toggleGenerationStyle}
                isChecking={isChecking}
                onSearch={() =>
                  checkNames(bulkMode ? normalizeNameList(bulkNames || query) : normalizeNameList(query))
                }
              />
              <ProviderStatusPanel mode={mode} results={results} />
            </motion.div>
          )}

          {activePage === "results" && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]"
            >
              <section className="flex min-w-0 flex-col gap-5">
                <SearchOutcomeNotice
                  outcome={searchOutcome}
                  relatedAvailableCount={availableDomainRecommendations.length}
                  relatedCandidateCount={relatedCandidateRecommendations.length}
                  onShowExact={() => setFilter("all")}
                />
                <DashboardToolbar
                  filter={filter}
                  setFilter={setFilter}
                  availableCount={
                    isRelatedAvailabilityMode
                      ? availableDomainRecommendations.length
                      : confirmedAvailableResults.length
                  }
                  totalCount={domainResultsTotalCount}
                  isRelatedAvailabilityMode={isRelatedAvailabilityMode}
                  isRelatedReviewMode={isRelatedReviewMode}
                  isFindingAlternatives={isFindingAvailableAlternatives}
                  recommendationTarget={activeRecommendationPlan.target}
                  exportMenu={
                    <ExportMenu
                      onCsv={() => exportCsv()}
                      onJson={exportJson}
                      onXlsx={() => exportXlsx()}
                      onAvailableCsv={() => exportCsv(availableExportRows, "available-domains.csv")}
                      availableCount={confirmedAvailableResults.length}
                    />
                  }
                />
                <DomainResultsPanel
                  results={visibleResults}
                  totalCount={domainResultsTotalCount}
                  filter={filter}
                  saved={saved}
                  onSave={saveResult}
                  onShowAll={() => setFilter("all")}
                  isRelatedAvailabilityMode={isRelatedAvailabilityMode}
                  isRelatedReviewMode={isRelatedReviewMode}
                  isFindingAlternatives={isFindingAvailableAlternatives}
                  recommendationTarget={activeRecommendationPlan.target}
                  qualitySeedName={searchOutcome?.name}
                />
              </section>

              <aside className="flex min-w-0 flex-col gap-5">
                <BrandScoreGauge recommendation={topRecommendation} results={results} />
                <RecommendationPanel
                  availableDomains={
                    availableDomainRecommendations.length
                      ? availableDomainRecommendations
                      : relatedCandidateRecommendations
                  }
                  recommendations={recommendations}
                  isCandidateFallbackMode={
                    availableDomainRecommendations.length === 0 &&
                    relatedCandidateRecommendations.length > 0
                  }
                  isFindingAlternatives={isFindingAvailableAlternatives}
                  recommendationTarget={activeRecommendationPlan.target}
                  qualitySeedName={searchOutcome?.name}
                  onCheck={(names) => checkNames(names)}
                />
                <ExtensionMatrix groups={groupedByName} extensions={extensions} />
                <DomainStackCards groups={groupedByName} recommendations={availableRecommendations} />
              </aside>
            </motion.div>
          )}

          {activePage === "namelab" && (
            <motion.div
              key="namelab"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]"
            >
              <NameGeneratorPanel
                seed={seed}
                setSeed={setSeed}
                selectedStyles={selectedStyles}
                toggleGenerationStyle={toggleGenerationStyle}
                applyPreset={applyPreset}
                candidateCount={candidateCount}
                setCandidateCount={setCandidateCount}
                minLength={minLength}
                setMinLength={setMinLength}
                maxLength={maxLength}
                setMaxLength={setMaxLength}
                allowedLetters={allowedLetters}
                setAllowedLetters={setAllowedLetters}
                avoidLetters={avoidLetters}
                setAvoidLetters={setAvoidLetters}
                mustInclude={mustInclude}
                setMustInclude={setMustInclude}
                mustAvoid={mustAvoid}
                setMustAvoid={setMustAvoid}
                isChecking={isChecking}
                onGenerate={generateAndCheck}
              />
              <GlassCard className="p-5">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
                      Candidate Feed
                    </p>
                    <h2 className="mt-1 text-xl font-semibold">NameLab output</h2>
                  </div>
                  <IconButton
                    label="Check visible candidates"
                    onClick={() =>
                      checkNames(
                        (generated.length ? generated : transformed)
                          .slice(0, 20)
                          .map((candidate) => candidate.name),
                      )
                    }
                  >
                    <RefreshCw className="h-4 w-4" />
                  </IconButton>
                </div>
                <CandidateFeed
                  generated={generated}
                  transformed={transformed}
                  onCheck={(name) => checkNames([name])}
                />
              </GlassCard>
            </motion.div>
          )}

          {activePage === "bulk" && (
            <motion.div
              key="bulk"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="flex flex-col gap-5"
            >
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                <BulkChecker
                  bulkNames={bulkNames}
                  setBulkNames={setBulkNames}
                  fileRef={bulkFileRef}
                  onFile={handleBulkFile}
                  selectedExtensions={selectedExtensions}
                  toggleExtension={toggleExtension}
                  progress={progress}
                  isChecking={isChecking}
                  onRun={() => checkNames(normalizeNameList(bulkNames), "bulk")}
                  onExportAvailable={() => exportCsv(availableExportRows, "available-only.csv")}
                />
                <GlassCard className="p-5">
                  <h2 className="text-xl font-semibold">Bulk results</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    {results.length
                      ? `${results.length} checks loaded. ${confirmedAvailableResults.length} confirmed available.`
                      : "Paste or upload names to populate the checker."}
                  </p>
                  <div className="mt-5">
                    <BulkProgress progress={progress} total={results.length} available={confirmedAvailableResults.length} />
                  </div>
                </GlassCard>
              </div>
              <DomainResultsPanel
                results={visibleResults}
                totalCount={results.length}
                filter={filter}
                saved={saved}
                onSave={saveResult}
                onShowAll={() => setFilter("all")}
              />
            </motion.div>
          )}

          {activePage === "saved" && (
            <motion.div
              key="saved"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <SavedProjects
                saved={saved}
                updateSaved={updateSaved}
                remove={(domain) =>
                  setSaved((current) => {
                    const next = new Map(current);
                    next.delete(domain);
                    return next;
                  })
                }
                exportSaved={exportSaved}
              />
            </motion.div>
          )}

          {activePage === "settings" && (
            <motion.div
              key="settings"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
            >
              <SettingsPage
                mode={mode}
                setMode={setMode}
                cacheTtl={cacheTtl}
                setCacheTtl={setCacheTtl}
                rateLimit={rateLimit}
                setRateLimit={setRateLimit}
                selectedExtensions={selectedExtensions}
                toggleExtension={toggleExtension}
                customExtension={customExtension}
                setCustomExtension={setCustomExtension}
                addCustomExtension={addCustomExtension}
                theme={theme}
                setTheme={setTheme}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}

function HomeSearch({
  query,
  setQuery,
  bulkMode,
  setBulkMode,
  bulkNames,
  setBulkNames,
  selectedExtensions,
  toggleExtension,
  recommendationPlan,
  recommendationQuotas,
  setRecommendationQuota,
  applyRecommendationPreset,
  recommendationSearchPreset,
  applyRecommendationSearchPreset,
  recommendationNamingMode,
  setRecommendationNamingMode,
  allowSemanticAlternatives,
  setAllowSemanticAlternatives,
  relatedMustIncludeSeed,
  setRelatedMustIncludeSeed,
  recommendationTimeBudgetMinutes,
  setRecommendationTimeBudgetMinutes,
  selectedStyles,
  toggleGenerationStyle,
  isChecking,
  onSearch,
}: {
  query: string;
  setQuery: (value: string) => void;
  bulkMode: boolean;
  setBulkMode: (value: boolean) => void;
  bulkNames: string;
  setBulkNames: (value: string) => void;
  selectedExtensions: Set<string>;
  toggleExtension: (extension: string) => void;
  recommendationPlan: RecommendationPlan;
  recommendationQuotas: Record<string, number>;
  setRecommendationQuota: (extension: string, value: number) => void;
  applyRecommendationPreset: (target: RecommendationTarget) => void;
  recommendationSearchPreset: RecommendationSearchPreset;
  applyRecommendationSearchPreset: (preset: Exclude<RecommendationSearchPreset, "custom">) => void;
  recommendationNamingMode: NamingMode;
  setRecommendationNamingMode: (value: NamingMode) => void;
  allowSemanticAlternatives: boolean;
  setAllowSemanticAlternatives: (value: boolean) => void;
  relatedMustIncludeSeed: boolean;
  setRelatedMustIncludeSeed: (value: boolean) => void;
  recommendationTimeBudgetMinutes: RecommendationTimeBudgetMinutes;
  setRecommendationTimeBudgetMinutes: (value: RecommendationTimeBudgetMinutes) => void;
  selectedStyles: Set<GenerationStyle>;
  toggleGenerationStyle: (style: GenerationStyle) => void;
  isChecking: boolean;
  onSearch: () => void;
}) {
  return (
    <GlassCard className="p-5 sm:p-7 lg:p-8">
      <div className="max-w-4xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-200/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">
          <Sparkles className="h-3.5 w-3.5" />
          AI-native domain intelligence
        </div>
        <h2 className="mt-5 max-w-4xl text-3xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Find the perfect AI-native domain before someone else does.
        </h2>
      </div>

      <div className="mt-6 rounded-2xl border border-white/10 bg-black/35 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
        <div className="flex flex-col gap-3 lg:flex-row">
          {bulkMode ? (
            <textarea
              value={bulkNames}
              onChange={(event) => setBulkNames(event.target.value)}
              className="min-h-28 flex-1 resize-y rounded-2xl border border-white/10 bg-white/[0.045] px-5 py-4 text-lg font-medium text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-200/45"
              placeholder="Paste names, one per line"
            />
          ) : (
            <div className="flex min-h-20 flex-1 items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.045] px-5 focus-within:border-cyan-200/45">
              <Search className="h-6 w-6 text-cyan-100" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSearch();
                }}
                className="min-w-0 flex-1 bg-transparent text-2xl font-semibold text-white outline-none placeholder:text-zinc-500 sm:text-3xl"
                placeholder="aptava"
              />
            </div>
          )}
          <PrimaryButton onClick={onSearch} disabled={isChecking} className="lg:min-w-44">
            <Search className="h-5 w-5" />
            Search
          </PrimaryButton>
        </div>
      </div>

      <p className="mt-5 max-w-2xl text-sm leading-7 text-zinc-400 sm:text-lg">
        Generate, score, check, compare, and export high-conviction domains across AI, enterprise, Singapore, and global naming strategies.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {QUICK_EXTENSIONS.map((extension) => (
          <button
            key={extension}
            type="button"
            onClick={() => toggleExtension(extension)}
            title={`Toggle .${extension}`}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition",
              selectedExtensions.has(extension)
                ? "border-cyan-200/45 bg-cyan-200/13 text-cyan-100"
                : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white",
            )}
          >
            {selectedExtensions.has(extension) && <Check className="h-3.5 w-3.5" />}
            .{extension}
          </button>
        ))}
      </div>

      <RecommendationPlanner
        selectedExtensions={selectedExtensions}
        recommendationPlan={recommendationPlan}
        recommendationQuotas={recommendationQuotas}
        setRecommendationQuota={setRecommendationQuota}
        applyRecommendationPreset={applyRecommendationPreset}
        recommendationSearchPreset={recommendationSearchPreset}
        applyRecommendationSearchPreset={applyRecommendationSearchPreset}
        recommendationNamingMode={recommendationNamingMode}
        setRecommendationNamingMode={setRecommendationNamingMode}
        allowSemanticAlternatives={allowSemanticAlternatives}
        setAllowSemanticAlternatives={setAllowSemanticAlternatives}
        relatedMustIncludeSeed={relatedMustIncludeSeed}
        setRelatedMustIncludeSeed={setRelatedMustIncludeSeed}
        recommendationTimeBudgetMinutes={recommendationTimeBudgetMinutes}
        setRecommendationTimeBudgetMinutes={setRecommendationTimeBudgetMinutes}
      />

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_auto]">
        <StyleSelector
          selectedStyles={selectedStyles}
          toggleGenerationStyle={toggleGenerationStyle}
        />
        <button
          type="button"
          role="switch"
          aria-checked={bulkMode}
          onClick={() => setBulkMode(!bulkMode)}
          className={cn(
            "inline-flex h-12 items-center justify-center gap-3 rounded-xl border px-4 text-sm font-bold transition",
            bulkMode
              ? "border-cyan-200/45 bg-cyan-200/13 text-cyan-100"
              : "border-white/10 bg-white/[0.045] text-zinc-300",
          )}
        >
          <Table2 className="h-4 w-4" />
          Bulk mode
        </button>
      </div>
    </GlassCard>
  );
}

function RecommendationPlanner({
  selectedExtensions,
  recommendationPlan,
  recommendationQuotas,
  setRecommendationQuota,
  applyRecommendationPreset,
  recommendationSearchPreset,
  applyRecommendationSearchPreset,
  recommendationNamingMode,
  setRecommendationNamingMode,
  allowSemanticAlternatives,
  setAllowSemanticAlternatives,
  relatedMustIncludeSeed,
  setRelatedMustIncludeSeed,
  recommendationTimeBudgetMinutes,
  setRecommendationTimeBudgetMinutes,
}: {
  selectedExtensions: Set<string>;
  recommendationPlan: RecommendationPlan;
  recommendationQuotas: Record<string, number>;
  setRecommendationQuota: (extension: string, value: number) => void;
  applyRecommendationPreset: (target: RecommendationTarget) => void;
  recommendationSearchPreset: RecommendationSearchPreset;
  applyRecommendationSearchPreset: (preset: Exclude<RecommendationSearchPreset, "custom">) => void;
  recommendationNamingMode: NamingMode;
  setRecommendationNamingMode: (value: NamingMode) => void;
  allowSemanticAlternatives: boolean;
  setAllowSemanticAlternatives: (value: boolean) => void;
  relatedMustIncludeSeed: boolean;
  setRelatedMustIncludeSeed: (value: boolean) => void;
  recommendationTimeBudgetMinutes: RecommendationTimeBudgetMinutes;
  setRecommendationTimeBudgetMinutes: (value: RecommendationTimeBudgetMinutes) => void;
}) {
  const sortedExtensions = sortRecommendationExtensions(Array.from(selectedExtensions));
  const quotaByExtension = new Map(
    recommendationPlan.quotas.map((item) => [item.extension, item.quota]),
  );

  return (
    <div className="mt-5 border-t border-white/[0.08] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Layers3 className="h-4 w-4 text-cyan-100" />
          <span className="text-xs font-bold uppercase text-cyan-100/75">
            Recommendation split
          </span>
          <span className="rounded-full border border-emerald-200/25 bg-emerald-200/10 px-2.5 py-1 text-xs font-bold text-emerald-100">
            {recommendationPlanSummary(recommendationPlan)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Recommendation target">
          {RECOMMENDATION_TARGET_OPTIONS.map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => applyRecommendationPreset(target)}
              className={cn(
                "inline-flex h-9 items-center justify-center rounded-xl border px-3 text-xs font-bold transition",
                recommendationPlan.target === target
                  ? "border-cyan-200/45 bg-cyan-200/13 text-cyan-100"
                  : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white",
              )}
            >
              Top {target}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-500">Search depth</span>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Search depth preset">
          {RECOMMENDATION_SEARCH_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              onClick={() => applyRecommendationSearchPreset(preset.value)}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-xs font-bold transition",
                recommendationSearchPreset === preset.value
                  ? "border-emerald-200/45 bg-emerald-200/13 text-emerald-100"
                  : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white",
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {sortedExtensions.map((extension) => (
          <label
            key={extension}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-zinc-200"
          >
            <span>.{extension}</span>
            <input
              aria-label={`Quota for .${extension}`}
              type="number"
              min={0}
              max={MAX_RECOMMENDATION_TARGET}
              value={recommendationQuotas[extension] ?? quotaByExtension.get(extension) ?? 0}
              onChange={(event) => setRecommendationQuota(extension, Number(event.target.value))}
              className="h-7 w-14 rounded-lg border border-white/10 bg-black/25 px-2 text-center text-xs font-bold text-white outline-none focus:border-cyan-200/45"
            />
          </label>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-500">Time budget</span>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Recommendation time budget">
          {RECOMMENDATION_TIME_BUDGET_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              onClick={() => setRecommendationTimeBudgetMinutes(minutes)}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-xs font-bold transition",
                recommendationTimeBudgetMinutes === minutes
                  ? "border-violet-200/45 bg-violet-200/13 text-violet-100"
                  : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white",
              )}
            >
              {minutes} min
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-zinc-500">Naming mode</span>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Naming mode">
          {NAMING_MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRecommendationNamingMode(option.value)}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-lg border px-2.5 text-xs font-bold transition",
                recommendationNamingMode === option.value
                  ? "border-cyan-200/45 bg-cyan-200/13 text-cyan-100"
                  : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <label className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-zinc-200">
          <input
            type="checkbox"
            checked={allowSemanticAlternatives}
            onChange={(event) => setAllowSemanticAlternatives(event.target.checked)}
            className="h-3.5 w-3.5 accent-cyan-300"
          />
          Semantic
        </label>
        <label className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-bold text-zinc-200">
          <input
            type="checkbox"
            checked={relatedMustIncludeSeed}
            onChange={(event) => setRelatedMustIncludeSeed(event.target.checked)}
            className="h-3.5 w-3.5 accent-cyan-300"
          />
          Include seed
        </label>
      </div>
    </div>
  );
}

function StyleSelector({
  selectedStyles,
  toggleGenerationStyle,
}: {
  selectedStyles: Set<GenerationStyle>;
  toggleGenerationStyle: (style: GenerationStyle) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CANONICAL_GENERATION_STYLES.map((style) => (
        <button
          key={style}
          type="button"
          onClick={() => toggleGenerationStyle(style)}
          title={`${GENERATION_STYLE_LABELS[style]} generation style`}
          className={cn(
            "inline-flex min-h-10 items-center rounded-xl border px-3 py-1.5 text-xs font-bold transition",
            selectedStyles.has(style)
              ? "border-violet-200/45 bg-violet-200/12 text-violet-100"
              : "border-white/10 bg-white/[0.04] text-zinc-400 hover:text-white",
          )}
        >
          {GENERATION_STYLE_LABELS[style]}
        </button>
      ))}
    </div>
  );
}

function ModeSafetyNotice({
  mode,
  hasMockResults,
}: {
  mode: ProviderMode;
  hasMockResults: boolean;
}) {
  const showMockWarning = mode === "mock" || hasMockResults;
  const message =
    mode === "mock"
      ? "Mock mode is simulated demo data. It is not evidence that a domain can be registered."
      : hasMockResults
        ? "Some results came from mock fallback. Treat those as simulated and verify with Live or a registrar."
        : mode === "hybrid"
          ? "Hybrid may use fallback providers. Check each result source before acting."
          : "";

  if (!message && !showMockWarning) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-3 flex items-start gap-2 rounded-xl border px-3 py-2 text-xs font-semibold",
        showMockWarning
          ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
          : "border-cyan-200/25 bg-cyan-200/8 text-cyan-100",
      )}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function SearchOutcomeNotice({
  outcome,
  relatedAvailableCount,
  relatedCandidateCount,
  onShowExact,
}: {
  outcome: SearchOutcome | null;
  relatedAvailableCount: number;
  relatedCandidateCount: number;
  onShowExact: () => void;
}) {
  if (!outcome) {
    return null;
  }

  const exactAvailable = outcome.exactResults.filter(isRegistrarAvailable);
  const exactUnavailable = exactAvailable.length === 0;
  const exactAvailableDomains = exactAvailable.map((result) => result.domain);
  const target = outcome.recommendationPlan.target;
  const splitSummary = recommendationPlanSummary(outcome.recommendationPlan);
  const hasRelatedAvailable = relatedAvailableCount > 0;
  const hasRelatedCandidates = relatedCandidateCount > 0;
  const readyCopy = hasRelatedAvailable
    ? `Below are the top ${relatedAvailableCount} registrar-confirmed related domains, targeting ${splitSummary}.`
    : hasRelatedCandidates && !outcome.registrarAvailability
      ? `Registrar API credentials are not configured, so confirmed availability cannot be claimed. Showing ${relatedCandidateCount} high-quality related candidates needing registrar confirmation, targeting ${splitSummary}.`
      : "No registrar-confirmed related domains were found with the current provider setup. Review the checked results or configure a registrar API for stronger live availability.";
  const findingCopy = `Exact lookup completed first. Finding top ${target} related available domains, split ${splitSummary}.`;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 shadow-[0_18px_60px_rgba(0,0,0,0.24)]",
        exactUnavailable
          ? "border-amber-200/25 bg-amber-200/[0.075] text-amber-50"
          : "border-cyan-200/25 bg-cyan-200/[0.07] text-cyan-50",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-xl border",
                exactUnavailable
                  ? "border-amber-200/25 bg-amber-200/10"
                  : "border-cyan-200/25 bg-cyan-200/10",
              )}
            >
              {exactUnavailable ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <BadgeCheck className="h-4 w-4" />
              )}
            </span>
            <h2 className="text-lg font-semibold text-white">
              {exactUnavailable
                ? `No registrar-confirmed availability for "${outcome.name}"`
                : `Searched domain: "${outcome.name}"`}
            </h2>
          </div>
          <p
            className={cn(
              "mt-2 max-w-3xl text-sm leading-6",
              exactUnavailable ? "text-amber-50/80" : "text-cyan-50/80",
            )}
          >
            {exactUnavailable
              ? outcome.alternativesReady
                ? readyCopy
                : findingCopy
              : outcome.alternativesReady
                ? `Exact available: ${exactAvailableDomains.join(", ")}. ${readyCopy}`
                : `Exact available: ${exactAvailableDomains.join(", ")}. Finding top ${target} related available domains, split ${splitSummary}.`}
          </p>
          {exactAvailable.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {exactAvailable.map((result) => (
                <span
                  key={result.domain}
                  className="rounded-full border border-cyan-200/25 bg-cyan-200/10 px-2.5 py-1 text-xs font-bold text-cyan-100"
                >
                  {result.domain}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onShowExact}
          className={cn(
            "inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 bg-black/20 px-3 text-xs font-bold transition hover:bg-white/[0.06]",
            exactUnavailable
              ? "text-amber-50 hover:border-amber-200/40"
              : "text-cyan-50 hover:border-cyan-200/40",
          )}
        >
          Show full check list
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
        {relatedAvailableCount > 0 && (
          <span className="rounded-full border border-emerald-200/25 bg-emerald-200/10 px-2.5 py-1 text-emerald-100">
            {relatedAvailableCount} of {target} related available
          </span>
        )}
        {outcome.alternativesReady && relatedAvailableCount === 0 && (
          <span className="rounded-full border border-amber-200/25 bg-amber-200/10 px-2.5 py-1 text-amber-100">
            {hasRelatedCandidates && !outcome.registrarAvailability
              ? `${relatedCandidateCount} related candidates need registrar check`
              : "0 registrar-confirmed related domains"}
          </span>
        )}
      </div>
    </div>
  );
}

function ProviderStatusPanel({
  mode,
  results,
}: {
  mode: ProviderMode;
  results: DomainCheckResult[];
}) {
  const sourceCounts = results.reduce<Record<string, number>>((counts, result) => {
    counts[result.source] = (counts[result.source] ?? 0) + 1;
    return counts;
  }, {});
  const rows = [
    ["Mock provider", mode === "mock" ? "Demo only" : mode === "hybrid" ? "Fallback" : "Off"],
    ["RDAP", mode === "live" || mode === "hybrid" ? "Enabled" : "Standby"],
    ["DNS taken evidence", mode === "live" || mode === "hybrid" ? "Enabled" : "Standby"],
    ["Registrar API", mode === "live" || mode === "hybrid" ? "Conditional" : "Off"],
    ["Brand risk", mode === "live" ? "USPTO + handles" : "Heuristic"],
    ["Market data", "Comparable-ready"],
    ["Evidence store", "Redis-ready"],
    ["Manual policy", "Always on"],
  ];

  return (
    <GlassCard className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
            Provider Status
          </p>
          <h2 className="mt-1 text-2xl font-semibold">Lookup fabric</h2>
        </div>
        <Activity className="h-5 w-5 text-cyan-100" />
      </div>
      <div className="mt-5 flex flex-col gap-3">
        {rows.map(([label, status]) => (
          <div key={label} className="flex items-center justify-between gap-3 border-b border-white/[0.07] pb-3 last:border-0 last:pb-0">
            <span className="text-sm font-semibold text-zinc-200">{label}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-xs font-bold text-zinc-300">
              {status}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {Object.entries(SOURCE_LABELS).map(([source, label]) => (
          <div key={source} className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
            <div className="text-lg font-bold text-white">{sourceCounts[source] ?? 0}</div>
            <div className="mt-1 text-xs text-zinc-400">{label}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function DashboardToolbar({
  filter,
  setFilter,
  availableCount,
  totalCount,
  isRelatedAvailabilityMode = false,
  isRelatedReviewMode = false,
  isFindingAlternatives = false,
  recommendationTarget = DEFAULT_RECOMMENDATION_TARGET,
  exportMenu,
}: {
  filter: ResultFilter;
  setFilter: (filter: ResultFilter) => void;
  availableCount: number;
  totalCount: number;
  isRelatedAvailabilityMode?: boolean;
  isRelatedReviewMode?: boolean;
  isFindingAlternatives?: boolean;
  recommendationTarget?: number;
  exportMenu: React.ReactNode;
}) {
  return (
    <GlassCard className="flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-zinc-400" />
        <button
          type="button"
          onClick={() => setFilter(filter === "available" ? "all" : "available")}
          title="Show only domains with confirmed non-mock availability."
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-bold transition",
            filter === "available"
              ? "border-emerald-200/45 bg-emerald-200/15 text-emerald-100"
              : "border-white/10 bg-white/[0.045] text-zinc-300 hover:border-emerald-200/35 hover:text-white",
          )}
        >
          <BadgeCheck className="h-3.5 w-3.5" />
          Available only
          {(!isRelatedAvailabilityMode || availableCount > 0) && (
            <span className="rounded-full bg-black/25 px-1.5 py-0.5 text-[10px]">
              {availableCount}
            </span>
          )}
        </button>
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={cn(
              "h-9 rounded-xl px-3 text-xs font-bold transition",
              filter === item.value
                ? "bg-white text-slate-950"
                : "bg-white/[0.045] text-zinc-400 hover:text-white",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="text-xs font-semibold text-zinc-500">
        {isFindingAlternatives
          ? `Finding top ${recommendationTarget}`
          : isRelatedReviewMode
            ? `${totalCount} need registrar check`
          : filter === "available"
          ? `${availableCount} confirmed available`
          : `${totalCount} checked`}
      </div>
      {exportMenu}
    </GlassCard>
  );
}

function ExportMenu({
  onCsv,
  onJson,
  onXlsx,
  onAvailableCsv,
  availableCount,
}: {
  onCsv: () => void;
  onJson: () => void;
  onXlsx: () => void;
  onAvailableCsv: () => void;
  availableCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <IconButton label="Export CSV" onClick={onCsv}>
        <Download className="h-4 w-4" />
      </IconButton>
      <IconButton label="Export JSON" onClick={onJson}>
        <FileJson className="h-4 w-4" />
      </IconButton>
      <IconButton label="Export XLSX" onClick={onXlsx}>
        <FileSpreadsheet className="h-4 w-4" />
      </IconButton>
      <SecondaryButton
        onClick={onAvailableCsv}
        disabled={availableCount === 0}
        className="min-h-10 px-3 text-xs"
      >
        <BadgeCheck className="h-4 w-4" />
        Export available
      </SecondaryButton>
    </div>
  );
}

function AvailabilityBadge({ result }: { result: DomainCheckResult }) {
  const meta = statusMetaForResult(result);

  return (
    <span
      title={meta.tooltip}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-bold",
        meta.tone,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function RegistrarLinkButton({ result }: { result: DomainCheckResult }) {
  if (!result.registrarUrl) return null;

  const isMock = isMockResult(result);

  return (
    <a
      href={result.registrarUrl}
      target="_blank"
      rel="noreferrer"
      title={
        isMock
          ? "Open registrar to verify this simulated mock result"
          : "Open registrar or registry action link"
      }
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.05] px-3 text-sm font-bold text-cyan-100 transition hover:border-cyan-200/45"
    >
      {isMock ? "Verify" : "Registrar"}
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}

function DomainResultsPanel({
  results,
  totalCount,
  filter,
  saved,
  onSave,
  onShowAll,
  isRelatedAvailabilityMode = false,
  isRelatedReviewMode = false,
  isFindingAlternatives = false,
  recommendationTarget = DEFAULT_RECOMMENDATION_TARGET,
  qualitySeedName,
}: {
  results: DomainCheckResult[];
  totalCount: number;
  filter: ResultFilter;
  saved: Map<string, SavedDomain>;
  onSave: (result: DomainCheckResult) => void;
  onShowAll: () => void;
  isRelatedAvailabilityMode?: boolean;
  isRelatedReviewMode?: boolean;
  isFindingAlternatives?: boolean;
  recommendationTarget?: number;
  qualitySeedName?: string;
}) {
  return (
    <GlassCard className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
            Domain Stack
          </p>
          <h2 className="mt-1 text-lg font-semibold">
            {isRelatedReviewMode
              ? "Related domains to verify"
              : filter === "available"
                ? "Confirmed available domains"
                : "Checked extensions"}
          </h2>
        </div>
        <div className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1 text-xs font-bold text-zinc-300">
          {isRelatedAvailabilityMode && results.length === 0
            ? isFindingAlternatives
              ? `Finding top ${recommendationTarget}`
              : "0 confirmed"
            : `${results.length} of ${totalCount}`}
        </div>
      </div>

      {results.length === 0 ? (
        <div className="p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-300/25 bg-amber-300/10 text-amber-100">
            {isFindingAlternatives ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <CircleHelp className="h-5 w-5" />
            )}
          </div>
          <h3 className="mt-4 text-lg font-semibold text-white">
            {isFindingAlternatives
              ? `Finding top ${recommendationTarget} available related domains`
              : isRelatedReviewMode
                ? "Related domains need registrar confirmation"
              : filter === "available"
              ? "No confirmed available domains in this run"
              : "No domains match this filter"}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-400">
            {isFindingAlternatives
              ? "Checking commercial, semantic, and preference-aware alternatives across high-value extensions."
              : isRelatedReviewMode
                ? "These candidates match the search intent and selected extension split, but need a registrar API or checkout lookup before availability can be claimed."
              : "Available-only shows registrar-confirmed results and excludes mock simulations, taken names, and manual checks."}
          </p>
          {!isFindingAlternatives && (
            <SecondaryButton onClick={onShowAll} className="mt-5">
              Review unavailable and needs-check results
            </SecondaryButton>
          )}
        </div>
      ) : (
        <div className="divide-y divide-white/[0.06]">
          {results.map((result) => {
            const evidence = evidenceSummary(result);
            const price = priceLabel(result);
            const intelligence = result.intelligence;
            const qualityChips = qualityChipsForName(qualitySeedName, result.name);

            return (
              <div
                key={result.domain}
                className="grid gap-3 px-4 py-3 transition hover:bg-white/[0.025] lg:grid-cols-[minmax(220px,0.9fr)_minmax(360px,1.5fr)_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-lg font-bold tracking-normal text-white">
                    {result.domain}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span>{relativeCheckedAt(result.checkedAt)}</span>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex min-h-8 flex-wrap items-center gap-2">
                    <AvailabilityBadge result={result} />
                    <span
                      title={evidence}
                      className="inline-flex items-center gap-1 rounded-full border border-cyan-200/20 bg-cyan-200/8 px-2.5 py-1 text-xs font-bold text-cyan-100"
                    >
                      {evidenceLabel(result)}
                      <CircleHelp className="h-3 w-3 opacity-75" />
                    </span>
                    {price && (
                      <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-xs font-bold text-zinc-200">
                        {price}
                      </span>
                    )}
                    {qualityChips.map((chip) => (
                      <span
                        key={`${result.domain}-${chip}`}
                        className="rounded-full border border-fuchsia-200/20 bg-fuchsia-200/8 px-2.5 py-1 text-xs font-bold text-fuchsia-100"
                      >
                        {chip}
                      </span>
                    ))}
                    {intelligence && (
                      <>
                        <span
                          title={`Commercial score ${intelligence.commercialScore}/100`}
                          className="rounded-full border border-emerald-200/20 bg-emerald-200/8 px-2.5 py-1 text-xs font-bold text-emerald-100"
                        >
                          C {intelligence.commercialScore}
                        </span>
                        <span
                          title={`Launch readiness ${intelligence.launchReadiness}/100`}
                          className="rounded-full border border-violet-200/20 bg-violet-200/8 px-2.5 py-1 text-xs font-bold text-violet-100"
                        >
                          L {intelligence.launchReadiness}
                        </span>
                        <span
                          title={`Estimated value USD ${intelligence.valuationUsd}`}
                          className="rounded-full border border-amber-200/20 bg-amber-200/8 px-2.5 py-1 text-xs font-bold text-amber-100"
                        >
                          ${intelligence.valuationUsd}
                        </span>
                        <span
                          title={`Brand-risk score ${intelligence.riskScore}/100`}
                          className="rounded-full border border-rose-200/20 bg-rose-200/8 px-2.5 py-1 text-xs font-bold text-rose-100"
                        >
                          R {intelligence.riskScore}
                        </span>
                        <span
                          title={`Evidence confidence ${intelligence.confidenceScore}/100`}
                          className="rounded-full border border-sky-200/20 bg-sky-200/8 px-2.5 py-1 text-xs font-bold text-sky-100"
                        >
                          E {intelligence.confidenceScore}
                        </span>
                        {intelligence.signals.slice(0, 2).map((signal) => (
                          <span
                            key={`${result.domain}-${signal.kind}-${signal.label}`}
                            title={signal.detail}
                            className={cn(
                              "rounded-full border px-2.5 py-1 text-xs font-bold",
                              signalTone(signal.status),
                            )}
                          >
                            {signal.label}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                    {intelligence?.warnings.length
                      ? `${evidence} ${intelligence.warnings[0]}`
                      : intelligence?.reasons.length
                        ? intelligence.reasons.slice(0, 3).join(" | ")
                        : evidence}
                  </p>
                </div>

                <div className="flex items-center justify-end gap-2">
                  <IconButton
                    label={saved.has(result.domain) ? "Remove saved" : "Save domain"}
                    active={saved.has(result.domain)}
                    onClick={() => onSave(result)}
                  >
                    <Star className={cn("h-4 w-4", saved.has(result.domain) && "fill-current")} />
                  </IconButton>
                  <RegistrarLinkButton result={result} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}

function MetricTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border border-white/[0.07] bg-black/20 p-3">
      <div className="truncate text-base font-bold text-white">{value}</div>
      <div className="mt-1 text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function BrandScoreGauge({
  recommendation,
  results,
}: {
  recommendation?: Recommendation;
  results: DomainCheckResult[];
}) {
  const score = recommendation?.brandScore ?? 0;
  const circumference = 2 * Math.PI * 42;
  const stroke = circumference - (score / 100) * circumference;
  const available = results.filter(isRegistrarAvailable).length;
  const manual = results.filter((result) =>
    ["manual_check_required", "restricted", "unknown", "rate_limited"].includes(result.status),
  ).length;

  return (
    <GlassCard className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
            Brand Score
          </p>
          <h2 className="mt-1 text-2xl font-semibold">
            {recommendation?.name ?? "No available name yet"}
          </h2>
        </div>
        <Gauge className="h-5 w-5 text-cyan-100" />
      </div>
      <div className="mt-6 flex items-center justify-center">
        <div className="relative h-36 w-36">
          <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth="9" />
            <motion.circle
              cx="50"
              cy="50"
              r="42"
              fill="none"
              stroke="url(#scoreGradient)"
              strokeLinecap="round"
              strokeWidth="9"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: stroke }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            />
            <defs>
              <linearGradient id="scoreGradient" x1="0" x2="1" y1="0" y2="1">
                <stop stopColor="#67e8f9" />
                <stop offset="0.55" stopColor="#a7f3d0" />
                <stop offset="1" stopColor="#f8d57e" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-4xl font-bold text-white">{score}</span>
            <span className="text-xs text-zinc-500">/100</span>
          </div>
        </div>
      </div>
      <p className="mt-4 min-h-12 text-sm leading-6 text-zinc-400">
        {recommendation?.explanation ??
          "Confirmed available names will appear here after registrar-backed checks."}
      </p>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <MetricTile label="Checked" value={results.length} />
        <MetricTile label="Confirmed" value={available} />
        <MetricTile label="Needs check" value={manual} />
      </div>
    </GlassCard>
  );
}

function RecommendationPanel({
  availableDomains,
  recommendations,
  isCandidateFallbackMode = false,
  isFindingAlternatives = false,
  recommendationTarget = DEFAULT_RECOMMENDATION_TARGET,
  qualitySeedName,
  onCheck,
}: {
  availableDomains: DomainCheckResult[];
  recommendations: Recommendation[];
  isCandidateFallbackMode?: boolean;
  isFindingAlternatives?: boolean;
  recommendationTarget?: number;
  qualitySeedName?: string;
  onCheck: (names: string[]) => void;
}) {
  const recommendationByName = new Map(
    recommendations.map((recommendation) => [
      recommendation.name,
      recommendation,
    ]),
  );

  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
            Recommendations
          </p>
          <h2 className="mt-1 text-xl font-semibold">
            {isCandidateFallbackMode ? "Related candidates" : "Available recommendations"}
          </h2>
        </div>
        <IconButton
          label="Check top recommendations"
          onClick={() =>
            onCheck(
              availableDomains
                .slice(0, recommendationTarget)
                .map((item) => item.name),
            )
          }
          disabled={availableDomains.length === 0}
        >
          <Sparkles className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="studio-scrollbar flex max-h-[32rem] flex-col gap-3 overflow-y-auto pr-1">
        {availableDomains.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm text-zinc-400">
            {isFindingAlternatives
              ? `Finding top ${recommendationTarget} available commercial-value recommendations.`
              : isCandidateFallbackMode
                ? "These names are ranked for commercial quality and extension fit, but still need registrar confirmation."
                : "No variants have passed live availability checks yet. Try different roots or configure a registrar API for stronger confirmation."}
          </div>
        ) : (
          availableDomains.slice(0, recommendationTarget).map((result, index) => (
            <RecommendationCard
              key={result.domain}
              result={result}
              recommendation={recommendationByName.get(result.name)}
              rank={index + 1}
              qualitySeedName={qualitySeedName}
              onCheck={() => onCheck([result.name])}
            />
          ))
        )}
      </div>
    </GlassCard>
  );
}

function RecommendationCard({
  result,
  recommendation,
  rank,
  qualitySeedName,
  onCheck,
}: {
  result: DomainCheckResult;
  recommendation?: Recommendation;
  rank: number;
  qualitySeedName?: string;
  onCheck: () => void;
}) {
  const intelligence = result.intelligence;
  const qualityChips = qualityChipsForName(qualitySeedName, result.name);
  const reasonText = intelligence?.reasons.length
    ? intelligence.reasons.slice(0, 4).join(" | ")
    : recommendation?.explanation ?? evidenceSummary(result);

  return (
    <button
      type="button"
      onClick={onCheck}
      className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-left transition hover:border-cyan-200/35 hover:bg-white/[0.055]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 truncate font-semibold text-white">
          {rank}. {result.domain}
        </div>
        <span className="rounded-full bg-cyan-200/12 px-2.5 py-1 text-xs font-bold text-cyan-100">
          {recommendation?.brandScore ?? getExtensionQuality(result.extension)}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <AvailabilityBadge result={result} />
        <span className="rounded-full border border-cyan-200/20 bg-cyan-200/8 px-2.5 py-1 text-xs font-bold text-cyan-100">
          {evidenceLabel(result)}
        </span>
        {intelligence && (
          <>
            <span
              title={`Availability confidence ${intelligence.confidenceScore}/100`}
              className="rounded-full border border-sky-200/20 bg-sky-200/8 px-2.5 py-1 text-xs font-bold text-sky-100"
            >
              Avail {intelligence.confidenceScore}
            </span>
            <span
              title={`Brand risk ${intelligence.riskScore}/100`}
              className="rounded-full border border-rose-200/20 bg-rose-200/8 px-2.5 py-1 text-xs font-bold text-rose-100"
            >
              Risk {intelligence.riskScore}
            </span>
            <span
              title={`Estimated value USD ${intelligence.valuationUsd}`}
              className="rounded-full border border-amber-200/20 bg-amber-200/8 px-2.5 py-1 text-xs font-bold text-amber-100"
            >
              ${intelligence.valuationUsd}
            </span>
          </>
        )}
        {qualityChips.slice(0, 3).map((chip) => (
          <span
            key={`${result.domain}-${chip}`}
            className="rounded-full border border-fuchsia-200/20 bg-fuchsia-200/8 px-2.5 py-1 text-xs font-bold text-fuchsia-100"
          >
            {chip}
          </span>
        ))}
      </div>
      <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">
        {reasonText}
      </p>
      {intelligence?.signals.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {intelligence.signals.slice(0, 3).map((signal) => (
            <span
              key={`${result.domain}-${signal.kind}-${signal.label}`}
              title={signal.detail}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-bold",
                signalTone(signal.status),
              )}
            >
              {signal.label}
            </span>
          ))}
        </div>
      ) : null}
    </button>
  );
}

function ExtensionMatrix({
  groups,
  extensions,
}: {
  groups: Map<string, DomainCheckResult[]>;
  extensions: string[];
}) {
  const names = Array.from(groups.keys()).slice(0, 12);

  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
            Availability Matrix
          </p>
          <h2 className="mt-1 text-xl font-semibold">Extension coverage</h2>
        </div>
        <CircleHelp className="h-4 w-4 text-zinc-500" />
      </div>
      <div className="studio-scrollbar overflow-x-auto">
        <div
          className="grid min-w-[520px] gap-2"
          style={{ gridTemplateColumns: `112px repeat(${Math.max(extensions.length, 1)}, minmax(44px, 1fr))` }}
        >
          <div />
          {extensions.map((extension) => (
            <div key={extension} className="truncate text-center text-xs font-bold text-zinc-500">
              .{extension}
            </div>
          ))}
          {names.map((name) => (
            <div key={name} className="contents">
              <div className="truncate text-sm font-semibold text-zinc-200">{name}</div>
              {extensions.map((extension) => {
                const result = groups.get(name)?.find((item) => item.extension === extension);
                const meta = result ? statusMetaForResult(result) : undefined;

                return (
                  <div
                    key={`${name}.${extension}`}
                    title={result ? `${meta?.label} via ${sourceLabel(result.source)}` : "Not checked"}
                    className={cn(
                      "h-9 rounded-xl border border-white/10",
                      meta?.matrix ?? "bg-white/[0.04]",
                    )}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

function DomainStackCards({
  groups,
  recommendations,
}: {
  groups: Map<string, DomainCheckResult[]>;
  recommendations: Recommendation[];
}) {
  const names = recommendations.slice(0, 4).map((item) => item.name);
  const visibleNames = names.length ? names : Array.from(groups.keys()).slice(0, 4);

  return (
    <GlassCard className="p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
        Domain Stack Cards
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {visibleNames.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-sm text-zinc-400">
            Stacks appear after checking domains.
          </div>
        ) : (
          visibleNames.map((name) => {
            const stack = groups.get(name) ?? [];
            const recommendation = scoreForName(name, recommendations);

            return (
              <div key={name} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-semibold text-white">{name}</span>
                  <span className="text-xs font-bold text-cyan-100">{recommendation?.brandScore ?? "-"}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {stack.map((result) => {
                    const meta = statusMetaForResult(result);

                    return (
                      <span
                        key={result.domain}
                        title={`${meta.label}; source: ${sourceLabel(result.source)}`}
                        className={cn("rounded-full border px-2 py-1 text-xs font-bold", meta.tone)}
                      >
                        .{result.extension}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </GlassCard>
  );
}

function NameGeneratorPanel({
  seed,
  setSeed,
  selectedStyles,
  toggleGenerationStyle,
  applyPreset,
  candidateCount,
  setCandidateCount,
  minLength,
  setMinLength,
  maxLength,
  setMaxLength,
  allowedLetters,
  setAllowedLetters,
  avoidLetters,
  setAvoidLetters,
  mustInclude,
  setMustInclude,
  mustAvoid,
  setMustAvoid,
  isChecking,
  onGenerate,
}: {
  seed: string;
  setSeed: (value: string) => void;
  selectedStyles: Set<GenerationStyle>;
  toggleGenerationStyle: (style: GenerationStyle) => void;
  applyPreset: (preset: (typeof STYLE_PRESETS)[number]) => void;
  candidateCount: number;
  setCandidateCount: (value: number) => void;
  minLength: number;
  setMinLength: (value: number) => void;
  maxLength: number;
  setMaxLength: (value: number) => void;
  allowedLetters: string;
  setAllowedLetters: (value: string) => void;
  avoidLetters: string;
  setAvoidLetters: (value: string) => void;
  mustInclude: string;
  setMustInclude: (value: string) => void;
  mustAvoid: string;
  setMustAvoid: (value: string) => void;
  isChecking: boolean;
  onGenerate: () => void;
}) {
  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
            NameLab
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Generate AI-native names</h2>
        </div>
        <PrimaryButton onClick={onGenerate} disabled={isChecking}>
          <BrainCircuit className="h-5 w-5" />
          Generate candidates
        </PrimaryButton>
      </div>

      <label className="mt-6 block">
        <span className="text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
          Concept Words
        </span>
        <textarea
          value={seed}
          onChange={(event) => setSeed(event.target.value)}
          className="mt-2 min-h-32 w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 text-base font-medium text-white outline-none transition placeholder:text-zinc-500 focus:border-cyan-200/45"
        />
      </label>

      <div className="mt-5">
        <div className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-zinc-500">
          Style Presets
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {STYLE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left text-sm font-bold text-zinc-200 transition hover:border-cyan-200/40 hover:text-white"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <StyleSelector selectedStyles={selectedStyles} toggleGenerationStyle={toggleGenerationStyle} />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3 xl:grid-cols-7">
        <LabeledInput label="Min" type="number" value={minLength} onChange={(value) => setMinLength(Number(value))} />
        <LabeledInput label="Max" type="number" value={maxLength} onChange={(value) => setMaxLength(Number(value))} />
        <LabeledInput label="Count" type="number" value={candidateCount} onChange={(value) => setCandidateCount(Number(value))} />
        <LabeledInput label="Allow" value={allowedLetters} onChange={setAllowedLetters} placeholder="letters" />
        <LabeledInput label="Avoid" value={avoidLetters} onChange={setAvoidLetters} placeholder="letters" />
        <LabeledInput label="Must" value={mustInclude} onChange={setMustInclude} placeholder="text" />
        <LabeledInput label="Block" value={mustAvoid} onChange={setMustAvoid} placeholder="text" />
      </div>
    </GlassCard>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm font-semibold text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-200/45"
      />
    </label>
  );
}

function CandidateFeed({
  generated,
  transformed,
  onCheck,
}: {
  generated: GeneratedCandidate[];
  transformed: GeneratedCandidate[];
  onCheck: (name: string) => void;
}) {
  const visible = generated.length ? generated.slice(0, 24) : transformed.slice(0, 16);

  return (
    <div className="studio-scrollbar flex max-h-[34rem] flex-col gap-3 overflow-y-auto pr-1">
      {visible.map((candidate) => (
        <button
          key={`${candidate.name}-${candidate.style}-${candidate.method ?? "candidate"}`}
          type="button"
          onClick={() => onCheck(candidate.name)}
          className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 text-left transition hover:border-cyan-200/35"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate font-semibold text-white">{candidate.name}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-xs font-bold text-zinc-300">
              {candidate.style === "transformation" ? "Transform" : GENERATION_STYLE_LABELS[candidate.style]}
            </span>
          </div>
          <p className="mt-2 line-clamp-2 text-xs leading-5 text-zinc-400">{candidate.rationale}</p>
        </button>
      ))}
    </div>
  );
}

function BulkChecker({
  bulkNames,
  setBulkNames,
  fileRef,
  onFile,
  selectedExtensions,
  toggleExtension,
  progress,
  isChecking,
  onRun,
  onExportAvailable,
}: {
  bulkNames: string;
  setBulkNames: (value: string) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onFile: (file?: File) => void;
  selectedExtensions: Set<string>;
  toggleExtension: (extension: string) => void;
  progress: number;
  isChecking: boolean;
  onRun: () => void;
  onExportAvailable: () => void;
}) {
  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
            Bulk Checker
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Check names at portfolio scale</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <SecondaryButton onClick={() => fileRef.current?.click()}>
            <CloudUpload className="h-4 w-4" />
            Upload
          </SecondaryButton>
          <PrimaryButton onClick={onRun} disabled={isChecking}>
            <Search className="h-4 w-4" />
            Run bulk
          </PrimaryButton>
        </div>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        className="hidden"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
      <textarea
        aria-label="Bulk domain names"
        value={bulkNames}
        onChange={(event) => setBulkNames(event.target.value)}
        className="mt-5 min-h-72 w-full resize-y rounded-2xl border border-white/10 bg-black/30 px-4 py-4 font-mono text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-cyan-200/45"
        placeholder="aptava&#10;satyaflow&#10;medhaops"
      />
      <div className="mt-5 flex flex-wrap gap-2">
        {QUICK_EXTENSIONS.map((extension) => (
          <button
            key={extension}
            type="button"
            onClick={() => toggleExtension(extension)}
            className={cn(
              "h-10 rounded-xl border px-3 text-sm font-bold transition",
              selectedExtensions.has(extension)
                ? "border-cyan-200/45 bg-cyan-200/13 text-cyan-100"
                : "border-white/10 bg-white/[0.04] text-zinc-400",
            )}
          >
            .{extension}
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <BulkProgress progress={progress} total={normalizeNameList(bulkNames).length} available={0} />
        <SecondaryButton onClick={onExportAvailable}>
          <Download className="h-4 w-4" />
          Export available-only
        </SecondaryButton>
      </div>
    </GlassCard>
  );
}

function BulkProgress({
  progress,
  total,
  available,
}: {
  progress: number;
  total: number;
  available: number;
}) {
  return (
    <div className="min-w-[220px] flex-1">
      <div className="mb-2 flex items-center justify-between gap-3 text-xs font-bold text-zinc-400">
        <span>{total} queued</span>
        <span>{available} confirmed</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan-200 to-emerald-200"
          animate={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function SavedProjects({
  saved,
  updateSaved,
  remove,
  exportSaved,
}: {
  saved: Map<string, SavedDomain>;
  updateSaved: (domain: string, update: Partial<Pick<SavedDomain, "note" | "registrar">>) => void;
  remove: (domain: string) => void;
  exportSaved: () => void;
}) {
  const items = Array.from(saved.values());

  return (
    <GlassCard className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
            Saved Projects
          </p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Founder shortlist</h2>
        </div>
        <SecondaryButton onClick={exportSaved} disabled={items.length === 0}>
          <Download className="h-4 w-4" />
          Export founder shortlist
        </SecondaryButton>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {items.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-6 text-sm text-zinc-400">
            Save domains from the results dashboard to compare, annotate, and export.
          </div>
        ) : (
          items.map((item) => (
            <div key={item.domain} className="rounded-2xl border border-white/[0.08] bg-black/20 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-lg font-bold text-white">{item.domain}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <AvailabilityBadge result={item.result} />
                    <span className="rounded-full border border-cyan-200/30 bg-cyan-200/10 px-2.5 py-1 text-xs font-bold text-cyan-100">
                      {item.recommendation?.brandScore ?? "-"} score
                    </span>
                  </div>
                </div>
                <IconButton label="Remove saved domain" onClick={() => remove(item.domain)}>
                  <X className="h-4 w-4" />
                </IconButton>
              </div>
              <label className="mt-4 block">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-zinc-500">Notes</span>
                <textarea
                  value={item.note}
                  onChange={(event) => updateSaved(item.domain, { note: event.target.value })}
                  className="mt-2 min-h-24 w-full resize-y rounded-2xl border border-white/10 bg-white/[0.035] px-3 py-3 text-sm text-white outline-none focus:border-cyan-200/45"
                  placeholder="Positioning, founder preference, risks"
                />
              </label>
              <LabeledInput
                label="Preferred Registrar"
                value={item.registrar}
                onChange={(registrar) => updateSaved(item.domain, { registrar })}
              />
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
}

function SettingsPage({
  mode,
  setMode,
  cacheTtl,
  setCacheTtl,
  rateLimit,
  setRateLimit,
  selectedExtensions,
  toggleExtension,
  customExtension,
  setCustomExtension,
  addCustomExtension,
  theme,
  setTheme,
}: {
  mode: ProviderMode;
  setMode: (mode: ProviderMode) => void;
  cacheTtl: number;
  setCacheTtl: (value: number) => void;
  rateLimit: number;
  setRateLimit: (value: number) => void;
  selectedExtensions: Set<string>;
  toggleExtension: (extension: string) => void;
  customExtension: string;
  setCustomExtension: (value: string) => void;
  addCustomExtension: () => void;
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <GlassCard className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
          API Providers
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Provider routing</h2>
        <div className="mt-6 grid gap-3">
          {MODES.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setMode(item.value)}
              className={cn(
                "flex items-center justify-between gap-3 rounded-2xl border p-4 text-left transition",
                mode === item.value
                  ? "border-cyan-200/45 bg-cyan-200/10"
                  : "border-white/10 bg-white/[0.035]",
              )}
            >
              <span className="font-bold text-white">{item.label}</span>
              {mode === item.value && <Check className="h-4 w-4 text-cyan-100" />}
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <LabeledInput label="Rate Limit" type="number" value={rateLimit} onChange={(value) => setRateLimit(Number(value))} />
          <LabeledInput label="Cache TTL" type="number" value={cacheTtl} onChange={(value) => setCacheTtl(Number(value))} />
        </div>
      </GlassCard>

      <GlassCard className="p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-cyan-100/70">
          Defaults
        </p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Extensions and theme</h2>
        <div className="mt-6 flex flex-wrap gap-2">
          {DEFAULT_EXTENSIONS.map((extension) => (
            <button
              key={extension}
              type="button"
              onClick={() => toggleExtension(extension)}
              className={cn(
                "h-10 rounded-xl border px-3 text-sm font-bold transition",
                selectedExtensions.has(extension)
                  ? "border-cyan-200/45 bg-cyan-200/13 text-cyan-100"
                  : "border-white/10 bg-white/[0.04] text-zinc-400",
              )}
            >
              .{extension}
            </button>
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          <input
            value={customExtension}
            onChange={(event) => setCustomExtension(event.target.value)}
            placeholder=".studio"
            className="h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-cyan-200/45"
          />
          <IconButton label="Add extension" onClick={addCustomExtension}>
            <Plus className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {(["dark", "light"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTheme(item)}
              className={cn(
                "flex items-center justify-between rounded-2xl border p-4 font-bold capitalize transition",
                theme === item
                  ? "border-cyan-200/45 bg-cyan-200/10 text-white"
                  : "border-white/10 bg-white/[0.035] text-zinc-300",
              )}
            >
              {item}
              {item === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <SettingLink icon={Globe2} label="Registrar links" value="Namecheap, Cloudflare, GoDaddy, Porkbun, SGNIC" />
          <SettingLink icon={Database} label="Cache policy" value={`${cacheTtl}s TTL`} />
          <SettingLink icon={Link2} label="Default action" value="Open registrar" />
          <SettingLink icon={Activity} label="Rate limits" value={`${rateLimit} concurrent`} />
        </div>
      </GlassCard>
    </div>
  );
}

function SettingLink({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-white">
        <Icon className="h-4 w-4 text-cyan-100" />
        {label}
      </div>
      <div className="mt-2 text-xs text-zinc-400">{value}</div>
    </div>
  );
}
