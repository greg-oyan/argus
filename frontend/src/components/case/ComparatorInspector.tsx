import {
  activeLinkedPoint,
  formatMagnitude,
  gaussianComparison,
  isHighResidualPoint,
  largestResidualPoint,
  linkedResidualPoints,
  selectedWindowStats,
} from "../../lib/chartSeries";
import { useInvestigationStore } from "../../stores/investigationStore";
import type { CaseFileDetail, ModelComparison } from "../../types/casefile";

interface ComparatorInspectorProps {
  detail: CaseFileDetail | null | undefined;
}

function metricValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) >= 10 ? value.toFixed(1) : value.toFixed(3);
  }
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return "n/a";
}

function comparatorLabel(comparison: ModelComparison): string {
  if (comparison.model_type === "gaussian_bump") return "Gaussian comparator";
  if (comparison.model_type === "variability_texture") return "Variability texture";
  if (comparison.model_type === "sncosmo_template_probe") return "Template-family probe";
  return comparison.name ?? comparison.model_type;
}

function comparatorIsActive(activeComparator: string | null, modelType: string): boolean {
  if (activeComparator === modelType) return true;
  if (modelType === "gaussian_bump") return activeComparator === "gaussian";
  if (modelType === "variability_texture") return activeComparator === "variability";
  if (modelType === "sncosmo_template_probe") return activeComparator === "template";
  return false;
}

function keyMetrics(comparison: ModelComparison): Array<[string, unknown]> {
  const metrics = comparison.fit_metrics ?? {};
  if (comparison.model_type === "gaussian_bump") {
    return [
      ["rmse", metrics.rmse],
      ["reduced chi2", metrics.reduced_chi2],
      ["largest residual", metrics.largest_abs_residual],
    ];
  }
  if (comparison.model_type === "variability_texture") {
    return [
      ["behavior_hint", metrics.behavior_hint],
      ["smoothed turns", metrics.smoothed_sign_changes],
      ["scatter/error", metrics.scatter_to_error_ratio],
    ];
  }
  if (comparison.model_type === "sncosmo_template_probe") {
    return [
      ["status", comparison.status],
      ["missing context", metrics.missing_context],
      ["bands", metrics.bands_used],
    ];
  }
  return Object.entries(metrics).slice(0, 3);
}

export function ComparatorInspector({ detail }: ComparatorInspectorProps) {
  const hoveredPointId = useInvestigationStore((state) => state.hoveredPointId);
  const selectedPointId = useInvestigationStore((state) => state.selectedPointId);
  const selectedTimeRange = useInvestigationStore((state) => state.selectedTimeRange);
  const activeComparator = useInvestigationStore((state) => state.activeComparator);
  const focusedPanelKey = useInvestigationStore((state) => state.focusedPanelKey);
  const setActiveComparator = useInvestigationStore((state) => state.setActiveComparator);
  const setHighlightedEvidenceKey = useInvestigationStore(
    (state) => state.setHighlightedEvidenceKey,
  );
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const points = linkedResidualPoints(detail?.oid ?? "case", detail);
  const activePoint = activeLinkedPoint(points, hoveredPointId, selectedPointId);
  const largest = largestResidualPoint(points);
  const highResidualFocus = isHighResidualPoint(activePoint, points);
  const windowStats = selectedWindowStats(points, selectedTimeRange);
  const comparisons = detail?.model_comparisons ?? [];

  return (
    <section
      className={`argus-panel ${focusedPanelKey === "comparator" || activeComparator ? "argus-panel-focus" : ""}`}
      onMouseEnter={() => setFocusedPanelKey("comparator")}
    >
      <div className="argus-panel-header">
        <p className="argus-panel-title">
          Comparator Inspector
        </p>
        <p className="mt-1 text-xs leading-5 text-workstation-muted">
          Toggle comparator focus for chart emphasis, narrative focus, and selected-window readouts.
        </p>
        <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-[0.12em] text-workstation-muted">
          Active: <span className="text-workstation-text">{activeComparator ?? "none"}</span>
        </p>
      </div>
      <div className="max-h-[380px] overflow-auto p-3">
        {comparisons.length === 0 ? (
          <p className="text-sm text-workstation-muted">No comparator entries are present.</p>
        ) : (
          <div className="space-y-3">
            {comparisons.map((comparison) => {
              const active = comparatorIsActive(activeComparator, comparison.model_type);
              const gaussianMismatchFocus =
                comparison.model_type === "gaussian_bump" && highResidualFocus;
              return (
                <div
                  className={`border p-3 ${
                    active || gaussianMismatchFocus
                      ? "border-workstation-accent/70 bg-workstation-bg/85 shadow-[inset_2px_0_0_rgba(107,183,255,0.58)]"
                      : "border-workstation-line bg-workstation-bg/40 hover:border-workstation-line/90"
                  }`}
                  key={comparison.model_type}
                >
                  <button
                    className="flex w-full items-center justify-between gap-3 text-left"
                    onClick={() => {
                      setActiveComparator(comparison.model_type);
                      setHighlightedEvidenceKey(comparison.model_type);
                      setFocusedPanelKey("comparator");
                    }}
                    type="button"
                  >
                    <span className="font-mono text-xs uppercase tracking-[0.14em] text-workstation-text">
                      {comparatorLabel(comparison)}
                    </span>
                    <span className="font-mono text-xs text-workstation-muted">
                      {comparison.status ?? "missing"}
                    </span>
                  </button>
                  <dl className="mt-3 grid grid-cols-[120px_minmax(0,1fr)] gap-2 font-mono text-xs">
                    {keyMetrics(comparison).map(([key, value]) => (
                      <div className="contents" key={key}>
                        <dt className="text-workstation-muted">{key}</dt>
                        <dd>{metricValue(value)}</dd>
                      </div>
                    ))}
                  </dl>
                  {gaussianMismatchFocus ? (
                    <p className="mt-3 border-l border-workstation-accent/70 pl-3 text-xs leading-5 text-workstation-text">
                      Comparator focus: the selected observation is in a high residual-mismatch
                      region for the Gaussian comparator.
                    </p>
                  ) : null}
                  {comparison.model_type === "gaussian_bump" && windowStats ? (
                    <p className="mt-3 text-xs leading-5 text-workstation-muted">
                      Selected-window readout: {windowStats.count} residual point(s), max abs
                      residual {formatMagnitude(windowStats.maxAbsResidual)}
                      {windowStats.containsLargestResidual ? ", includes largest residual." : "."}
                    </p>
                  ) : null}
                  {comparison.model_type === "gaussian_bump" && largest ? (
                    <p className="mt-2 text-xs leading-5 text-workstation-muted">
                      Largest stored residual: {formatMagnitude(Math.abs(largest.residualMag))} mag.
                    </p>
                  ) : null}
                  {comparison.interpretation ? (
                    <p className="mt-3 text-xs leading-5 text-workstation-muted">
                      {comparison.interpretation}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
