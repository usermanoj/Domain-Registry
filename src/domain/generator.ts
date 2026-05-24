import { normalizeBaseName } from "./normalize";
import type { GeneratedCandidate, GenerationStyle } from "./types";

export const CANONICAL_GENERATION_STYLES: GenerationStyle[] = [
  "sanskrit_hindi",
  "spiritual",
  "enterprise",
  "bizarre_brandable",
  "ai_native",
  "agentic_automation",
  "data_analytics",
  "workflow_ops",
  "revenue_growth",
  "singapore_global",
];

const LEGACY_GENERATION_STYLES: GenerationStyle[] = [
  "sanskrit",
  "western",
  "bizarre",
  "short",
  "premium",
  "acronym",
  "compound",
  "synonym",
  "prefix_suffix",
];

export const ALL_GENERATION_STYLES: GenerationStyle[] = [
  ...CANONICAL_GENERATION_STYLES,
  ...LEGACY_GENERATION_STYLES,
];

export const DEFAULT_GENERATION_STYLES: GenerationStyle[] = [
  ...CANONICAL_GENERATION_STYLES,
];

export const GENERATION_STYLE_LABELS: Record<GenerationStyle, string> = {
  sanskrit_hindi: "Sanskrit/Hindi",
  spiritual: "Spiritual",
  enterprise: "Enterprise",
  bizarre_brandable: "Bizarre brandable",
  ai_native: "AI-native",
  agentic_automation: "Agentic automation",
  data_analytics: "Data/analytics",
  workflow_ops: "Workflow/ops",
  revenue_growth: "Revenue/growth",
  singapore_global: "Singapore/global",
  sanskrit: "Sanskrit/Hindi",
  western: "Enterprise",
  bizarre: "Bizarre brandable",
  short: "Short",
  premium: "Premium",
  acronym: "Acronym",
  compound: "Compound",
  synonym: "Synonym",
  prefix_suffix: "Prefix/suffix",
};

const STYLE_ALIASES: Record<string, GenerationStyle> = {
  sanskrit: "sanskrit_hindi",
  hindi: "sanskrit_hindi",
  sanskrit_hindi: "sanskrit_hindi",
  spiritual: "spiritual",
  enterprise: "enterprise",
  trusted_enterprise: "enterprise",
  western: "enterprise",
  bizarre: "bizarre_brandable",
  bizarre_brandable: "bizarre_brandable",
  brandable: "bizarre_brandable",
  ai: "ai_native",
  ai_native: "ai_native",
  ainative: "ai_native",
  agentic: "agentic_automation",
  agentic_automation: "agentic_automation",
  automation: "agentic_automation",
  data: "data_analytics",
  analytics: "data_analytics",
  data_analytics: "data_analytics",
  data_intelligence: "data_analytics",
  workflow: "workflow_ops",
  ops: "workflow_ops",
  workflow_ops: "workflow_ops",
  revenue: "revenue_growth",
  growth: "revenue_growth",
  revenue_growth: "revenue_growth",
  singapore: "singapore_global",
  global: "singapore_global",
  singapore_global: "singapore_global",
  sanskrit_wisdom: "sanskrit_hindi",
  short: "short",
  premium: "premium",
  acronym: "acronym",
  compound: "compound",
  synonym: "synonym",
  prefix_suffix: "prefix_suffix",
};

