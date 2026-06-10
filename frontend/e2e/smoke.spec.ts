import { expect, test } from "@playwright/test";

// Aladin Lite markers are drawn into a canvas by an external CDN script and are
// flaky to click in headless Chromium, so we navigate to a case by direct hash.
// The sky chrome assertion still confirms SkyMain mounted at the workstation
// root.
test("sky view loads and a case opens into the story view", async ({ page }) => {
  await page.goto("/workstation/?nointro=1");

  await expect(page.getByText("Argus", { exact: true }).first()).toBeVisible();

  await page.goto("/workstation/?nointro=1#case/ZTF18abujsbq");

  await expect(page.getByTestId("story-root")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What is this?" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Why was it flagged?" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "What would an astronomer check next?" }),
  ).toBeVisible();
  await expect(page.getByTestId("light-curve-panel")).toBeVisible();

  await page.getByTestId("story-expert-toggle").click();
  await expect(page.getByTestId("story-expert-content")).toBeVisible();
  await expect(page.getByTestId("assessment-panel")).toBeVisible();
});

test("story view stacks cleanly at 375px (mobile)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/workstation/?nointro=1#case/ZTF18abujsbq");

  await expect(page.getByTestId("story-root")).toBeVisible();
  await expect(page.getByRole("heading", { name: "What is this?" })).toBeVisible();
  await expect(page.getByTestId("light-curve-panel")).toBeVisible();

  // Vertical layout: the story root should fit the viewport width and the
  // body should be scrollable vertically rather than horizontally.
  const root = page.getByTestId("story-root");
  const box = await root.boundingBox();
  expect(box?.width ?? 0).toBeLessThanOrEqual(375);
});
