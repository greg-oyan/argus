import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { loadAladinLite } from "../../lib/aladin";
import { priorityMarkerEncoding } from "../../lib/glyphEncoding";
import { plainHeadline } from "../../lib/plainLanguage";
import { staticDemoUrl } from "../../lib/paths";
import { isPresenterMode, shouldSkipIntro } from "../../lib/presenterMode";
import { useInvestigationStore } from "../../stores/investigationStore";
import type {
  CaseFileDetailMap,
  CasefileIndex,
  CasefileIndexEntry,
  Coordinates,
} from "../../types/casefile";

interface SkyMainProps {
  index: CasefileIndex | null;
  caseDetails: CaseFileDetailMap;
  isLoading: boolean;
  error: string | null;
  onOpenCase: (oid: string) => void;
}

type SkyStatus = "idle" | "loading" | "ready" | "failed";

interface SkyEntry {
  entry: CasefileIndexEntry;
  ra: number;
  dec: number;
}

const OVERLAY_STORAGE_KEY = "argus.workstation.skyOverlayDismissed.v1";
const OVERLAY_AUTO_FADE_MS = 6500;
const FLY_TO_FOV = 0.3;
const FLY_TO_DURATION = 1.2;
const OPEN_CASE_DELAY_MS = 320;
const SELECTION_COLOR = "#ffffff";
const SELECTION_SOURCE_SIZE = 22;

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function usableCoordinates(
  coordinates: Coordinates | undefined,
): coordinates is Coordinates & { ra: number; dec: number } {
  if (!finiteNumber(coordinates?.ra) || !finiteNumber(coordinates?.dec)) {
    return false;
  }
  const raUnit = coordinates.ra_unit ?? "deg";
  const decUnit = coordinates.dec_unit ?? "deg";
  return (
    raUnit === "deg" &&
    decUnit === "deg" &&
    coordinates.ra >= 0 &&
    coordinates.ra < 360 &&
    coordinates.dec >= -90 &&
    coordinates.dec <= 90
  );
}

