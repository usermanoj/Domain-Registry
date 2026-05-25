import { NextResponse } from "next/server";
import {
  apiError,
  generateContractCandidates,
  publicGenerateRequestSchema,
  readJson,
  validationError,
} from "@/app/api/_lib/domain-api";
import { buildPortfolioInsight } from "@/domain/portfolio-intelligence";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const parsed = publicGenerateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return validationError("Invalid generation request.", parsed.error.issues);
    }

    const generated = await generateContractCandidates({
      seedWords: parsed.data.seedWords,
      styles: parsed.data.styles,
      minLength: parsed.data.minLength,
      maxLength: parsed.data.maxLength,
      count: parsed.data.count,
      allowedLetters: parsed.data.allowedLetters,
      avoidLetters: parsed.data.avoidLetters,
      mustInclude: parsed.data.mustInclude,
      mustAvoid: parsed.data.mustAvoid,
      extensions: parsed.data.extensions,
      mode: parsed.data.mode,
    });

    return NextResponse.json({
      ...generated,
      portfolioInsight: buildPortfolioInsight(
        generated.candidates.flatMap((candidate) => candidate.domains),
        generated.recommendations,
      ),
    });
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Unexpected generation failure.",
      500,
      "INTERNAL_ERROR",
    );
  }
}
