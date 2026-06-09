import { useInvestigationStore } from "../../stores/investigationStore";
import type { CaseFileDetail, CasefileIndexEntry } from "../../types/casefile";

interface EvidenceStandardPanelProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
}

function status(value: string | undefined): string {
  return value?.trim() || "missing";
}

export function EvidenceStandardPanel({ entry, detail }: EvidenceStandardPanelProps) {
  const focusedPanelKey = useInvestigationStore((state) => state.focusedPanelKey);
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const detections = detail?.detection_count ?? entry.detection_count ?? "n/a";
  const filters = detail?.filters_observed ?? entry.filters_observed ?? [];
  const featureStatus = detail?.feature_summary?.status ?? entry.feature_summary_status;
  const catalogStatus = detail?.cross_survey_context?.status ?? entry.cross_survey_context_status;
  const gaussianStatus =
    detail?.model_comparisons?.find((comparison) => comparison.model_type === "gaussian_bump")?.status ??
    entry.gaussian_comparator_status;
  const variabilityStatus =
    detail?.model_comparisons?.find((comparison) => comparison.model_type === "variability_texture")?.status ??
    entry.variability_texture_status;

  return (
    <section
      className={`argus-panel ${focusedPanelKey === "evidence_standard" ? "argus-panel-focus" : ""}`}
      onMouseEnter={() => setFocusedPanelKey("evidence_standard")}
    >
      <div className="argus-panel-header">
        <p className="argus-panel-title">
          Evidence Standard
        </p>
        <p className="mt-1 text-xs leading-5 text-workstation-muted">
          What is observed, computed, missing, and explicitly not claimed.
        </p>
      </div>
      <div className="grid gap-3 p-3 text-xs leading-5 text-workstation-muted">
        <div className="border border-workstation-line bg-workstation-bg/40 p-3">
          <p className="font-mono uppercase tracking-[0.14em] text-workstation-text">
            Observed facts
          </p>
          <p className="mt-2">
            {detections} detection(s), filters {(filters.length ? filters.join(", ") : "n/a")}.
          </p>
        </div>
        <div className="border border-workstation-line bg-workstation-bg/40 p-3">
          <p className="font-mono uppercase tracking-[0.14em] text-workstation-text">
            Computed evidence
          </p>
          <p className="mt-2">
            features {status(featureStatus)}, Gaussian comparator {status(gaussianStatus)},
            variability texture {status(variabilityStatus)}.
          </p>
        </div>
        <div className="border border-workstation-line bg-workstation-bg/40 p-3">
          <p className="font-mono uppercase tracking-[0.14em] text-workstation-text">
            Missing context
          </p>
          <p className="mt-2">
            Catalog context status is {status(catalogStatus)}. Missing or unrequested context is
            a review limitation, not evidence of object identity.
          </p>
        </div>
        <div className="border border-workstation-line bg-workstation-bg/40 p-3">
          <p className="font-mono uppercase tracking-[0.14em] text-workstation-text">
            Non-claims
          </p>
          <p className="mt-2">
            Argus organizes evidence for inspection. It does not identify the object type,
            assert a final finding, or treat broker/catalog labels as ground truth.
          </p>
        </div>
      </div>
    </section>
  );
}
