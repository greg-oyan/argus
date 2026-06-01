import {
  activeLinkedPoint,
  formatMagnitude,
  formatMjd,
  gaussianComparison,
  isHighResidualPoint,
  largestResidualPoint,
  linkedResidualPoints,
  residualAbsoluteValue,
  selectedWindowStats,
} from "../../lib/chartSeries";
import { useInvestigationStore } from "../../stores/investigationStore";
import type { CaseFileDetail, CasefileIndexEntry } from "../../types/casefile";

interface PointInspectorProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
}

export function PointInspector({ entry, detail }: PointInspectorProps) {
  const hoveredPointId = useInvestigationStore((state) => state.hoveredPointId);
  const selectedPointId = useInvestigationStore((state) => state.selectedPointId);
  const selectedTimeRange = useInvestigationStore((state) => state.selectedTimeRange);
  const clearPointSelection = useInvestigationStore((state) => state.clearPointSelection);
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const points = linkedResidualPoints(entry.oid, detail);
  const activePoint = activeLinkedPoint(points, hoveredPointId, selectedPointId);
  const largest = largestResidualPoint(points);
  const isLargest = Boolean(activePoint && largest?.pointId === activePoint.pointId);
  const isHigh = isHighResidualPoint(activePoint, points);
  const comparison = gaussianComparison(detail);
  const windowStats = selectedWindowStats(points, selectedTimeRange);
  const pointMode = selectedPointId ? "selected observation" : hoveredPointId ? "hovered observation" : "no observation selected";

  return (
    <section
      className={`border bg-workstation-panel/80 ${
        activePoint ? "border-workstation-accent/70" : "border-workstation-line"
      }`}
      onMouseEnter={() => setFocusedPanelKey("point")}
    >
      <div className="border-b border-workstation-line px-3 py-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Point Inspector
        </p>
        <p className="mt-1 font-mono text-xs text-workstation-text">{pointMode}</p>
      </div>

      <div className="max-h-[280px] overflow-auto p-3">
        <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 font-mono text-xs">
          <dt className="text-workstation-muted">MJD</dt>
          <dd>{formatMjd(activePoint?.mjd)}</dd>
          <dt className="text-workstation-muted">observed_mag</dt>
          <dd>{formatMagnitude(activePoint?.observedMag)}</dd>
          <dt className="text-workstation-muted">model_mag</dt>
          <dd>{formatMagnitude(activePoint?.modelMag)}</dd>
          <dt className="text-workstation-muted">residual_mag</dt>
          <dd>{formatMagnitude(activePoint?.residualMag)}</dd>
          <dt className="text-workstation-muted">abs residual</dt>
          <dd>{activePoint ? formatMagnitude(residualAbsoluteValue(activePoint)) : "n/a"}</dd>
          <dt className="text-workstation-muted">magerr</dt>
          <dd>{formatMagnitude(activePoint?.magerr)}</dd>
          <dt className="text-workstation-muted">comparator</dt>
          <dd>{comparison?.status ?? "missing"}</dd>
        </dl>

        {activePoint && (isLargest || isHigh) ? (
          <p className="mt-3 border-l border-workstation-accent/70 pl-3 text-xs leading-5 text-workstation-text">
            This selected observation is in a high residual-mismatch region for the Gaussian
            comparator{isLargest ? " and matches the largest stored residual" : ""}.
          </p>
        ) : null}

        {windowStats ? (
          <div className="mt-4 border-t border-workstation-line pt-3">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-workstation-muted">
              Selected-window readout
            </p>
            <dl className="mt-2 grid grid-cols-[120px_minmax(0,1fr)] gap-2 font-mono text-xs">
              <dt className="text-workstation-muted">points</dt>
              <dd>{windowStats.count}</dd>
              <dt className="text-workstation-muted">max abs residual</dt>
              <dd>{formatMagnitude(windowStats.maxAbsResidual)}</dd>
              <dt className="text-workstation-muted">largest included</dt>
              <dd>{windowStats.containsLargestResidual ? "yes" : "no"}</dd>
            </dl>
          </div>
        ) : null}

        <p className="mt-3 text-xs leading-5 text-workstation-muted">
          Hover updates this panel. Click pins the selected observation until cleared.
        </p>
        {selectedPointId || hoveredPointId ? (
          <button
            className="mt-3 border border-workstation-line px-3 py-2 text-xs hover:border-workstation-accent"
            onClick={clearPointSelection}
            type="button"
          >
            Clear point focus
          </button>
        ) : null}
      </div>
    </section>
  );
}
