import { NextResponse } from "next/server";
import { newApiId } from "@/app/api/_lib/domain-api";
import { checkDomains } from "@/domain/availability-engine";
import { buildPortfolioInsight } from "@/domain/portfolio-intelligence";
import { checkRequestSchema } from "@/domain/schemas";
import { recordSearchRun } from "@/server/persistence/intelligence-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = checkRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid domain check request.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const response = await checkDomains({
      names: parsed.data.names,
      extensions: parsed.data.extensions,
      mode: parsed.data.mode,
      includeExternalIntelligence: parsed.data.includeExternalIntelligence,
    });

    const queryId = newApiId("qry");

    void recordSearchRun({
      id: queryId,
      query: parsed.data.names.join(", "),
      mode: parsed.data.mode,
      extensions: parsed.data.extensions,
      checkedAt: response.checkedAt,
      results: response.results,
      recommendations: response.recommendations,
    });

    return NextResponse.json({
      queryId,
      ...response,
      portfolioInsight: buildPortfolioInsight(response.results, response.recommendations),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected domain check failure.",
      },
      { status: 500 },
    );
  }
}
