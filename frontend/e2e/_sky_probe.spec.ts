import { test } from "@playwright/test";

// Opt-in: ARGUS_SKY_PROBE=1 npm run e2e:smoke
// Loads the workstation, captures console + image-tile network traffic, and
// samples a 50x50 region from the center of the Aladin canvas to detect the
// "black void" condition. Writes a single line of evidence per concern to
// stdout so the failure can be classified (tiles failing / never requested /
// canvas black).

const PROBE = process.env.ARGUS_SKY_PROBE === "1";
test.skip(!PROBE, "Sky probe is opt-in via ARGUS_SKY_PROBE=1");

test("diagnose sky render", async ({ page }) => {
  const consoleLines: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (
      msg.type() === "error" ||
      msg.type() === "warning" ||
      text.startsWith("ARGUS-PROBE-")
    ) {
      consoleLines.push(`[${msg.type()}] ${text}`);
    }
  });
  page.on("pageerror", (err) => {
    consoleLines.push(`[pageerror] ${err.message}`);
  });

  const tileRequests: Array<{ url: string; status: number | null; failed: string | null }> = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (
      /alasky\.|aladin\.cds\.|hips\.|\.fits|\.jpg|\.png/i.test(url) &&
      /alasky|aladin|hips/i.test(url)
    ) {
      tileRequests.push({ url, status: response.status(), failed: null });
    }
  });
  page.on("requestfailed", (req) => {
    const url = req.url();
    if (/alasky|aladin|hips/i.test(url)) {
      tileRequests.push({ url, status: null, failed: req.failure()?.errorText ?? "unknown" });
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/workstation/?nointro=1");

  // Give Aladin 8s to initialize and request tiles.
  await page.waitForTimeout(8000);

  // Sample pixels from the Aladin canvas center.
  const pixelStat = await page.evaluate(() => {
    const container = document.getElementById("argus-sky-main");
    if (!container) return { error: "no #argus-sky-main" } as const;
    const containerStats = {
      clientWidth: container.clientWidth,
      clientHeight: container.clientHeight,
      offsetWidth: (container as HTMLElement).offsetWidth,
      offsetHeight: (container as HTMLElement).offsetHeight,
      computedHeight: window.getComputedStyle(container).height,
      computedPosition: window.getComputedStyle(container).position,
      parentClientHeight: (container.parentElement as HTMLElement | null)?.clientHeight,
    };
    console.log("ARGUS-PROBE-CONTAINER " + JSON.stringify(containerStats));
    const canvases = Array.from(container.querySelectorAll("canvas"));
    if (canvases.length === 0) return { error: "no canvas in container" } as const;
    const results = canvases.map((canvas, index) => {
      const ctx = canvas.getContext("2d");
      const size = 50;
      const cx = Math.max(0, Math.floor(canvas.width / 2 - size / 2));
      const cy = Math.max(0, Math.floor(canvas.height / 2 - size / 2));
      let nonBlack = 0;
      let totalR = 0;
      let totalG = 0;
      let totalB = 0;
      let sampleCount = 0;
      if (!ctx) {
        return {
          index,
          width: canvas.width,
          height: canvas.height,
          ctx2d: false,
          nonBlack,
          avg: null as null | [number, number, number],
        };
      }
      try {
        const data = ctx.getImageData(cx, cy, size, size).data;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          totalR += r;
          totalG += g;
          totalB += b;
          sampleCount += 1;
          if (r > 12 || g > 12 || b > 12) nonBlack += 1;
        }
      } catch (e) {
        return {
          index,
          width: canvas.width,
          height: canvas.height,
          ctx2d: true,
          nonBlack: -1,
          getImageDataError: String(e),
          avg: null as null | [number, number, number],
        };
      }
      const avg: [number, number, number] = sampleCount
        ? [
            Math.round(totalR / sampleCount),
            Math.round(totalG / sampleCount),
            Math.round(totalB / sampleCount),
          ]
        : [0, 0, 0];
      return {
        index,
        width: canvas.width,
        height: canvas.height,
        ctx2d: true,
        nonBlackPx: nonBlack,
        nonBlackPct: Math.round((nonBlack / Math.max(1, sampleCount)) * 100),
        avg,
      };
    });
    return { canvases: results } as const;
  });

  console.log("=== ARGUS SKY PROBE ===");
  console.log("Console errors/warnings:", consoleLines.length);
  for (const line of consoleLines) console.log("  " + line);
  console.log("Tile-ish requests:", tileRequests.length);
  for (const req of tileRequests) {
    console.log(`  ${req.status ?? "FAILED"} ${req.failed ?? ""} ${req.url}`);
  }
  console.log("Pixel sample:", JSON.stringify(pixelStat, null, 2));
  await page.screenshot({ path: "test-results/sky-probe.png", fullPage: false });
});
