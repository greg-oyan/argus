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
  const setActiveComparator = useInvestigationStore((state) => state.setActiveComparator);
  const setHighlightedEvidenceKey = useInvestigationStore(
    (state) => state.setHighlightedEvidenceKey,
  );
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const summary = detail?.feature_summary;
  const features = Object.entries(summary?.features ?? {});
  const focused =
    activeComparator === "feature_summary" ||
    activeComparator === "features" ||
    highlightedEvidenceKey === "feature_summary" ||
    highlightedEvidenceKey === "Standard feature summary";

  return (
    <section
      className={`border bg-workstation-panel/80 ${
        focused ? "border-workstation-accent/70" : "border-workstation-line"
      }`}
      onMouseEnter={() => setFocusedPanelKey("feature_summary")}
    >
      <div className="flex items-start justify-between gap-3 border-b border-workstation-line px-3 py-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
            Feature Inspector
          </p>
          <p className="mt-1 text-xs leading-5 text-workstation-muted">
            Existing descriptive feature_summary values.
          </p>
        </div>
        <button
          className="border border-workstation-line px-2 py-1 font-mono text-[0.68rem] uppercase tracking-[0.12em] hover:border-workstation-accent"
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

      <div className="max-h-[300px] overflow-auto p-3">
        {!summary ? (
          <p className="text-sm text-workstation-muted">No feature summary is present.</p>
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
