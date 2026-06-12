import { useInvestigationStore } from "../../stores/investigationStore";
import type { CaseFileDetail } from "../../types/casefile";

interface FeatureInspectorProps {
  detail: CaseFileDetail | null | undefined;
}

function formatFeatureValue(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.abs(value) >= 10 ? value.toFixed(2) : value.toFixed(4);
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return "n/a";
}

function featureLabel(key: string): string {
  return key.replaceAll("_", " ");
}

export function FeatureInspector({ detail }: FeatureInspectorProps) {
  const activeComparator = useInvestigationStore((state) => state.activeComparator);
  const highlightedEvidenceKey = useInvestigationStore((state) => state.highlightedEvidenceKey);
  const focusedPanelKey = useInvestigationStore((state) => state.focusedPanelKey);
  const setActiveComparator = useInvestigationStore((state) => state.setActiveComparator);
  const setHighlightedEvidenceKey = useInvestigationStore(
    (state) => state.setHighlightedEvidenceKey,
  );
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const summary = detail?.feature_summary;
  const features = Object.entries(summary?.features ?? {});
  const diagnostics = summary?.feature_diagnostics ?? {};
  const qualityNotes = summary?.feature_quality_notes ?? [];
  const cadenceDiagnostics = [
    ["min spacing", diagnostics.minimum_delta_time_minutes],
    ["max slope dt", diagnostics.maximum_slope_pair_delta_time_minutes],
    ["max slope dmag", diagnostics.maximum_slope_pair_delta_mag],
  ] satisfies Array<[string, unknown]>;
  const focused =
    activeComparator === "feature_summary" ||
    activeComparator === "features" ||
    highlightedEvidenceKey === "feature_summary" ||
    highlightedEvidenceKey === "Standard feature summary";

  return (
    <section
      className={`argus-panel ${
        focused || focusedPanelKey === "feature_summary" ? "argus-panel-focus" : ""
      }`}
      onMouseEnter={() => setFocusedPanelKey("feature_summary")}
    >
      <div className="argus-panel-header flex items-start justify-between gap-3">
        <div>
          <p className="argus-panel-title">
            Feature Inspector
          </p>
          <p className="mt-1 text-xs leading-5 text-workstation-muted">
            Existing descriptive feature_summary values.
          </p>
        </div>
        <button
          className={`argus-state-pill ${focused ? "argus-state-pill-active" : ""}`}
          onClick={() => {
            setActiveComparator("feature_summary");
            setHighlightedEvidenceKey("feature_summary");
            setFocusedPanelKey("feature_summary");
          }}
          type="button"
        >
          focus
        </button>
      </div>

      <div className="max-h-[300px] overflow-auto p-4">
        {!summary ? (
          <div className="argus-missing-state">No feature summary is present in this case-file artifact.</div>
        ) : (
          <>
            <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 font-mono text-xs">
              <dt className="text-workstation-muted">source</dt>
              <dd>{summary.source ?? "n/a"}</dd>
              <dt className="text-workstation-muted">band</dt>
              <dd>{summary.band ?? "n/a"}</dd>
              <dt className="text-workstation-muted">status</dt>
              <dd>{summary.status ?? "missing"}</dd>
              <dt className="text-workstation-muted">points</dt>
              <dd>{summary.n_points ?? "n/a"}</dd>
            </dl>
            {features.length ? (
              <dl className="mt-4 grid grid-cols-[150px_minmax(0,1fr)] gap-2 font-mono text-xs">
                {features.map(([key, value]) => (
                  <div className="contents" key={key}>
                    <dt className="text-workstation-muted">{featureLabel(key)}</dt>
                    <dd>{formatFeatureValue(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {qualityNotes.length ? (
              <div className="mt-4 border-l border-workstation-amber/70 pl-3">
                <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-workstation-amber">
                  Feature quality notes
                </p>
                <ul className="mt-2 space-y-2 text-xs leading-5 text-workstation-muted">
                  {qualityNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {Object.keys(diagnostics).length ? (
              <dl className="mt-4 grid grid-cols-[120px_minmax(0,1fr)] gap-2 border-t border-workstation-line pt-3 font-mono text-xs">
                {cadenceDiagnostics.map(([key, value]) => (
                  <div className="contents" key={key}>
                    <dt className="text-workstation-muted">{key}</dt>
                    <dd>{formatFeatureValue(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {summary.interpretation ? (
              <p className="mt-4 border-t border-workstation-line pt-3 text-xs leading-5 text-workstation-muted">
                {summary.interpretation}
              </p>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