const ROOT_DICTIONARY = {
  trust: {
    aliases: ["trust", "assurance", "credible", "reliable", "faith"],
    roots: ["apta", "vishwas", "shraddha", "nishtha", "cred", "sure"],
  },
  honesty: {
    aliases: ["honesty", "integrity", "transparent", "clean"],
    roots: ["satya", "ritam", "niti", "dharma", "veri"],
  },
  truth: {
    aliases: ["truth", "true", "verified", "proof"],
    roots: ["satya", "ritam", "veri", "pramana"],
  },
  action: {
    aliases: ["action", "do", "execute", "task", "work"],
    roots: ["kriya", "karya", "karma", "kin", "drive"],
  },
  intelligence: {
    aliases: ["intelligence", "reasoning", "smart", "mind", "logic"],
    roots: ["medha", "vivek", "veda", "yukti", "tarka", "bodhi", "iq"],
  },
  evidence: {
    aliases: ["evidence", "proof", "signal", "validation"],
    roots: ["pramana", "signal", "metric", "audit"],
  },
  wisdom: {
    aliases: ["wisdom", "knowledge", "learn", "insight"],
    roots: ["medha", "vivek", "veda", "bodhi", "insight"],
  },
  data: {
    aliases: ["data", "analytics", "metric", "signal", "dashboard"],
    roots: ["veda", "datum", "metric", "signal", "graph", "pulse"],
  },
  automation: {
    aliases: ["automation", "agentic", "agent", "auto", "robot", "orchestrate"],
    roots: ["yantra", "doot", "agent", "auto", "pilot", "loop"],
  },
  revenue: {
    aliases: ["revenue", "growth", "sales", "profit", "value"],
    roots: ["artha", "yield", "gain", "rev", "grow", "value"],
  },
  flow: {
    aliases: ["flow", "stream", "pipeline", "process"],
    roots: ["pravah", "nadi", "dhara", "flow", "stream"],
  },
  efficiency: {
    aliases: ["efficiency", "efficient", "speed", "lean", "productive"],
    roots: ["daksha", "lean", "swift", "lift", "clear"],
  },
  governance: {
    aliases: ["rules", "rule", "governance", "policy", "control", "method"],
    roots: ["niti", "niyam", "dharma", "yukti", "tarka"],
  },
  light: {
    aliases: ["light", "energy", "spark", "life", "force"],
    roots: ["tejas", "ojas", "prana", "jyoti"],
  },
  singapore: {
    aliases: ["singapore", "sg", "global", "asia", "apac"],
    roots: ["sg", "strait", "lion", "axis", "global", "pacific"],
  },
} as const;

const STYLE_CATEGORY_MAP: Record<string, string[]> = {
  sanskrit_hindi: [
    "trust",
    "honesty",
    "truth",
    "action",
    "intelligence",
    "evidence",
    "wisdom",
    "flow",
    "governance",
    "light",
  ],
  spiritual: ["truth", "wisdom", "governance", "light", "flow"],
  enterprise: ["trust", "honesty", "intelligence", "governance", "efficiency"],
  bizarre_brandable: ["trust", "action", "intelligence", "flow", "light"],
  ai_native: ["intelligence", "data", "automation", "evidence"],
  agentic_automation: ["action", "automation", "flow", "efficiency"],
  data_analytics: ["data", "evidence", "intelligence"],
  workflow_ops: ["flow", "action", "automation", "efficiency"],
  revenue_growth: ["revenue", "efficiency", "data"],
  singapore_global: ["singapore", "trust", "governance"],
};

const TECH_SUFFIXES = ["nex", "iq", "ra", "va", "ora", "ava", "ex", "io", "q", "x", "vyn", "vanta"];
const AI_SUFFIXES = ["ai", "iq", "syn", "agent", "ops", "flow", "data"];
const ENTERPRISE_SUFFIXES = ["systems", "logic", "suite", "cloud", "signal", "works", "base"];
const SHORT_SUFFIXES = ["ra", "va", "io", "ai", "iq", "ex"];
const INVENTED_SYLLABLES = ["va", "ra", "na", "ta", "lo", "mi", "ki", "yo", "za", "vi", "sha", "dra"];
const FAMOUS_AI_BRANDS = [
  "openai",
  "chatgpt",
  "anthropic",
  "claude",
  "gemini",
  "deepmind",
  "perplexity",
  "mistral",
  "copilot",
  "midjourney",
  "huggingface",
  "characterai",
  "jasper",
  "grok",
];
const GENERIC_TERMS = new Set([
  "ai",
  "app",
  "agent",
  "agents",
  "automation",
  "business",
  "company",
  "data",
  "analytics",
  "growth",
  "ops",
  "platform",
  "revenue",
  "software",
  "solution",
  "studio",
  "system",
  "workflow",
]);
const OFFENSIVE_FRAGMENTS = ["fuck", "shit", "bitch", "cunt", "dick", "piss", "slut", "whore"];
const VOWELS = new Set(["a", "e", "i", "o", "u"]);

