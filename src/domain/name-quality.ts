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
