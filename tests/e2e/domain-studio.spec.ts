import { expect, test } from "@playwright/test";

async function openApp(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Find the perfect AI-native domain before someone else does.",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Mock", exact: true }).click();
  await expect(page.getByText("Mock mode is simulated demo data.")).toBeVisible();
}

async function runHeroSearch(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Search", exact: true }).nth(1).click();
  await expect(page.getByText("Availability Matrix")).toBeVisible();
}

async function showAllResults(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "All", exact: true }).click();
}

function fakeResult(
  name: string,
  extension: string,
  status: "available_confirmed" | "taken_confirmed" | "manual_check_required" = "taken_confirmed",
) {
  const domain = `${name}.${extension}`;

  return {
    domain,
    sld: name,
    tld: extension,
    status,
    confidence: status === "manual_check_required" ? "medium" : "high",
    source:
      status === "available_confirmed"
        ? "registrar_api"
        : status === "manual_check_required"
          ? "manual"
          : "dns",
    providerName: "PlaywrightProvider",
    checkedAt: new Date().toISOString(),
    premium: false,
    id: domain,
    name,
    extension,
    rules: [],
    registrarUrl: `https://example.test/register/${domain}`,
    rawSummary: "Playwright fixture.",
  };
}

function fakeRecommendation(name: string, brandScore = 82) {
  return {
    name,
    brandScore,
    subscores: {},
    explanation: `${brandScore}/100 Playwright fixture score.`,
  };
}

test("user enters a seed name and checks .ai/.com/.sg", async ({ page }) => {
  await openApp(page);

  await page.getByPlaceholder("aptava").fill("satyaflow");

  for (const extension of [".com.sg", ".io", ".co", ".app", ".dev"]) {
    await page.getByRole("button", { name: extension, exact: true }).click();
  }

  await runHeroSearch(page);
  await showAllResults(page);

  await expect(page.getByText("satyaflow.ai").first()).toBeVisible();
  await expect(page.getByText("satyaflow.com").first()).toBeVisible();
  await expect(page.getByText("satyaflow.sg").first()).toBeVisible();
});

test("user generates 100 names from concept words", async ({ page }) => {
  await openApp(page);

  await page.getByRole("navigation").getByRole("button", { name: "NameLab" }).click();
  await page.getByLabel("Concept Words").fill("trust, agentic automation, data intelligence, revenue growth");
  await page.getByLabel("Count").fill("100");
  await page.getByRole("button", { name: "Generate candidates" }).click();

  await expect(page.getByText("Available recommendations")).toBeVisible();
  await expect(page.getByText("No variants have passed live availability checks yet")).toBeVisible();
});

test("mock results are excluded from available-only filters", async ({ page }) => {
  await openApp(page);
  await runHeroSearch(page);

  await expect(page.getByText("No confirmed available domains in this run")).toBeVisible();
});