type GenerationOptions = {
  minLength: number;
  maxLength: number;
  allowedLetters?: string;
  avoidLetters?: string;
  mustInclude?: string;
  mustAvoid?: string;
  allowNumbersHyphens?: boolean;
  premiumMode?: boolean;
};

export type GenerateNameCandidateOptions = Partial<GenerationOptions> & {
  seed: string;
  limit?: number;
  styles?: GenerationStyle[];
};

export function parseSeedTerms(seed: string) {
  const directTerms = seed
    .split(/[,;\n]+/)
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  const expanded = directTerms.flatMap((term) => term.split(/\s+/));
  return Array.from(new Set([...directTerms, ...expanded])).slice(0, 48);
}

function styleKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeGenerationStyle(value: string) {
  return STYLE_ALIASES[styleKey(value)];
}

export function normalizeGenerationStyles(styles?: Array<GenerationStyle | string>) {
  const normalized = (styles?.length ? styles : DEFAULT_GENERATION_STYLES)
    .map((style) => normalizeGenerationStyle(style))
    .filter((style): style is GenerationStyle => Boolean(style));

  return Array.from(new Set(normalized)).slice(0, 16);
}

function compact(value: string) {
  return normalizeBaseName(value).replace(/-/g, "");
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(compact).filter(Boolean)));
}

function hash(value: string) {
  let result = 0;

  for (let index = 0; index < value.length; index += 1) {
    result = (result * 33 + value.charCodeAt(index)) >>> 0;
  }

  return result;
}

function rootsForCategory(category: string) {
  return ROOT_DICTIONARY[category as keyof typeof ROOT_DICTIONARY]?.roots ?? [];
}

function termMatchesCategory(term: string, category: keyof typeof ROOT_DICTIONARY) {
  const normalized = compact(term);
  const aliases = ROOT_DICTIONARY[category].aliases;

  return aliases.some((alias) => {
    const compactAlias = compact(alias);
    return normalized.includes(compactAlias) || compactAlias.includes(normalized);
  });
}

function rootsForTerm(term: string) {
  const roots: string[] = [];

  for (const category of Object.keys(ROOT_DICTIONARY) as Array<keyof typeof ROOT_DICTIONARY>) {
    if (termMatchesCategory(term, category)) {
      roots.push(...ROOT_DICTIONARY[category].roots);
    }
  }

  return roots;
}

function rootPool(seedTerms: string[], styles: GenerationStyle[]) {
  const matchedRoots = seedTerms.flatMap(rootsForTerm);
  const styleRoots = styles.flatMap((style) =>
    (STYLE_CATEGORY_MAP[style] ?? []).flatMap(rootsForCategory),
  );
  const baseTerms = seedTerms.map(compact);

  return unique([...matchedRoots, ...styleRoots, ...baseTerms]).slice(0, 80);
}

function removeVowels(value: string) {
  const name = compact(value);
  return [...name].filter((char, index) => index === 0 || !VOWELS.has(char)).join("");
}

function compressSyllables(value: string) {
  return compact(value)
    .replace(/(?:tion|sion)$/g, "x")
    .replace(/(?:ing|ment|ness|able|ible)$/g, "")
    .replace(/[aeiou]{2,}/g, (match) => match[0])
    .replace(/(.)\1+/g, "$1");
}

function blend(left: string, right: string, maxLength = 12) {
  const l = compact(left);
  const r = compact(right);

  if (!l && !r) {
    return "";
  }

  for (let size = Math.min(l.length, r.length, 4); size >= 2; size -= 1) {
    if (l.endsWith(r.slice(0, size))) {
      return `${l}${r.slice(size)}`.slice(0, maxLength);
    }
  }

  const candidate = `${l.slice(0, Math.ceil(l.length / 2))}${r.slice(Math.floor(r.length / 2))}`;
  return candidate.slice(0, maxLength);
}

function inventedWord(root: string, index: number, targetLength: number) {
  const clean = compact(root);
  const seed = hash(`${clean}:${index}`);
  const first = clean.slice(0, Math.min(3, clean.length));
  const middle = INVENTED_SYLLABLES[seed % INVENTED_SYLLABLES.length];
  const second = INVENTED_SYLLABLES[(seed >> 3) % INVENTED_SYLLABLES.length];
  const tail = clean.slice(-1);

  return `${first}${middle}${tail}${second}`.slice(0, targetLength);
}