function circularMeanRa(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce(
    (acc, value) => {
      const radians = (value * Math.PI) / 180;
      return { sin: acc.sin + Math.sin(radians), cos: acc.cos + Math.cos(radians) };
    },
    { sin: 0, cos: 0 },
  );
  const degrees = (Math.atan2(sum.sin, sum.cos) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

function angularOffset(ra: number, centerRa: number): number {
  return ((ra - centerRa + 540) % 360) - 180;
}

function skyFrame(entries: SkyEntry[]) {
  if (entries.length === 0) {
    return { centerRa: 180, centerDec: 0, fov: 60 };
  }
  const centerRa = circularMeanRa(entries.map((item) => item.ra));
  const centerDec =
    entries.reduce((total, item) => total + item.dec, 0) / Math.max(1, entries.length);
  // Cluster bbox: full extent in each axis, scaled cos(dec) so RA spread is
  // an actual on-sky angle rather than a coordinate delta.
  const decRad = (centerDec * Math.PI) / 180;
  const cosDec = Math.max(0.1, Math.cos(decRad));
  const raSpread =
    Math.max(...entries.map((item) => Math.abs(angularOffset(item.ra, centerRa)))) * 2 * cosDec;
  const decSpread =
    Math.max(...entries.map((item) => Math.abs(item.dec - centerDec))) * 2;
  // Frame the cluster generously: bbox extent x 2.5, with a 4 deg floor so
  // a tight cluster does not start zoomed in past the marker scale, then
  // clamp to [20, 120] so the first paint is sky-with-stars (SIN/MOL),
  // never the AIT whole-sky ellipse on a 100vh canvas.
  const raw = Math.max(4, Math.max(raSpread, decSpread)) * 2.5;
  const fov = Math.max(20, Math.min(120, raw));
  return { centerRa, centerDec, fov };
}

function extractOid(object: unknown): string | null {
  if (!object || typeof object !== "object") return null;
  const data = (object as { data?: Record<string, unknown> }).data;
  return data && typeof data.oid === "string" ? data.oid : null;
}

function overlayWasDismissed(): boolean {
  try {
    return sessionStorage.getItem(OVERLAY_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markOverlayDismissed(): void {
  try {
    sessionStorage.setItem(OVERLAY_STORAGE_KEY, "1");
  } catch {
    /* noop */
  }
}

export function SkyMain({ index, caseDetails, isLoading, error, onOpenCase }: SkyMainProps) {
  const selectedOid = useInvestigationStore((state) => state.selectedOid);
  const setSelectedOid = useInvestigationStore((state) => state.setSelectedOid);
  const setHoveredOid = useInvestigationStore((state) => state.setHoveredOid);
  const reduceMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aladinRef = useRef<AladinLiteInstance | null>(null);
  const aladinGlobalRef = useRef<AladinLiteGlobal | null>(null);
  const selectionCatalogRef = useRef<AladinLiteCatalog | null>(null);
  const sourceByOidRef = useRef<Map<string, { ra: number; dec: number }>>(new Map());
  const onOpenCaseRef = useRef(onOpenCase);
  const setSelectedOidRef = useRef(setSelectedOid);
  const setHoveredOidRef = useRef(setHoveredOid);
  const [status, setStatus] = useState<SkyStatus>("idle");
  const [reloadKey, setReloadKey] = useState(0);
  const [hoveredEntry, setHoveredEntry] = useState<CasefileIndexEntry | null>(null);
  const [missingListOpen, setMissingListOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const presenter = isPresenterMode();
  const [overlayVisible, setOverlayVisible] = useState(() =>
    !shouldSkipIntro() && !overlayWasDismissed(),
  );

  onOpenCaseRef.current = onOpenCase;
  setSelectedOidRef.current = setSelectedOid;
  setHoveredOidRef.current = (oid: string | null) => {
    setHoveredOid(oid);
    if (oid && index) {
      const found = index.entries.find((item) => item.oid === oid);
      setHoveredEntry(found ?? null);
    } else {
      setHoveredEntry(null);
    }
  };

  const entries = index?.entries ?? [];
  const skyEntries = useMemo<SkyEntry[]>(
    () =>
      entries.flatMap((entry) => {
        const detail = caseDetails[entry.oid];
        if (!detail || !usableCoordinates(detail.coordinates)) {
          return [];
        }
        return [{ entry, ra: detail.coordinates.ra, dec: detail.coordinates.dec }];
      }),
    [caseDetails, entries],
  );
  const invitationEntry = useMemo<SkyEntry | null>(() => {
    const high = skyEntries.filter(
      (item) => item.entry.review_priority?.level === "high",
    );
    if (high.length === 0) {
      return skyEntries[0] ?? null;
    }
    return high.reduce(
      (best, current) =>
        (current.entry.review_priority?.score ?? 0) >
        (best.entry.review_priority?.score ?? 0)
          ? current
          : best,
      high[0],
    );
  }, [skyEntries]);
  const [invitationPos, setInvitationPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const missingEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const detail = caseDetails[entry.oid];
        return !detail || !usableCoordinates(detail.coordinates);
      }),
    [caseDetails, entries],
  );
  const frame = useMemo(() => skyFrame(skyEntries), [skyEntries]);

  useEffect(() => {
    if (!overlayVisible || reduceMotion || presenter) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      markOverlayDismissed();
      setOverlayVisible(false);
    }, OVERLAY_AUTO_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [overlayVisible, presenter, reduceMotion]);

  useEffect(() => {
    aladinRef.current?.remove?.();
    aladinRef.current = null;
    aladinGlobalRef.current = null;
    selectionCatalogRef.current = null;
    sourceByOidRef.current = new Map();

    if (!containerRef.current || skyEntries.length === 0) {
      setStatus("idle");
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    containerRef.current.innerHTML = "";

    // Aladin Lite v3 reads container size synchronously at init and locks
    // canvas dimensions to those values. If we call init while the container
    // is still 0-height (layout not yet applied / React 19 + StrictMode
    // ordering), the canvases end up 1px tall and the page renders as a
    // black void regardless of which survey responds. Wait until the
    // container has a real height (up to ~2s) before init.
    const waitForContainerSize = (): Promise<HTMLDivElement | null> => {
      return new Promise((resolve) => {
        const start = performance.now();
        const tick = () => {
          if (cancelled) {
            resolve(null);
            return;
          }
          const node = containerRef.current;
          if (node && node.clientHeight > 4 && node.clientWidth > 4) {
            resolve(node);
            return;
          }
          if (performance.now() - start > 2000) {
            resolve(node ?? null);
            return;
          }
          window.requestAnimationFrame(tick);
        };
        tick();
      });
    };

    // Stops the loading state from flashing too briefly to read.
    const minimumLoadingMs = 1500;
    // If we are still in loading after this, the external service didn't
    // deliver. Show the failure panel with a fallback object list.
    const failTimer = window.setTimeout(() => {
      if (cancelled) return;
      setStatus((current) => (current === "ready" ? current : "failed"));
    }, 12_000);

    const initStart = performance.now();

    Promise.all([loadAladinLite(), waitForContainerSize()])
      .then(([A, node]) => {
        if (cancelled) return;
        if (!node || node.clientHeight <= 4) {
          window.clearTimeout(failTimer);
          setStatus("failed");
          return;
        }
        const aladin = A.aladin("#argus-sky-main", {
          survey: "P/DSS2/color",
          target: `${frame.centerRa} ${frame.centerDec}`,
          fov: frame.fov,
          cooFrame: "equatorial",
          // SIN renders a recognizable star field at our framed FoVs;
          // AIT collapsed everything to a small ellipse on the dark canvas.
          projection: "SIN",
          showReticle: false,
          showCooGrid: false,
          showCooGridControl: false,
          showSimbadPointerControl: false,
          showFullscreenControl: false,
          showLayersControl: false,
          showGotoControl: false,
          showShareControl: false,
        });
        aladinRef.current = aladin;
        aladinGlobalRef.current = A;

        const positionByOid = new Map<string, { ra: number; dec: number }>();
        for (const item of skyEntries) {
          positionByOid.set(item.entry.oid, { ra: item.ra, dec: item.dec });
        }
        sourceByOidRef.current = positionByOid;

        // Catalogs are added only after the loading state ends, so the
        // starfield overlay covers any half-painted marker layer Aladin
        // sketches in during its first frames.
        const addCatalogsAndEvents = () => {
        if (A.catalog && A.source && aladin.addCatalog) {
          const buckets = new Map<
            string,
            { color: string; size: number; entries: SkyEntry[] }
          >();
          for (const item of skyEntries) {
            const encoding = priorityMarkerEncoding(item.entry);
            const key = `${encoding.color}|${encoding.size}`;
            const bucket = buckets.get(key);
            if (bucket) {
              bucket.entries.push(item);
            } else {
              buckets.set(key, {
                color: encoding.color,
                size: encoding.size,
                entries: [item],
              });
            }
          }
          const sorted = Array.from(buckets.values()).sort((a, b) => a.size - b.size);
          for (const bucket of sorted) {
            const catalog = A.catalog({
              name: `Argus flagged (${bucket.color})`,
              color: bucket.color,
              sourceSize: bucket.size,
              shape: "circle",
            });
            const sources = bucket.entries
              .map((item) =>
                A.source?.(item.ra, item.dec, { oid: item.entry.oid, name: item.entry.oid }),
              )
              .filter((s): s is AladinLiteSource => Boolean(s));
            catalog.addSources?.(sources);
            aladin.addCatalog(catalog);
          }
          const selectionCatalog = A.catalog({
            name: "Argus selected",
            color: SELECTION_COLOR,
            sourceSize: SELECTION_SOURCE_SIZE,
            shape: "circle",
          });
          aladin.addCatalog(selectionCatalog);
          selectionCatalogRef.current = selectionCatalog;
        }

        if (typeof aladin.on === "function") {
          aladin.on("objectClicked", (object) => {
            const oid = extractOid(object);
            if (!oid) return;
            const coords = sourceByOidRef.current.get(oid);
            setSelectedOidRef.current(oid);
            if (coords) {
              aladin.gotoRaDec?.(coords.ra, coords.dec);
              if (reduceMotion) {
                aladin.setFoV?.(FLY_TO_FOV);
              } else if (aladin.zoomToFoV) {
                aladin.zoomToFoV(FLY_TO_FOV, FLY_TO_DURATION);
              } else {
                aladin.setFoV?.(FLY_TO_FOV);
              }
            }
            window.setTimeout(
              () => onOpenCaseRef.current(oid),
              reduceMotion ? 0 : OPEN_CASE_DELAY_MS,
            );
          });
          aladin.on("objectHovered", (object) => {
            if (object === null || object === undefined) {
              setHoveredOidRef.current(null);
              return;
            }
            const oid = extractOid(object);
            setHoveredOidRef.current(oid);
          });
        }
        };

        const elapsed = performance.now() - initStart;
        const remaining = Math.max(0, minimumLoadingMs - elapsed);
        window.setTimeout(() => {
          if (cancelled) return;
          addCatalogsAndEvents();
          window.clearTimeout(failTimer);
          setStatus("ready");
        }, remaining);
      })
      .catch(() => {
        if (cancelled) return;
        window.clearTimeout(failTimer);
        setStatus("failed");
      });

    return () => {
      cancelled = true;
      window.clearTimeout(failTimer);
      aladinRef.current?.remove?.();
      aladinRef.current = null;
      aladinGlobalRef.current = null;
      selectionCatalogRef.current = null;
    };
  }, [frame.centerDec, frame.centerRa, frame.fov, reduceMotion, skyEntries, reloadKey]);

  useEffect(() => {
    if (status !== "ready" || !invitationEntry) {
      setInvitationPos(null);
      return undefined;
    }
    const aladin = aladinRef.current;
    if (!aladin || typeof aladin.world2pix !== "function") {
      setInvitationPos(null);
      return undefined;
    }
    let cancelled = false;
    const project = () => {
      if (cancelled) return;
      try {
        const result = aladin.world2pix?.(invitationEntry.ra, invitationEntry.dec);
        if (result && Number.isFinite(result[0]) && Number.isFinite(result[1])) {
          setInvitationPos({ x: result[0], y: result[1] });
        } else {
          setInvitationPos(null);
        }
      } catch {
        setInvitationPos(null);
      }
    };
    project();
    // Aladin v3 exposes "positionChanged" / "zoomChanged" events; subscribe to
    // those when available so the pulse re-projects exactly when the view
    // moves. The 1000ms interval is a fallback for runtimes that don't fire
    // those events and for projection-matrix updates that happen async during
    // a flyTo. The Aladin runtime we load doesn't expose an `off` removal API,
    // so unmount safety is the existing `cancelled` guard inside `project`.
    if (typeof aladin.on === "function") {
      try {
        aladin.on("positionChanged", project);
      } catch {
        /* event name unsupported in this build */
      }
      try {
        aladin.on("zoomChanged", project);
      } catch {
        /* event name unsupported in this build */
      }
    }
    const interval = window.setInterval(project, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [invitationEntry, status]);

  useEffect(() => {
    if (status !== "ready") return;
    const A = aladinGlobalRef.current;
    const selectionCatalog = selectionCatalogRef.current;
    if (!A?.source || !selectionCatalog) return;
    if (typeof selectionCatalog.removeAll === "function") {
      selectionCatalog.removeAll();
    }
    if (!selectedOid) return;
    const coords = sourceByOidRef.current.get(selectedOid);
    if (!coords || typeof selectionCatalog.addSources !== "function") return;
    const source = A.source(coords.ra, coords.dec, {
      oid: selectedOid,
      name: `${selectedOid} (selected)`,
    });
    if (source) {
      selectionCatalog.addSources([source]);
    }
  }, [selectedOid, status]);

  function dismissOverlay() {
    markOverlayDismissed();
    setOverlayVisible(false);
  }

  return (
    <div className="argus-sky-root relative h-screen w-screen overflow-hidden bg-workstation-bg text-workstation-text">
      {/*
        Aladin Lite v3 rewrites the container's position to `relative` during
        init, which kills `absolute inset-0`. Inline width/height percentages
        survive that rewrite and let Aladin read a real clientHeight at init,
        so the canvas does not lock at 1px tall.
      */}
      <div
        id="argus-sky-main"
        ref={containerRef}
        style={{ width: "100%", height: "100%" }}
      />

      {/*
        Starfield placeholder. Visible whenever real tiles haven't taken over.
        Cross-fades out once status flips to "ready"; remains under the
        failure panel when status flips to "failed" so the page never goes
        to a true black void.
      */}
      <div
        aria-hidden="true"
        className={`argus-starfield ${reduceMotion ? "" : "argus-starfield-twinkle"} pointer-events-none absolute inset-0 transition-opacity duration-700`}
        style={{ opacity: status === "ready" ? 0 : 1 }}
      />

      {status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="font-mono text-xs uppercase tracking-[0.22em] text-workstation-muted">
            Loading the sky…
          </p>
        </div>
      ) : null}

      {invitationPos && !overlayVisible ? (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute z-10 h-16 w-16 rounded-full ${
            reduceMotion ? "argus-marker-pulse-static" : "argus-marker-pulse"
          }`}
          style={{
            left: invitationPos.x,
            top: invitationPos.y,
            transform: reduceMotion ? "translate(-50%, -50%)" : undefined,
          }}
        />
      ) : null}

      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-workstation-bg/80">
          <p className="font-mono text-sm uppercase tracking-[0.18em] text-workstation-muted">
            Loading flagged objects…
          </p>
        </div>
      ) : null}

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center bg-workstation-bg/80 px-6 text-center">
          <p className="max-w-md text-sm leading-6 text-workstation-red">{error}</p>
        </div>
      ) : null}

      {status === "failed" && !isLoading && !error ? (
        <div className="absolute inset-0 z-20 flex items-center justify-center overflow-auto p-6">
          <div className="w-full max-w-2xl space-y-6">
            <div className="border border-workstation-line bg-workstation-panel/95 p-5 backdrop-blur">
              <p className="font-mono text-xs uppercase tracking-[0.22em] text-workstation-accent">
                Sky imagery offline
              </p>
              <p className="mt-3 text-base leading-7 text-white">
                The live sky imagery couldn't load (it streams from an external
                astronomy service). The flagged objects below are still available.
              </p>
              <button
                className="argus-focus-visible mt-4 border border-workstation-accent bg-workstation-accent/15 px-4 py-2 font-mono text-xs uppercase tracking-[0.22em] text-white hover:bg-workstation-accent/25"
                onClick={() => {
                  setStatus("loading");
                  setReloadKey((value) => value + 1);
                }}
                type="button"
              >
                Retry
              </button>
            </div>
            <ul className="space-y-2">
              {[...skyEntries.map((item) => item.entry), ...missingEntries].map((entry) => (
                <li key={entry.oid}>
                  <button
                    className="argus-focus-visible block w-full border border-workstation-line bg-workstation-bg/80 px-4 py-3 text-left transition-colors hover:border-workstation-accent hover:bg-workstation-bg"
                    onClick={() => {
                      setSelectedOid(entry.oid);
                      onOpenCase(entry.oid);
                    }}
                    type="button"
                  >
                    <span className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-accent">
                      {entry.oid}
                    </span>
                    <span className="mt-1 block text-sm leading-6 text-white">
                      {plainHeadline(entry)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {!presenter ? (
        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between px-4 py-4 sm:px-6 sm:py-5">
          <div className="pointer-events-auto flex items-center gap-3">
            <span className="font-mono text-sm font-semibold uppercase tracking-[0.28em] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              Argus
            </span>
            <a
              className="argus-focus-visible rounded-sm px-2 py-1 font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted hover:text-white"
              href={staticDemoUrl()}
            >
              About
            </a>
          </div>
          <div className="pointer-events-auto">
            <button
              className="argus-focus-visible rounded-sm border border-workstation-line/60 bg-workstation-bg/65 px-3 py-1 font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted backdrop-blur hover:border-workstation-accent/70 hover:text-white"
              onClick={() => setAboutOpen((value) => !value)}
              type="button"
              aria-expanded={aboutOpen}
            >
              What is Argus?
            </button>
          </div>
        </header>
      ) : null}

      {aboutOpen ? (
        <div className="pointer-events-none absolute right-4 top-16 z-30 max-w-sm sm:right-6">
          <div className="pointer-events-auto border border-workstation-line bg-workstation-panel/95 p-4 text-xs leading-5 text-workstation-muted shadow-lg backdrop-blur">
            <p>
              Argus watches public sky surveys for objects whose brightness changes don't
              match the simple models astronomers usually try first.
            </p>
            <p className="mt-2">
              The markers on the sky are objects Argus has queued for a human reviewer.
              They are not confirmed discoveries.
            </p>
            <p className="mt-2">
              Click one to see why it was flagged, and what an astronomer might check
              next.
            </p>
            <button
              className="argus-focus-visible mt-3 border border-workstation-line/70 px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-workstation-muted hover:border-workstation-accent/70 hover:text-white"
              onClick={() => setAboutOpen(false)}
              type="button"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}

      {overlayVisible && !presenter ? (
        <motion.div
          animate={{ opacity: 1 }}
          className="pointer-events-auto absolute inset-0 z-10 flex items-center justify-center bg-workstation-bg/55 px-6 text-center backdrop-blur-sm"
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.6 } }}
          initial={reduceMotion ? false : { opacity: 0 }}
          onClick={dismissOverlay}
          role="presentation"
          transition={reduceMotion ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-workstation-accent">
              Argus
            </p>
            <p className="mt-6 text-2xl font-semibold leading-[1.3] tracking-tight text-white sm:text-[2rem] sm:leading-[1.25]">
              Argus watches the sky for unusual behavior.
            </p>
            <p className="mt-3 text-2xl font-semibold leading-[1.3] tracking-tight text-white sm:text-[2rem] sm:leading-[1.25]">
              These are the objects it flagged for human review.
            </p>
            <p className="mt-6 font-mono text-sm uppercase tracking-[0.22em] text-workstation-muted">
              Click one.
            </p>
            <button
              className="argus-focus-visible mt-8 border border-workstation-accent bg-workstation-accent/15 px-5 py-2.5 font-mono text-xs uppercase tracking-[0.22em] text-white hover:bg-workstation-accent/25"
              onClick={(event) => {
                event.stopPropagation();
                dismissOverlay();
              }}
              type="button"
            >
              Enter
            </button>
          </div>
        </motion.div>
      ) : null}

      {hoveredEntry && !overlayVisible ? (
        <div className="pointer-events-none absolute inset-x-0 top-16 z-20 mx-auto flex justify-center px-4 sm:top-20">
          <div className="pointer-events-auto max-w-md border border-workstation-accent/70 bg-workstation-bg/85 px-4 py-3 shadow-[0_0_0_1px_rgba(107,183,255,0.18)] backdrop-blur">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-workstation-accent">
              {hoveredEntry.oid}
            </p>
            <p className="mt-1 text-sm leading-5 text-white">{plainHeadline(hoveredEntry)}</p>
            <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-workstation-accent">
              Click to investigate
            </p>
          </div>
        </div>
      ) : null}

      {!presenter && missingEntries.length > 0 ? (
        <div className="absolute bottom-4 right-4 z-20 max-w-xs sm:bottom-6 sm:right-6">
          {missingListOpen ? (
            <div className="border border-workstation-line bg-workstation-panel/95 p-3 backdrop-blur shadow-lg">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-workstation-muted">
                  Flagged without sky positions
                </p>
                <button
                  className="argus-focus-visible font-mono text-[0.62rem] uppercase tracking-[0.18em] text-workstation-muted hover:text-white"
                  onClick={() => setMissingListOpen(false)}
                  type="button"
                  aria-label="Close list"
                >
                  ×
                </button>
              </div>
              <ul className="max-h-64 space-y-1 overflow-auto">
                {missingEntries.map((entry) => (
                  <li key={entry.oid}>
                    <button
                      className="argus-focus-visible block w-full border border-workstation-line/60 bg-workstation-bg/60 px-2 py-2 text-left text-xs text-workstation-muted hover:border-workstation-accent/70 hover:text-white"
                      onClick={() => {
                        setSelectedOid(entry.oid);
                        onOpenCase(entry.oid);
                      }}
                      type="button"
                    >
                      <span className="block font-mono text-white">{entry.oid}</span>
                      <span className="mt-1 block leading-4">{plainHeadline(entry)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <button
              className="argus-focus-visible border border-workstation-line bg-workstation-bg/75 px-3 py-2 font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted backdrop-blur hover:border-workstation-accent/70 hover:text-white"
              onClick={() => setMissingListOpen(true)}
              type="button"
              aria-haspopup="true"
              aria-expanded={missingListOpen}
            >
              +{missingEntries.length} more without sky positions
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