test("live search shows the exact lookup before keyword-anchored alternatives finish", async ({ page }) => {
  let calls = 0;
  let alternativeNames: string[] = [];

  await page.route("**/api/domain/check", async (route) => {
    calls += 1;

    if (calls === 1) {
      const body = route.request().postDataJSON() as {
        names?: string[];
        extensions?: string[];
        mode?: string;
      };
      const name = body.names?.[0] ?? "enterprise";
      const extensions = body.extensions?.length ? body.extensions : ["ai"];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkedAt: new Date().toISOString(),
          mode: body.mode ?? "live",
          results: extensions.map((extension) => fakeResult(name, extension)),
          recommendations: [fakeRecommendation(name, 70)],
        }),
      });
      return;
    }

    const body = route.request().postDataJSON() as {
      names?: string[];
      extensions?: string[];
      mode?: string;
    };
    alternativeNames = Array.from(new Set([...alternativeNames, ...(body.names ?? [])]));
    const extension = body.extensions?.[0] ?? "ai";
    const availableNames = (body.names ?? []).slice(0, 10);

    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkedAt: new Date().toISOString(),
        mode: body.mode ?? "live",
        results: availableNames.map((name) =>
          fakeResult(name, extension, "available_confirmed"),
        ),
        recommendations: availableNames.map((name) => fakeRecommendation(name, 91)),
      }),
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Find the perfect AI-native domain before someone else does.",
    }),
  ).toBeVisible();

  await page.getByPlaceholder("aptava").fill("enterprise");
  await page.getByRole("button", { name: "Search", exact: true }).nth(1).click();

  await expect(page.getByText('No registrar-confirmed availability for "enterprise"')).toBeVisible();
  await expect(page.getByText("Finding top 20 related available domains")).toBeVisible();
  await expect(page.getByText("Finding available alternatives")).toBeVisible();
  await expect(page.getByText("0 of 20 related available", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Available recommendations")).toBeVisible();
  await expect(page.getByText("Below are the top 20 registrar-confirmed related domains")).toBeVisible();
  await expect(page.getByText("20 of 20 related available", { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  const visibleDomains = await page.locator("div.font-mono.text-lg").allTextContents();
  expect(visibleDomains).toHaveLength(20);
  expect(visibleDomains.slice(0, 10).every((domain) => domain.endsWith(".ai"))).toBe(true);
  expect(visibleDomains.slice(10, 20).every((domain) => domain.endsWith(".com"))).toBe(true);
  expect(alternativeNames.length).toBeGreaterThan(0);
  expect(alternativeNames.some((name) => /enterprise|business|scale|trust|venture|company|govern/.test(name))).toBe(true);
  expect(alternativeNames.every((name) => !/(ops|cloud|grid|works)/.test(name))).toBe(true);
  expect(alternativeNames).not.toContain("aptasignal");
  expect(alternativeNames).not.toContain("satyaflow");
  expect(alternativeNames).not.toContain("ritamflow");
  expect(calls).toBeGreaterThan(1);
});

test("live search supplements partial exact availability with top related domains", async ({ page }) => {
  let calls = 0;
  let alternativeNames: string[] = [];
  let alternativeExtensionRequests: string[] = [];

  await page.route("**/api/domain/check", async (route) => {
    calls += 1;

    if (calls === 1) {
      const body = route.request().postDataJSON() as {
        names?: string[];
        extensions?: string[];
        mode?: string;
      };
      const name = body.names?.[0] ?? "enterprisedata";
      const extensions = body.extensions?.length ? body.extensions : ["ai"];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkedAt: new Date().toISOString(),
          mode: body.mode ?? "live",
          results: extensions.map((extension) =>
            fakeResult(
              name,
              extension,
              extension === "app" || extension === "dev"
                ? "available_confirmed"
                : "taken_confirmed",
            ),
          ),
          recommendations: [fakeRecommendation(name, 92)],
        }),
      });
      return;
    }

    const body = route.request().postDataJSON() as {
      names?: string[];
      extensions?: string[];
      mode?: string;
    };
    const currentAlternativeNames = body.names ?? [];
    alternativeNames = Array.from(new Set([...alternativeNames, ...currentAlternativeNames]));
    alternativeExtensionRequests = [
      ...alternativeExtensionRequests,
      ...(body.extensions ?? []),
    ];
    const requestedExtensions = body.extensions?.length ? body.extensions : ["ai"];
    const names = currentAlternativeNames.slice(0, 10);

    await new Promise((resolve) => setTimeout(resolve, 50));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkedAt: new Date().toISOString(),
        mode: body.mode ?? "live",
        results: names.flatMap((name, index) =>
          requestedExtensions.map((extension) =>
            fakeResult(name, extension, index < 10 ? "available_confirmed" : "taken_confirmed"),
          ),
        ),
        recommendations: names.map((name, index) => fakeRecommendation(name, 88 - index)),
      }),
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Find the perfect AI-native domain before someone else does.",
    }),
  ).toBeVisible();

  await page.getByPlaceholder("aptava").fill("enterprisedata");
  await page.getByRole("button", { name: "Search", exact: true }).nth(1).click();

  await expect(page.getByText('Searched domain: "enterprisedata"')).toBeVisible();
  await expect(page.getByText("Exact available: enterprisedata.app, enterprisedata.dev.")).toBeVisible();
  await expect(page.getByText("enterprisedata.app").first()).toBeVisible();
  await expect(page.getByText("20 of 20", { exact: true })).toBeVisible();

  const visibleDomains = await page.locator("div.font-mono.text-lg").allTextContents();
  expect(visibleDomains).toHaveLength(20);
  expect(visibleDomains.slice(0, 10).every((domain) => domain.endsWith(".ai"))).toBe(true);
  expect(visibleDomains.slice(10, 20).every((domain) => domain.endsWith(".com"))).toBe(true);
  expect(
    alternativeNames.some((name) =>
      /enterprise|business|scale|trust|venture|company|govern|data|signal|graph|metric|query|vault|atlas|stream|insight/.test(name),
    ),
  ).toBe(true);
  expect(alternativeNames.every((name) => !/(ops|cloud|grid|works)/.test(name))).toBe(true);
  expect(alternativeExtensionRequests).toContain("ai");
  expect(alternativeExtensionRequests).toContain("com");
  expect(calls).toBeGreaterThanOrEqual(3);
});

