import { NextResponse } from "next/server";
import {
  apiError,
  newApiId,
  projectRequestSchema,
  readJson,
  validationError,
} from "@/app/api/_lib/domain-api";
import { parseDomainName } from "@/domain/normalize";
import { recordPreferenceEvent } from "@/server/persistence/intelligence-store";

type SavedProject = {
  id: string;
  name: string;
  description: string;
  domains: string[];
  notes: string;
  preferredRegistrar: string;
  createdAt: string;
  updatedAt: string;
};

const projects = new Map<string, SavedProject>();

export async function GET() {
  return NextResponse.json({
    projects: Array.from(projects.values()).sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    ),
  });
}

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const parsed = projectRequestSchema.safeParse(body);

    if (!parsed.success) {
      return validationError("Invalid project request.", parsed.error.issues);
    }

    const now = new Date().toISOString();
    const domains = Array.from(
      new Set([...parsed.data.domains, ...parsed.data.shortlist]),
    );
    const project: SavedProject = {
      id: newApiId("prj"),
      name: parsed.data.name,
      description: parsed.data.description,
      domains,
      notes: parsed.data.notes,
      preferredRegistrar: parsed.data.preferredRegistrar,
      createdAt: now,
      updatedAt: now,
    };

    projects.set(project.id, project);

    void Promise.all(
      domains.map((domain) => {
        const parts = parseDomainName(domain);

        return recordPreferenceEvent({
          action: "saved",
          domain: parts.domain || domain,
          name: parts.sld || domain,
          extension: parts.tld || "",
          weight: 2,
        });
      }),
    );

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    return apiError(
      error instanceof Error
        ? error.message
        : "Unexpected project creation failure.",
      500,
      "INTERNAL_ERROR",
    );
  }
}
