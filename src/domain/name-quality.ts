import { normalizeBaseName } from "./normalize";

const STRONG_SUFFIXES = [
  "base",
  "hub",
  "hq",
  "forge",
  "pilot",
  "suite",
  "stack",
  "labs",
  "vault",
  "signal",
  "flow",
  "insight",
  "analytics",
  "crm",
  "sales",
  "finance",
  "security",
  "market",
  "growth",
  "platform",
  "studio",
];

const ACTION_PREFIXES = [
  "ask",
  "run",
  "use",
  "get",
  "go",
  "try",
  "join",
  "build",
  "scale",
  "secure",
  "smart",
  "trusted",
  "modern",
];

const NOISY_TERMS = new Set(["ops", "cloud", "grid", "works", "command", "control", "engine"]);
const RESTRICTED_DUPLICATE_TERMS = ["ai", "app", "dev", "tech", "io", "co", "com"];
const STRONG_ENDINGS = new Set([
  "base",
  "hub",
  "hq",
  "forge",
  "pilot",
  "suite",
  "stack",
  "labs",
  "vault",
  "signal",
  "flow",
  "insight",
]);

const SEMANTIC_FAMILIES: Record<string, { roots: string[]; curated: string[] }> = {
  agent: {
    roots: ["operator", "assistant", "autopilot", "workflow", "task", "action"],
    curated: [
      "operatorbase",
      "operatorhub",
      "operatorpilot",
      "assistantbase",
      "assistantforge",
      "assistantsuite",
      "autopilotbase",
      "autopilothq",
      "taskpilot",
      "actionforge",
      "workflowpilot",
      "workflowbase",
    ],
  },
  data: {
    roots: ["signal", "metric", "insight", "query", "atlas", "vault", "graph", "stream"],
    curated: [
      "datasignal",
      "dataforge",
      "datavault",
      "datahub",
      "metricbase",
      "signalbase",
      "insightforge",
      "queryhub",
      "atlasdata",
      "graphpilot",
      "streamforge",
      "vaultdata",
    ],
  },
  enterprise: {
    roots: ["business", "company", "scale", "trust", "govern", "venture", "workforce"],
    curated: [
      "enterprisebase",
      "enterprisehub",
      "enterprisesuite",
      "enterpriseforge",
      "enterprisepilot",
      "enterprisestack",
      "businessbase",
      "businessforge",
      "scalehub",
      "trustsuite",
      "governhub",
      "venturebase",
    ],
  },
};

const FAMOUS_AI_BRANDS = [
  "openai",
  "chatgpt",
  "anthropic",
  "claude",
  "gemini",
  "deepmind",
  "perplexity",
  "mistral",
  "midjourney",
  "huggingface",
];
const HARD_FILLER_TERMS = new Set([
  "ops",
  "cloud",
  "grid",
  "works",
  "command",
  "control",
  "engine",
  "hq",
]);
const SOFT_FILLER_TERMS = new Set(["base", "hub", "labs", "suite", "stack", "studio"]);
const LOW_VALUE_ACTION_PREFIXES = new Set(["go", "try", "join", "use", "get"]);
const OFFENSIVE_FRAGMENTS = ["fuck", "shit", "bitch", "cunt", "dick", "piss", "slut", "whore"];
const QUALITY_FRAGMENTS = [
  ...STRONG_SUFFIXES,
  ...ACTION_PREFIXES,
  "agent",
  "operator",
  "assistant",
  "autopilot",
  "workflow",
  "task",
  "action",
  "data",
  "metric",
  "query",
  "atlas",
  "graph",
  "stream",
  "business",
  "company",
  "scale",
  "trust",
  "govern",
  "venture",
  "workforce",
  "sales",
  "revenue",
  "pipeline",
  "deal",
  "seller",
  "customer",
  "developer",
  "code",
  "deploy",
  "api",
  "ship",
  "platform",
  "strait",
  "ledger",
  "finance",
  "account",
  "audit",
  "local",
  "security",
  "secure",
  "risk",
  "guard",
  "shield",
  "cyber",
  "process",
  "loop",
  "automate",
  "orchestrate",
].sort((left, right) => right.length - left.length);

export type NameQualityFamily =
  | "curated"
  | "semantic_compound"
  | "keyword_compound"
  | "verb_noun"
  | "invented_brandable"
  | "two_morpheme"
  | "weak";

export type NameQualityAssessmentOptions = {
  extension?: string;
  intentRoots?: string[];
  curatedNames?: string[];
  method?: string;
  maxMorphemes?: number;
  allowFillerTerms?: boolean;
  mustIncludeSeed?: boolean;
};

