import { expect, test } from "@playwright/test";

async function openApp(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", {
      name: "Find the perfect AI-native domain before someone else does.",
    }),
  ).toBeVisible();
}

async function runHeroSearch(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Search", exact: true }).nth(1).click();
  await expect(page.getByText("Availability Matrix")).toBeVisible();
}

test("user enters a seed name and checks .ai/.com/.sg", async ({ page }) => {
  await openApp(page);

  await page.getByPlaceholder("aptava").fill("satyaflow");

  for (const extension of [".com.sg", ".io", ".co", ".app", ".dev"]) {
    await page.getByRole("button", { name: extension, exact: true }).click();
  }

  await runHeroSearch(page);

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

  await expect(page.getByText("Top 20 names")).toBeVisible();
  await expect(page.getByText("800").first()).toBeVisible();
});

test("user filters only available domains", async ({ page }) => {
  await openApp(page);
  await runHeroSearch(page);

  await page.getByRole("button", { name: "Available", exact: true }).click();

  await expect(page.getByText("aptava.app").first()).toBeVisible();
  await expect(page.getByText("aptava.ai").first()).not.toBeVisible();
});

test("user saves favorites and sees them in saved projects", async ({ page }) => {
  await openApp(page);
  await runHeroSearch(page);

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
