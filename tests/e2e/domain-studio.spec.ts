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
  status: "available_confirmed" | "taken_confirmed" = "taken_confirmed",
) {
  const domain = `${name}.${extension}`;

  return {
    domain,
    sld: name,
    tld: extension,
    status,
    confidence: "high",
    source: status === "available_confirmed" ? "rdap" : "dns",
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
  let availableAlternative = "enterpriseai";
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
      mode?: string;
    };
    alternativeNames = body.names ?? [];
    availableAlternative = alternativeNames[0] ?? availableAlternative;

    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        checkedAt: new Date().toISOString(),
        mode: body.mode ?? "live",
        results: [fakeResult(availableAlternative, "ai", "available_confirmed")],
        recommendations: [fakeRecommendation(availableAlternative, 91)],
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

  await expect(page.getByText('"enterprise" domain is not available')).toBeVisible();
  await expect(page.getByText("Finding top 20 available related domains")).toBeVisible();
  await expect(page.getByText("Finding available alternatives")).toBeVisible();
  await expect(page.getByText("0 of 20 related available", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Available recommendations")).toBeVisible();
  await expect(page.getByText(`${availableAlternative}.ai`).first()).toBeVisible();
  await expect(page.getByText("Below are the top 20 related available domains")).toBeVisible();
  await expect(page.getByText("1 of 20 related available", { exact: true })).toBeVisible();
  await expect(page.getByText("1 of 20", { exact: true })).toBeVisible();
  expect(alternativeNames.length).toBeGreaterThan(0);
  expect(alternativeNames.some((name) => name.startsWith("enterprise"))).toBe(true);
  expect(alternativeNames.some((name) => name.endsWith("enterprise"))).toBe(true);
  expect(alternativeNames.every((name) => name.includes("enterprise"))).toBe(true);
  expect(alternativeNames).not.toContain("aptasignal");
  expect(alternativeNames).not.toContain("satyaflow");
  expect(alternativeNames).not.toContain("ritamflow");
  expect(calls).toBeGreaterThan(1);
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
