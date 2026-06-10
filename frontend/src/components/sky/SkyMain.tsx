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
    return { centerRa: 180, centerDec: 0, fov: 180 };
  }
  const centerRa = circularMeanRa(entries.map((item) => item.ra));
  const centerDec =
    entries.reduce((total, item) => total + item.dec, 0) / Math.max(1, entries.length);
  const raSpread = Math.max(...entries.map((item) => Math.abs(angularOffset(item.ra, centerRa)))) * 2;
  const decSpread = Math.max(...entries.map((item) => Math.abs(item.dec - centerDec))) * 2;
  const fov = Math.max(2, Math.min(180, Math.max(raSpread, decSpread) + 12));
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

    loadAladinLite()
      .then((A) => {
        if (cancelled) return;
        const aladin = A.aladin("#argus-sky-main", {
          survey: "P/DSS2/color",
          target: `${frame.centerRa} ${frame.centerDec}`,
          fov: frame.fov,
          cooFrame: "equatorial",
          projection: "AIT",
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

        setStatus("ready");
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("failed");
      });

    return () => {
      cancelled = true;
      aladinRef.current?.remove?.();
      aladinRef.current = null;
      aladinGlobalRef.current = null;
      selectionCatalogRef.current = null;
    };
  }, [frame.centerDec, frame.centerRa, frame.fov, reduceMotion, skyEntries]);

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
      <div className="absolute inset-0" id="argus-sky-main" ref={containerRef} />

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
        <div className="absolute inset-x-0 top-1/3 mx-auto max-w-md px-6 text-center">
          <p className="text-sm leading-6 text-workstation-muted">
            External sky imagery did not load. You can still browse the flagged objects
            from the list below.
          </p>
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
          exit={{ opacity: 0 }}
          initial={reduceMotion ? false : { opacity: 0 }}
          onClick={dismissOverlay}
          role="presentation"
          transition={reduceMotion ? { duration: 0 } : { duration: 0.5 }}
        >
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-workstation-accent">
              Argus
            </p>
            <p className="mt-4 text-xl leading-8 text-white sm:text-2xl sm:leading-9">
              Argus watches the sky for unusual behavior. These are the objects it
              flagged for human review.
            </p>
            <p className="mt-3 text-base leading-7 text-workstation-muted">Click one.</p>
            <button
              className="argus-focus-visible mt-6 border border-workstation-accent/70 bg-workstation-accent/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-white hover:bg-workstation-accent/20"
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
          <div className="pointer-events-auto max-w-md border border-workstation-line bg-workstation-bg/85 px-4 py-3 backdrop-blur">
            <p className="font-mono text-xs uppercase tracking-[0.16em] text-workstation-muted">
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
