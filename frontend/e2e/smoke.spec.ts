import { expect, test } from "@playwright/test";

test("workstation queue opens a linked case view", async ({ page }) => {
  await page.goto("/workstation/?nointro=1");

  const glyphs = page.getByTestId("object-glyph-card");
  await expect(glyphs.first()).toBeVisible();
  await expect.poll(() => glyphs.count()).toBeGreaterThan(0);

  await glyphs.first().click();

  await expect(page.getByText("Evidence Canvas")).toBeVisible();
  await expect(page.getByTestId("assessment-panel")).toBeVisible();
  await expect(page.getByTestId("light-curve-panel")).toBeVisible();
});
