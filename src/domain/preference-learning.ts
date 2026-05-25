import { normalizeBaseName } from "./normalize";

export type PreferenceSignal = {
  name: string;
  action: "saved" | "rejected" | "opened_registrar" | "exported";
  weight?: number;
};

export type PreferenceProfile = {
  preferredFragments: Record<string, number>;
  rejectedFragments: Record<string, number>;
  preferredLength: number;
  preferredExtensions: Record<string, number>;
  sampleSize: number;
};

const TOKEN_MIN_LENGTH = 3;

function tokensForName(name: string) {
  const normalized = normalizeBaseName(name).replace(/[^a-z0-9]+/g, "");
  const tokens = new Set<string>();

  if (normalized.length >= TOKEN_MIN_LENGTH) {
    tokens.add(normalized);
  }

  for (let size = 3; size <= Math.min(6, normalized.length); size += 1) {
    for (let index = 0; index <= normalized.length - size; index += 1) {
      tokens.add(normalized.slice(index, index + size));
    }
  }

  return Array.from(tokens);
}

function extensionFromDomain(value: string) {
  const parts = value.toLowerCase().split(".");
  return parts.length > 1 ? parts.slice(1).join(".") : "";
}

function addScore(target: Record<string, number>, key: string, value: number) {
  target[key] = (target[key] ?? 0) + value;
}

export function learnPreferenceProfile(signals: PreferenceSignal[]): PreferenceProfile {
  const preferredFragments: Record<string, number> = {};
  const rejectedFragments: Record<string, number> = {};
  const preferredExtensions: Record<string, number> = {};
  let preferredLengthTotal = 0;
  let preferredCount = 0;

  for (const signal of signals) {
    const name = normalizeBaseName(signal.name.split(".")[0] ?? signal.name);
    const weight = signal.weight ?? 1;
    const extension = extensionFromDomain(signal.name);
    const positive =
      signal.action === "saved" ||
      signal.action === "opened_registrar" ||
      signal.action === "exported";

    for (const token of tokensForName(name)) {
      addScore(positive ? preferredFragments : rejectedFragments, token, weight);
    }

    if (positive) {
      preferredLengthTotal += name.length * weight;
      preferredCount += weight;

      if (extension) {
        addScore(preferredExtensions, extension, weight);
      }
    }
  }

  return {
    preferredFragments,
    rejectedFragments,
    preferredLength: preferredCount > 0 ? preferredLengthTotal / preferredCount : 10,
    preferredExtensions,
    sampleSize: signals.length,
  };
}

export function preferenceBoost(
  name: string,
  extension: string,
  profile: PreferenceProfile,
) {
  if (profile.sampleSize === 0) {
    return 0;
  }

  const normalized = normalizeBaseName(name);
  const tokens = tokensForName(normalized);
  const positive = tokens.reduce(
    (total, token) => total + Math.min(4, profile.preferredFragments[token] ?? 0),
    0,
  );
  const negative = tokens.reduce(
    (total, token) => total + Math.min(5, profile.rejectedFragments[token] ?? 0),
    0,
  );
  const lengthDelta = Math.abs(normalized.length - profile.preferredLength);
  const extensionBoost = Math.min(8, profile.preferredExtensions[extension] ?? 0);

  return Math.round(Math.min(18, positive * 0.25 + extensionBoost) - negative * 0.35 - lengthDelta * 0.4);
}
