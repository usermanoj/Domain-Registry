import { NextResponse } from "next/server";
import { checkDomains } from "@/domain/availability-engine";
import { generateNameCandidates } from "@/domain/generator";
import { buildPortfolioInsight } from "@/domain/portfolio-intelligence";
import { generateRequestSchema } from "@/domain/schemas";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = generateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid generation request.",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    const generated = generateNameCandidates({
      seed: parsed.data.seed,
      limit: parsed.data.limit,
      styles: parsed.data.styles,
      minLength: parsed.data.minLength,
      maxLength: parsed.data.maxLength,
      allowedLetters: parsed.data.allowedLetters,
      avoidLetters: parsed.data.avoidLetters,
      mustInclude: parsed.data.mustInclude,
      mustAvoid: parsed.data.mustAvoid,
      allowNumbersHyphens: parsed.data.allowNumbersHyphens,
    });
    const checked = await checkDomains({
      names: generated.candidates.map((candidate) => candidate.name),
      extensions: parsed.data.extensions,
      mode: parsed.data.mode,
    });

    return NextResponse.json({
      ...generated,
      checkedAt: checked.checkedAt,
      mode: checked.mode,
      extensions: parsed.data.extensions,
      results: checked.results,
      recommendations: checked.recommendations.slice(0, 20),
      portfolioInsight: buildPortfolioInsight(
        checked.results,
        checked.recommendations.slice(0, 20),
      ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unexpected generation failure.",
      },
      { status: 500 },
    );
  }
}
