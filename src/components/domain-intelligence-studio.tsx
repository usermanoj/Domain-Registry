"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BadgeCheck,
  BarChart3,
  Check,
  ChevronRight,
  Clock3,
  Download,
  FileJson,
  FileSpreadsheet,
  Filter,
  Moon,
  Plus,
  Search,
  Sparkles,
  Star,
  Sun,
  Table2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  Tooltip,
} from "recharts";
import { buildExportRows, toCsv, toXlsxBuffer } from "@/domain/export";
import {
  DEFAULT_GENERATION_STYLES,
  transformName,
} from "@/domain/generator";
import { splitNames, normalizeExtension } from "@/domain/normalize";
import { DEFAULT_EXTENSIONS } from "@/domain/tlds";
import type {
  AvailabilityStatus,
  DomainCheckResponse,
  DomainCheckResult,
  GeneratedCandidate,
  GenerateNamesResponse,
  ProviderMode,
  Recommendation,
} from "@/domain/types";

type ResultFilter =
  | "all"
  | "available"
  | "premium"
  | "taken"
  | "manual"
  | "short"
  | "ai"
  | "singapore"
  | "favorite";

const INITIAL_EXTENSIONS = ["ai", "com", "sg", "com.sg", "io", "co", "app", "dev"];
const MODES: { value: ProviderMode; label: string }[] = [
  { value: "mock", label: "Mock" },
  { value: "hybrid", label: "Hybrid" },
  { value: "live", label: "Live RDAP" },
];

const FILTERS: { value: ResultFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "available", label: "Available" },
  { value: "premium", label: "Premium" },
  { value: "taken", label: "Taken" },
  { value: "manual", label: "Manual" },
  { value: "short", label: "Short" },
  { value: "ai", label: "AI-friendly" },
  { value: "singapore", label: "SG" },
  { value: "favorite", label: "Favorites" },
];

const STATUS_META: Record<
  AvailabilityStatus,
  { label: string; dot: string; badge: string; heat: string }
