import { NextResponse } from "next/server";
import { publicProviderCapabilities } from "@/domain/provider-capabilities";
import { cloudflareProvider } from "@/domain/providers/cloudflare-provider";
import { godaddyProvider } from "@/domain/providers/godaddy-provider";
import { mockProvider } from "@/domain/providers/mock-provider";
import { namecheapProvider } from "@/domain/providers/namecheap-provider";
import { porkbunProvider } from "@/domain/providers/porkbun-provider";
import { registrarQuorumProvider } from "@/domain/providers/registrar-quorum-provider";
import { rdapProvider } from "@/domain/providers/rdap-provider";
import { restrictedTldProvider } from "@/domain/providers/restricted-tld-provider";
import { sgProvider } from "@/domain/providers/sg-provider";
import { persistenceHealth } from "@/server/persistence/intelligence-store";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "domain-intelligence-studio",
    providers: {
      mock: mockProvider.supportsTld("com"),
      rdap: rdapProvider.supportsTld("com"),
      restricted: restrictedTldProvider.supportsTld("edu"),
      sg: sgProvider.supportsTld("sg"),
      registrarQuorum: registrarQuorumProvider.supportsTld("com"),
      cloudflare: cloudflareProvider.supportsTld("com"),
      godaddy: godaddyProvider.supportsTld("com"),
      porkbun: porkbunProvider.supportsTld("com"),
      namecheap: namecheapProvider.supportsTld("com"),
    },
    capabilities: publicProviderCapabilities(),
    externalIntelligence: {
      liveBrandIntelligence: process.env.ENABLE_LIVE_BRAND_INTELLIGENCE !== "false",
      trademark: {
        provider: "USPTO Trademark Search",
        configured: true,
      },
      handles: {
        github: true,
        x: Boolean(process.env.X_BEARER_TOKEN),
        youtube: Boolean(process.env.YOUTUBE_API_KEY),
        appleAppStore: true,
        linkedIn: "manual",
        productHunt: "manual",
      },
      marketComparables: {
        localDataset: Boolean(process.env.DOMAIN_SALES_DATA_PATH),
        remoteDataset: Boolean(process.env.DOMAIN_SALES_COMPARABLES_URL),
      },
    },
    persistence: persistenceHealth(),
  });
}
