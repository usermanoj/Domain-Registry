import { NextResponse } from "next/server";
import { generateNameCandidates } from "@/domain/generator";
import { generateRequestSchema } from "@/domain/schemas";
import { rankRecommendations, scoreName } from "@/domain/scoring";

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

    const generated = generateNameCandidates(parsed.data);

    return NextResponse.json({
      ...generated,
      recommendations: rankRecommendations(
        generated.candidates.map((candidate) => scoreName(candidate.name)),
      ).slice(0, 24),
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
