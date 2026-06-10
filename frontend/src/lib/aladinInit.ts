import { loadAladinLite } from "./aladin";

// Phase 5A diagnosis: Aladin Lite v3 rewrites the container's CSS position
// to `relative` during init. If the container has no resolved height at that
// moment (React 19 + StrictMode rendering order, or any percent-height chain
// that depends on absolute positioning), both canvases lock at 1px tall and
// the page paints a black void regardless of which survey responds. The
// helper below waits for real container dimensions before calling
// A.aladin() and forces every show* widget off so callers can't forget one.

// 14 widget toggles. Override individually via the options arg if a specific
// instance really needs one back.
const CHROME_OFF: Partial<AladinLiteInitOptions> = {
  showReticle: false,
  showCooGrid: false,
  showCooGridControl: false,
  showSimbadPointerControl: false,
  showFullscreenControl: false,
  showLayersControl: false,
  showGotoControl: false,
  showShareControl: false,
  showFrame: false,
  showProjectionControl: false,
  showZoomControl: false,
  showSettingsControl: false,
  showStatusBar: false,
  showContextMenu: false,
};

export interface HardenedAladin {
  A: AladinLiteGlobal;
  aladin: AladinLiteInstance;
}

export interface InitAladinHardenedConfig {
  container: HTMLElement;
  options: AladinLiteInitOptions;
  // Caller can flip this true to early-cancel a slow init from an effect
  // cleanup. The helper resolves with a rejected promise in that case.
  signal?: { cancelled: boolean };
  // Maximum time (ms) to wait for the container to grow past 4px in each
  // dimension before throwing. Default 2000.
  maxWaitMs?: number;
}

function waitForContainerSize(
  container: HTMLElement,
  signal: { cancelled: boolean } | undefined,
  maxWaitMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      if (signal?.cancelled) {
        reject(new Error("aladin init cancelled"));
        return;
      }
      if (container.clientWidth > 4 && container.clientHeight > 4) {
        resolve();
        return;
      }
      if (performance.now() - start > maxWaitMs) {
        reject(new Error("aladin container never reached usable size"));
        return;
      }
      window.requestAnimationFrame(tick);
    };
    tick();
  });
}

export async function initAladinHardened(
  config: InitAladinHardenedConfig,
): Promise<HardenedAladin> {
  const { container, options, signal, maxWaitMs = 2000 } = config;
  const [A] = await Promise.all([
    loadAladinLite(),
    waitForContainerSize(container, signal, maxWaitMs),
  ]);
  if (signal?.cancelled) {
    throw new Error("aladin init cancelled");
  }
  const aladin = A.aladin(container, { ...CHROME_OFF, ...options });
  return { A, aladin };
}
