import type { CaseFileDetailMap, CasefileIndex, CasefileIndexEntry } from "../types/casefile";
import {
  ANOMALY_ASSESSMENT_DEFINITION,
  REVIEW_PRIORITY_DEFINITION,
  assessmentCaveat,
  assessmentDrivers,
  assessmentFromSources,
  assessmentLabel,
  formatAssessmentScore,
} from "../lib/assessmentDisplay";
import { exampleArtifactUrl } from "../lib/paths";
import { QueueField } from "../components/queue/QueueField";
import { QueueHintBar } from "../components/queue/QueueHintBar";
import { QueueSkyView } from "../components/queue/QueueSkyView";
import { useInvestigationStore } from "../stores/investigationStore";
import type { Coordinates } from "../types/casefile";

interface QueueRouteProps {
  index: CasefileIndex | null;
  isLoading: boolean;
  error: string | null;
  onOpenCase: (oid: string) => void;
  selectedOid: string | null;
  caseDetails: CaseFileDetailMap;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasUsableCoordinates(coordinates: Coordinates | undefined): boolean {
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

function QueueModeHeader({
  entries,
  caseDetails,
}: {
  entries: CasefileIndexEntry[];
  caseDetails: CaseFileDetailMap;
}) {
  const selectedOid = useInvestigationStore((state) => state.selectedOid);
  const queueViewMode = useInvestigationStore((state) => state.queueViewMode);
  const setQueueViewMode = useInvestigationStore((state) => state.setQueueViewMode);
  const plotted = entries.filter((entry) => hasUsableCoordinates(caseDetails[entry.oid]?.coordinates)).length;
  const missing = entries.length - plotted;

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-workstation-line px-4 py-3">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Queue Mode
        </p>
        <h1 className="mt-1 text-lg font-semibold text-white">
          {queueViewMode === "sky" ? "Sky review field" : "Evidence glyph field"}
        </h1>
        <p className="mt-1 font-mono text-xs text-workstation-muted">
          {entries.length} objects prepared / {plotted} plotted / {missing} without sky position
          {selectedOid ? ` / selected ${selectedOid}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex border border-workstation-line bg-workstation-bg/70 p-1 font-mono text-[0.68rem] uppercase tracking-[0.14em]">
          {(["field", "sky"] as const).map((mode) => (
            <button
              className={`px-3 py-1.5 transition-colors ${
                queueViewMode === mode
                  ? "bg-workstation-accent/20 text-workstation-text"
                  : "text-workstation-muted hover:text-workstation-text"
              }`}
              key={mode}
              onClick={() => setQueueViewMode(mode)}
              type="button"
            >
              {mode === "field" ? "Field" : "Sky"}
            </button>
          ))}
        </div>
        <p className="hidden max-w-md text-right text-xs leading-5 text-workstation-muted md:block">
          Field encodes evidence texture. Sky places case files with recorded coordinates on
          external Aladin imagery; missing positions remain explicit.
        </p>
      </div>
    </div>
  );
}

function SelectedPreview({
  entry,
  caseDetails,
}: {
  entry: CasefileIndexEntry | undefined;
  caseDetails: CaseFileDetailMap;
}) {
  const setActiveComparator = useInvestigationStore((state) => state.setActiveComparator);
  const activeComparator = useInvestigationStore((state) => state.activeComparator);
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
  const assessment = assessmentFromSources(entry, detail);
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
        <p className="mt-2 font-mono text-xs uppercase tracking-[0.14em] text-workstation-accent">
          Opens into linked evidence canvas
        </p>
        <p className="mt-3 text-sm leading-6 text-workstation-muted">{entry.short_summary}</p>
      </div>

      <div className="border-y border-workstation-line py-4">
        <div className="grid grid-cols-2 gap-3 font-mono text-xs">
          <span className="text-workstation-muted">detections</span>
          <span>{entry.detection_count ?? "n/a"}</span>
          <span className="text-workstation-muted">filters</span>
          <span>{(entry.filters_observed ?? []).join(", ") || "n/a"}</span>
          <span className="text-workstation-muted">priority</span>
          <span title={REVIEW_PRIORITY_DEFINITION}>{priority ? `${priority.score}/10 ${priority.level}` : "n/a"}</span>
          <span className="text-workstation-muted">assessment</span>
          <span title={ANOMALY_ASSESSMENT_DEFINITION}>
            {assessment ? `${formatAssessmentScore(assessment)} ${assessmentLabel(assessment)}` : "n/a"}
          </span>
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
              className={`flex justify-between border bg-workstation-bg/60 px-3 py-2 text-left transition-colors hover:border-workstation-accent/70 ${
                activeComparator === key
                  ? "border-workstation-accent/70 text-workstation-text"
                  : "border-workstation-line"
              }`}
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
          <p className="mb-3 text-xs leading-5 text-workstation-muted">{REVIEW_PRIORITY_DEFINITION}</p>
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

      {assessment ? (
        <div>
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
            Evidence Triage Drivers
          </p>
          <p className="mb-3 text-xs leading-5 text-workstation-muted">{ANOMALY_ASSESSMENT_DEFINITION}</p>
          <ul className="space-y-2 text-sm leading-5 text-workstation-text">
            {assessmentDrivers(assessment, 3).map((driver) => (
              <li className="border-l border-workstation-line pl-3" key={driver}>
                {driver}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-workstation-muted">
            {assessmentCaveat(assessment)}
          </p>
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
  const queueViewMode = useInvestigationStore((state) => state.queueViewMode);

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
    primary: (
      <div className="flex h-full min-h-0 flex-col">
        <QueueModeHeader caseDetails={caseDetails} entries={entries} />
        <QueueHintBar />
        <div className="min-h-0 flex-1">
          {queueViewMode === "sky" ? (
            <QueueSkyView details={caseDetails} entries={entries} onOpenCase={onOpenCase} />
          ) : (
            <QueueField
              details={caseDetails}
              entries={entries}
              onOpenCase={onOpenCase}
              showHeader={false}
            />
          )}
        </div>
      </div>
    ),
    secondary: <SelectedPreview caseDetails={caseDetails} entry={selectedEntry} />,
  };
}
