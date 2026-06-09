"""Case-file dataclasses. JSON-serializable via `asdict`.

The structure deliberately keeps four things separate (per ARGUS_VISION.md):
observed evidence, candidate explanations, uncertainty, and recommended next
checks. Anything that blurs those boundaries does not belong in this schema.
"""
from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Any, Optional

SCHEMA_VERSION = "1.11"  # 1.11: added observed light_curve_points for public workstation fallback


@dataclass
class FilterStats:
    filter: str                              # "g" or "r"
    n_detections: int
    n_non_detections: int
    first_mjd: Optional[float] = None
    last_mjd: Optional[float] = None
    mag_min: Optional[float] = None
    mag_max: Optional[float] = None
    mag_median: Optional[float] = None
    delta_mag: Optional[float] = None


@dataclass
class LightCurveSummary:
    n_detections: int
    n_non_detections: int
    filters_observed: list[str]
    first_mjd: Optional[float]
    last_mjd: Optional[float]
    time_span_days: Optional[float]
    most_recent_detection_mjd: Optional[float]
    longest_detection_gap_days: Optional[float]
    per_filter: list[FilterStats]


@dataclass
class LightCurvePoint:
    mjd: float
    band: str
    mag: float
    magerr: Optional[float] = None


@dataclass
class CandidateExplanation:
    """A possible explanation for the object's behavior.

    `status` is mandatory and constrained:
      • "external_label"        — label inherited from a broker; not verified by Argus.
      • "placeholder_unfitted"  — hypothesis name only; no fit has been performed.

    Phase 2B does not produce any other status. Adding a "fitted" status is a
    future-phase change and must come with goodness-of-fit values.
    """
    name: str
    status: str
    rationale: str
    mismatch_notes: str
    source: str


@dataclass
class ModelComparison:
    """A single fitted (or attempted) comparator on the object's light curve.

    `status` is constrained:
      • "fitted_baseline"   — a phenomenological template was fit; parameters
        and fit_metrics are populated.
      • "computed"          — descriptive, non-fitted metrics were computed;
        parameters is None and fit_metrics is populated.
      • "insufficient_data" — the data did not meet the minimum requirements
        for fitting/computation; parameters is None and fit_metrics may carry
        bookkeeping such as n_points.
      • "failed_fit"        — the optimizer raised; an error string is recorded
        in fit_metrics; parameters are None.
      • Phase 2G sncosmo probe statuses:
        "fitted", "missing_required_context", "template_unavailable",
        "fit_failed", and "dependency_unavailable".

    The schema does NOT yet support a "physical_model" status. Phase 2C is
    intentionally about phenomenological shapes only.
    """
    name: str
    model_type: str
    filter_used: str
    status: str
    parameters: Optional[dict[str, Any]]
    fit_metrics: Optional[dict[str, Any]]
    residual_summary: list[str]
    interpretation: str
    limitations: list[str]
    residual_points: Optional[list[dict[str, float]]] = None


@dataclass
class ComparisonSummary:
    """Plain-English synthesis of the model_comparisons list.

    This is a phenomenological summary of comparator outputs, not a new model
    and not a physical classification.
    """
    headline: str
    summary: str
    caveat: str
    recommended_next_check: str


@dataclass
class FeatureSummary:
    """Standardized descriptive light-curve features for one band."""
    source: str
    band: str
    status: str
    n_points: int
    features: dict[str, Any]
    interpretation: str
    caveat: str


@dataclass
class CrossSurveyContext:
    """Optional external catalog context, recorded as metadata only."""
    status: str
    coordinates: Optional[dict[str, Any]] = None
    search_radius_arcsec: Optional[float] = None
    sources: list[dict[str, Any]] = field(default_factory=list)
    interpretation: str = ""
    caveat: str = ""


@dataclass
class AnomalyAssessment:
    """Deterministic review-support assessment built from existing evidence.

    This is not a learned detector, object type, or physical interpretation. It
    exists so a reviewer can see why a case may deserve earlier inspection.
    """
    score: int
    label: str
    status: str
    drivers: list[str]
    cautions: list[str]
    input_summary: dict[str, Any]
    caveat: str


@dataclass
class EvidenceSection:
    title: str
    status: str
    summary: str


@dataclass
class EvidenceNarrative:
    """Readable synthesis of the case file's existing evidence layers."""
    headline: str
    short_summary: str
    evidence_sections: list[EvidenceSection]
    what_argus_can_say: list[str]
    what_argus_cannot_say: list[str]
    recommended_next_checks: list[str]
    caveat: str


@dataclass
class CaseFile:
    oid: str
    source_date: str                         # the ALeRCE pull date this case is built from
    generated_at: str                        # ISO 8601 UTC
    coordinates: Optional[dict[str, Any]]
    available_data_sources: list[str]
    detection_count: int
    non_detection_count: int
    filters_observed: list[str]
    first_mjd: Optional[float]
    last_mjd: Optional[float]
    time_span_days: Optional[float]
    classification_metadata: Optional[dict[str, Any]]
    light_curve_summary: Optional[LightCurveSummary]
    evidence_notes: list[str]
    candidate_explanations: list[CandidateExplanation]
    uncertainty_notes: list[str]
    recommended_next_checks: list[str]
    light_curve_points: list[LightCurvePoint] = field(default_factory=list)
    model_comparisons: list[ModelComparison] = field(default_factory=list)
    comparison_summary: Optional[ComparisonSummary] = None
    feature_summary: Optional[FeatureSummary] = None
    anomaly_assessment: Optional[AnomalyAssessment] = None
    cross_survey_context: Optional[CrossSurveyContext] = None
    evidence_narrative: Optional[EvidenceNarrative] = None
    schema_version: str = SCHEMA_VERSION

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
