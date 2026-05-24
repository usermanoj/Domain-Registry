import type { AvailabilityStatus, DomainRuleNote, PriceQuote } from "./types";

export const DEFAULT_EXTENSIONS = [
  "ai",
  "com",
  "sg",
  "com.sg",
  "net",
  "io",
  "co",
  "app",
  "dev",
  "tech",
  "education",
  "edu",
] as const;

export const IANA_TLD_LIST_URL =
  "https://data.iana.org/TLD/tlds-alpha-by-domain.txt";

const RESTRICTED_EXTENSIONS = new Set(["edu", "gov", "mil", "int", "gov.sg"]);
const SINGAPORE_EXTENSIONS = new Set(["sg", "com.sg"]);

const QUALITY_BY_EXTENSION = new Map<string, number>([
  ["com", 98],
  ["ai", 94],
  ["sg", 88],
  ["com.sg", 86],
  ["io", 82],
  ["app", 80],
  ["dev", 78],
  ["co", 76],
  ["net", 70],
  ["tech", 68],
  ["education", 62],
  ["edu", 55],
]);

export function getRootTld(extension: string) {
  const labels = extension.toLowerCase().replace(/^\.+/, "").split(".");
  return labels[labels.length - 1] ?? extension;
}

export function isRestrictedExtension(extension: string) {
  return RESTRICTED_EXTENSIONS.has(extension.toLowerCase());
}

export function isSingaporeExtension(extension: string) {
  return SINGAPORE_EXTENSIONS.has(extension.toLowerCase());
}

export function getExtensionQuality(extension: string) {
  return QUALITY_BY_EXTENSION.get(extension.toLowerCase()) ?? 58;
}

export function getExtensionRules(extension: string): DomainRuleNote[] {
  const normalized = extension.toLowerCase();
  const rules: DomainRuleNote[] = [];

  if (normalized === "edu") {
    rules.push({
      kind: "restricted",
      label: ".edu eligibility",
      message:
        ".edu is restricted to eligible accredited postsecondary institutions and requires manual eligibility validation.",
      url: "https://net.educause.edu/eligibility.htm",
    });
  }

  if (["gov", "mil", "int", "gov.sg"].includes(normalized)) {
    rules.push({
      kind: "restricted",
      label: "Restricted registry",
      message:
        `.${normalized} is government, military, intergovernmental, or otherwise eligibility-restricted. Manual registry or registrar validation is required.`,
    });
  }

  if (normalized === "sg" || normalized === "com.sg") {
    rules.push({
      kind: "country_rule",
      label: "Singapore registry",
      message:
        "Singapore domains should be verified through an accredited registrar; .com.sg may require local entity eligibility checks.",
      url: "https://www.sgnic.sg/registrars/accredited-registrars",
    });
  }

  return rules;
}

export function getRegistrarUrl(domain: string, extension: string) {
  const normalized = extension.toLowerCase();

  if (normalized === "sg" || normalized === "com.sg") {
    return `https://www.sgnic.sg/domain-search?domain=${encodeURIComponent(domain)}`;
  }

  if (normalized === "edu") {
    return "https://net.educause.edu/eligibility.htm";
  }

  return `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(domain)}`;
}

export function defaultPriceForExtension(extension: string): PriceQuote | undefined {
  const normalized = extension.toLowerCase();

  if (normalized === "edu") {
    return undefined;
  }

  const table = new Map<string, number>([
    ["com", 14],
    ["ai", 79],
    ["sg", 42],
    ["com.sg", 45],
    ["net", 16],
    ["io", 49],
    ["co", 31],
    ["app", 18],
    ["dev", 18],
    ["tech", 39],
    ["education", 28],
  ]);

  const amount = table.get(normalized);
  return amount ? { amount, currency: "USD", period: "year" } : undefined;
}

export function statusRank(status: AvailabilityStatus) {
  const weights: Record<AvailabilityStatus, number> = {
    available_confirmed: 100,
    premium_available: 84,
    taken_confirmed: 72,
    restricted: 45,
    manual_check_required: 40,
    rate_limited: 34,
    unknown: 30,
    invalid: 0,
  };

  return weights[status];
}

export async function fetchIanaRootZoneTlds(
  fetcher: typeof fetch = fetch,
): Promise<Set<string>> {
  const response = await fetcher(IANA_TLD_LIST_URL, {
    next: { revalidate: 86_400 },
  });

  if (!response.ok) {
    throw new Error(`IANA root-zone list failed with HTTP ${response.status}`);
  }

  const text = await response.text();
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line && !line.startsWith("#")),
  );
}