function hasConsonantRun(name: string) {
  return /[bcdfghjklmnpqrstvwxyz]{4,}/.test(name);
}

function isHardToPronounce(name: string) {
  const vowels = [...name].filter((char) => VOWELS.has(char)).length;
  const vowelRatio = name.length ? vowels / name.length : 0;

  return (
    vowels === 0 ||
    vowelRatio < 0.18 ||
    vowelRatio > 0.78 ||
    hasConsonantRun(name) ||
    /(.)\1{2,}/.test(name) ||
    /q(?!u|a|e|i|o)/.test(name)
  );
}

function levenshteinWithin(left: string, right: string, maxDistance: number) {
  if (Math.abs(left.length - right.length) > maxDistance) {
    return false;
  }

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    let rowMin = current[0];

    for (let column = 1; column <= right.length; column += 1) {
      const cost = left[row - 1] === right[column - 1] ? 0 : 1;
      const value = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        previous[column - 1] + cost,
      );
      current[column] = value;
      rowMin = Math.min(rowMin, value);
    }

    if (rowMin > maxDistance) {
      return false;
    }

    for (let column = 0; column < current.length; column += 1) {
      previous[column] = current[column];
    }
  }

  return previous[right.length] <= maxDistance;
}

function isTooCloseToFamousAiBrand(name: string) {
  return FAMOUS_AI_BRANDS.some((brand) => {
    if (name === brand || name.includes(brand)) {
      return true;
    }

    return name.length >= 5 && levenshteinWithin(name, brand, 1);
  });
}

function isTooGeneric(name: string) {
  if (GENERIC_TERMS.has(name)) {
    return true;
  }

  const genericHits = [...GENERIC_TERMS].filter((term) => name.includes(term));
  return name.length >= 13 && genericHits.length >= 2;
}

function normalizeLetters(value?: string) {
  return compact(value ?? "");
}

function brandabilityIssue(name: string, options: GenerationOptions, premiumCandidate: boolean) {
  const allowedLetters = normalizeLetters(options.allowedLetters);
  const avoidLetters = normalizeLetters(options.avoidLetters);
  const mustInclude = compact(options.mustInclude ?? "");
  const mustAvoid = compact(options.mustAvoid ?? "");
  const maxLength = premiumCandidate || options.premiumMode
    ? options.maxLength
    : Math.min(options.maxLength, 12);

  if (name.length < options.minLength || name.length > maxLength) {
    return "length";
  }

  if (!options.allowNumbersHyphens && /[-0-9]/.test(name)) {
    return "numbers_or_hyphens";
  }

  if (allowedLetters) {
    const allowed = new Set([...allowedLetters]);
    if ([...name].some((char) => !allowed.has(char))) {
      return "outside_allowed_letters";
    }
  }

  if (avoidLetters && [...name].some((char) => avoidLetters.includes(char))) {
    return "avoid_letters";
  }

  if (mustInclude && !name.includes(mustInclude)) {
    return "missing_required_text";
  }

  if (mustAvoid && name.includes(mustAvoid)) {
    return "contains_avoided_text";
  }

  if (OFFENSIVE_FRAGMENTS.some((fragment) => name.includes(fragment))) {
    return "offensive";
  }

  if (isTooCloseToFamousAiBrand(name)) {
    return "famous_ai_brand";
  }

  if (isTooGeneric(name)) {
    return "too_generic";
  }

  if (isHardToPronounce(name)) {
    return "pronunciation";
  }

  return null;
}

function pushCandidate(
  candidates: GeneratedCandidate[],
  seen: Set<string>,
  name: string,
  style: GeneratedCandidate["style"],
  rationale: string,
  options: GenerationOptions,
  method: string,
  tags: string[] = [],
) {
  const normalized = compact(name);
  const premiumCandidate = style === "premium" || tags.includes("premium");

  if (!normalized || seen.has(normalized)) {
    return;
  }

  if (brandabilityIssue(normalized, options, premiumCandidate)) {
    return;
  }

  seen.add(normalized);
  candidates.push({
    name: normalized,
    style,
    rationale,
    method,
    tags,
  });
}

