import { NextResponse } from "next/server";
import { apiError } from "@/app/api/_lib/domain-api";
import { getBulkJob } from "@/app/api/jobs/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await context.params;
  const job = getBulkJob(jobId);

  if (!job) {
    return apiError("Bulk check job was not found.", 404, "NOT_FOUND");
  }

  return NextResponse.json(job);
}
