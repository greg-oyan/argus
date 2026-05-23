import type { CaseFileDetailMap, CasefileIndex, CasefileIndexEntry } from "../types/casefile";
import { exampleArtifactUrl } from "../lib/paths";
import { QueueField } from "../components/queue/QueueField";
import { useInvestigationStore } from "../stores/investigationStore";

interface QueueRouteProps {
  index: CasefileIndex | null;
  isLoading: boolean;
  error: string | null;
  onOpenCase: (oid: string) => void;
  selectedOid: string | null;
  caseDetails: CaseFileDetailMap;
}

function SelectedPreview({
  entry,
  caseDetails,
}: {
  entry: CasefileIndexEntry | undefined;
  caseDetails: CaseFileDetailMap;
}) {
  const setActiveComparator = useInvestigationStore((state) => state.setActiveComparator);
  const setHighlightedEvidenceKey = useInvestigationStore(
    (state) => state.setHighlightedEvidenceKey,
  );

  if (!entry) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-workstation-muted">
        Select an object to inspect its case-file signals.
      </div>
    );
  }

  const htmlHref = exampleArtifactUrl(entry.links?.html);
  const jsonHref = exampleArtifactUrl(entry.links?.json);
  const priority = entry.review_priority;
  const detail = caseDetails[entry.oid];
  const residualCount =
    detail?.model_comparisons?.find((item) => item.model_type === "gaussian_bump")
      ?.residual_points?.length ?? 0;
  const longestGap = detail?.light_curve_summary?.longest_detection_gap_days;

  return (
    <div className="flex h-full flex-col gap-5 overflow-auto p-5">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Selected Object
        </p>
        <h2 className="mt-2 font-mono text-2xl text-white">{entry.oid}</h2>
        <p className="mt-3 text-sm leading-6 text-workstation-muted">{entry.short_summary}</p>
      </div>

      <div className="border-y border-workstation-line py-4">
        <div className="grid grid-cols-2 gap-3 font-mono text-xs">
          <span className="text-workstation-muted">detections</span>
          <span>{entry.detection_count ?? "n/a"}</span>
          <span className="text-workstation-muted">filters</span>
          <span>{(entry.filters_observed ?? []).join(", ") || "n/a"}</span>
          <span className="text-workstation-muted">priority</span>
          <span>{priority ? `${priority.score}/10 ${priority.level}` : "n/a"}</span>
          <span className="text-workstation-muted">sort</span>
          <span>{entry.source_date ?? "n/a"}</span>
          <span className="text-workstation-muted">residual field</span>
          <span>{residualCount > 0 ? `${residualCount} points` : detail === null ? "unavailable" : "loading"}</span>
          <span className="text-workstation-muted">largest gap</span>
          <span>{longestGap ? `${longestGap.toFixed(1)} d` : "n/a"}</span>
        </div>
      </div>

      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Evidence Status
        </p>
        <div className="grid gap-2 font-mono text-xs">
          {([
            ["gaussian", entry.gaussian_comparator_status],
            ["variability", entry.variability_texture_status],
            ["features", entry.feature_summary_status],
            ["template", entry.sncosmo_template_probe_status],
            ["catalog", entry.cross_survey_context_status],
          ] satisfies Array<[string, string | undefined]>).map(([key, value]) => (
            <button
              className="flex justify-between border border-workstation-line bg-workstation-bg/60 px-3 py-2 text-left hover:border-workstation-accent/70"
              key={key}
              onClick={() => {
                setActiveComparator(key);
                setHighlightedEvidenceKey(key);
              }}
              type="button"
            >
              <span className="text-workstation-muted">{key}</span>
              <span>{value ?? "missing"}</span>
            </button>
          ))}
        </div>
      </div>

      {priority ? (
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
            Priority Reasons
          </p>
          <ul className="space-y-2 text-sm leading-5 text-workstation-text">
            {priority.reasons.map((reason) => (
              <li className="border-l border-workstation-line pl-3" key={reason}>
                {reason}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-workstation-muted">{priority.caveat}</p>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-3 border-t border-workstation-line pt-4 text-sm">
        {htmlHref ? (
          <a className="text-workstation-accent hover:text-white" href={htmlHref}>
            Static HTML report
          </a>
        ) : null}
        {jsonHref ? (
          <a className="text-workstation-accent hover:text-white" href={jsonHref}>
            Case JSON
          </a>
        ) : null}
      </div>
    </div>
  );
}

export function QueueRoute({
  index,
  isLoading,
  error,
  onOpenCase,
  selectedOid,
  caseDetails,
}: QueueRouteProps) {
  const entries = index?.entries ?? [];
  const selectedEntry = entries.find((entry) => entry.oid === selectedOid) ?? entries[0];

  if (isLoading) {
    return {
      primary: (
        <div className="flex h-full items-center justify-center p-8 font-mono text-sm text-workstation-muted">
          Loading public case-file index...
        </div>
      ),
      secondary: (
        <div className="flex h-full items-center justify-center p-8 text-sm text-workstation-muted">
          Waiting for index data.
        </div>
      ),
    };
  }

  if (error) {
    return {
      primary: (
        <div className="flex h-full items-center justify-center p-8 text-sm text-workstation-red">
          {error}
        </div>
      ),
      secondary: (
        <div className="p-5 text-sm leading-6 text-workstation-muted">
          Check that `docs/examples/index.json` exists and that the workstation is served from
          the built `docs/workstation/` path or Vite dev server.
        </div>
      ),
    };
  }

  return {
    primary: <QueueField details={caseDetails} entries={entries} onOpenCase={onOpenCase} />,
    secondary: <SelectedPreview caseDetails={caseDetails} entry={selectedEntry} />,
  };
}