test("live search falls back to checked results when no registrar availability is confirmed", async ({ page }) => {
  let calls = 0;
  const alternativeBatchesByExtension: Record<string, number> = {};

  await page.route("**/api/domain/check", async (route) => {
    calls += 1;
    const body = route.request().postDataJSON() as {
      names?: string[];
      extensions?: string[];
      mode?: string;
    };
    const names = body.names?.length ? body.names : ["agent"];
    const extensions = body.extensions?.length ? body.extensions : ["ai"];
    const alternativeExtension = extensions[0] ?? "ai";
    const alternativeBatch =
      calls === 1
        ? 0
        : (alternativeBatchesByExtension[alternativeExtension] =
            (alternativeBatchesByExtension[alternativeExtension] ?? 0) + 1);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkedAt: new Date().toISOString(),
        mode: body.mode ?? "live",
        results: names.flatMap((name, index) =>
          extensions.map((extension) =>
            fakeResult(
              name,
              extension,
              calls === 1 || index >= 2 || alternativeBatch === 0
                ? "taken_confirmed"
                : "manual_check_required",
            ),
          ),
        ),
        recommendations: names.map((name) => fakeRecommendation(name, 76)),
        capabilities: {
          registrarAvailability: false,
          configuredRegistrarProviders: [],
        },
      }),
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Find the perfect AI-native domain before someone else does.",
    }),
  ).toBeVisible();

  await page.getByPlaceholder("aptava").fill("agent");
  await page.getByRole("button", { name: "Search", exact: true }).nth(1).click();

  await expect(page.getByText('No registrar-confirmed availability for "agent"')).toBeVisible();
  await expect(page.getByText("related candidates need registrar check")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText("Related domains to verify")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Related candidates" })).toBeVisible();
  const visibleDomains = await page.locator("div.font-mono.text-lg").allTextContents();
  expect(visibleDomains).toHaveLength(20);
  expect(visibleDomains.slice(0, 10).every((domain) => domain.endsWith(".ai"))).toBe(true);
  expect(visibleDomains.slice(10, 20).every((domain) => domain.endsWith(".com"))).toBe(true);
  expect(
    visibleDomains.some((domain) =>
      /agent|operator|assistant|autopilot|task|action/.test(domain),
    ),
  ).toBe(true);
  expect(visibleDomains.every((domain) => !/(ops|cloud|grid|works)/.test(domain))).toBe(true);
  expect(alternativeBatchesByExtension.ai).toBeGreaterThanOrEqual(5);
  expect(alternativeBatchesByExtension.com).toBeGreaterThanOrEqual(5);
  expect(calls).toBeGreaterThanOrEqual(11);
});

