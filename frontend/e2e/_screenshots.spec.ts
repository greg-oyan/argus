import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

// Opt-in: ARGUS_CAPTURE_SCREENSHOTS=1 npm run e2e:smoke
// Captures the live UI as PNG into docs/media/ for the README and About page.
// Aladin Lite tiles load from an external CDN; the script gives them several
// seconds. Sky tiles do paint in headless Chromium with the current build,
// but quality varies — re-shoot social-preview.png by hand for marketing
// if it matters.

const CAPTURE = process.env.ARGUS_CAPTURE_SCREENSHOTS === "1";
test.skip(!CAPTURE, "Screenshot capture is opt-in via ARGUS_CAPTURE_SCREENSHOTS=1");

const MEDIA_DIR = path.resolve(moduleDir, "..", "..", "docs", "media");

async function ensureMediaDir() {
  await mkdir(MEDIA_DIR, { recursive: true });
}

test.describe("argus screenshots", () => {
  test.beforeEach(async () => {
    await ensureMediaDir();
  });

  test("sky view (workstation-sky.png)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Skip the tour so the capture shows the unobstructed sky with markers.
    await page.goto("/workstation/?nointro=1");
    // Loading state has a 1.5s minimum; give Aladin time to actually paint
    // tiles before we shoot.
    await page.waitForTimeout(9000);
    await page.screenshot({
      path: path.join(MEDIA_DIR, "workstation-sky.png"),
      fullPage: false,
    });
  });

  test("social preview (social-preview.png, 1280x640)", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 640 });
    // Show step 1 of the tour as the marketing image (plain Argus line).
    await page.goto("/workstation/");
    await expect(
      page.getByText("Argus watches the sky for unusual behavior."),
    ).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: path.join(MEDIA_DIR, "social-preview.png"),
      fullPage: false,
    });
  });

  test("story view (workstation-story.png)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/workstation/?nointro=1#case/ZTF18abujsbq");
    await expect(page.getByRole("heading", { name: "What is this?" })).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(3000);
    await page.screenshot({
      path: path.join(MEDIA_DIR, "workstation-story.png"),
      fullPage: true,
    });
  });

  test("expert view (workstation-expert.png)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("/workstation/?nointro=1#case/ZTF18abujsbq");
    await expect(page.getByTestId("story-expert-toggle")).toBeVisible();
    await page.getByTestId("story-expert-toggle").click();
    await expect(page.getByTestId("story-expert-content")).toBeVisible();
    await page.waitForTimeout(800);
    await page.getByTestId("story-expert-content").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: path.join(MEDIA_DIR, "workstation-expert.png"),
      fullPage: true,
    });
  });
});
