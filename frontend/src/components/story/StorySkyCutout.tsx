import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { loadAladinLite } from "../../lib/aladin";
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

  const coordinates = detail?.coordinates;
  const usableCoordinates = coordinatesAreUsable(coordinates) ? coordinates : null;
  const selectedSurvey = SURVEY_OPTIONS[selectedSurveyIndex];
  const selector = useMemo(() => `#${aladinId}`, [aladinId]);

  useEffect(() => {
    aladinRef.current?.remove?.();
    aladinRef.current = null;
    setErrorMessage(null);

    if (!usableCoordinates || !containerRef.current) {
      setStatus("idle");
      return undefined;
    }

    let cancelled = false;
    setStatus("loading");
    containerRef.current.innerHTML = "";

    loadAladinLite()
      .then((A) => {
        if (cancelled) return;
        const aladin = A.aladin(selector, {
          target: `${usableCoordinates.ra} ${usableCoordinates.dec}`,
          survey: selectedSurvey.id,
          fov: reduceMotion ? 0.08 : 0.18,
          cooFrame: "equatorial",
          projection: "TAN",
          showReticle: true,
          showCooGrid: false,
          showCooGridControl: false,
          showSimbadPointerControl: false,
          showFullscreenControl: false,
          showLayersControl: false,
          showGotoControl: false,
          showShareControl: false,
        });

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
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setStatus("failed");
        setErrorMessage(error instanceof Error ? error.message : "Aladin Lite failed to load.");
      });

    return () => {
      cancelled = true;
      aladinRef.current?.remove?.();
      aladinRef.current = null;
    };
  }, [detail?.oid, reduceMotion, selectedSurvey.id, selector, usableCoordinates]);

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
      <div className="relative h-72 overflow-hidden border-b border-workstation-line bg-workstation-bg sm:h-80">
        <div className="absolute inset-0" id={aladinId} ref={containerRef} />
        {status === "loading" ? (
          <div className="argus-missing-state absolute inset-0 min-h-full border-0 bg-workstation-bg/70 font-mono uppercase tracking-[0.16em]">
            Loading telescope imagery
          </div>
        ) : null}
        {status === "failed" ? (
          <div className="argus-missing-state absolute inset-0 min-h-full border-0 bg-workstation-bg/80">
            Telescope imagery did not load. The rest of this page still works.
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
