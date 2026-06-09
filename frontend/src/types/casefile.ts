export type ReviewPriorityLevel = "low" | "medium" | "high" | string;

export interface ReviewPriority {
  score: number;
  level: ReviewPriorityLevel;
  reasons: string[];
  caveat: string;
}

export interface EvidenceSection {
  title: string;
  status?: string;
  summary?: string;
}

export interface EvidenceNarrative {
  headline?: string;
  short_summary?: string;
  evidence_sections?: EvidenceSection[];
  what_argus_can_say?: string[];
  what_argus_cannot_say?: string[];
  recommended_next_checks?: string[];
  caveat?: string;
}

export interface ComparisonSummary {
  headline?: string;
  summary?: string;
  caveat?: string;
  recommended_next_check?: string;
}

export interface FeatureSummary {
  source?: string;
  band?: string;
  status?: string;
  n_points?: number;
  features?: Record<string, number | string | boolean | null | undefined>;
  interpretation?: string;
  caveat?: string;
}

export interface AnomalyAssessment {
  score?: number | null;
  label?: string;
  status?: string;
  drivers?: string[];
  cautions?: string[];
  input_summary?: Record<string, unknown>;
  caveat?: string;
}

export interface Coordinates {
  ra?: number | null;
  dec?: number | null;
  ra_unit?: string | null;
  dec_unit?: string | null;
}

export interface CrossSurveyNearestMatch {
  name?: string;
  separation_arcsec?: number | null;
  raw_type_label?: string | null;
  catalog_object_type?: string | null;
}

export interface CrossSurveySource {
  catalog?: string;
  status?: string;
  nearest_match?: CrossSurveyNearestMatch | null;
  match_count?: number;
}

export interface CrossSurveyContext {
  status?: string;
  coordinates?: Coordinates | null;
  search_radius_arcsec?: number | null;
  sources?: CrossSurveySource[];
  interpretation?: string;
  caveat?: string;
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
  anomaly_assessment?: AnomalyAssessment;
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

export interface ResidualPoint {
  mjd: number;
  observed_mag?: number;
  model_mag?: number;
  residual_mag: number;
  magerr?: number | null;
}

export interface LightCurvePoint {
  mjd: number;
  band?: string;
  mag?: number;
  magerr?: number | null;
}

export interface ModelComparison {
  name?: string;
  model_type: string;
  filter_used?: string;
  status?: string;
  parameters?: Record<string, number | string | boolean | null | undefined>;
  fit_metrics?: Record<string, number | string | boolean | null | undefined>;
  residual_summary?: string[];
  interpretation?: string;
  limitations?: string[];
  residual_points?: ResidualPoint[] | null;
}

export interface LightCurveFilterSummary {
  filter: string;
  n_detections?: number;
  n_non_detections?: number;
  delta_mag?: number;
}

export interface LightCurveSummary {
  n_detections?: number;
  n_non_detections?: number;
  longest_detection_gap_days?: number;
  time_span_days?: number;
  per_filter?: LightCurveFilterSummary[];
}

export interface CaseFileDetail {
  oid: string;
  schema_version?: string;
  detection_count?: number;
  non_detection_count?: number;
  filters_observed?: string[];
  time_span_days?: number;
  coordinates?: Coordinates;
  light_curve_summary?: LightCurveSummary;
  light_curve_points?: LightCurvePoint[];
  evidence_narrative?: EvidenceNarrative;
  comparison_summary?: ComparisonSummary;
  feature_summary?: FeatureSummary;
  anomaly_assessment?: AnomalyAssessment;
  cross_survey_context?: CrossSurveyContext;
  model_comparisons?: ModelComparison[];
  recommended_next_checks?: string[];
  uncertainty_notes?: string[];
}

export type CaseFileDetailMap = Record<string, CaseFileDetail | null | undefined>;
