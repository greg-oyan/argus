import { expect, test } from "@playwright/test";

// Aladin Lite markers are drawn into a canvas by an external CDN script and are
// flaky to click in headless Chromium, so we navigate to a case by direct hash.
// The sky chrome assertion still confirms SkyMain mounted at the workstation
// root.
test("sky view loads and a case opens via direct navigation", async ({ page }) => {
  await page.goto("/workstation/?nointro=1");

  await expect(page.getByText("Argus", { exact: true }).first()).toBeVisible();

  await page.goto("/workstation/?nointro=1#case/ZTF18abujsbq");
  await expect(page.getByText("Evidence Canvas")).toBeVisible();
  await expect(page.getByTestId("light-curve-panel")).toBeVisible();
});
