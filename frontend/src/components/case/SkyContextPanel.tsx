import { useEffect, useId, useMemo, useRef, useState } from "react";
import { loadAladinLite } from "../../lib/aladin";
import { useInvestigationStore } from "../../stores/investigationStore";
import type { CaseFileDetail, Coordinates, CrossSurveySource } from "../../types/casefile";

interface SkyContextPanelProps {
  detail: CaseFileDetail | null | undefined;
}

type SkyStatus = "idle" | "loading" | "ready" | "failed";

interface UsableCoordinates extends Coordinates {
  ra: number;
  dec: number;
}

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

function formatCoordinate(value: number | null | undefined): string {
  return finiteNumber(value) ? value.toFixed(6) : "n/a";
}

function formatSource(source: CrossSurveySource): string {
  const catalog = source.catalog ?? "catalog";
  const status = source.status ?? "recorded";
  const count = source.match_count != null ? `${source.match_count} match(es)` : "match count n/a";
  const nearest = source.nearest_match?.name ? `nearest ${source.nearest_match.name}` : "nearest n/a";
  const separation = finiteNumber(source.nearest_match?.separation_arcsec)
    ? `${source.nearest_match?.separation_arcsec?.toFixed(2)} arcsec`
    : "separation n/a";
  return `${catalog}: ${status}, ${count}, ${nearest}, ${separation}`;
}

export function SkyContextPanel({ detail }: SkyContextPanelProps) {
  const focusedPanelKey = useInvestigationStore((state) => state.focusedPanelKey);
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const aladinId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const aladinRef = useRef<AladinLiteInstance | null>(null);
  const [status, setStatus] = useState<SkyStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const coordinates = detail?.coordinates;
  const usableCoordinates = coordinatesAreUsable(coordinates) ? coordinates : null;
  const context = detail?.cross_survey_context;
  const sources = context?.sources ?? [];

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
        if (cancelled) {
          return;
        }
        const aladin = A.aladin(selector, {
          target: `${usableCoordinates.ra} ${usableCoordinates.dec}`,
          fov: 0.08,
          cooFrame: "equatorial",
          projection: "TAN",
          showReticle: true,
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
            name: "Argus object position",
            color: "#6bb7ff",
            sourceSize: 12,
            shape: "cross",
          });
          catalog.addSources?.([
            A.source(usableCoordinates.ra, usableCoordinates.dec, {
              name: detail?.oid ?? "object position",
            }),
          ]);
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
  }, [detail?.oid, selector, usableCoordinates]);

  return (
    <section
      className={`argus-panel ${focusedPanelKey === "sky_context" ? "argus-panel-focus" : ""}`}
      onMouseEnter={() => setFocusedPanelKey("sky_context")}
    >
      <div className="argus-panel-header">
        <p className="argus-panel-title">
          Sky Context
        </p>
        <p className="mt-1 text-xs leading-5 text-workstation-muted">
          External sky imagery centered on the recorded object position.
        </p>
      </div>

      <div className="p-3">
        <div
          className="relative h-56 overflow-hidden border border-workstation-line bg-workstation-bg"
          id={aladinId}
          ref={containerRef}
        >
          {!usableCoordinates ? (
            <div className="argus-missing-state min-h-full border-0">
              Coordinate context is unavailable for this case-file artifact.
            </div>
          ) : status === "loading" ? (
            <div className="argus-missing-state min-h-full border-0 font-mono uppercase tracking-[0.16em]">
              Loading external sky imagery
            </div>
          ) : status === "failed" ? (
            <div className="argus-missing-state min-h-full border-0">
              Aladin Lite did not load. Case Mode remains available without the sky panel.
            </div>
          ) : null}
        </div>

        <dl className="mt-3 grid grid-cols-[80px_minmax(0,1fr)] gap-2 font-mono text-xs">
          <dt className="text-workstation-muted">RA</dt>
          <dd>{formatCoordinate(coordinates?.ra)} {coordinates?.ra_unit ?? "deg"}</dd>
          <dt className="text-workstation-muted">Dec</dt>
          <dd>{formatCoordinate(coordinates?.dec)} {coordinates?.dec_unit ?? "deg"}</dd>
          <dt className="text-workstation-muted">status</dt>
          <dd>{context?.status ?? "missing"}</dd>
        </dl>

        {sources.length ? (
          <ul className="mt-3 space-y-2 text-xs leading-5 text-workstation-muted">
            {sources.map((source, index) => (
              <li className="border-l border-workstation-line pl-3" key={`${source.catalog ?? "source"}-${index}`}>
                {formatSource(source)}
              </li>
            ))}
          </ul>
        ) : null}

        {context?.interpretation ? (
          <p className="mt-3 border-t border-workstation-line pt-3 text-xs leading-5 text-workstation-muted">
            {context.interpretation}
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-5 text-workstation-muted">
          {context?.caveat ??
            "Sky imagery and catalog-context status are external evidence layers, not Argus conclusions."}
        </p>
        {errorMessage ? (
          <p className="mt-2 font-mono text-[0.68rem] text-workstation-muted">{errorMessage}</p>
        ) : null}
      </div>
    </section>
  );
}
