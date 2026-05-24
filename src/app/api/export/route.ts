import {
  apiError,
  exportPayload,
  exportRequestSchema,
  readJson,
  validationError,
} from "@/app/api/_lib/domain-api";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const parsed = exportRequestSchema.safeParse(body);

    if (!parsed.success) {
      return validationError("Invalid export request.", parsed.error.issues);
    }

    return exportPayload(parsed.data);
  } catch (error) {
    return apiError(
      error instanceof Error ? error.message : "Unexpected export failure.",
      500,
      "INTERNAL_ERROR",
    );
  }
}
