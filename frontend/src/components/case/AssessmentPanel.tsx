import { useInvestigationStore } from "../../stores/investigationStore";
import {
  assessmentCautions,
  assessmentCaveat,
  assessmentDrivers,
  assessmentFromSources,
  assessmentLabel,
  assessmentStatus,
  formatAssessmentScore,
} from "../../lib/assessmentDisplay";
import type { CaseFileDetail, CasefileIndexEntry } from "../../types/casefile";

interface AssessmentPanelProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
}

export function AssessmentPanel({ entry, detail }: AssessmentPanelProps) {
  const focusedPanelKey = useInvestigationStore((state) => state.focusedPanelKey);
  const highlightedEvidenceKey = useInvestigationStore((state) => state.highlightedEvidenceKey);
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const setHighlightedEvidenceKey = useInvestigationStore(
    (state) => state.setHighlightedEvidenceKey,
  );
  const assessment = assessmentFromSources(entry, detail);
  const drivers = assessmentDrivers(assessment, 6);
  const cautions = assessmentCautions(assessment, 6);
  const isFocused = focusedPanelKey === "anomaly_assessment" || highlightedEvidenceKey === "assessment";

  return (
    <section
      className={`argus-panel ${isFocused ? "argus-panel-focus" : ""}`}
      onMouseEnter={() => setFocusedPanelKey("anomaly_assessment")}
    >
      <div className="argus-panel-header">
        <div className="flex items-center justify-between gap-3">
          <p className="argus-panel-title">
            Assessment
          </p>
          <span className="argus-state-pill">
            {assessmentStatus(assessment)}
          </span>
        </div>
        <p className="mt-1 text-xs leading-5 text-workstation-muted">
          Deterministic public-demo assessment for review support only.
        </p>
      </div>

      <div className="max-h-[260px] overflow-auto p-3">
        <button
          className="w-full border border-workstation-line bg-workstation-bg/40 p-3 text-left hover:border-workstation-accent/70"
          onClick={() => {
            setHighlightedEvidenceKey("assessment");
            setFocusedPanelKey("anomaly_assessment");
          }}
          type="button"
        >
          <div className="flex items-center justify-between gap-3 font-mono text-xs">
            <span className="uppercase tracking-[0.14em] text-workstation-muted">
              score
            </span>
            <span className="text-workstation-accent">
              {formatAssessmentScore(assessment)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 font-mono text-xs">
            <span className="uppercase tracking-[0.14em] text-workstation-muted">
              label
            </span>
            <span className="text-workstation-text">
              {assessmentLabel(assessment)}
            </span>
          </div>
        </button>

        {drivers.length ? (
          <div className="mt-3">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-workstation-muted">
              Drivers
            </p>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-workstation-text">
              {drivers.map((driver) => (
                <li className="border-l border-workstation-line pl-3" key={driver}>
                  {driver}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="mt-3 text-xs leading-5 text-workstation-muted">
            No assessment drivers are recorded in this artifact.
          </p>
        )}

        {cautions.length ? (
          <div className="mt-3 border-t border-workstation-line pt-3">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-workstation-muted">
              Cautions
            </p>
            <ul className="mt-2 space-y-2 text-xs leading-5 text-workstation-muted">
              {cautions.map((caution) => (
                <li key={caution}>{caution}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-3 border-t border-workstation-line pt-3 text-xs leading-5 text-workstation-muted">
          {assessmentCaveat(assessment)}
        </p>
      </div>
    </section>
  );
}
