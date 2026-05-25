import type {
  DomainCheckResult,
  DomainEvidenceLedger,
  DomainEvidenceRecord,
  DomainSignalConflict,
} from "./types";

function shortProviderName(providerName: string) {
  return providerName
    .replace(/AvailabilityProvider$/, "")
    .replace(/Provider$/, "")
    .replace(/Registrar$/, "");
}

export function toEvidenceRecord(result: DomainCheckResult): DomainEvidenceRecord {
  return {
    domain: result.domain,
    providerName: result.providerName,
    source: result.source,
    status: result.status,
    confidence: result.confidence,
    checkedAt: result.checkedAt,
    premium: result.premium,
    priceRegistration: result.priceRegistration,
    priceRenewal: result.priceRenewal,
    currency: result.currency,
    registrarUrl: result.registrarUrl,
    rawSummary: result.rawSummary,
    errorCode: result.errorCode,
  };
}

export function evidenceFromResults(results: DomainCheckResult[]) {
  return results.flatMap((result) =>
    result.evidence?.length ? result.evidence : [toEvidenceRecord(result)],
  );
}

function priceSpreadConflict(evidence: DomainEvidenceRecord[]): DomainSignalConflict | null {
  const prices = evidence
    .filter((item) => item.source === "registrar_api" && item.priceRegistration)
    .map((item) => ({
      provider: item.providerName,
      price: item.priceRegistration ?? 0,
    }));

  if (prices.length < 2) {
    return null;
  }

  const sorted = [...prices].sort((left, right) => left.price - right.price);
  const low = sorted[0];
  const high = sorted[sorted.length - 1];

  if (high.price < low.price * 1.5 && high.price - low.price < 25) {
    return null;
  }

  return {
    kind: "price_conflict",
    severity: "medium",
    message: `Registrar prices differ materially (${low.provider}: ${low.price}, ${high.provider}: ${high.price}).`,
    providers: [low.provider, high.provider],
  };
}

export function buildEvidenceLedger(
  domain: string,
  evidence: DomainEvidenceRecord[],
): DomainEvidenceLedger {
  const registrarEvidence = evidence.filter((item) => item.source === "registrar_api");
  const registryEvidence = evidence.filter((item) =>
    ["rdap", "whois", "dns"].includes(item.source),
  );
  const availableProviders = registrarEvidence
    .filter((item) => ["available_confirmed", "premium_available"].includes(item.status))
    .map((item) => item.providerName);
  const takenProviders = registrarEvidence
    .filter((item) => item.status === "taken_confirmed")
    .map((item) => item.providerName);
  const restrictedProviders = registrarEvidence
    .filter((item) => item.status === "restricted")
    .map((item) => item.providerName);
  const conflicts: DomainSignalConflict[] = [];
  const priceConflict = priceSpreadConflict(registrarEvidence);

  if (availableProviders.length > 0 && takenProviders.length > 0) {
    conflicts.push({
      kind: "availability_conflict",
      severity: "high",
      message:
        "At least one registrar reports purchasable availability while another reports unavailable.",
      providers: [...availableProviders, ...takenProviders],
    });
  }

  if (availableProviders.length > 0 && restrictedProviders.length > 0) {
    conflicts.push({
      kind: "policy_conflict",
      severity: "high",
      message:
        "Availability and restriction signals disagree; manual registry or checkout validation is required.",
      providers: [...availableProviders, ...restrictedProviders],
    });
  }

  if (priceConflict) {
    conflicts.push(priceConflict);
  }

  return {
    domain,
    evidence,
    registrarEvidence,
    registryEvidence,
    conflicts,
    hasRegistrarAvailability: availableProviders.length > 0,
    hasRegistrarTaken: takenProviders.length > 0,
    providerSummary: evidence.length
      ? evidence
          .map((item) => `${shortProviderName(item.providerName)}=${item.status}`)
          .join("; ")
      : "No provider evidence recorded.",
  };
}

export function ledgerForResult(result: DomainCheckResult) {
  return buildEvidenceLedger(
    result.domain,
    result.evidence?.length ? result.evidence : [toEvidenceRecord(result)],
  );
}

export function ledgersForResults(results: DomainCheckResult[]) {
  return results.map(ledgerForResult);
}