test("recommendation split can be customized across selected extensions", async ({ page }) => {
  let calls = 0;
  const requestedExtensions: string[] = [];

  await page.route("**/api/domain/check", async (route) => {
    calls += 1;

    if (calls === 1) {
      const body = route.request().postDataJSON() as {
        names?: string[];
        extensions?: string[];
        mode?: string;
      };
      const name = body.names?.[0] ?? "agent";
      const extensions = body.extensions?.length ? body.extensions : ["ai"];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkedAt: new Date().toISOString(),
          mode: body.mode ?? "live",
          results: extensions.map((extension) => fakeResult(name, extension)),
          recommendations: [fakeRecommendation(name, 80)],
        }),
      });
      return;
    }

    const body = route.request().postDataJSON() as {
      names?: string[];
      extensions?: string[];
      mode?: string;
    };
    const extension = body.extensions?.[0] ?? "ai";
    const quotaByExtension: Record<string, number> = { ai: 4, com: 3, tech: 3 };
    const names = (body.names ?? []).slice(0, quotaByExtension[extension] ?? 0);

    requestedExtensions.push(extension);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkedAt: new Date().toISOString(),
        mode: body.mode ?? "live",
        results: names.map((name) => fakeResult(name, extension, "available_confirmed")),
        recommendations: names.map((name, index) => fakeRecommendation(name, 90 - index)),
      }),
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Find the perfect AI-native domain before someone else does.",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: ".tech", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Quota for .ai", exact: true }).fill("4");
  await page.getByRole("spinbutton", { name: "Quota for .com", exact: true }).fill("3");
  await page.getByRole("spinbutton", { name: "Quota for .tech", exact: true }).fill("3");
  await expect(page.getByText("4 .ai / 3 .com / 3 .tech")).toBeVisible();

  await page.getByPlaceholder("aptava").fill("agent");
  await page.getByRole("button", { name: "Search", exact: true }).nth(1).click();

  await expect(page.getByText("10 of 10 related available", { exact: true })).toBeVisible();

  const visibleDomains = await page.locator("div.font-mono.text-lg").allTextContents();
  expect(visibleDomains).toHaveLength(10);
  expect(visibleDomains.slice(0, 4).every((domain) => domain.endsWith(".ai"))).toBe(true);
  expect(visibleDomains.slice(4, 7).every((domain) => domain.endsWith(".com"))).toBe(true);
  expect(visibleDomains.slice(7, 10).every((domain) => domain.endsWith(".tech"))).toBe(true);
  expect(requestedExtensions).toContain("ai");
  expect(requestedExtensions).toContain("com");
  expect(requestedExtensions).toContain("tech");
});

