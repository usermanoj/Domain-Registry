import { Queue } from "bullmq";

export type DomainCheckJob = {
  names: string[];
  extensions: string[];
  mode: "mock" | "hybrid" | "live";
  projectId?: string;
};

export function createDomainCheckQueue() {
  const connectionUrl = process.env.REDIS_URL;

  if (!connectionUrl) {
    return null;
  }

  return new Queue<DomainCheckJob>("domain-checks", {
    connection: { url: connectionUrl },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2_000,
      },
      removeOnComplete: 1_000,
      removeOnFail: 1_000,
    },
  });
}
