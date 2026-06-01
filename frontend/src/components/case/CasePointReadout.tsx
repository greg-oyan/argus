import { exampleArtifactUrl } from "../../lib/paths";
import {
  activeLinkedPoint,
  formatMagnitude,
  formatMjd,
  gaussianComparison,
  linkedResidualPoints,
} from "../../lib/chartSeries";
import { useInvestigationStore } from "../../stores/investigationStore";
import type { CaseFileDetail, CasefileIndexEntry } from "../../types/casefile";

interface CasePointReadoutProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
}

export function CasePointReadout({ entry, detail }: CasePointReadoutProps) {
  const hoveredPointId = useInvestigationStore((state) => state.hoveredPointId);
  const selectedPointId = useInvestigationStore((state) => state.selectedPointId);
  const clearSelectedPointId = useInvestigationStore((state) => state.clearSelectedPointId);
  const points = linkedResidualPoints(entry.oid, detail);
  const activePoint = activeLinkedPoint(points, hoveredPointId, selectedPointId);
  const comparison = gaussianComparison(detail);
  const htmlHref = exampleArtifactUrl(entry.links?.html);
  const jsonHref = exampleArtifactUrl(entry.links?.json);
  const pointMode = selectedPointId ? "selected point" : hoveredPointId ? "hovered point" : "no point";

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto p-5 text-sm">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Point Readout
        </p>
        <h2 className="mt-2 font-mono text-xl text-white">{entry.oid}</h2>
        <p className="mt-3 text-xs uppercase tracking-[0.14em] text-workstation-muted">
          {pointMode}
        </p>
      </div>

      <dl className="grid grid-cols-[130px_minmax(0,1fr)] gap-2 border-y border-workstation-line py-4 font-mono text-xs">
        <dt className="text-workstation-muted">MJD</dt>
        <dd>{formatMjd(activePoint?.mjd)}</dd>
        <dt className="text-workstation-muted">observed_mag</dt>
        <dd>{formatMagnitude(activePoint?.observedMag)}</dd>
        <dt className="text-workstation-muted">model_mag</dt>
        <dd>{formatMagnitude(activePoint?.modelMag)}</dd>
        <dt className="text-workstation-muted">residual_mag</dt>
        <dd>{formatMagnitude(activePoint?.residualMag)}</dd>
        <dt className="text-workstation-muted">magerr</dt>
        <dd>{formatMagnitude(activePoint?.magerr)}</dd>
      </dl>

      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Comparator
        </p>
        <dl className="mt-3 grid grid-cols-[130px_minmax(0,1fr)] gap-2 font-mono text-xs">
          <dt className="text-workstation-muted">name</dt>
          <dd>{comparison?.name ?? "Gaussian comparator"}</dd>
          <dt className="text-workstation-muted">status</dt>
          <dd>{comparison?.status ?? "missing"}</dd>
          <dt className="text-workstation-muted">filter</dt>
          <dd>{comparison?.filter_used ?? "r"}</dd>
          <dt className="text-workstation-muted">points</dt>
          <dd>{points.length}</dd>
        </dl>
      </div>

      {entry.review_priority?.reasons.length ? (
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
            Review Reasons
          </p>
          <ul className="space-y-2 text-xs leading-5 text-workstation-muted">
            {entry.review_priority.reasons.slice(0, 4).map((reason) => (
              <li className="border-l border-workstation-line pl-3" key={reason}>
                {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-auto border-t border-workstation-line pt-4">
        <p className="text-xs leading-5 text-workstation-muted">
          Hover a point in either chart to link the views. Click a point to keep it selected
          while inspecting model mismatch.
        </p>
        {selectedPointId ? (
          <button
            className="mt-3 border border-workstation-line px-3 py-2 text-xs hover:border-workstation-accent"
            onClick={clearSelectedPointId}
            type="button"
          >
            Clear point selection
          </button>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          {htmlHref ? (
            <a className="text-workstation-accent hover:text-white" href={htmlHref}>
              Static HTML
            </a>
          ) : null}
          {jsonHref ? (
            <a className="text-workstation-accent hover:text-white" href={jsonHref}>
              Case JSON
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
