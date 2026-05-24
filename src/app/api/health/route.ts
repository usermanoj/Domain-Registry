import { NextResponse } from "next/server";
import { mockProvider } from "@/domain/providers/mock-provider";
import { namecheapProvider } from "@/domain/providers/namecheap-provider";
import { rdapProvider } from "@/domain/providers/rdap-provider";
import { restrictedTldProvider } from "@/domain/providers/restricted-tld-provider";
import { sgProvider } from "@/domain/providers/sg-provider";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "domain-intelligence-studio",
    providers: {
      mock: mockProvider.supportsTld("com"),
      rdap: rdapProvider.supportsTld("com"),
      restricted: restrictedTldProvider.supportsTld("edu"),
      sg: sgProvider.supportsTld("sg"),
      namecheap: namecheapProvider.supportsTld("com"),
    },
  });
}
