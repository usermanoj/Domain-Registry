import { describe, expect, it } from "vitest";
import { GET as GET_JOB } from "../jobs/[jobId]/route";
import { POST } from "./route";

async function getJob(jobId: string) {
  const response = await GET_JOB(
    new Request(`http://localhost/api/jobs/${jobId}`),
    {
      params: Promise.resolve({ jobId }),
    },
  );

  return {
    response,
    payload: await response.json(),
  };
}

describe("POST /api/check-bulk and GET /api/jobs/{jobId}", () => {
  it("queues a bulk job and exposes progress", async () => {
    const response = await POST(
      new Request("http://localhost/api/check-bulk", {
        method: "POST",
        body: JSON.stringify({
          names: ["aptava", "ritava"],
          extensions: ["ai", "com"],
          forceRefresh: false,
        }),
      }),
    );
    const queued = await response.json();

    expect(response.status).toBe(202);
    expect(queued.status).toBe("queued");
    expect(queued.jobId).toEqual(expect.any(String));

    let payload = (await getJob(queued.jobId)).payload;

    for (let attempt = 0; attempt < 20 && payload.status !== "completed"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      payload = (await getJob(queued.jobId)).payload;
    }

    expect(payload.jobId).toBe(queued.jobId);
    expect(["queued", "running", "completed"]).toContain(payload.status);
    expect(payload.progress.total).toBe(4);
    expect(payload.progress.checked).toBeGreaterThanOrEqual(0);

    if (payload.status === "completed") {
      expect(payload.results).toHaveLength(4);
    }
  });

  it("returns a robust not-found response for missing jobs", async () => {
    const response = await GET_JOB(
      new Request("http://localhost/api/jobs/missing"),
      {
        params: Promise.resolve({ jobId: "missing" }),
      },
    );
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload).toEqual(
      expect.objectContaining({
        error: "Bulk check job was not found.",
        code: "NOT_FOUND",
      }),
    );
  });
});
