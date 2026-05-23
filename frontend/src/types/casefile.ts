export type ReviewPriorityLevel = "low" | "medium" | "high" | string;

export interface ReviewPriority {
  score: number;
  level: ReviewPriorityLevel;
  reasons: string[];
  caveat: string;
}

export interface CasefileArtifactLinks {
  json?: string;
  markdown?: string;
  html?: string;
  light_curve_png?: string;
  residual_png?: string;
  [key: string]: string | undefined;
}

export interface CasefileIndexEntry {
  oid: string;
  source_date?: string;
  generated_at?: string;
  schema_version?: string;
  headline: string;
  short_summary?: string;
  detection_count?: number;
  non_detection_count?: number;
  filters_observed?: string[];
  time_span_days?: number;
  gaussian_comparator_status?: string;
  variability_texture_status?: string;
  feature_summary_status?: string;
  sncosmo_template_probe_status?: string;
  cross_survey_context_status?: string;
  review_priority?: ReviewPriority;
  top_recommended_next_check?: string;
  links?: CasefileArtifactLinks;
}

export interface CasefileIndex {
  index_version: string;
  generated_at: string;
  case_count: number;
  sort_order: string;
  description?: string;
  entries: CasefileIndexEntry[];
}
