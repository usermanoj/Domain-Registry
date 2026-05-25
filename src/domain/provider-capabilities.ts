import { getRootTld, isRestrictedExtension } from "./tlds";

export type ProviderCapability = {
  id: string;
  providerName: string;
  displayName: string;
  category: "registrar" | "registry" | "dns" | "manual" | "mock";
  priority: number;
  configured: boolean;
  supportsBulk: boolean;
  maxBatchSize: number;
  defaultConcurrency: number;
  timeoutMs: number;
  supportsPricing: boolean;
  supportsPremium: boolean;
  confirmsAvailability: boolean;
  confirmsTaken: boolean;
  supportedTlds: "all" | string[];
  unsupportedTlds: string[];
  notes: string[];
};

export type ProviderRoutePlan = {
  tld: string;
  primary: ProviderCapability[];
  supporting: ProviderCapability[];
  manual: ProviderCapability[];
  totalConfiguredRegistrars: number;
};

type EnvReader = (name: string) => string | undefined;

function defaultEnv(name: string) {
  return process.env[name]?.trim();
}

function isConfigured(env: EnvReader, keys: string[]) {
  return keys.every((key) => Boolean(env(key)));
}

function capabilitySupportsTld(capability: ProviderCapability, tld: string) {
  const normalized = tld.toLowerCase();

  if (capability.unsupportedTlds.includes(normalized)) {
    return false;
  }

  if (capability.supportedTlds === "all") {
    return !isRestrictedExtension(normalized);
  }

  return capability.supportedTlds.includes(normalized) ||
    capability.supportedTlds.includes(getRootTld(normalized));
}

