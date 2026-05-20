"""Case-file dataclasses. JSON-serializable via `asdict`.

The structure deliberately keeps four things separate (per ARGUS_VISION.md):
observed evidence, candidate explanations, uncertainty, and recommended next
checks. Anything that blurs those boundaries does not belong in this schema.
"""
from __future__ import annotations
from dataclasses import dataclass, asdict
from typing import Any, Optional

SCHEMA_VERSION = "1.0"


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
    schema_version: str = SCHEMA_VERSION

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
