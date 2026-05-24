import type { DomainCheckInput, DomainParts } from "./types";

const MAX_LABEL_LENGTH = 63;
const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const KNOWN_MULTI_LABEL_TLDS = new Set(["com.sg", "gov.sg", "edu.sg", "net.sg"]);

export function normalizeBaseName(input: string) {
  const withoutProtocol = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0] ?? "";

  const firstLabel = withoutProtocol.includes(".")
    ? withoutProtocol.split(".")[0]
    : withoutProtocol;

  return firstLabel
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, MAX_LABEL_LENGTH);
}

export function normalizeExtension(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/^\.+/, "")
    .replace(/\.+$/, "")
    .replace(/\s+/g, "");
}

export function isValidDomainLabel(label: string) {
  return label.length > 0 && label.length <= MAX_LABEL_LENGTH && LABEL_PATTERN.test(label);
}

export function isValidExtension(extension: string) {
  const normalized = normalizeExtension(extension);

  if (!normalized || normalized.length > 253) {
    return false;
  }

  return normalized
    .split(".")
    .every((label) => label.length >= 2 && label.length <= MAX_LABEL_LENGTH && /^[a-z0-9-]+$/.test(label) && !label.startsWith("-") && !label.endsWith("-"));
}

export function parseDomainName(input: string): DomainParts {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0]
    ?.replace(/^\.+|\.+$/g, "") ?? "";
  const labels = normalized.split(".").filter(Boolean);

  if (labels.length < 2) {
    return {
      domain: normalized,
      sld: labels[0] ?? "",
      tld: "",
      valid: false,
    };
  }

  const lastTwo = labels.slice(-2).join(".");
  const tld = KNOWN_MULTI_LABEL_TLDS.has(lastTwo)
    ? lastTwo
    : labels[labels.length - 1];
  const sldIndex = labels.length - tld.split(".").length - 1;
  const sld = labels[sldIndex] ?? "";
  const valid =
    labels.every(isValidDomainLabel) &&
    isValidDomainLabel(sld) &&
    isValidExtension(tld);

  return {
    domain: normalized,
    sld,
    tld,
    valid,
  };
}

export function composeDomain(name: string, extension: string) {
  return `${name}.${normalizeExtension(extension)}`;
}

export function buildDomainInputs(
  names: string[],
  extensions: string[],
): DomainCheckInput[] {
  const normalizedNames = names
    .map(normalizeBaseName)
    .filter(isValidDomainLabel);
  const normalizedExtensions = extensions
    .map(normalizeExtension)
    .filter(isValidExtension);

  const seen = new Set<string>();
  const inputs: DomainCheckInput[] = [];

  for (const name of normalizedNames) {
    for (const extension of normalizedExtensions) {
      const domain = composeDomain(name, extension);
      const key = domain.toLowerCase();

      if (!seen.has(key)) {
        seen.add(key);
        inputs.push({ name, extension, domain });
      }
    }
  }

  return inputs;
}

export function splitNames(input: string) {
  return input
    .split(/[\n,;]+/)
    .map((name) => normalizeBaseName(name))
    .filter(isValidDomainLabel);
}
