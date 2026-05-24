import { normalizeBaseName } from "./normalize";
import type { GeneratedCandidate, GenerationStyle } from "./types";

export const DEFAULT_GENERATION_STYLES: GenerationStyle[] = [
  "sanskrit",
  "western",
  "bizarre",
  "enterprise",
  "short",
  "premium",
  "acronym",
  "compound",
  "synonym",
  "prefix_suffix",
];

const SANSKRIT_ROOTS = [
  ["trust", "satya"],
  ["truth", "satya"],
  ["action", "karma"],
  ["data", "veda"],
  ["knowledge", "veda"],
  ["flow", "nadi"],
  ["revenue", "artha"],
  ["efficiency", "daksha"],
  ["automation", "yantra"],
  ["agent", "doot"],
  ["integrity", "dharma"],
  ["ai", "bodhi"],
];

const SYNONYMS = new Map<string, string[]>([
  ["trust", ["assure", "cred", "veri", "sure"]],
  ["action", ["move", "act", "kin", "drive"]],
  ["data", ["signal", "metric", "datum", "pulse"]],
  ["automation", ["auto", "flow", "ops", "loop"]],
  ["revenue", ["yield", "earn", "value", "gain"]],
  ["efficiency", ["swift", "lean", "clear", "lift"]],
  ["agentic", ["agent", "pilot", "copilot", "crew"]],
  ["ai", ["ai", "neural", "cog", "mind"]],
]);

const PREFIXES = ["nova", "mono", "hyper", "clear", "true", "bright", "nexa"];
const SUFFIXES = ["flow", "ops", "grid", "base", "mind", "agent", "labs", "works"];

