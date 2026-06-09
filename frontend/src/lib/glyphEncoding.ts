import type {
  CaseFileDetail,
  CasefileIndexEntry,
  ModelComparison,
  ResidualPoint,
} from "../types/casefile";

export type BehaviorKind = "smooth_bump" | "repeated_or_irregular" | "insufficient_data";
export type EvidenceState = "available" | "limited" | "missing";

export interface EvidenceRailItem {
  key: string;
  label: string;
  status: string;
  state: EvidenceState;
}

export interface PriorityEncoding {
  width: number;
  opacity: number;
  color: string;
}

export interface PriorityMarkerEncoding {
  color: string;
  size: number;
  opacity: number;
}

export interface SparsityEncoding {
  detectionDots: number;
  nonDetectionTexture: number;
  gapFraction: number;
  opacity: number;
}

export function comparison(
  detail: CaseFileDetail | null | undefined,
  modelType: string,
): ModelComparison | undefined {
  return detail?.model_comparisons?.find((item) => item.model_type === modelType);
}

export function priorityEncoding(entry: CasefileIndexEntry): PriorityEncoding {
  const score = Math.max(0, Math.min(10, entry.review_priority?.score ?? 0));
  const level = entry.review_priority?.level;
  if (level === "high") {
    return { width: 7, opacity: 0.95, color: "#d46a6a" };
  }
  if (level === "medium") {
    return { width: 5, opacity: 0.78, color: "#d8a84c" };
  }
  return { width: score > 0 ? 3 : 2, opacity: score > 0 ? 0.58 : 0.34, color: "#80c990" };
}

export function priorityMarkerEncoding(entry: CasefileIndexEntry): PriorityMarkerEncoding {
  const spine = priorityEncoding(entry);
  const score = Math.max(0, Math.min(10, entry.review_priority?.score ?? 0));
  return {
    color: spine.color,
    opacity: spine.opacity,
    size: Math.max(9, Math.min(18, 8 + score)),
  };
}

export function behaviorKind(
  entry: CasefileIndexEntry,
  detail: CaseFileDetail | null | undefined,
): BehaviorKind {
  const variability = comparison(detail, "variability_texture");
  const hint = String(variability?.fit_metrics?.behavior_hint ?? "");
  const gaussianStatus = entry.gaussian_comparator_status ?? "";
  const variabilityStatus = entry.variability_texture_status ?? "";
  const text = `${entry.headline} ${entry.short_summary ?? ""}`.toLowerCase();

  if (hint === "repeated_or_irregular" || text.includes("repeated or irregular")) {
    return "repeated_or_irregular";
  }
  if (
    gaussianStatus === "insufficient_data" ||
    variabilityStatus === "insufficient_data" ||
    (entry.detection_count ?? 0) < 5
  ) {
    return "insufficient_data";
  }
  return "smooth_bump";
}

export function residualPoints(detail: CaseFileDetail | null | undefined): ResidualPoint[] {
  return comparison(detail, "gaussian_bump")?.residual_points ?? [];
}

export function sparsityEncoding(
  entry: CasefileIndexEntry,
  detail: CaseFileDetail | null | undefined,
): SparsityEncoding {
  const detections = entry.detection_count ?? detail?.detection_count ?? 0;
  const nonDetections = entry.non_detection_count ?? detail?.non_detection_count ?? 0;
  const gap = detail?.light_curve_summary?.longest_detection_gap_days ?? 0;
  const span =
    detail?.light_curve_summary?.time_span_days ?? entry.time_span_days ?? detail?.time_span_days ?? 0;
  const gapFraction = span > 0 ? Math.max(0, Math.min(1, gap / span)) : 0;
  return {
    detectionDots: Math.max(2, Math.min(18, Math.round(Math.sqrt(Math.max(0, detections))))),
    nonDetectionTexture: Math.max(0, Math.min(20, Math.round(nonDetections / 45))),
    gapFraction,
    opacity: detections > 100 ? 0.96 : detections > 20 ? 0.78 : detections > 5 ? 0.58 : 0.38,
  };
}

function statusState(status: string | undefined): EvidenceState {
  if (!status || status === "missing" || status === "dependency_unavailable") {
    return "missing";
  }
  if (
    status === "computed" ||
    status === "fitted_baseline" ||
    status === "queried" ||
    status === "fitted"
  ) {
    return "available";
  }
  return "limited";
}

export function evidenceRailItems(entry: CasefileIndexEntry): EvidenceRailItem[] {
  return ([
    ["F", "feature_summary_status", entry.feature_summary_status],
    ["G", "gaussian_comparator_status", entry.gaussian_comparator_status],
    ["V", "variability_texture_status", entry.variability_texture_status],
    ["T", "sncosmo_template_probe_status", entry.sncosmo_template_probe_status],
    ["C", "cross_survey_context_status", entry.cross_survey_context_status],
  ] satisfies Array<[string, string, string | undefined]>).map(([label, key, status]) => ({
    key,
    label,
    status: status ?? "missing",
    state: statusState(status),
  }));
}

export function sampledResiduals(points: ResidualPoint[], maxCount = 34): ResidualPoint[] {
  if (points.length <= maxCount) {
    return points;
  }
  const step = (points.length - 1) / (maxCount - 1);
  return Array.from({ length: maxCount }, (_, index) => points[Math.round(index * step)]);
}
