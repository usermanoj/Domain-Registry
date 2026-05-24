import { NextResponse } from "next/server";
import {
  apiError,
  publicBulkCheckRequestSchema,
  readJson,
  validationError,
} from "@/app/api/_lib/domain-api";
import { createBulkJob } from "@/app/api/jobs/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const parsed = publicBulkCheckRequestSchema.safeParse(body);

    if (!parsed.success) {
      return validationError("Invalid bulk check request.", parsed.error.issues);
    }

    const job = createBulkJob({
      names: parsed.data.names,
      extensions: parsed.data.extensions,
      mode: parsed.data.mode,
    });

    return NextResponse.json(
      {
        jobId: job.jobId,
        status: "queued",
      },
      { status: 202 },
    );
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Unexpected bulk check failure.",
      500,
      "INTERNAL_ERROR",
    );
  }
}