function normalizedGenerationOptions(options: GenerateNameCandidateOptions): GenerationOptions {
  const minLength = Math.max(3, Math.min(20, options.minLength ?? 4));
  const maxLength = Math.max(minLength, Math.min(24, options.maxLength ?? 12));
  const styles = normalizeGenerationStyles(options.styles);

  return {
    minLength,
    maxLength,
    allowedLetters: options.allowedLetters,
    avoidLetters: options.avoidLetters,
    mustInclude: options.mustInclude,
    mustAvoid: options.mustAvoid,
    allowNumbersHyphens: options.allowNumbersHyphens ?? false,
    premiumMode: styles.includes("premium") || maxLength > 12,
  };
}

function addRootSuffixes(
  candidates: GeneratedCandidate[],
  seen: Set<string>,
  roots: string[],
  suffixes: string[],
  style: GeneratedCandidate["style"],
  rationale: string,
  options: GenerationOptions,
  method: string,
  count = 24,
) {
  let emitted = 0;

  for (const root of roots) {
    for (const suffix of suffixes) {
      pushCandidate(candidates, seen, `${root}${suffix}`, style, rationale, options, method);
      emitted += 1;

      if (emitted >= count) {
        return;
      }
    }
  }
}

function diversifyCandidates(candidates: GeneratedCandidate[], limit: number) {
  const buckets = new Map<string, GeneratedCandidate[]>();
  const styleOrder: string[] = [];

  for (const candidate of candidates) {
    const key = candidate.style;

    if (!buckets.has(key)) {
      buckets.set(key, []);
      styleOrder.push(key);
    }

    buckets.get(key)?.push(candidate);
  }

  const diversified: GeneratedCandidate[] = [];

  while (diversified.length < limit && styleOrder.some((style) => (buckets.get(style)?.length ?? 0) > 0)) {
    for (const style of styleOrder) {
      const bucket = buckets.get(style);
      const next = bucket?.shift();

      if (next) {
        diversified.push(next);
      }

      if (diversified.length >= limit) {
        break;
      }
    }
  }

  return diversified;
}

