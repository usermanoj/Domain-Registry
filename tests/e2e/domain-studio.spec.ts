import { expect, test } from "@playwright/test";

test("checks the default name and renders result intelligence", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Domain Intelligence Studio" })).toBeVisible();
  await page.getByRole("button", { name: "Check", exact: true }).click();

  await expect(page.getByText("aptava.ai").first()).toBeVisible();
  await expect(page.getByText("Extension Heatmap")).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
});
