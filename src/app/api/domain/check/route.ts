import { NextResponse } from "next/server";
import { checkDomains } from "@/domain/availability-engine";
import { checkRequestSchema } from "@/domain/schemas";

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
    });

    return NextResponse.json(response);
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