export function generateNameCandidates(options: GenerateNameCandidateOptions) {
  const seedTerms = parseSeedTerms(options.seed);
  const activeStyles = normalizeGenerationStyles(options.styles);
  const generationOptions = normalizedGenerationOptions(options);
  const limit = Math.max(1, Math.min(300, options.limit ?? 80));
  const baseTerms = unique(seedTerms);
  const roots = rootPool(seedTerms, activeStyles);
  const primary = roots[0] ?? baseTerms[0] ?? "apta";
  const secondary = roots.find((root) => root !== primary) ?? baseTerms[1] ?? "flow";
  const candidates: GeneratedCandidate[] = [];
  const seen = new Set<string>();

  if (activeStyles.includes("sanskrit_hindi")) {
    const indicRoots = unique([
      ...rootsForCategory("truth"),
      ...rootsForCategory("trust"),
      ...rootsForCategory("action"),
      ...rootsForCategory("intelligence"),
      ...rootsForCategory("wisdom"),
      ...rootsForCategory("flow"),
      ...roots,
    ]);

    addRootSuffixes(
      candidates,
      seen,
      indicRoots,
      ["flow", "logic", "ai", "ops", "nex", "va"],
      "sanskrit_hindi",
      "Uses local Sanskrit/Hindi roots for trust, action, wisdom, and flow.",
      generationOptions,
      "synonym_expansion",
      60,
    );
  }

  if (activeStyles.includes("spiritual")) {
    addRootSuffixes(
      candidates,
      seen,
      unique([...rootsForCategory("light"), ...rootsForCategory("governance"), ...rootsForCategory("wisdom")]),
      ["flow", "mind", "ops", "nex", "labs"],
      "spiritual",
      "Carries spiritual depth through dharma, prana, tejas, ojas, or wisdom roots.",
      generationOptions,
      "synonym_expansion",
      24,
    );
  }

  if (activeStyles.includes("enterprise")) {
    addRootSuffixes(
      candidates,
      seen,
      unique([...roots, primary, secondary]),
      ENTERPRISE_SUFFIXES,
      "enterprise",
      "Adds a conservative enterprise suffix for credibility and procurement fit.",
      generationOptions,
      "tech_suffix",
      36,
    );
  }

  if (activeStyles.includes("bizarre_brandable")) {
    for (const [index, root] of roots.slice(0, 14).entries()) {
      pushCandidate(
        candidates,
        seen,
        `${root.slice(0, 3)}${INVENTED_SYLLABLES[index % INVENTED_SYLLABLES.length]}${TECH_SUFFIXES[(index + 3) % TECH_SUFFIXES.length]}`,
        "bizarre_brandable",
        "Invented, slightly unusual construction kept pronounceable by vowel-consonant balance.",
        generationOptions,
        "invented_word",
      );
      pushCandidate(
        candidates,
        seen,
        inventedWord(root, index, 8),
        "bizarre_brandable",
        "Pronounceable invented 5-8 letter variant.",
        generationOptions,
        "invented_word",
      );
    }
  }

  if (activeStyles.includes("ai_native")) {
    addRootSuffixes(
      candidates,
      seen,
      unique([...rootsForCategory("intelligence"), ...rootsForCategory("data"), ...roots]),
      AI_SUFFIXES,
      "ai_native",
      "Uses AI-native suffixes such as ai, syn, agent, ops, flow, and data.",
      generationOptions,
      "ai_suffix",
      42,
    );
  }

  if (activeStyles.includes("agentic_automation")) {
    addRootSuffixes(
      candidates,
      seen,
      unique([...rootsForCategory("automation"), ...rootsForCategory("action"), ...rootsForCategory("flow"), ...roots]),
      ["agent", "ops", "flow", "loop", "pilot", "auto"],
      "agentic_automation",
      "Positions the name around autonomous agents, orchestration, and execution.",
      generationOptions,
      "ai_suffix",
      36,
    );
  }

  if (activeStyles.includes("data_analytics")) {
    addRootSuffixes(
      candidates,
      seen,
      unique([...rootsForCategory("data"), ...rootsForCategory("evidence"), ...rootsForCategory("intelligence"), ...roots]),
      ["data", "metric", "graph", "signal", "iq", "lens"],
      "data_analytics",
      "Connects data, evidence, analytics, signal, and intelligence cues.",
      generationOptions,
      "synonym_expansion",
      36,
    );
  }

  if (activeStyles.includes("workflow_ops")) {
    addRootSuffixes(
      candidates,
      seen,
      unique([...rootsForCategory("flow"), ...rootsForCategory("efficiency"), ...rootsForCategory("automation"), ...roots]),
      ["flow", "ops", "loop", "grid", "run", "works"],
      "workflow_ops",
      "Emphasizes workflow, operations, flow, and efficiency.",
      generationOptions,
      "synonym_expansion",
      36,
    );
  }

  if (activeStyles.includes("revenue_growth")) {
    addRootSuffixes(
      candidates,
      seen,
      unique([...rootsForCategory("revenue"), ...rootsForCategory("efficiency"), ...roots]),
      ["grow", "yield", "gain", "flow", "iq", "ops"],
      "revenue_growth",
      "Signals revenue, growth, yield, and operating leverage.",
      generationOptions,
      "synonym_expansion",
      36,
    );
  }

  if (activeStyles.includes("singapore_global")) {
    addRootSuffixes(
      candidates,
      seen,
      unique([...rootsForCategory("singapore"), ...rootsForCategory("trust"), ...roots]),
      ["global", "axis", "flow", "logic", "sg", "nex"],
      "singapore_global",
      "Blends Singapore/APAC orientation with global enterprise naming.",
      generationOptions,
      "synonym_expansion",
      30,
    );
  }

  if (activeStyles.includes("acronym")) {
    const acronym = seedTerms
      .slice(0, 5)
      .map((term) => compact(term)[0])
      .filter(Boolean)
      .join("");

    pushCandidate(candidates, seen, `${acronym}ai`, "acronym", "Compact acronym with an AI suffix.", generationOptions, "acronym");
    pushCandidate(candidates, seen, `${acronym}ops`, "acronym", "Compact acronym with an ops suffix.", generationOptions, "acronym");
  }

  for (let index = 0; index < roots.length; index += 1) {
    const root = roots[index];
    const next = roots[(index + 1) % roots.length] ?? secondary;

    pushCandidate(
      candidates,
      seen,
      `${removeVowels(root)}${SHORT_SUFFIXES[index % SHORT_SUFFIXES.length]}`,
      "transformation",
      "Removes vowels, then restores brandability with a compact tech suffix.",
      generationOptions,
      "remove_vowels",
    );
    pushCandidate(
      candidates,
      seen,
      `${compressSyllables(root)}${TECH_SUFFIXES[index % TECH_SUFFIXES.length]}`,
      "transformation",
      "Compresses syllables and adds a tech suffix.",
      generationOptions,
      "compress_syllables",
    );
    pushCandidate(
      candidates,
      seen,
      blend(root, next, 8),
      "short",
      "Creates a 5-8 letter blended variant for memorability.",
      generationOptions,
      "short_variant",
    );
    pushCandidate(
      candidates,
      seen,
      `${blend(root, next, 8)}${TECH_SUFFIXES[(index + 5) % TECH_SUFFIXES.length]}`.slice(0, 12),
      "premium",
      "Creates an 8-12 letter premium-style variant.",
      generationOptions,
      "premium_variant",
      ["premium"],
    );

    if (candidates.length >= limit * 2) {
      break;
    }
  }

  for (const term of baseTerms.slice(0, 12)) {
    pushCandidate(
      candidates,
      seen,
      term,
      "compound",
      "Original seed term normalized after brandability filtering.",
      generationOptions,
      "seed_term",
    );
  }

  pushCandidate(
    candidates,
    seen,
    blend(primary, secondary, 10),
    "compound",
    "Blends the two strongest root signals from the seed set.",
    generationOptions,
    "blend_two_roots",
  );

  return {
    seedTerms,
    candidates: diversifyCandidates(candidates, limit),
  };
}

