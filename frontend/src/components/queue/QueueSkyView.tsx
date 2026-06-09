import { useEffect, useMemo, useRef, useState } from "react";
import { loadAladinLite } from "../../lib/aladin";
import { priorityMarkerEncoding } from "../../lib/glyphEncoding";
import { useInvestigationStore } from "../../stores/investigationStore";
import type { CaseFileDetailMap, CasefileIndexEntry, Coordinates } from "../../types/casefile";

interface QueueSkyViewProps {
  entries: CasefileIndexEntry[];
  details: CaseFileDetailMap;
  onOpenCase: (oid: string) => void;
}

type SkyStatus = "idle" | "loading" | "ready" | "failed";

interface SkyEntry {
  entry: CasefileIndexEntry;
  ra: number;
  dec: number;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function usableCoordinates(coordinates: Coordinates | undefined): coordinates is Coordinates & { ra: number; dec: number } {
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

function reducedMotionPreferred(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function circularMeanRa(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sum = values.reduce(
    (acc, value) => {
      const radians = (value * Math.PI) / 180;
      return {
        sin: acc.sin + Math.sin(radians),
        cos: acc.cos + Math.cos(radians),
      };
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

function markerPosition(item: SkyEntry, centerRa: number, centerDec: number, fov: number) {
  const x = 50 + (angularOffset(item.ra, centerRa) / fov) * 86;
  const y = 50 - ((item.dec - centerDec) / fov) * 86;
  return {
    left: `${Math.max(4, Math.min(96, x))}%`,
    top: `${Math.max(4, Math.min(96, y))}%`,
  };
}

export function QueueSkyView({ entries, details, onOpenCase }: QueueSkyViewProps) {
  const selectedOid = useInvestigationStore((state) => state.selectedOid);
  const hoveredOid = useInvestigationStore((state) => state.hoveredOid);
  const setSelectedOid = useInvestigationStore((state) => state.setSelectedOid);
  const setHoveredOid = useInvestigationStore((state) => state.setHoveredOid);
  const aladinId = useMemo(() => `argus-queue-sky-${Math.random().toString(36).slice(2)}`, []);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aladinRef = useRef<AladinLiteInstance | null>(null);
  const [status, setStatus] = useState<SkyStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const skyEntries = useMemo(
    () =>
      entries.flatMap((entry) => {
        const detail = details[entry.oid];
        if (!detail || !usableCoordinates(detail.coordinates)) {
          return [];
        }
        return [{ entry, ra: detail.coordinates.ra, dec: detail.coordinates.dec }];
      }),
    [details, entries],
  );
  const missingEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const detail = details[entry.oid];
        return !detail || !usableCoordinates(detail.coordinates);
      }),
    [details, entries],
  );
  const frame = useMemo(() => skyFrame(skyEntries), [skyEntries]);
  const selector = useMemo(() => `#${aladinId}`, [aladinId]);

  useEffect(() => {
    aladinRef.current?.remove?.();
    aladinRef.current = null;
    setErrorMessage(null);

    if (!containerRef.current) {
      setStatus("idle");
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    containerRef.current.innerHTML = "";

    loadAladinLite()
      .then((A) => {
        if (cancelled) {
          return;
        }
        const aladin = A.aladin(selector, {
          survey: "P/DSS2/color",
          target: `${frame.centerRa} ${frame.centerDec}`,
          fov: frame.fov,
          cooFrame: "equatorial",
          projection: "AIT",
          showReticle: false,
          showCooGrid: true,
          showCooGridControl: false,
          showSimbadPointerControl: false,
          showFullscreenControl: false,
          showLayersControl: false,
          showGotoControl: false,
          showShareControl: false,
        });

        if (A.catalog && A.source && aladin.addCatalog) {
          const catalog = A.catalog({
            name: "Argus queue objects",
            color: "#6bb7ff",
            sourceSize: 9,
            shape: "circle",
          });
          catalog.addSources?.(
            skyEntries.map((item) =>
              A.source?.(item.ra, item.dec, {
                oid: item.entry.oid,
                name: item.entry.oid,
              }),
            ).filter((source): source is AladinLiteSource => Boolean(source)),
          );
          aladin.addCatalog(catalog);
        }

        aladinRef.current = aladin;
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setStatus("failed");
        setErrorMessage(error instanceof Error ? error.message : "Aladin Lite failed to load.");
      });

    return () => {
      cancelled = true;
      aladinRef.current?.remove?.();
      aladinRef.current = null;
    };
  }, [frame.centerDec, frame.centerRa, frame.fov, selector, skyEntries]);

  function openFromMarker(item: SkyEntry) {
    setSelectedOid(item.entry.oid);
    const aladin = aladinRef.current;
    const reduce = reducedMotionPreferred();
    if (aladin) {
      aladin.gotoRaDec?.(item.ra, item.dec);
      if (reduce) {
        aladin.setFoV?.(0.3);
      } else if (aladin.zoomToFoV) {
        aladin.zoomToFoV(0.3, 1.2);
      } else {
        aladin.setFoV?.(0.3);
      }
    }
    window.setTimeout(() => onOpenCase(item.entry.oid), reduce ? 0 : 320);
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_220px] gap-0 overflow-hidden">
      <div className="relative min-h-[420px] overflow-hidden bg-workstation-bg">
        <div className="absolute inset-0" id={aladinId} ref={containerRef}>
          {status === "loading" ? (
            <div className="argus-missing-state min-h-full border-0 font-mono uppercase tracking-[0.16em]">
              Loading external sky imagery
            </div>
          ) : null}
          {status === "failed" ? (
            <div className="argus-missing-state min-h-full border-0">
              Aladin Lite did not load. Queue Field view remains available.
            </div>
          ) : null}
        </div>
        {status === "ready" ? (
          <div className="pointer-events-none absolute inset-0">
            {skyEntries.map((item) => {
              const marker = priorityMarkerEncoding(item.entry);
              const selected = selectedOid === item.entry.oid;
              const hovered = hoveredOid === item.entry.oid;
              return (
                <button
                  aria-label={`Open ${item.entry.oid} from sky queue`}
                  className="pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 rounded-full border font-mono text-[0.58rem] text-white shadow-[0_0_18px_rgba(107,183,255,0.25)] transition-[border-color,box-shadow,transform,opacity] duration-200"
                  key={item.entry.oid}
                  onClick={() => openFromMarker(item)}
                  onMouseEnter={() => setHoveredOid(item.entry.oid)}
                  onMouseLeave={() => setHoveredOid(null)}
                  style={{
                    ...markerPosition(item, frame.centerRa, frame.centerDec, frame.fov),
                    background: marker.color,
                    borderColor: selected || hovered ? "#ffffff" : "rgba(215,222,231,0.5)",
                    height: marker.size,
                    opacity: selected || hovered ? 1 : marker.opacity,
                    transform: `translate(-50%, -50%) scale(${selected ? 1.35 : hovered ? 1.18 : 1})`,
                    width: marker.size,
                  }}
                  title={`${item.entry.oid} review priority ${item.entry.review_priority?.score ?? "n/a"}`}
                  type="button"
                />
              );
            })}
          </div>
        ) : null}
        <div className="pointer-events-none absolute bottom-3 left-3 border border-workstation-line bg-workstation-bg/80 px-3 py-2 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-workstation-muted">
          {skyEntries.length} plotted / {missingEntries.length} without sky position
        </div>
        {errorMessage ? (
          <p className="absolute bottom-3 right-3 max-w-sm border border-workstation-line bg-workstation-bg/85 px-3 py-2 text-xs text-workstation-muted">
            {errorMessage}
          </p>
        ) : null}
      </div>

      <aside className="min-h-0 overflow-auto border-l border-workstation-line bg-workstation-panel/80 p-3">
        <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-workstation-muted">
          No sky position in case file
        </p>
        <div className="mt-3 space-y-2">
          {missingEntries.length ? (
            missingEntries.map((entry) => (
              <button
                className="w-full border border-workstation-line bg-workstation-bg/60 px-3 py-2 text-left text-xs text-workstation-muted transition-colors hover:border-workstation-accent hover:text-workstation-text"
                key={entry.oid}
                onClick={() => {
                  setSelectedOid(entry.oid);
                  onOpenCase(entry.oid);
                }}
                onMouseEnter={() => setHoveredOid(entry.oid)}
                onMouseLeave={() => setHoveredOid(null)}
                type="button"
              >
                <span className="block font-mono text-workstation-text">{entry.oid}</span>
                <span className="mt-1 block">{entry.headline}</span>
              </button>
            ))
          ) : (
            <p className="text-xs leading-5 text-workstation-muted">
              All loaded case files have usable coordinates.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