export type NameQualityAssessment = {
  name: string;
  accepted: boolean;
  score: number;
  family: NameQualityFamily;
  morphemeCount: number;
  reasons: string[];
  rejectionReasons: string[];
  warnings: string[];
};

function compactName(value: string) {
  return normalizeBaseName(value).replace(/-/g, "");
}

function detectFamilies(base: string) {
  return Object.entries(SEMANTIC_FAMILIES)
    .filter(([key]) => base === key || base.includes(key))
    .map(([key, value]) => ({ key, ...value }));
}

function countVowels(value: string) {
  return [...value].filter((char) => "aeiou".includes(char)).length;
}

function hasAwkwardRuns(value: string) {
  return /(.)\1{2,}/.test(value) || /[bcdfghjklmnpqrstvwxyz]{5,}/.test(value);
}

function duplicateExtensionPenalty(name: string, extension?: string) {
  const normalizedExtension = compactName(extension ?? "");

  if (!normalizedExtension) return 0;
  if (name.endsWith(normalizedExtension)) return 18;
  if (normalizedExtension === "ai" && name.endsWith("ai")) return 18;

  return 0;
}

function containsFamousBrand(name: string) {
  return FAMOUS_AI_BRANDS.some((brand) => name === brand || name.includes(brand));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function containsFragment(name: string, fragment: string) {
  if (fragment.length <= 3) {
    return name === fragment || name.startsWith(fragment) || name.endsWith(fragment);
  }

  return name.includes(fragment);
}

function fragmentHits(name: string, fragments: Iterable<string>, seed = "") {
  return Array.from(fragments).filter(
    (fragment) => !seed.includes(fragment) && containsFragment(name, fragment),
  );
}

function lowValueActionPrefix(name: string) {
  for (const prefix of LOW_VALUE_ACTION_PREFIXES) {
    if (!name.startsWith(prefix)) {
      continue;
    }

    const rest = name.slice(prefix.length);

    if (rest.length >= 4 && QUALITY_FRAGMENTS.some((fragment) => rest.startsWith(fragment))) {
      return prefix;
    }
  }

  return "";
}

function spansOverlap(
  left: { start: number; end: number },
  right: { start: number; end: number },
) {
  return left.start < right.end && right.start < left.end;
}

function matchingFragmentSpans(name: string, extraFragments: string[] = []) {
  const fragments = Array.from(new Set([...extraFragments, ...QUALITY_FRAGMENTS]))
    .filter((fragment) => fragment.length >= 3)
    .sort((left, right) => right.length - left.length);
  const spans: Array<{ fragment: string; start: number; end: number }> = [];

  for (const fragment of fragments) {
    let start = name.indexOf(fragment);

    while (start >= 0) {
      const span = { fragment, start, end: start + fragment.length };

      if (!spans.some((existing) => spansOverlap(existing, span))) {
        spans.push(span);
      }

      start = name.indexOf(fragment, start + 1);
    }
  }

  return spans.sort((left, right) => left.start - right.start);
}

function estimateMorphemeCount(name: string, extraFragments: string[] = []) {
  const spans = matchingFragmentSpans(name, extraFragments);

  if (spans.length === 0) {
    return name.length <= 8 ? 1 : 2;
  }

  return spans.length;
}

function hasRepeatedMeaningfulFragment(name: string, extraFragments: string[] = []) {
  const fragments = Array.from(new Set([...extraFragments, ...QUALITY_FRAGMENTS]))
    .filter((fragment) => fragment.length >= 4)
    .sort((left, right) => right.length - left.length);

  return fragments.some((fragment) => {
    const first = name.indexOf(fragment);

    return first >= 0 && name.indexOf(fragment, first + fragment.length) >= 0;
  });
}

function qualityFamily({
  name,
  seed,
  method,
  morphemeCount,
  intentRoots,
  curatedNames,
}: {
  name: string;
  seed: string;
  method: string;
  morphemeCount: number;
  intentRoots: string[];
  curatedNames: string[];
}): NameQualityFamily {
  if (curatedNames.includes(name)) return "curated";
  if (method === "action" || ACTION_PREFIXES.some((prefix) => name.startsWith(prefix))) {
    return "verb_noun";
  }
  if (seed && name.includes(seed)) return "keyword_compound";
  if (intentRoots.some((root) => root && name.includes(root))) return "semantic_compound";
  if (method === "brandable" || morphemeCount <= 1) return "invented_brandable";
  if (morphemeCount <= 2) return "two_morpheme";

  return "weak";
}

export function assessNameQuality(
  seedName: string,
  candidateName: string,
  options: NameQualityAssessmentOptions = {},
): NameQualityAssessment {
  const seed = compactName(seedName);
  const name = compactName(candidateName);
  const intentRoots = Array.from(
    new Set([seed, ...(options.intentRoots ?? [])].map(compactName).filter(Boolean)),
  );
  const curatedNames = (options.curatedNames ?? []).map(compactName);
  const method = options.method ?? "";
  const maxMorphemes = options.maxMorphemes ?? 2;
  const rejectionReasons: string[] = [];
  const warnings: string[] = [];
  const reasons: string[] = [];

  if (!name) {
    rejectionReasons.push("empty");
  }

  if (seed && name === seed) {
    rejectionReasons.push("exact_seed");
  }

  if (name.length < 5) {
    rejectionReasons.push("too_short");
  }

  if (name.length > 16) {
    rejectionReasons.push("too_long");
  } else if (name.length > 12) {
    warnings.push("longer_than_premium_default");
  }

  if (containsFamousBrand(name)) {
    rejectionReasons.push("famous_brand_conflict");
  }

  if (OFFENSIVE_FRAGMENTS.some((fragment) => name.includes(fragment))) {
    rejectionReasons.push("offensive_fragment");
  }

  if (hasAwkwardRuns(name)) {
    rejectionReasons.push("awkward_pronunciation");
  }

  if (options.mustIncludeSeed && seed && !name.includes(seed)) {
    rejectionReasons.push("missing_required_seed");
  }

  const hardFillerHits = fragmentHits(name, HARD_FILLER_TERMS, seed);
  const softFillerHits = fragmentHits(name, SOFT_FILLER_TERMS, seed);
  const lowAction = lowValueActionPrefix(name);

  if (!options.allowFillerTerms && hardFillerHits.length > 0) {
    rejectionReasons.push(`overused_filler:${hardFillerHits.join(",")}`);
  }

  if (lowAction) {
    rejectionReasons.push(`weak_action_prefix:${lowAction}`);
  }

  const morphemeCount = estimateMorphemeCount(name, intentRoots);

  if (morphemeCount > maxMorphemes) {
    rejectionReasons.push(`too_many_morphemes:${morphemeCount}`);
  }

  if (hasRepeatedMeaningfulFragment(name, intentRoots)) {
    rejectionReasons.push("repeated_meaningful_fragment");
  }

  const family = qualityFamily({
    name,
    seed,
    method,
    morphemeCount,
    intentRoots,
    curatedNames,
  });
  const length = name.length;
  const vowelRatio = length ? countVowels(name) / length : 0;
  const hasSeed = Boolean(seed && name.includes(seed));
  const semanticHit = intentRoots.some((root) => root !== seed && name.includes(root));
  const curatedHit = curatedNames.includes(name);
  const lengthScore =
    length <= 10 ? 24 - Math.abs(length - 8) * 2.4 : 16 - Math.max(0, length - 10) * 4;
  const pronunciationScore =
    vowelRatio >= 0.24 && vowelRatio <= 0.62 ? 12 : vowelRatio >= 0.18 && vowelRatio <= 0.72 ? 5 : -10;
  const relationScore = curatedHit ? 18 : semanticHit ? 13 : hasSeed ? 9 : 3;
  const familyScore =
    family === "curated"
      ? 14
      : family === "semantic_compound"
        ? 11
        : family === "invented_brandable"
          ? 9
          : family === "two_morpheme"
            ? 8
            : family === "keyword_compound"
              ? 6
              : family === "verb_noun"
                ? 4
                : -12;
  const conciseBonus = length <= 9 ? 8 : length <= 12 ? 4 : -8;
  const endingBonus = [...STRONG_ENDINGS].some((ending) => name.endsWith(ending)) ? 5 : 0;
  const softFillerPenalty = softFillerHits.length * 14;
  const hardFillerPenalty = hardFillerHits.length * 32;
  const morphemePenalty = Math.max(0, morphemeCount - maxMorphemes) * 22;
  const duplicateExtension = duplicateExtensionPenalty(name, options.extension);
  const score = clampScore(
    42 +
      lengthScore +
      pronunciationScore +
      relationScore +
      familyScore +
      conciseBonus +
      endingBonus -
      softFillerPenalty -
      hardFillerPenalty -
      morphemePenalty -
      duplicateExtension,
  );

  if (length <= 12) reasons.push("short");
  if (semanticHit) reasons.push("semantic_match");
  if (curatedHit) reasons.push("curated_pattern");
  if (family === "invented_brandable") reasons.push("brandable_shape");
  if (morphemeCount <= 2) reasons.push("two_morpheme");
  if (softFillerHits.length > 0) warnings.push(`soft_filler:${softFillerHits.join(",")}`);

  return {
    name,
    accepted: rejectionReasons.length === 0 && score >= 58,
    score,
    family,
    morphemeCount,
    reasons: Array.from(new Set(reasons)),
    rejectionReasons: Array.from(new Set(rejectionReasons)),
    warnings: Array.from(new Set(warnings)),
  };
}

function addCandidate(candidates: Map<string, string>, name: string, origin: string) {
  const normalized = compactName(name);

  if (!normalized || normalized.length < 5 || normalized.length > 18) return;
  if (containsFamousBrand(normalized)) return;
  if (hasAwkwardRuns(normalized)) return;

  candidates.set(normalized, candidates.get(normalized) ?? origin);
}

export function scoreCommercialNameCandidate(
  seedName: string,
  candidateName: string,
  extension?: string,
) {
  const seed = compactName(seedName);
  const name = compactName(candidateName);

  if (!name || name === seed) return 0;

  const families = detectFamilies(seed);
  const semanticRoots = families.flatMap((family) => family.roots);
  const hasSeed = seed.length > 0 && name.includes(seed);
  const hasSemanticRoot = semanticRoots.some((root) => name.includes(root));
  const length = name.length;
  const vowelRatio = length ? countVowels(name) / length : 0;
  const knownTerms = [...STRONG_SUFFIXES, ...ACTION_PREFIXES, ...semanticRoots].filter((term) =>
    name.includes(term),
  ).length;
  const noisyPenalty = [...NOISY_TERMS].reduce(
    (penalty, term) => penalty + (name.includes(term) && !seed.includes(term) ? 11 : 0),
    0,
  );
  const extensionPenalty = duplicateExtensionPenalty(name, extension);
  const restrictedTermPenalty = RESTRICTED_DUPLICATE_TERMS.reduce(
    (penalty, term) =>
      penalty + (term !== extension && name.endsWith(term) && term.length <= 3 ? 3 : 0),
    0,
  );
  const endingBonus = [...STRONG_ENDINGS].some((ending) => name.endsWith(ending)) ? 10 : 0;
  const actionBonus = ACTION_PREFIXES.some((prefix) => name.startsWith(prefix)) ? 5 : 0;
  const relationBonus = hasSeed ? 17 : hasSemanticRoot ? 13 : 0;
  const lengthScore =
    length <= 12 ? 30 - Math.abs(length - 9) * 2.2 : 18 - Math.max(0, length - 12) * 3.5;
  const clarityPenalty =
    vowelRatio < 0.18 || vowelRatio > 0.72 ? 14 : hasAwkwardRuns(name) ? 18 : 0;
  const complexityPenalty = Math.max(0, knownTerms - 3) * 9;
  const prefixPenalty = name.startsWith("the") || name.startsWith("my") ? 7 : 0;

  return Math.max(
    0,
    Math.round(
      42 +
        lengthScore +
        relationBonus +
        endingBonus +
        actionBonus -
        noisyPenalty -
        extensionPenalty -
        restrictedTermPenalty -
        clarityPenalty -
        complexityPenalty -
        prefixPenalty,
    ),
  );
}

export function generateCommercialNameCandidates(seedName: string, limit = 600) {
  const base = compactName(seedName);

  if (!base) return [];

  const candidates = new Map<string, string>();
  const families = detectFamilies(base);

  for (const suffix of STRONG_SUFFIXES) {
    addCandidate(candidates, `${base}${suffix}`, "keyword");
  }

  for (const prefix of ACTION_PREFIXES) {
    addCandidate(candidates, `${prefix}${base}`, "keyword");
  }

  for (const family of families) {
    for (const name of family.curated) {
      addCandidate(candidates, name, "semantic");
    }

    for (const root of family.roots) {
      for (const suffix of STRONG_SUFFIXES.slice(0, 12)) {
        addCandidate(candidates, `${root}${suffix}`, "semantic");
      }

      for (const prefix of ACTION_PREFIXES.slice(0, 8)) {
        addCandidate(candidates, `${prefix}${root}`, "semantic");
      }
    }
  }

  return Array.from(candidates.keys())
    .sort((left, right) => {
      const scoreDelta =
        scoreCommercialNameCandidate(seedName, right) -
        scoreCommercialNameCandidate(seedName, left);

      return scoreDelta === 0 ? left.localeCompare(right) : scoreDelta;
    })
    .slice(0, limit);
}

export function rankCommercialNameCandidatesForExtension(
  seedName: string,
  names: string[],
  extension: string,
  limit?: number,
) {
  const ranked = [...new Set(names)]
    .sort((left, right) => {
      const scoreDelta =
        scoreCommercialNameCandidate(seedName, right, extension) -
        scoreCommercialNameCandidate(seedName, left, extension);

      return scoreDelta === 0 ? left.localeCompare(right) : scoreDelta;
    });

  return typeof limit === "number" ? ranked.slice(0, limit) : ranked;
}