export function transformName(input: string): GeneratedCandidate[] {
  const name = compact(input);
  const candidates: GeneratedCandidate[] = [];
  const seen = new Set<string>();
  const options: GenerationOptions = {
    minLength: 3,
    maxLength: 16,
    allowNumbersHyphens: false,
    premiumMode: true,
  };

  if (!name) {
    return candidates;
  }

  pushCandidate(candidates, seen, name.slice(0, 8), "transformation", "Shorter form.", options, "short_variant");
  pushCandidate(candidates, seen, `${removeVowels(name)}ai`, "transformation", "Vowel removal with AI suffix.", options, "remove_vowels");
  pushCandidate(candidates, seen, `${compressSyllables(name)}nex`, "transformation", "Compressed syllable form with tech suffix.", options, "compress_syllables");
  pushCandidate(candidates, seen, `${name}labs`, "enterprise", "Longer enterprise form.", options, "tech_suffix");
  pushCandidate(candidates, seen, name.replace(/c/g, "k"), "transformation", "Phonetic variant.", options, "phonetic_variant");
  pushCandidate(candidates, seen, `satya${name}`.slice(0, 13), "sanskrit_hindi", "Sanskrit-root trust variant.", options, "synonym_expansion");
  pushCandidate(candidates, seen, `${name}dharma`.slice(0, 13), "spiritual", "Integrity-root variant.", options, "synonym_expansion");
  pushCandidate(candidates, seen, `${name}ai`, "ai_native", "AI suffix variant.", options, "ai_suffix");
  pushCandidate(candidates, seen, `${name}agent`, "agentic_automation", "Agent suffix variant.", options, "ai_suffix");
  pushCandidate(candidates, seen, `${name}flow`, "workflow_ops", "Flow suffix variant.", options, "ai_suffix");
  pushCandidate(candidates, seen, `${name}ops`, "workflow_ops", "Operations suffix variant.", options, "ai_suffix");
  pushCandidate(candidates, seen, `${name}s`, "transformation", "Plural form.", options, "plural_variant");
  pushCandidate(
    candidates,
    seen,
    name.endsWith("s") ? name.slice(0, -1) : `${name}x`,
    "bizarre_brandable",
    "Brandable misspelling.",
    options,
    "invented_word",
  );

  return candidates;
}
