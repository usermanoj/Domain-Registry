import { createAvailabilityEngine } from "@/domain/availability-engine";
import { domainMatrix, newApiId } from "@/app/api/_lib/domain-api";
import type { DomainCheckResult, ProviderMode } from "@/domain/types";

export type BulkJobStatus = "queued" | "running" | "completed" | "failed";

export type BulkJob = {
  jobId: string;
  status: BulkJobStatus;
  progress: {
    total: number;
    checked: number;
  };
  results: DomainCheckResult[];
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
};

const jobs = new Map<string, BulkJob>();

function snapshot(job: BulkJob) {
  return {
    jobId: job.jobId,
    status: job.status,
    progress: { ...job.progress },
    results: [...job.results],
    ...(job.errorMessage ? { errorMessage: job.errorMessage } : {}),
  };
}

async function runBulkJob(
  jobId: string,
  input: {
    names: string[];
    extensions: string[];
    mode: ProviderMode;
  },
) {
  const job = jobs.get(jobId);

  if (!job) {
    return;
  }

  try {
    const engine = createAvailabilityEngine(input.mode);
    const domains = domainMatrix(input.names, input.extensions);
    job.status = "running";
    job.updatedAt = new Date().toISOString();

    for (const domain of domains) {
      job.results.push(await engine.check(domain));
      job.progress.checked += 1;
      job.updatedAt = new Date().toISOString();
    }

    job.status = "completed";
    job.updatedAt = new Date().toISOString();
  } catch (error) {
    job.status = "failed";
    job.errorMessage =
      error instanceof Error ? error.message : "Unexpected bulk check failure.";
    job.updatedAt = new Date().toISOString();
  }
}

export function createBulkJob(input: {
  names: string[];
  extensions: string[];
  mode: ProviderMode;
}) {
  const now = new Date().toISOString();
  const job: BulkJob = {
    jobId: newApiId("job"),
    status: "queued",
    progress: {
      total: input.names.length * input.extensions.length,
      checked: 0,
    },
    results: [],
    createdAt: now,
    updatedAt: now,
  };

  jobs.set(job.jobId, job);
  setTimeout(() => {
    void runBulkJob(job.jobId, input);
  }, 0);

  return snapshot(job);
}

export function getBulkJob(jobId: string) {
  const job = jobs.get(jobId);
  return job ? snapshot(job) : null;
}
