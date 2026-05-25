import { NextResponse } from "next/server";
import { z } from "zod";
import { attachLiveDomainIntelligence } from "@/domain/domain-intelligence";
import type { DomainCheckResult, Recommendation } from "@/domain/types";

export const runtime = "nodejs";

const intelligenceRequestSchema = z.object({
  results: z.array(z.unknown()).min(1).max(100),
  recommendations: z.array(z.unknown()).default([]),
  maxDistinctNames: z.coerce.number().int().min(1).max(50).default(20),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = intelligenceRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid intelligence enrichment request.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const results = await attachLiveDomainIntelligence(
      parsed.data.results as DomainCheckResult[],
      parsed.data.recommendations as Recommendation[],
      {
        enabled: true,
        maxDistinctNames: parsed.data.maxDistinctNames,
      },
    );

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected intelligence enrichment failure.",
      },
      { status: 500 },
    );
  }
}
