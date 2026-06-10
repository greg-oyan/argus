import type { CaseFileDetail, CasefileIndexEntry } from "../../types/casefile";
import {
  ANOMALY_ASSESSMENT_DEFINITION,
  REVIEW_PRIORITY_DEFINITION,
  assessmentFromSources,
  assessmentLabel,
  formatAssessmentScore,
} from "../../lib/assessmentDisplay";
import { behaviorKind, evidenceRailItems, priorityEncoding } from "../../lib/glyphEncoding";
import { useInvestigationStore } from "../../stores/investigationStore";

interface CaseHeaderProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
  onBackToQueue: () => void;
}

function formatFilters(filters: string[] | undefined): string {
  return filters?.length ? filters.join(", ") : "n/a";
}

function behaviorLabel(kind: string): string {
  if (kind === "repeated_or_irregular") return "repeated/irregular texture";
  if (kind === "insufficient_data") return "sparse evidence";
  return "smooth-bump reference";
}

export function CaseHeader({ entry, detail, onBackToQueue }: CaseHeaderProps) {
  const detections = entry.detection_count ?? detail?.detection_count ?? "n/a";
  const nonDetections = entry.non_detection_count ?? detail?.non_detection_count ?? "n/a";
  const filters = entry.filters_observed ?? detail?.filters_observed;
  const priority = entry.review_priority;
  const assessment = assessmentFromSources(entry, detail);
  const priorityVisual = priorityEncoding(entry);
  const behavior = behaviorKind(entry, detail);
  const railItems = evidenceRailItems(entry);
  const activeComparator = useInvestigationStore((state) => state.activeComparator);
  const highlightedEvidenceKey = useInvestigationStore((state) => state.highlightedEvidenceKey);
  const hoveredPointId = useInvestigationStore((state) => state.hoveredPointId);
  const selectedPointId = useInvestigationStore((state) => state.selectedPointId);
  const crossStatus = detail?.cross_survey_context?.status ?? entry.cross_survey_context_status ?? "missing";
  const pointState = selectedPointId ? "selected observation pinned" : hoveredPointId ? "hovered observation" : "no point focus";

  return (
    <header className="relative border-b border-workstation-line bg-workstation-panel px-5 py-4 shadow-[0_1px_0_rgba(255,255,255,0.03)]">
      <div
        className="absolute inset-y-0 left-0"
        style={{
          backgroundColor: priorityVisual.color,
          opacity: priorityVisual.opacity,
          width: priorityVisual.width,
        }}
      />
      <div className="flex flex-col gap-4 pl-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
            Evidence Canvas
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl text-white">{entry.oid}</h1>
            {priority ? (
              <span className="argus-state-pill argus-state-pill-active" title={REVIEW_PRIORITY_DEFINITION}>
                review priority {priority.score}/10 {priority.level}
              </span>
            ) : null}
            {assessment ? (
              <span className="argus-state-pill" title={ANOMALY_ASSESSMENT_DEFINITION}>
                evidence triage {formatAssessmentScore(assessment)} {assessmentLabel(assessment)}
              </span>
            ) : null}
            <span className="argus-state-pill">{behaviorLabel(behavior)}</span>
          </div>
          <p className="mt-3 max-w-5xl text-sm leading-6 text-workstation-muted">
            {entry.headline}
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 text-xs xl:items-end">
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span className="argus-state-pill">filters {formatFilters(filters)}</span>
            <span className="argus-state-pill">det {detections}</span>
            <span className="argus-state-pill">non-det {nonDetections}</span>
            <span className="argus-state-pill">catalog {crossStatus}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <span className={`argus-state-pill ${activeComparator ? "argus-state-pill-active" : ""}`}>
              comparator {activeComparator ?? "none"}
            </span>
            <span className={`argus-state-pill ${highlightedEvidenceKey ? "argus-state-pill-active" : ""}`}>
              evidence {highlightedEvidenceKey ?? "none"}
            </span>
            <span className={`argus-state-pill ${selectedPointId || hoveredPointId ? "argus-state-pill-active" : ""}`}>
              {pointState}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {railItems.map((item) => (
              <span
                className={`h-5 min-w-5 border px-1 text-center font-mono text-[0.62rem] leading-5 ${
                  item.state === "available"
                    ? "border-workstation-green/70 text-workstation-green"
                    : item.state === "limited"
                      ? "border-workstation-amber/70 text-workstation-amber"
                      : "border-workstation-line text-workstation-muted/50"
                }`}
                key={item.key}
                title={`${item.key}: ${item.status}`}
              >
                {item.label}
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              className="argus-focus-visible border border-workstation-line px-4 py-2 text-sm text-workstation-text transition-colors hover:border-workstation-accent hover:bg-workstation-bg/70"
              onClick={onBackToQueue}
              type="button"
            >
              Queue Mode
            </button>
            <span className="font-mono text-[0.62rem] uppercase tracking-[0.16em] text-workstation-muted">
              Esc
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
