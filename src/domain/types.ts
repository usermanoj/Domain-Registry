export const AVAILABILITY_STATUSES = [
  "available_confirmed",
  "taken_confirmed",
  "premium_available",
  "restricted",
  "unknown",
  "rate_limited",
  "invalid",
  "manual_check_required",
] as const;

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;

export const AVAILABILITY_SOURCES = [
  "registrar_api",
  "rdap",
  "whois",
  "dns",
  "mock",
  "manual",
] as const;

export type AvailabilityStatus = (typeof AVAILABILITY_STATUSES)[number];
export type AvailabilityConfidence = AvailabilityStatus;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
export type AvailabilitySource = (typeof AVAILABILITY_SOURCES)[number];

export type ProviderMode = "mock" | "hybrid" | "live";

export type GenerationStyle =
  | "sanskrit_hindi"
  | "spiritual"
  | "bizarre_brandable"
  | "ai_native"
  | "agentic_automation"
  | "data_analytics"
  | "workflow_ops"
  | "revenue_growth"
  | "singapore_global"
  | "sanskrit"
  | "western"
  | "bizarre"
  | "enterprise"
  | "short"
  | "premium"
  | "acronym"
  | "compound"
  | "synonym"
  | "prefix_suffix";

export type RuleKind = "restricted" | "country_rule" | "provider_note";

export type DomainRuleNote = {
  kind: RuleKind;
  label: string;
  message: string;
  url?: string;
};

export type PriceQuote = {
  amount: number;
  currency: string;
  period: "year" | "one_time" | "unknown";
};

export type DomainParts = {
  domain: string;
  sld: string;
  tld: string;
  valid: boolean;
};

export type DomainCheckInput = {
  name: string;
  extension: string;
  domain: string;
};

export type DomainCheckResult = {
  domain: string;
  sld: string;
  tld: string;
  status: AvailabilityStatus;
  confidence: ConfidenceLevel;
  source: AvailabilitySource;
  providerName: string;
  checkedAt: string;
  priceRegistration?: number;
  priceRenewal?: number;
  currency?: string;
  premium: boolean;
  registrarUrl?: string;
  rawSummary?: string;
  errorCode?: string;
  errorMessage?: string;

  // App-facing metadata used by scoring/export/UI. The public API contract above
  // remains the source of truth for provider adapters.
  id: string;
  name: string;
  extension: string;
  rules: DomainRuleNote[];
};

export type DomainAvailabilityProvider = {
  name: string;
  supportsTld(tld: string): boolean;
  check(domain: string): Promise<DomainCheckResult>;
  checkBulk(domains: string[]): Promise<DomainCheckResult[]>;
};

export type GeneratedCandidate = {
  name: string;
  style: GenerationStyle | "transformation";
  rationale: string;
  method?: string;
  tags?: string[];
};

export type RecommendationSubscores = {
  memorability: number;
  pronunciation: number;
  pronunciationEase: number;
  aiRelevance: number;
  spellingClarity: number;
  brandStrength: number;
  enterpriseCredibility: number;
  uniqueness: number;
  spiritualDepth: number;
  spiritualIndianDepth: number;
  dataAutomationRelevance: number;
  shortness: number;
  extensionAvailability: number;
  aiNativeFeel: number;
  domainStackQuality: number;
  riskOfConfusion: number;
  length: number;
  extensionQuality: number;
  availabilityConfidence: number;
};

export type Recommendation = {
  name: string;
  brandScore: number;
  subscores: RecommendationSubscores;
  explanation: string;
};

export type DomainCheckResponse = {
  checkedAt: string;
  mode: ProviderMode;
  results: DomainCheckResult[];
  recommendations: Recommendation[];
};

export type GenerateNamesResponse = {
  checkedAt: string;
  mode: ProviderMode;
  extensions: string[];
  seedTerms: string[];
  candidates: GeneratedCandidate[];
  results: DomainCheckResult[];
  recommendations: Recommendation[];
};