export function parseSeedTerms(seed: string) {
  const directTerms = seed
    .split(/[,;\n]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const expanded = directTerms.flatMap((term) => term.split(/\s+/));
  return Array.from(new Set([...directTerms, ...expanded])).slice(0, 32);
}

function compact(value: string) {
  return normalizeBaseName(value).replace(/-/g, "");
}

function blend(left: string, right: string, maxLength = 12) {
  const l = compact(left);
  const r = compact(right);

  if (!l && !r) {
    return "";
  }

  const candidate = `${l.slice(0, Math.ceil(l.length / 2))}${r.slice(Math.floor(r.length / 2))}`;
  return candidate.slice(0, maxLength);
}

function pushCandidate(
  candidates: GeneratedCandidate[],
  seen: Set<string>,
  name: string,
  style: GeneratedCandidate["style"],
  rationale: string,
) {
  const normalized = compact(name);

  if (normalized.length < 3 || seen.has(normalized)) {
    return;
  }

  seen.add(normalized);
  candidates.push({ name: normalized, style, rationale });
}

export function generateNameCandidates({
  seed,
  limit = 80,
  styles = DEFAULT_GENERATION_STYLES,
}: {
  seed: string;
  limit?: number;
  styles?: GenerationStyle[];
}) {
  const seedTerms = parseSeedTerms(seed);
  const baseTerms = seedTerms.map(compact).filter(Boolean);
  const candidates: GeneratedCandidate[] = [];
  const seen = new Set<string>();
  const first = baseTerms[0] ?? "domain";
  const second = baseTerms[1] ?? "studio";

  if (styles.includes("sanskrit")) {
    for (const term of seedTerms) {
      const root = SANSKRIT_ROOTS.find(([key]) => term.includes(key))?.[1];

      if (root) {
        pushCandidate(
          candidates,
          seen,
          `${root}${second}`,
          "sanskrit",
          `Uses ${root} as an Indic-root signal for ${term}.`,
        );
        pushCandidate(
          candidates,
          seen,
          `${root}${SUFFIXES[baseTerms.length % SUFFIXES.length]}`,
          "sanskrit",
          `Pairs an Indic-root cue with an operating suffix.`,
        );
      }
    }
  }

  if (styles.includes("western")) {
    for (const suffix of ["labs", "works", "base", "hq"]) {
      pushCandidate(
        candidates,
        seen,
        `${first}${suffix}`,
        "western",
        "Clean Western technology naming pattern.",
      );
    }
  }

  if (styles.includes("bizarre")) {
    for (const term of baseTerms.slice(0, 5)) {
      pushCandidate(
        candidates,
        seen,
        `${term.slice(0, 3)}xo${term.slice(-2)}a`,
        "bizarre",
        "Odd but pronounceable brandable construction.",
      );
      pushCandidate(
        candidates,
        seen,
        `${term.slice(0, 2)}vanta`,
        "bizarre",
        "Bizarre brandable variant with enterprise cadence.",
      );
    }
  }

  if (styles.includes("enterprise")) {
    for (const suffix of ["systems", "logic", "suite", "cloud", "signal"]) {
      pushCandidate(
        candidates,
        seen,
        `${first}${suffix}`,
        "enterprise",
        "Conservative enterprise-grade naming pattern.",
      );
    }
  }

  if (styles.includes("short")) {
    for (let index = 0; index < baseTerms.length; index += 1) {
      const left = baseTerms[index];
      const right = baseTerms[(index + 1) % baseTerms.length] ?? second;
      pushCandidate(
        candidates,
        seen,
        blend(left, right, 8),
        "short",
        "Short 5-8 letter blend for memorability.",
      );
    }
  }

  if (styles.includes("premium")) {
    for (const prefix of ["apt", "ora", "ver", "kin", "nex"]) {
      pushCandidate(
        candidates,
        seen,
        `${prefix}${blend(first, second, 8)}`.slice(0, 12),
        "premium",
        "Premium 8-12 letter construction with broad brand range.",
      );
    }
  }

  if (styles.includes("acronym")) {
    const acronym = seedTerms
      .slice(0, 5)
      .map((term) => term[0])
      .join("");
    pushCandidate(
      candidates,
      seen,
      `${acronym}ai`,
      "acronym",
      "Acronym style for compact enterprise shorthand.",
    );
    pushCandidate(
      candidates,
      seen,
      `${acronym}ops`,
      "acronym",
      "Acronym style with operations suffix.",
    );
  }

  if (styles.includes("compound")) {
    for (const suffix of SUFFIXES.slice(0, 6)) {
      pushCandidate(
        candidates,
        seen,
        `${first}${suffix}`,
        "compound",
        "Compound style that makes the category legible.",
      );
    }
  }

  if (styles.includes("synonym")) {
    for (const term of seedTerms) {
      const synonyms = SYNONYMS.get(term) ?? [];
      for (const synonym of synonyms) {
        pushCandidate(
          candidates,
          seen,
          `${synonym}${second}`,
          "synonym",
          `Synonym-driven variant for ${term}.`,
        );
      }
    }
  }

  if (styles.includes("prefix_suffix")) {
    for (let index = 0; index < Math.min(6, baseTerms.length || 1); index += 1) {
      const term = baseTerms[index] ?? first;
      pushCandidate(
        candidates,
        seen,
        `${PREFIXES[index % PREFIXES.length]}${term}`.slice(0, 13),
        "prefix_suffix",
        "Prefix variant for a stronger invented brand signal.",
      );
      pushCandidate(
        candidates,
        seen,
        `${term}${SUFFIXES[index % SUFFIXES.length]}`.slice(0, 13),
        "prefix_suffix",
        "Suffix variant for clearer category positioning.",
      );
    }
  }

  for (const term of baseTerms) {
    pushCandidate(candidates, seen, term, "compound", "Original seed term normalized.");
  }

  return {
    seedTerms,
    candidates: candidates.slice(0, limit),
  };
}

export function transformName(input: string): GeneratedCandidate[] {
  const name = compact(input);
  const candidates: GeneratedCandidate[] = [];
  const seen = new Set<string>();

  if (!name) {
    return candidates;
  }

  pushCandidate(candidates, seen, name.slice(0, 8), "transformation", "Shorter form.");
  pushCandidate(candidates, seen, `${name}labs`, "transformation", "Longer enterprise form.");
  pushCandidate(candidates, seen, `${name.replace(/c/g, "k")}`, "transformation", "Phonetic variant.");
  pushCandidate(candidates, seen, `satya${name}`.slice(0, 13), "transformation", "Sanskrit-root trust variant.");
  pushCandidate(candidates, seen, `${name}dharma`.slice(0, 13), "transformation", "Integrity-root variant.");
  pushCandidate(candidates, seen, `${name}ai`, "transformation", "AI suffix variant.");
  pushCandidate(candidates, seen, `${name}agent`, "transformation", "Agent suffix variant.");
  pushCandidate(candidates, seen, `${name}flow`, "transformation", "Flow suffix variant.");
  pushCandidate(candidates, seen, `${name}ops`, "transformation", "Operations suffix variant.");
  pushCandidate(candidates, seen, `${name}s`, "transformation", "Plural form.");
  pushCandidate(candidates, seen, name.endsWith("s") ? name.slice(0, -1) : `${name}x`, "transformation", "Brandable misspelling.");

  return candidates;
}
