import type { AnomalyAssessment, CaseFileDetail, CasefileIndexEntry } from "../types/casefile";

export const REVIEW_PRIORITY_DEFINITION =
  "Review priority is a queue sorting heuristic. It orders the review queue for inspection; it is not a model score or object-identity claim.";

export const ANOMALY_ASSESSMENT_DEFINITION =
  "anomaly_assessment is an evidence triage summary inside this case file. It summarizes available signals for review; it is not an object-identity claim.";

export function assessmentFromSources(
  entry: CasefileIndexEntry,
  detail: CaseFileDetail | null | undefined,
): AnomalyAssessment | undefined {
  return detail?.anomaly_assessment ?? entry.anomaly_assessment;
}

export function formatAssessmentScore(assessment: AnomalyAssessment | null | undefined): string {
  if (typeof assessment?.score === "number" && Number.isFinite(assessment.score)) {
    return `${assessment.score}/10`;
  }
  return "n/a";
}

export function assessmentLabel(assessment: AnomalyAssessment | null | undefined): string {
  return assessment?.label?.trim() || "unknown";
}

export function assessmentStatus(assessment: AnomalyAssessment | null | undefined): string {
  return assessment?.status?.trim() || "missing";
}

export function assessmentDrivers(
  assessment: AnomalyAssessment | null | undefined,
  limit = 3,
): string[] {
  return (assessment?.drivers ?? []).filter((item) => item.trim()).slice(0, limit);
}

export function assessmentCautions(
  assessment: AnomalyAssessment | null | undefined,
  limit = 3,
): string[] {
  return (assessment?.cautions ?? []).filter((item) => item.trim()).slice(0, limit);
}

export function assessmentCaveat(assessment: AnomalyAssessment | null | undefined): string {
  return (
    assessment?.caveat?.trim() ||
    "This assessment supports review only; it does not identify the object."
  );
}
