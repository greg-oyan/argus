import {
  activeLinkedPoint,
  formatMagnitude,
  formatMjd,
  gaussianComparison,
  isHighResidualPoint,
  largestResidualPoint,
  linkedLightCurvePoints,
  linkedResidualPoints,
  residualAbsoluteValue,
  selectedWindowStats,
  type LinkedLightCurvePoint,
  type LinkedResidualPoint,
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
  const focusedPanelKey = useInvestigationStore((state) => state.focusedPanelKey);
  const clearPointSelection = useInvestigationStore((state) => state.clearPointSelection);
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const residualPoints = linkedResidualPoints(entry.oid, detail);
  const lightCurvePoints = linkedLightCurvePoints(entry.oid, detail);
  const activePoint = activeLinkedPoint(lightCurvePoints, hoveredPointId, selectedPointId) as LinkedLightCurvePoint | null;
  const activeResidualPoint = activeLinkedPoint(residualPoints, hoveredPointId, selectedPointId) as LinkedResidualPoint | null;
  const largest = largestResidualPoint(residualPoints);
  const isLargest = Boolean(activeResidualPoint && largest?.pointId === activeResidualPoint.pointId);
  const isHigh = isHighResidualPoint(activeResidualPoint, residualPoints);
  const comparison = gaussianComparison(detail);
  const windowStats = selectedWindowStats(residualPoints, selectedTimeRange);
  const pointMode = selectedPointId ? "selected observation" : hoveredPointId ? "hovered observation" : "no observation selected";

  return (
    <section
      className={`argus-panel ${
        activePoint || focusedPanelKey === "point" ? "argus-panel-focus" : ""
      }`}
      onMouseEnter={() => setFocusedPanelKey("point")}
    >
      <div className="argus-panel-header">
        <p className="argus-panel-title">
          Point Inspector
        </p>
        <p className={`mt-1 font-mono text-xs ${activePoint ? "text-workstation-accent" : "text-workstation-text"}`}>
          {pointMode}
        </p>
      </div>

      <div className="max-h-[280px] overflow-auto p-4">
        <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-2 font-mono text-xs">
          <dt className="text-workstation-muted">MJD</dt>
          <dd>{formatMjd(activePoint?.mjd)}</dd>
          <dt className="text-workstation-muted">observed_mag</dt>
          <dd>{formatMagnitude(activePoint?.observedMag)}</dd>
          <dt className="text-workstation-muted">model_mag</dt>
          <dd>{formatMagnitude(activeResidualPoint?.modelMag)}</dd>
          <dt className="text-workstation-muted">residual_mag</dt>
          <dd>{formatMagnitude(activeResidualPoint?.residualMag)}</dd>
          <dt className="text-workstation-muted">abs residual</dt>
          <dd>{activeResidualPoint ? formatMagnitude(residualAbsoluteValue(activeResidualPoint)) : "n/a"}</dd>
          <dt className="text-workstation-muted">magerr</dt>
          <dd>{formatMagnitude(activePoint?.magerr)}</dd>
          <dt className="text-workstation-muted">comparator</dt>
          <dd>{comparison?.status ?? "missing"}</dd>
        </dl>

        {activeResidualPoint && (isLargest || isHigh) ? (
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
          Hover updates this panel. Click pins the selected observation until cleared; the same
          point drives the linked time guide in both charts.
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