export function getProviderCapabilities(env: EnvReader = defaultEnv): ProviderCapability[] {
  const cloudflareConfigured = isConfigured(env, ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"]);
  const godaddyConfigured = isConfigured(env, ["GODADDY_API_KEY", "GODADDY_API_SECRET"]);
  const porkbunConfigured = isConfigured(env, ["PORKBUN_API_KEY", "PORKBUN_SECRET_API_KEY"]);
  const namecheapConfigured = isConfigured(env, [
    "NAMECHEAP_API_USER",
    "NAMECHEAP_API_KEY",
    "NAMECHEAP_USERNAME",
    "NAMECHEAP_CLIENT_IP",
  ]);

  return [
    {
      id: "registrar-quorum",
      providerName: "RegistrarQuorumProvider",
      displayName: "Registrar quorum",
      category: "registrar",
      priority: 5,
      configured:
        cloudflareConfigured ||
        godaddyConfigured ||
        porkbunConfigured ||
        namecheapConfigured,
      supportsBulk: true,
      maxBatchSize: 500,
      defaultConcurrency: 4,
      timeoutMs: 12_000,
      supportsPricing: true,
      supportsPremium: true,
      confirmsAvailability: true,
      confirmsTaken: true,
      supportedTlds: "all",
      unsupportedTlds: ["edu", "gov", "mil", "int", "gov.sg"],
      notes: ["Aggregates configured registrar APIs and blocks conflicting availability signals."],
    },
    {
      id: "cloudflare",
      providerName: "CloudflareAvailabilityProvider",
      displayName: "Cloudflare Registrar",
      category: "registrar",
      priority: 10,
      configured: cloudflareConfigured,
      supportsBulk: true,
      maxBatchSize: 20,
      defaultConcurrency: 1,
      timeoutMs: 10_000,
      supportsPricing: true,
      supportsPremium: true,
      confirmsAvailability: true,
      confirmsTaken: true,
      supportedTlds: "all",
      unsupportedTlds: ["edu", "gov", "mil", "int", "gov.sg"],
      notes: ["Best used as a high-confidence registrar signal when credentials are configured."],
    },
    {
      id: "godaddy",
      providerName: "GoDaddyAvailabilityProvider",
      displayName: "GoDaddy",
      category: "registrar",
      priority: 20,
      configured: godaddyConfigured,
      supportsBulk: true,
      maxBatchSize: 500,
      defaultConcurrency: 1,
      timeoutMs: 10_000,
      supportsPricing: true,
      supportsPremium: false,
      confirmsAvailability: true,
      confirmsTaken: true,
      supportedTlds: "all",
      unsupportedTlds: ["edu", "gov", "mil", "int", "gov.sg"],
      notes: ["Only definitive availability responses should be promoted to available."],
    },
    {
      id: "porkbun",
      providerName: "PorkbunAvailabilityProvider",
      displayName: "Porkbun",
      category: "registrar",
      priority: 30,
      configured: porkbunConfigured,
      supportsBulk: false,
      maxBatchSize: 1,
      defaultConcurrency: Number(env("PORKBUN_CHECK_CONCURRENCY") ?? 1) || 1,
      timeoutMs: 10_000,
      supportsPricing: true,
      supportsPremium: true,
      confirmsAvailability: true,
      confirmsTaken: true,
      supportedTlds: "all",
      unsupportedTlds: ["edu", "gov", "mil", "int", "gov.sg"],
      notes: ["Single-domain checks with low default concurrency to protect rate limits."],
    },
    {
      id: "namecheap",
      providerName: "NamecheapAvailabilityProvider",
      displayName: "Namecheap",
      category: "registrar",
      priority: 40,
      configured: namecheapConfigured,
      supportsBulk: false,
      maxBatchSize: 1,
      defaultConcurrency: 4,
      timeoutMs: 10_000,
      supportsPricing: true,
      supportsPremium: true,
      confirmsAvailability: true,
      confirmsTaken: true,
      supportedTlds: "all",
      unsupportedTlds: ["edu", "gov", "mil", "int", "gov.sg"],
      notes: ["XML domains.check adapter; useful as a second registrar opinion."],
    },
    {
      id: "rdap",
      providerName: "RDAPAvailabilityProvider",
      displayName: "RDAP registry",
      category: "registry",
      priority: 100,
      configured: true,
      supportsBulk: true,
      maxBatchSize: 8,
      defaultConcurrency: 8,
      timeoutMs: 8_000,
      supportsPricing: false,
      supportsPremium: false,
      confirmsAvailability: false,
      confirmsTaken: true,
      supportedTlds: "all",
      unsupportedTlds: ["edu", "gov", "mil", "int", "gov.sg"],
      notes: ["RDAP 404 is registry not-found only; it must not be treated as availability."],
    },
    {
      id: "whois",
      providerName: "WHOISAvailabilityProvider",
      displayName: "WHOIS",
      category: "registry",
      priority: 120,
      configured: true,
      supportsBulk: true,
      maxBatchSize: 2,
      defaultConcurrency: 2,
      timeoutMs: 10_000,
      supportsPricing: false,
      supportsPremium: false,
      confirmsAvailability: false,
      confirmsTaken: true,
      supportedTlds: ["ai", "com", "net"],
      unsupportedTlds: ["edu", "gov", "mil", "int", "gov.sg"],
      notes: ["WHOIS not-found is not purchase availability proof."],
    },
    {
      id: "dns",
      providerName: "DNSAvailabilityProvider",
      displayName: "DNS evidence",
      category: "dns",
      priority: 140,
      configured: true,
      supportsBulk: true,
      maxBatchSize: 8,
      defaultConcurrency: 8,
      timeoutMs: 5_000,
      supportsPricing: false,
      supportsPremium: false,
      confirmsAvailability: false,
      confirmsTaken: true,
      supportedTlds: "all",
      unsupportedTlds: ["edu", "gov", "mil", "int", "gov.sg"],
      notes: ["DNS records can support taken evidence; absence of DNS proves nothing."],
    },
    {
      id: "manual",
      providerName: "ManualPolicyProvider",
      displayName: "Manual policy",
      category: "manual",
      priority: 200,
      configured: true,
      supportsBulk: true,
      maxBatchSize: 500,
      defaultConcurrency: 1,
      timeoutMs: 0,
      supportsPricing: false,
      supportsPremium: false,
      confirmsAvailability: false,
      confirmsTaken: false,
      supportedTlds: "all",
      unsupportedTlds: [],
      notes: ["Used for restricted TLDs, missing credentials, and conflict resolution."],
    },
  ];
}

export function buildProviderRoutePlan(
  tld: string,
  capabilities = getProviderCapabilities(),
): ProviderRoutePlan {
  const normalized = tld.toLowerCase().replace(/^\.+|\.+$/g, "");
  const supported = capabilities
    .filter((capability) => capabilitySupportsTld(capability, normalized))
    .sort((left, right) => left.priority - right.priority);
  const primary = supported.filter(
    (capability) => capability.category === "registrar" && capability.configured,
  );
  const supporting = supported.filter((capability) =>
    ["registry", "dns"].includes(capability.category),
  );
  const manual = supported.filter((capability) => capability.category === "manual");

  return {
    tld: normalized,
    primary,
    supporting,
    manual,
    totalConfiguredRegistrars: primary.length,
  };
}

export function publicProviderCapabilities(env: EnvReader = defaultEnv) {
  return getProviderCapabilities(env).map((capability) => ({
    id: capability.id,
    providerName: capability.providerName,
    displayName: capability.displayName,
    category: capability.category,
    priority: capability.priority,
    configured: capability.configured,
    supportsBulk: capability.supportsBulk,
    maxBatchSize: capability.maxBatchSize,
    defaultConcurrency: capability.defaultConcurrency,
    timeoutMs: capability.timeoutMs,
    supportsPricing: capability.supportsPricing,
    supportsPremium: capability.supportsPremium,
    confirmsAvailability: capability.confirmsAvailability,
    confirmsTaken: capability.confirmsTaken,
    supportedTlds: capability.supportedTlds,
    unsupportedTlds: capability.unsupportedTlds,
  }));
}
