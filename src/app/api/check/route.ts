import { NextResponse } from "next/server";
import {
  apiError,
  newApiId,
  publicCheckRequestSchema,
  readJson,
  runPublicDomainCheck,
  summarizeResults,
  validationError,
} from "@/app/api/_lib/domain-api";
import { buildPortfolioInsight } from "@/domain/portfolio-intelligence";
import { recordSearchRun } from "@/server/persistence/intelligence-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const parsed = publicCheckRequestSchema.safeParse(body);

    if (!parsed.success) {
      return validationError("Invalid domain check request.", parsed.error.issues);
    }

    const results = await runPublicDomainCheck({
      names: parsed.data.names,
      extensions: parsed.data.extensions,
      domains: parsed.data.domains.length ? parsed.data.domains : undefined,
      mode: parsed.data.mode,
      includeExternalIntelligence: parsed.data.includeExternalIntelligence,
    });

    const queryId = newApiId("qry");

    void recordSearchRun({
      id: queryId,
      query: parsed.data.domains.length
        ? parsed.data.domains.join(", ")
        : parsed.data.names.join(", "),
      mode: parsed.data.mode,
      extensions: parsed.data.extensions,
      checkedAt: new Date().toISOString(),
      results,
      recommendations: [],
    });

    return NextResponse.json({
      queryId,
      results,
      summary: summarizeResults(results),
      portfolioInsight: buildPortfolioInsight(results, []),
    });
  } catch (error) {
    return apiError(
      error instanceof Error
        ? error.message
        : "Unexpected domain check failure.",
      500,
      "INTERNAL_ERROR",
    );
  }
}