test("crowded agent searches broaden to commercial related names", async ({ page }) => {
  let calls = 0;
  let alternativeNames: string[] = [];
  let alternativeExtensionRequests: string[] = [];

  await page.route("**/api/domain/check", async (route) => {
    calls += 1;

    if (calls === 1) {
      const body = route.request().postDataJSON() as {
        names?: string[];
        extensions?: string[];
        mode?: string;
      };
      const name = body.names?.[0] ?? "agent";
      const extensions = body.extensions?.length ? body.extensions : ["ai"];

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          checkedAt: new Date().toISOString(),
          mode: body.mode ?? "live",
          results: extensions.map((extension) => fakeResult(name, extension)),
          recommendations: [fakeRecommendation(name, 72)],
        }),
      });
      return;
    }

    const body = route.request().postDataJSON() as {
      names?: string[];
      extensions?: string[];
      mode?: string;
    };
    const currentAlternativeNames = body.names ?? [];
    alternativeNames = Array.from(new Set([...alternativeNames, ...currentAlternativeNames]));
    alternativeExtensionRequests = [
      ...alternativeExtensionRequests,
      ...(body.extensions ?? []),
    ];
    const requestedExtension = body.extensions?.[0] ?? "ai";
    const commercialFallbacks = currentAlternativeNames
      .filter((name) => name.includes("agent") || /^(operator|assistant|autopilot)/.test(name))
      .slice(0, 10);
    const status =
      requestedExtension === "ai" && calls === 2
        ? "taken_confirmed"
        : "available_confirmed";

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkedAt: new Date().toISOString(),
        mode: body.mode ?? "live",
        results: commercialFallbacks.map((name) =>
          fakeResult(name, requestedExtension, status),
        ),
        recommendations: commercialFallbacks.map((name, index) =>
          fakeRecommendation(name, 90 - index),
        ),
      }),
    });
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Find the perfect AI-native domain before someone else does.",
    }),
  ).toBeVisible();

  await page.getByPlaceholder("aptava").fill("agent");
  await page.getByRole("button", { name: "Search", exact: true }).nth(1).click();

  await expect(page.getByText('No registrar-confirmed availability for "agent"')).toBeVisible();
  await expect(page.getByText("20 of 20 related available", { exact: true })).toBeVisible();
  await expect(page.getByText("8 exact checks", { exact: true })).not.toBeVisible();

  const visibleDomains = await page.locator("div.font-mono.text-lg").allTextContents();
  expect(visibleDomains).toHaveLength(20);
  expect(visibleDomains.slice(0, 10).every((domain) => domain.endsWith(".ai"))).toBe(true);
  expect(visibleDomains.slice(10, 20).every((domain) => domain.endsWith(".com"))).toBe(true);
  expect(visibleDomains.some((domain) => domain.endsWith(".dev"))).toBe(false);
  expect(visibleDomains.some((domain) => /agent|operator|assistant|autopilot/.test(domain))).toBe(true);
  expect(visibleDomains.every((domain) => !/(ops|cloud|grid|works)/.test(domain))).toBe(true);
  expect(alternativeExtensionRequests).toContain("ai");
  expect(alternativeExtensionRequests).toContain("com");
  expect(calls).toBeGreaterThanOrEqual(3);
});

test("user saves favorites and sees them in saved projects", async ({ page }) => {
  await openApp(page);
  await runHeroSearch(page);
  await showAllResults(page);

  await page.getByRole("button", { name: "Save domain" }).first().click();
  await page.getByRole("navigation").getByRole("button", { name: "Saved" }).click();

  await expect(page.getByRole("heading", { name: "Founder shortlist" })).toBeVisible();
  await expect(page.getByText("aptava.ai").first()).toBeVisible();
});

test("user exports CSV", async ({ page }) => {
  await openApp(page);
  await runHeroSearch(page);

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();

  await expect((await download).suggestedFilename()).toBe("domain-intelligence.csv");
});

test("user switches theme", async ({ page }) => {
  await openApp(page);

  await page.getByRole("button", { name: "Light theme" }).click();

  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("bulk checker processes pasted names", async ({ page }) => {
  await openApp(page);

  await page.getByRole("navigation").getByRole("button", { name: "Bulk" }).click();
  await page.getByLabel("Bulk domain names").fill("aptava\nsatyaflow");
  await page.getByRole("button", { name: "Run bulk" }).click();
  await page.getByRole("button", { name: "Review unavailable and needs-check results" }).click();

  await expect(page.getByText("Bulk results")).toBeVisible();
  await expect(page.getByText("aptava.ai").first()).toBeVisible();
  await expect(page.getByText("satyaflow.ai").first()).toBeVisible();
});

test("pending checks show progressive status before results land", async ({ page }) => {
  await page.route("**/api/domain/check", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await openApp(page);

  await page.getByRole("button", { name: "Search", exact: true }).nth(1).click();

  await expect(page.getByText("Checking domain stack")).toBeVisible();
  await expect(page.getByText("Availability Matrix")).toBeVisible();
});