> = {
  available_confirmed: {
    label: "Available",
    dot: "bg-emerald-300",
    badge: "border-emerald-300/35 bg-emerald-300/12 text-emerald-100",
    heat: "bg-emerald-400/80",
  },
  premium_available: {
    label: "Premium",
    dot: "bg-amber-300",
    badge: "border-amber-300/40 bg-amber-300/14 text-amber-100",
    heat: "bg-amber-300/85",
  },
  taken_confirmed: {
    label: "Taken",
    dot: "bg-rose-300",
    badge: "border-rose-300/35 bg-rose-300/12 text-rose-100",
    heat: "bg-rose-400/75",
  },
  restricted: {
    label: "Restricted",
    dot: "bg-sky-300",
    badge: "border-sky-300/35 bg-sky-300/12 text-sky-100",
    heat: "bg-sky-400/72",
  },
  unknown: {
    label: "Unknown",
    dot: "bg-zinc-300",
    badge: "border-white/20 bg-white/8 text-zinc-100",
    heat: "bg-zinc-400/45",
  },
  rate_limited: {
    label: "Rate limited",
    dot: "bg-orange-300",
    badge: "border-orange-300/35 bg-orange-300/12 text-orange-100",
    heat: "bg-orange-400/70",
  },
  invalid: {
    label: "Invalid",
    dot: "bg-zinc-500",
    badge: "border-zinc-400/30 bg-zinc-400/10 text-zinc-100",
    heat: "bg-zinc-500/50",
  },
  manual_check_required: {
    label: "Manual check",
    dot: "bg-blue-300",
    badge: "border-blue-300/35 bg-blue-300/12 text-blue-100",
    heat: "bg-blue-400/65",
  },
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

function resultMatchesFilter(
  result: DomainCheckResult,
  filter: ResultFilter,
  favorites: Set<string>,
) {
  if (filter === "all") return true;
  if (filter === "available") return result.status === "available_confirmed";
  if (filter === "premium") return result.status === "premium_available";
  if (filter === "taken") return result.status === "taken_confirmed";
  if (filter === "manual") {
    return ["manual_check_required", "restricted", "unknown", "rate_limited"].includes(
      result.status,
    );
  }
  if (filter === "short") return result.name.length <= 8;
  if (filter === "ai") return ["ai", "app", "dev", "io"].includes(result.extension);
  if (filter === "singapore") return ["sg", "com.sg"].includes(result.extension);
  if (filter === "favorite") return favorites.has(result.domain);
  return true;
}

function StatusBadge({ status }: { status: AvailabilityStatus }) {
  const meta = STATUS_META[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold",
        meta.badge,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-md border transition",
        active
          ? "border-[var(--accent)] bg-[var(--accent)]/18 text-[var(--accent)]"
          : "border-[var(--line)] bg-white/[0.04] text-[var(--app-fg)] hover:border-[var(--accent)]/55",
      )}
      type="button"
    >
      {children}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-[var(--accent)] px-4 text-sm font-bold text-slate-950 shadow-[0_16px_40px_rgba(45,212,191,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-[var(--line)] bg-white/[0.04] px-4 text-sm font-semibold text-[var(--app-fg)] transition hover:border-[var(--accent)]/55 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function DomainIntelligenceStudio() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [query, setQuery] = useState("aptava");
  const [bulkNames, setBulkNames] = useState("");
  const [seed, setSeed] = useState(
    "trust, action, data, agentic AI, automation, revenue, efficiency",
  );
  const [mode, setMode] = useState<ProviderMode>("mock");
  const [selectedExtensions, setSelectedExtensions] = useState(
    () => new Set<string>(INITIAL_EXTENSIONS),
  );
  const [customExtension, setCustomExtension] = useState("");
  const [results, setResults] = useState<DomainCheckResult[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [generated, setGenerated] = useState<GeneratedCandidate[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(() => new Set());
  const [comparison, setComparison] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [progress, setProgress] = useState(0);
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const extensions = useMemo(
    () => Array.from(selectedExtensions).sort((a, b) => a.localeCompare(b)),
    [selectedExtensions],
  );

  const visibleResults = useMemo(
    () =>
      results.filter((result) => resultMatchesFilter(result, filter, favorites)),
    [favorites, filter, results],
  );

  const groupedByName = useMemo(() => {
    const groups = new Map<string, DomainCheckResult[]>();

    for (const result of results) {
      groups.set(result.name, [...(groups.get(result.name) ?? []), result]);
    }

    return groups;
  }, [results]);

  const topRecommendation = recommendations[0];
  const comparisonResults = results.filter((result) => comparison.has(result.domain));
  const transformationCandidates = useMemo(() => transformName(query), [query]);
  const exportRows = useMemo(
    () => buildExportRows(visibleResults, recommendations),
    [recommendations, visibleResults],
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

    if (!normalized) {
      return;
    }

    setSelectedExtensions((current) => new Set([...current, normalized]));
    setCustomExtension("");
  }

  async function checkNames(names: string[]) {
    if (names.length === 0 || extensions.length === 0) {
      setError("Add a valid name and at least one extension.");
      return;
    }

    setError(null);
    setIsChecking(true);
    setProgress(8);

    try {
      const response = await fetch("/api/domain/check", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          names,
          extensions,
          mode,
          includeSuggestions: true,
        }),
      });

      setProgress(72);
      const payload = (await response.json()) as DomainCheckResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Domain check failed.");
      }

      setResults(payload.results);
      setRecommendations(payload.recommendations);
      setComparison(new Set(payload.results.slice(0, 2).map((result) => result.domain)));
      setProgress(100);
    } catch (checkError) {
      setError(
        checkError instanceof Error
          ? checkError.message
          : "Domain check failed unexpectedly.",
      );
      setProgress(0);
    } finally {
      setIsChecking(false);
      window.setTimeout(() => setProgress(0), 900);
    }
  }

  async function generateAndCheck() {
    setError(null);
    setIsChecking(true);
    setProgress(6);

    try {
      const response = await fetch("/api/domain/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          seed,
          limit: 90,
          styles: DEFAULT_GENERATION_STYLES,
        }),
      });

      const payload = (await response.json()) as GenerateNamesResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Generation failed.");
      }

      setGenerated(payload.candidates);
      setProgress(42);
      await checkNames(payload.candidates.slice(0, 36).map((candidate) => candidate.name));
    } catch (generationError) {
      setError(
        generationError instanceof Error
          ? generationError.message
          : "Generation failed unexpectedly.",
      );
      setIsChecking(false);
      setProgress(0);
    }
  }

  function toggleFavorite(domain: string) {
    setFavorites((current) => {
      const next = new Set(current);

      if (next.has(domain)) {
        next.delete(domain);
      } else {
        next.add(domain);
      }

      return next;
    });
  }

  function toggleComparison(domain: string) {
    setComparison((current) => {
      const next = new Set(current);

      if (next.has(domain)) {
        next.delete(domain);
      } else if (next.size < 4) {
        next.add(domain);
      }

      return next;
    });
  }

  function exportCsv() {
    downloadBlob(new Blob([toCsv(exportRows)], { type: "text/csv;charset=utf-8" }), "domain-intelligence.csv");
  }

  function exportJson() {
    downloadBlob(
      new Blob([JSON.stringify({ results: visibleResults, recommendations }, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
      "domain-intelligence.json",
    );
  }

  async function exportXlsx() {
    const buffer = toXlsxBuffer(exportRows);
    downloadBlob(
      new Blob([buffer as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      "domain-intelligence.xlsx",
    );
  }

  return (
    <main className="min-h-screen bg-[var(--app-bg)] text-[var(--app-fg)]">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--panel-strong)] shadow-[var(--shadow)]">
              <BarChart3 className="h-5 w-5 text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal sm:text-2xl">
                Domain Intelligence Studio
              </h1>
              <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                <BadgeCheck className="h-3.5 w-3.5 text-[var(--accent)]" />
                Layered availability, explainable confidence
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1 rounded-md border border-[var(--line)] bg-[var(--panel)] p-1 sm:flex">
              {MODES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMode(item.value)}
                  className={cn(
                    "h-8 rounded px-3 text-xs font-semibold transition",
                    mode === item.value
                      ? "bg-[var(--accent)] text-slate-950"
                      : "text-[var(--muted)] hover:text-[var(--app-fg)]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <IconButton
              label={theme === "dark" ? "Light mode" : "Dark mode"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </IconButton>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
          <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow)] backdrop-blur">
            <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Name
                </span>
                <div className="flex min-h-12 items-center gap-2 rounded-md border border-[var(--line)] bg-black/15 px-3 focus-within:border-[var(--accent)]">
                  <Search className="h-4 w-4 text-[var(--muted)]" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent text-base font-semibold outline-none placeholder:text-[var(--muted)]"
                    placeholder="aptava"
                  />
                </div>
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
                  Seed Words
                </span>
                <textarea
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
                  className="min-h-12 resize-none rounded-md border border-[var(--line)] bg-black/15 px-3 py-3 text-sm font-medium outline-none transition focus:border-[var(--accent)]"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {DEFAULT_EXTENSIONS.map((extension) => (
                <button
                  key={extension}
                  type="button"
                  onClick={() => toggleExtension(extension)}
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-semibold transition",
                    selectedExtensions.has(extension)
                      ? "border-[var(--accent)] bg-[var(--accent)]/16 text-[var(--accent)]"
                      : "border-[var(--line)] bg-white/[0.03] text-[var(--muted)] hover:text-[var(--app-fg)]",
                  )}
                >
                  {selectedExtensions.has(extension) && <Check className="h-3.5 w-3.5" />}
                  .{extension}
                </button>
              ))}
              <div className="inline-flex h-9 items-center rounded-md border border-[var(--line)] bg-white/[0.03]">
                <input
                  value={customExtension}
                  onChange={(event) => setCustomExtension(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomExtension();
                    }
                  }}
                  className="h-full w-24 bg-transparent px-3 text-sm outline-none placeholder:text-[var(--muted)]"
                  placeholder=".studio"
                />
                <button
                  aria-label="Add extension"
                  title="Add extension"
                  type="button"
                  onClick={addCustomExtension}
                  className="flex h-full w-9 items-center justify-center border-l border-[var(--line)] text-[var(--accent)]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
              <textarea
                value={bulkNames}
                onChange={(event) => setBulkNames(event.target.value)}
                className="min-h-24 resize-y rounded-md border border-[var(--line)] bg-black/15 px-3 py-3 text-sm outline-none transition focus:border-[var(--accent)]"
                placeholder="bulk names, one per line"
              />
              <div className="flex flex-col gap-2">
                <PrimaryButton
                  onClick={() => checkNames(splitNames(query))}
                  disabled={isChecking}
                >
                  <Search className="h-4 w-4" />
                  Check
                </PrimaryButton>
                <SecondaryButton
                  onClick={() => checkNames(splitNames(bulkNames || query))}
                  disabled={isChecking}
                >
                  <Table2 className="h-4 w-4" />
                  Bulk
                </SecondaryButton>
                <SecondaryButton onClick={generateAndCheck} disabled={isChecking}>
                  <Sparkles className="h-4 w-4" />
                  Generate
                </SecondaryButton>
              </div>
            </div>

            <AnimatePresence>
              {(progress > 0 || error) && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  className="mt-4"
                >
                  {error ? (
                    <div className="rounded-md border border-rose-300/30 bg-rose-300/10 px-3 py-2 text-sm text-rose-100">
                      {error}
                    </div>
                  ) : (
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-[var(--accent)]"
                        animate={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <ScorePanel recommendation={topRecommendation} results={results} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(360px,0.28fr)]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 backdrop-blur">
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-[var(--muted)]" />
                {FILTERS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFilter(item.value)}
                    className={cn(
                      "h-8 rounded px-3 text-xs font-bold transition",
                      filter === item.value
                        ? "bg-[var(--accent)] text-slate-950"
                        : "bg-white/[0.04] text-[var(--muted)] hover:text-[var(--app-fg)]",
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <IconButton label="Export CSV" onClick={exportCsv}>
                  <Download className="h-4 w-4" />
                </IconButton>
                <IconButton label="Export JSON" onClick={exportJson}>
                  <FileJson className="h-4 w-4" />
                </IconButton>
                <IconButton label="Export XLSX" onClick={exportXlsx}>
                  <FileSpreadsheet className="h-4 w-4" />
                </IconButton>
              </div>
            </div>

            <ResultCards
              results={visibleResults}
              recommendations={recommendations}
              favorites={favorites}
              comparison={comparison}
              onToggleFavorite={toggleFavorite}
              onToggleComparison={toggleComparison}
            />

            <ResultsTable
              results={visibleResults}
              recommendations={recommendations}
            />
          </div>

          <div className="flex flex-col gap-4">
            <Heatmap
              groups={groupedByName}
              extensions={extensions}
            />
            <DomainStacks
              groups={groupedByName}
              recommendations={recommendations}
            />
            <GeneratedPanel
              generated={generated}
              transformed={transformationCandidates}
              onCheck={(names) => checkNames(names)}
            />
          </div>
        </section>

        <ComparisonShelf
          results={comparisonResults}
          recommendations={recommendations}
          onRemove={(domain) =>
            setComparison((current) => {
              const next = new Set(current);
              next.delete(domain);
              return next;
            })
          }
        />
      </section>
    </main>
  );
}

function ScorePanel({
  recommendation,
  results,
}: {
  recommendation?: Recommendation;
  results: DomainCheckResult[];
}) {
  const score = recommendation?.brandScore ?? 0;
  const available = results.filter((result) =>
    ["available_confirmed", "premium_available"].includes(result.status),
  ).length;
  const manual = results.filter((result) =>
    ["manual_check_required", "restricted", "unknown", "rate_limited"].includes(
      result.status,
    ),
  ).length;

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
            Brand Score
          </div>
          <h2 className="mt-2 text-2xl font-semibold">
            {recommendation?.name ?? "No run yet"}
          </h2>
        </div>
        <div className="rounded-md border border-[var(--line)] bg-white/[0.04] px-3 py-2 text-right">
          <div className="text-2xl font-bold text-[var(--accent)]">{score}</div>
          <div className="text-xs text-[var(--muted)]">/100</div>
        </div>
      </div>
      <div className="mt-4 flex h-44 items-center justify-center">
        <RadialBarChart
          width={260}
          height={176}
          innerRadius="68%"
          outerRadius="100%"
          data={[{ name: "score", value: score, fill: "var(--accent)" }]}
          startAngle={90}
          endAngle={-270}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar dataKey="value" cornerRadius={8} background />
          <Tooltip
            contentStyle={{
              background: "var(--panel-strong)",
              border: "1px solid var(--line)",
              borderRadius: 8,
              color: "var(--app-fg)",
            }}
          />
        </RadialBarChart>
      </div>
      <p className="min-h-11 text-sm leading-6 text-[var(--muted)]">
        {recommendation?.explanation ?? "Run a check to populate recommendations."}
      </p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["Checked", results.length],
          ["Open", available],
          ["Manual", manual],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-md border border-[var(--soft-line)] bg-white/[0.035] p-3"
          >
            <div className="text-lg font-bold">{value}</div>
            <div className="text-xs text-[var(--muted)]">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultCards({
  results,
  recommendations,
  favorites,
  comparison,
  onToggleFavorite,
  onToggleComparison,
}: {
  results: DomainCheckResult[];
  recommendations: Recommendation[];
  favorites: Set<string>;
  comparison: Set<string>;
  onToggleFavorite: (domain: string) => void;
  onToggleComparison: (domain: string) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-8 text-center text-sm text-[var(--muted)]">
        Ready for the first domain run.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {results.slice(0, 12).map((result) => {
        const recommendation = scoreForName(result.name, recommendations);

        return (
          <motion.article
            key={result.domain}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 shadow-[var(--shadow)] backdrop-blur"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-mono text-lg font-bold tracking-normal">
                  {result.domain}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <StatusBadge status={result.status} />
                  {recommendation && (
                    <span className="rounded-full border border-[var(--line)] px-2.5 py-1 text-xs font-semibold text-[var(--muted)]">
                      {recommendation.brandScore} score
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <IconButton
                  label="Favorite"
                  active={favorites.has(result.domain)}
                  onClick={() => onToggleFavorite(result.domain)}
                >
                  <Star
                    className={cn(
                      "h-4 w-4",
                      favorites.has(result.domain) && "fill-current",
                    )}
                  />
                </IconButton>
                <IconButton
                  label="Compare"
                  active={comparison.has(result.domain)}
                  onClick={() => onToggleComparison(result.domain)}
                >
                  <ChevronRight className="h-4 w-4" />
                </IconButton>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
              <div>
                <div className="text-xs text-[var(--muted)]">Provider</div>
                <div className="truncate font-semibold">{result.providerName}</div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)]">Price</div>
                <div className="font-semibold">
                  {result.priceRegistration
                    ? `${result.currency ?? ""} ${result.priceRegistration}`.trim()
                    : "-"}
                </div>
              </div>
              <div>
                <div className="text-xs text-[var(--muted)]">Checked</div>
                <div className="font-semibold">
                  {new Date(result.checkedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
            <div className="mt-4 border-t border-[var(--soft-line)] pt-3 text-sm leading-6 text-[var(--muted)]">
              {result.rawSummary}
            </div>
            {result.registrarUrl && (
              <a
                href={result.registrarUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)]"
              >
                Registrar action
                <ChevronRight className="h-4 w-4" />
              </a>
            )}
          </motion.article>
        );
      })}
    </div>
  );
}

function ResultsTable({
  results,
  recommendations,
}: {
  results: DomainCheckResult[];
  recommendations: Recommendation[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] backdrop-blur">
      <div className="studio-scrollbar overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="border-b border-[var(--line)] text-xs uppercase tracking-[0.14em] text-[var(--muted)]">
            <tr>
              {["Domain", "Status", "Confidence", "Score", "Provider", "Source", "Price", "Rules"].map(
                (header) => (
                  <th key={header} className="px-4 py-3 font-bold">
                    {header}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {results.map((result) => {
              const recommendation = scoreForName(result.name, recommendations);

              return (
                <tr key={result.domain} className="border-b border-[var(--soft-line)]">
                  <td className="px-4 py-3 font-mono font-semibold">{result.domain}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={result.status} />
                  </td>
                  <td className="px-4 py-3 font-semibold capitalize">
                    {result.confidence}
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {recommendation?.brandScore ?? "-"}
                  </td>
                  <td className="px-4 py-3">{result.providerName}</td>
                  <td className="max-w-[180px] truncate px-4 py-3 text-[var(--muted)]">
                    {result.source}
                  </td>
                  <td className="px-4 py-3">
                    {result.priceRegistration
                      ? `${result.currency ?? ""} ${result.priceRegistration}`.trim()
                      : "-"}
                  </td>
                  <td className="max-w-[260px] px-4 py-3 text-[var(--muted)]">
                    {result.rules.map((rule) => rule.label).join(", ") || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Heatmap({
  groups,
  extensions,
}: {
  groups: Map<string, DomainCheckResult[]>;
  extensions: string[];
}) {
  const names = Array.from(groups.keys()).slice(0, 8);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
          Extension Heatmap
        </h2>
        <Clock3 className="h-4 w-4 text-[var(--muted)]" />
      </div>
      <div className="studio-scrollbar overflow-x-auto">
        <div className="grid min-w-[420px] gap-2" style={{ gridTemplateColumns: `96px repeat(${extensions.length}, minmax(44px, 1fr))` }}>
          <div />
          {extensions.map((extension) => (
            <div key={extension} className="text-center text-xs font-bold text-[var(--muted)]">
              .{extension}
            </div>
          ))}
          {names.map((name) => (
            <div key={name} className="contents">
              <div className="truncate text-sm font-semibold">{name}</div>
              {extensions.map((extension) => {
                const result = groups
                  .get(name)
                  ?.find((item) => item.extension === extension);
                const heat = result
                  ? STATUS_META[result.status].heat
                  : "bg-white/[0.06]";

                return (
                  <div
                    key={`${name}.${extension}`}
                    title={result?.confidence ?? "not checked"}
                    className={cn("h-8 rounded border border-white/10", heat)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DomainStacks({
  groups,
  recommendations,
}: {
  groups: Map<string, DomainCheckResult[]>;
  recommendations: Recommendation[];
}) {
  const names = recommendations.slice(0, 5).map((item) => item.name);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 backdrop-blur">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
        Domain Stack
      </h2>
      <div className="flex flex-col gap-3">
        {(names.length ? names : Array.from(groups.keys()).slice(0, 4)).map((name) => {
          const stack = groups.get(name) ?? [];
          const recommendation = scoreForName(name, recommendations);

          return (
            <div key={name} className="border-b border-[var(--soft-line)] pb-3 last:border-b-0 last:pb-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="truncate font-semibold">{name}</span>
                <span className="text-xs font-bold text-[var(--accent)]">
                  {recommendation?.brandScore ?? "-"}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {stack.map((result) => (
                  <span
                    key={result.domain}
                    title={STATUS_META[result.status].label}
                    className={cn(
                      "rounded border px-2 py-1 text-xs font-bold",
                      STATUS_META[result.status].badge,
                    )}
                  >
                    .{result.extension}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GeneratedPanel({
  generated,
  transformed,
  onCheck,
}: {
  generated: GeneratedCandidate[];
  transformed: GeneratedCandidate[];
  onCheck: (names: string[]) => void;
}) {
  const visible = generated.length ? generated.slice(0, 12) : transformed.slice(0, 12);

  return (
    <div className="rounded-lg border border-[var(--line)] bg-[var(--panel)] p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-[0.18em] text-[var(--muted)]">
          Name Variants
        </h2>
        <IconButton
          label="Check variants"
          onClick={() => onCheck(visible.map((candidate) => candidate.name))}
        >
          <Sparkles className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1 studio-scrollbar">
        {visible.map((candidate) => (
          <button
            key={`${candidate.name}-${candidate.style}`}
            type="button"
            onClick={() => onCheck([candidate.name])}
            className="rounded-md border border-[var(--soft-line)] bg-white/[0.035] p-3 text-left transition hover:border-[var(--accent)]/55"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{candidate.name}</span>
              <span className="rounded-full bg-white/[0.06] px-2 py-1 text-xs text-[var(--muted)]">
                {candidate.style}
              </span>
            </div>
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
              {candidate.rationale}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ComparisonShelf({
  results,
  recommendations,
  onRemove,
}: {
  results: DomainCheckResult[];
  recommendations: Recommendation[];
  onRemove: (domain: string) => void;
}) {
  if (results.length === 0) {
    return null;
  }

  return (
    <div className="sticky bottom-4 z-20 rounded-lg border border-[var(--line)] bg-[var(--panel-strong)] p-3 shadow-[var(--shadow)] backdrop-blur">
      <div className="studio-scrollbar flex gap-3 overflow-x-auto">
        {results.map((result) => {
          const recommendation = scoreForName(result.name, recommendations);

          return (
            <div
              key={result.domain}
              className="min-w-[220px] rounded-md border border-[var(--soft-line)] bg-black/10 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-sm font-bold">{result.domain}</div>
                  <div className="mt-2">
                    <StatusBadge status={result.status} />
                  </div>
                </div>
                <button
                  aria-label="Remove comparison"
                  title="Remove comparison"
                  type="button"
                  onClick={() => onRemove(result.domain)}
                  className="text-[var(--muted)] hover:text-[var(--app-fg)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[var(--muted)]">Score</div>
                  <div className="font-bold">{recommendation?.brandScore ?? "-"}</div>
                </div>
                <div>
                  <div className="text-[var(--muted)]">Provider</div>
                  <div className="font-bold">{result.providerName}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
