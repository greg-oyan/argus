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

  const chrome = await page.evaluate(() => {
    const container = document.getElementById("argus-sky-main");
    if (!container) return [];
    const items: Array<{ tag: string; cls: string; text: string }> = [];
    container.querySelectorAll<HTMLElement>("div, span, button, a").forEach((el) => {
      if (el === container) return;
      // Only catalog visible siblings of the canvas (Aladin's widget chrome
      // sits in absolutely positioned divs over the canvas).
      const rect = el.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return;
      const text = (el.textContent ?? "").trim().slice(0, 60);
      const cls = el.className.toString().slice(0, 80);
      const tag = el.tagName.toLowerCase();
      // Skip our own chrome (it lives outside #argus-sky-main).
      items.push({ tag, cls, text });
    });
    return items.slice(0, 40);
  });
  console.log("Aladin DOM children:", JSON.stringify(chrome, null, 2));
  await page.screenshot({ path: "test-results/sky-probe.png", fullPage: false });
});

test("diagnose story cutout render", async ({ page }) => {
  const consoleLines: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (msg.type() === "error" || text.startsWith("ARGUS-PROBE-")) {
      consoleLines.push(`[${msg.type()}] ${text}`);
    }
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/workstation/?nointro=1#case/ZTF18abujsbq");
  await page.waitForTimeout(10000);

  const cutout = await page.evaluate(() => {
    const host = document.querySelector(".argus-cutout-host");
    if (!host) return { error: "no .argus-cutout-host" } as const;
    const hostRect = host.getBoundingClientRect();
    const canvases = Array.from(host.querySelectorAll("canvas"));
    const results = canvases.map((canvas, index) => {
      const ctx = canvas.getContext("2d");
      const size = 30;
      const cx = Math.max(0, Math.floor(canvas.width / 2 - size / 2));
      const cy = Math.max(0, Math.floor(canvas.height / 2 - size / 2));
      let nonBlack = 0;
      let totalR = 0;
      let totalG = 0;
      let totalB = 0;
      let n = 0;
      if (!ctx) {
        return {
          index,
          width: canvas.width,
          height: canvas.height,
          ctx2d: false,
        };
      }
      try {
        const data = ctx.getImageData(cx, cy, size, size).data;
        for (let i = 0; i < data.length; i += 4) {
          totalR += data[i];
          totalG += data[i + 1];
          totalB += data[i + 2];
          n += 1;
          if (data[i] > 12 || data[i + 1] > 12 || data[i + 2] > 12) nonBlack += 1;
        }
      } catch (e) {
        return {
          index,
          width: canvas.width,
          height: canvas.height,
          ctx2d: true,
          err: String(e),
        };
      }
      const avg: [number, number, number] = n
        ? [Math.round(totalR / n), Math.round(totalG / n), Math.round(totalB / n)]
        : [0, 0, 0];
      return {
        index,
        width: canvas.width,
        height: canvas.height,
        ctx2d: true,
        nonBlack,
        nonBlackPct: Math.round((nonBlack / Math.max(1, n)) * 100),
        avg,
      };
    });
    const chrome = Array.from(host.querySelectorAll<HTMLElement>("[class*='aladin-']"))
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 4 && r.height > 4;
      })
      .map((el) => ({ tag: el.tagName.toLowerCase(), cls: el.className.slice(0, 60) }));
    return {
      hostWidth: Math.round(hostRect.width),
      hostHeight: Math.round(hostRect.height),
      canvases: results,
      chrome,
    } as const;
  });

  console.log("=== STORY CUTOUT PROBE ===");
  console.log("Console errors:", consoleLines.length);
  for (const line of consoleLines) console.log("  " + line);
  console.log("Cutout:", JSON.stringify(cutout, null, 2));
  await page.screenshot({ path: "test-results/cutout-probe.png", fullPage: false });
});
