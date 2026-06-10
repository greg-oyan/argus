import { useEffect, useId, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { initAladinHardened } from "../../lib/aladinInit";
import type { CaseFileDetail, Coordinates } from "../../types/casefile";

interface StorySkyCutoutProps {
  detail: CaseFileDetail | null | undefined;
}

type SkyStatus = "idle" | "loading" | "ready" | "failed";

interface UsableCoordinates extends Coordinates {
  ra: number;
  dec: number;
}

const SURVEY_OPTIONS = [
  { id: "P/DSS2/color", label: "DSS2 color" },
  { id: "P/PanSTARRS/DR1/color-z-zg-g", label: "Pan-STARRS DR1" },
] as const;

// Tight cutout so the crosshair lands on the object instead of an empty field.
const CUTOUT_FOV = 0.25;
const FAILURE_TIMEOUT_MS = 10_000;

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function coordinatesAreUsable(coordinates: Coordinates | undefined): coordinates is UsableCoordinates {
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

export function StorySkyCutout({ detail }: StorySkyCutoutProps) {
  const reduceMotion = useReducedMotion();
  const aladinId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aladinRef = useRef<AladinLiteInstance | null>(null);
  const [status, setStatus] = useState<SkyStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedSurveyIndex, setSelectedSurveyIndex] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const coordinates = detail?.coordinates;
  const usableCoordinates = coordinatesAreUsable(coordinates) ? coordinates : null;
  const selectedSurvey = SURVEY_OPTIONS[selectedSurveyIndex];

  useEffect(() => {
    aladinRef.current?.remove?.();
    aladinRef.current = null;
    setErrorMessage(null);

    if (!usableCoordinates || !containerRef.current) {
      setStatus("idle");
      return undefined;
    }

    const signal = { cancelled: false };
    setStatus("loading");
    containerRef.current.innerHTML = "";
    const container = containerRef.current;

    const failTimer = window.setTimeout(() => {
      if (signal.cancelled) return;
      setStatus((current) => (current === "ready" ? current : "failed"));
    }, FAILURE_TIMEOUT_MS);

    initAladinHardened({
      container,
      signal,
      options: {
        target: `${usableCoordinates.ra} ${usableCoordinates.dec}`,
        survey: selectedSurvey.id,
        fov: CUTOUT_FOV,
        cooFrame: "equatorial",
        projection: "TAN",
      },
    })
      .then(({ A, aladin }) => {
        if (signal.cancelled) return;

        if (A.catalog && A.source && aladin.addCatalog) {
          const catalog = A.catalog({
            name: "Argus object position",
            color: "#6bb7ff",
            sourceSize: 14,
            shape: "cross",
          });
          catalog.addSources?.([
            A.source(usableCoordinates.ra, usableCoordinates.dec, {
              name: detail?.oid ?? "object",
            }),
          ]);
          aladin.addCatalog(catalog);
        }

        aladinRef.current = aladin;
        window.clearTimeout(failTimer);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (signal.cancelled) return;
        window.clearTimeout(failTimer);
        setStatus("failed");
        setErrorMessage(error instanceof Error ? error.message : "Aladin Lite failed to load.");
      });

    return () => {
      signal.cancelled = true;
      window.clearTimeout(failTimer);
      aladinRef.current?.remove?.();
      aladinRef.current = null;
    };
  }, [detail?.oid, selectedSurvey.id, usableCoordinates, reloadKey]);

  useEffect(() => {
    if (status !== "ready" || !aladinRef.current) return;
    try {
      aladinRef.current.setImageSurvey?.(selectedSurvey.id);
      setErrorMessage(null);
    } catch (error: unknown) {
      setStatus("failed");
      setErrorMessage(
        error instanceof Error ? error.message : "The selected telescope imagery could not be loaded.",
      );
    }
  }, [selectedSurvey, status]);

  if (!usableCoordinates) {
    return (
      <section className="border border-workstation-line bg-workstation-panel/70">
        <div className="argus-missing-state min-h-[180px]">
          The case file does not record a sky position for this object.
        </div>
      </section>
    );
  }

  return (
    <section className="border border-workstation-line bg-workstation-panel/70">
      <div className="flex items-center justify-between gap-3 border-b border-workstation-line px-4 py-3">
        <h3 className="text-sm font-semibold text-white">A look at this patch of sky</h3>
        <button
          aria-label="Compare telescope imagery"
          className="argus-state-pill argus-focus-visible hover:border-workstation-accent/70 hover:text-workstation-text"
          disabled={status === "loading"}
          onClick={() => setSelectedSurveyIndex((index) => (index + 1) % SURVEY_OPTIONS.length)}
          type="button"
        >
          Compare telescope imagery: {selectedSurvey.label}
        </button>
      </div>
      {/*
        Reserved fixed height so the Aladin init never races layout. The
        actual canvas fills this via the hardened init helper.
      */}
      <div
        className="argus-cutout-host relative h-[320px] overflow-hidden border-b border-workstation-line bg-workstation-bg sm:h-[380px]"
      >
        <div
          id={aladinId}
          ref={containerRef}
          style={{ width: "100%", height: "100%" }}
        />
        {/* Starfield placeholder visible until tiles take over. Cross-fade out
            on ready; the failure panel sits over this so a black void cannot
            occur. */}
        <div
          aria-hidden="true"
          className={`argus-starfield ${reduceMotion ? "" : "argus-starfield-twinkle"} pointer-events-none absolute inset-0 transition-opacity duration-700`}
          style={{ opacity: status === "ready" ? 0 : 1 }}
        />
        {status === "loading" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.22em] text-workstation-muted">
              Loading imagery…
            </p>
          </div>
        ) : null}
        {/* Custom crosshair (Aladin's reticle is disabled via CHROME_OFF).
            Positioned from the container center, so it cannot be clipped by a
            mis-sized canvas. */}
        {status === "ready" ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <div className="relative h-10 w-10">
              <div className="absolute left-1/2 top-1/2 h-px w-10 -translate-x-1/2 -translate-y-1/2 bg-workstation-accent/65" />
              <div className="absolute left-1/2 top-1/2 h-10 w-px -translate-x-1/2 -translate-y-1/2 bg-workstation-accent/65" />
              <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-workstation-accent/85" />
            </div>
          </div>
        ) : null}
        {status === "failed" ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
            <div className="max-w-sm border border-workstation-line bg-workstation-panel/95 p-4 text-center text-xs leading-6 text-workstation-muted backdrop-blur">
              <p>Sky imagery couldn't load — it streams from an external astronomy service.</p>
              <button
                className="argus-focus-visible mt-3 border border-workstation-accent/70 bg-workstation-accent/15 px-3 py-1 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-white hover:bg-workstation-accent/25"
                onClick={() => {
                  setErrorMessage(null);
                  setStatus("loading");
                  setReloadKey((value) => value + 1);
                }}
                type="button"
              >
                Retry
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {errorMessage ? (
        <p className="px-4 py-2 font-mono text-[0.68rem] text-workstation-muted">{errorMessage}</p>
      ) : null}
      <p className="px-4 py-3 text-xs leading-5 text-workstation-muted">
        The crosshair marks where this object sits on the sky. Telescope imagery comes
        from external surveys (DSS, Pan-STARRS) — not from Argus.
      </p>
    </section>
  );
}
