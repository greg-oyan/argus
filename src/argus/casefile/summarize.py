"""Pure functions that compute the four parts of a case file from local data.

Every function here is deterministic and offline. No model output, no network,
no generative prose: only templated English driven by the numbers in front of us.
"""
from __future__ import annotations
from typing import Any, Optional

import numpy as np
import pandas as pd

from argus.casefile.schema import (
    CandidateExplanation, ComparisonSummary, EvidenceNarrative, EvidenceSection,
    FeatureSummary, FilterStats, LightCurveSummary, ModelComparison,
)

_FID_NAME = {1: "g", 2: "r"}


def _opt_float(x) -> Optional[float]:
    try:
        f = float(x)
        return f if np.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def summarize_light_curve(
    detections: pd.DataFrame,
    non_detections: pd.DataFrame,
) -> LightCurveSummary:
    """Structured summary of the photometric record from local files."""
    n_det = int(len(detections)) if detections is not None else 0
    n_nondet = int(len(non_detections)) if non_detections is not None else 0

    filters_observed: set[str] = set()
    if n_det and "fid" in detections.columns:
        filters_observed |= {_FID_NAME[int(f)] for f in detections["fid"].dropna().unique() if int(f) in _FID_NAME}
    if n_nondet and "fid" in non_detections.columns:
        filters_observed |= {_FID_NAME[int(f)] for f in non_detections["fid"].dropna().unique() if int(f) in _FID_NAME}

    all_mjd: list[float] = []
    if n_det and "mjd" in detections.columns:
        all_mjd.extend(float(x) for x in detections["mjd"].dropna())
    if n_nondet and "mjd" in non_detections.columns:
        all_mjd.extend(float(x) for x in non_detections["mjd"].dropna())

    first_mjd = min(all_mjd) if all_mjd else None
    last_mjd = max(all_mjd) if all_mjd else None
    time_span = (last_mjd - first_mjd) if (first_mjd is not None and last_mjd is not None) else None

    most_recent_det = _opt_float(detections["mjd"].max()) if n_det and "mjd" in detections.columns else None

    longest_gap: Optional[float] = None
    if n_det >= 2 and "mjd" in detections.columns:
        sorted_mjd = sorted(float(x) for x in detections["mjd"].dropna())
        if len(sorted_mjd) >= 2:
            longest_gap = float(max(b - a for a, b in zip(sorted_mjd, sorted_mjd[1:])))

    per_filter: list[FilterStats] = []
    for fid, fname in _FID_NAME.items():
        d_f = detections[detections["fid"] == fid] if n_det and "fid" in detections.columns else pd.DataFrame()
        nd_f = (non_detections[non_detections["fid"] == fid]
                if n_nondet and "fid" in non_detections.columns else pd.DataFrame())
        if len(d_f) == 0 and len(nd_f) == 0:
            continue
        d_mjd = d_f["mjd"].dropna() if "mjd" in d_f.columns else pd.Series(dtype=float)
        nd_mjd = nd_f["mjd"].dropna() if "mjd" in nd_f.columns else pd.Series(dtype=float)
        first = float(d_mjd.min()) if len(d_mjd) else (float(nd_mjd.min()) if len(nd_mjd) else None)
        last = float(d_mjd.max()) if len(d_mjd) else (float(nd_mjd.max()) if len(nd_mjd) else None)
        mags = d_f["magpsf"].dropna() if "magpsf" in d_f.columns else pd.Series(dtype=float)
        mag_min = float(mags.min()) if len(mags) else None
        mag_max = float(mags.max()) if len(mags) else None
        mag_med = float(mags.median()) if len(mags) else None
        delta = (mag_max - mag_min) if (mag_min is not None and mag_max is not None) else None
        per_filter.append(FilterStats(
            filter=fname,
            n_detections=int(len(d_f)),
            n_non_detections=int(len(nd_f)),
            first_mjd=first, last_mjd=last,
            mag_min=mag_min, mag_max=mag_max, mag_median=mag_med, delta_mag=delta,
        ))

    return LightCurveSummary(
        n_detections=n_det,
        n_non_detections=n_nondet,
        filters_observed=sorted(filters_observed),
        first_mjd=first_mjd,
        last_mjd=last_mjd,
        time_span_days=time_span,
        most_recent_detection_mjd=most_recent_det,
        longest_detection_gap_days=longest_gap,
        per_filter=per_filter,
    )


def evidence_notes(
    summary: LightCurveSummary,
    classification: Optional[dict],
) -> list[str]:
    """Plain-English facts read directly off the data. No inference, no narrative."""
    notes: list[str] = []
    notes.append(
        f"Object has {summary.n_detections} rb-filtered detection(s) "
        f"and {summary.n_non_detections} non-detection(s) on file."
    )
    if summary.filters_observed:
        notes.append(f"Filters observed: {', '.join(summary.filters_observed)}.")
    if summary.first_mjd is not None and summary.last_mjd is not None and summary.time_span_days is not None:
        notes.append(
            f"Coverage spans MJD {summary.first_mjd:.2f} to {summary.last_mjd:.2f} "
            f"({summary.time_span_days:.0f} days)."
        )
    if summary.most_recent_detection_mjd is not None:
        notes.append(f"Most recent detection: MJD {summary.most_recent_detection_mjd:.2f}.")
    if summary.longest_detection_gap_days is not None:
        notes.append(
            f"Longest gap between consecutive detections: "
            f"{summary.longest_detection_gap_days:.0f} days."
        )
    for f in summary.per_filter:
        if f.n_detections > 0 and f.mag_min is not None and f.mag_max is not None and f.delta_mag is not None:
            notes.append(
                f"In {f.filter}-band: {f.n_detections} detection(s), magnitude "
                f"{f.mag_min:.2f}–{f.mag_max:.2f} "
                f"(Δm = {f.delta_mag:.2f}); {f.n_non_detections} non-detection(s)."
            )
        elif f.n_detections == 0 and f.n_non_detections > 0:
            notes.append(
                f"In {f.filter}-band: 0 detections and {f.n_non_detections} non-detection(s). "
                f"Source was below detection threshold whenever ZTF looked in {f.filter}."
            )
    if classification and classification.get("class"):
        clf = classification.get("classifier") or "unknown classifier"
        prob = classification.get("probability")
        prob_str = f"p={prob:.2f}" if isinstance(prob, (int, float)) else "probability unknown"
        notes.append(
            f"External classifier ({clf}) labels this object as: "
            f"{classification['class']} ({prob_str})."
        )
    else:
        notes.append("No external classification label is attached to this object in local data.")
    return notes


_PLACEHOLDER_CANDIDATES: tuple[tuple[str, str], ...] = (
    ("Type Ia supernova",
     "Rise + decline over ~30–60 days with characteristic g–r color evolution. "
     "Worth fitting once a template comparator is wired in."),
    ("AGN variability",
     "Stochastic variability on month-to-year timescales, often coincident with "
     "a galactic nucleus. Worth checking host galaxy proximity."),
    ("Stellar flare / CV outburst",
     "Short, blue-leaning brightening. Worth checking the timescale of any "
     "detection cluster and presence of a nearby stellar host."),
)


def candidate_explanations(
    summary: LightCurveSummary,
    classification: Optional[dict],
) -> list[CandidateExplanation]:
    """Phase 2B emits only `external_label` and `placeholder_unfitted` candidates.

    No fitting happens here; every candidate carries a `mismatch_notes` field
    saying so explicitly. The structure is what matters at this stage — once a
    comparator exists, each placeholder gets replaced by a fitted candidate.
    """
    out: list[CandidateExplanation] = []
    if classification and classification.get("class"):
        out.append(CandidateExplanation(
            name=str(classification["class"]),
            status="external_label",
            rationale=(
                f"ALeRCE's {classification.get('classifier', 'unknown')} classifier "
                "assigned this label."
            ),
            mismatch_notes=(
                "External labels are inherited, not verified. Argus has not yet "
                "checked the data against this hypothesis."
            ),
            source="ALeRCE classifier metadata",
        ))
    for name, rationale in _PLACEHOLDER_CANDIDATES:
        out.append(CandidateExplanation(
            name=name,
            status="placeholder_unfitted",
            rationale=rationale,
            mismatch_notes=(
                "No fit has been performed in Phase 2B. This is a placeholder for "
                "the comparator that will replace it."
            ),
            source="default placeholder set",
        ))
    return out


def uncertainty_notes(
    summary: LightCurveSummary,
    classification: Optional[dict],
    available_sources: list[str],
) -> list[str]:
    notes: list[str] = []
    notes.append("No SIMBAD/NED/Gaia cross-match has been performed in Phase 2B.")
    notes.append("No spectroscopic information is on file.")
    notes.append("No forced-photometry follow-up has been requested.")
    notes.append(
        "Candidate explanations above are placeholders, not fits, so mismatch "
        "magnitudes and goodness-of-fit values are not yet available."
    )
    if "tensor_manifest" not in available_sources:
        notes.append(
            "No tensor manifest was found locally for this date; per-object "
            "preprocessing statistics were not joined into this case file."
        )
    if not (classification and classification.get("class")):
        notes.append("No external classification label is present in local data.")
    if summary.n_detections == 0:
        notes.append(
            "There are zero rb-filtered detections within the local Parquet. "
            "All photometric statements above derive from non-detection upper "
            "limits and any unfiltered raw data on disk."
        )
    return notes


def recommended_next_checks(
    summary: LightCurveSummary,
    classification: Optional[dict],
    coordinates: Optional[dict],
) -> list[str]:
    checks: list[str] = []
    if coordinates and "ra" in coordinates and "dec" in coordinates:
        checks.append(
            f"Cross-match position (RA={coordinates['ra']:.5f}, "
            f"Dec={coordinates['dec']:.5f}) against SIMBAD and NED for any "
            "known counterpart."
        )
        checks.append(
            "Search PanSTARRS at this position for a candidate host galaxy "
            "and record offset from any nearby extended source."
        )
    else:
        checks.append("Recover sky coordinates and cross-match against SIMBAD and NED.")
    if summary.most_recent_detection_mjd is not None:
        checks.append(
            f"Pull ZTF forced photometry in a ±90-day window around the most "
            f"recent detection (MJD {summary.most_recent_detection_mjd:.2f})."
        )
    checks.append(
        "Replace the Phase 2C Gaussian-bump baseline with physical templates "
        "(Type Ia SN light curve, AGN damped random walk, stellar-flare profile) "
        "and add their residuals to model_comparisons."
    )
    if (summary.most_recent_detection_mjd is not None
            and summary.last_mjd is not None
            and (summary.last_mjd - summary.most_recent_detection_mjd) < 60):
        checks.append(
            "If the source is still active (last detection within ~60 days), "
            "request follow-up spectroscopy."
        )
    return checks


def _comparison_field(comparison, field_name: str, default=None):
    if comparison is None:
        return default
    if isinstance(comparison, dict):
        return comparison.get(field_name, default)
    return getattr(comparison, field_name, default)


def _find_comparison(
    model_comparisons: list[ModelComparison] | None,
    model_type: str,
):
    for comparison in model_comparisons or []:
        if _comparison_field(comparison, "model_type") == model_type:
            return comparison
    return None


def _float_metric(metrics: dict | None, name: str) -> Optional[float]:
    if not metrics:
        return None
    try:
        value = metrics.get(name)
        return float(value) if value is not None and np.isfinite(float(value)) else None
    except (TypeError, ValueError):
        return None


def _gaussian_summary(comparison) -> dict:
    if comparison is None:
        return {
            "state": "missing",
            "is_poor": False,
            "is_clean": False,
            "is_limited": True,
            "has_coverage_note": False,
            "text": "The Gaussian bump comparator is missing from model_comparisons.",
        }

    status = _comparison_field(comparison, "status")
    metrics = _comparison_field(comparison, "fit_metrics") or {}
    residual_summary = _comparison_field(comparison, "residual_summary") or []
    residual_text = " ".join(str(x).lower() for x in residual_summary)
    has_coverage_note = any(
        token in residual_text for token in ("coverage", "gap", "uneven", "sparse")
    )

    if status == "insufficient_data":
        n = metrics.get("n_points", "too few")
        return {
            "state": "insufficient",
            "is_poor": False,
            "is_clean": False,
            "is_limited": True,
            "has_coverage_note": has_coverage_note,
            "text": (
                f"The Gaussian bump comparator had insufficient r-band data "
                f"({n} detection(s)), so it could not test a single smooth bump."
            ),
        }
    if status == "failed_fit":
        return {
            "state": "failed",
            "is_poor": False,
            "is_clean": False,
            "is_limited": True,
            "has_coverage_note": has_coverage_note,
            "text": "The Gaussian bump comparator failed to return a stable fit.",
        }
    if status != "fitted_baseline":
        return {
            "state": "unavailable",
            "is_poor": False,
            "is_clean": False,
            "is_limited": True,
            "has_coverage_note": has_coverage_note,
            "text": "The Gaussian bump comparator did not produce a fitted result.",
        }

    redchi = _float_metric(metrics, "reduced_chi2")
    rmse = _float_metric(metrics, "rmse")
    if redchi is not None and redchi < 2:
        text = "The Gaussian bump comparator fit the r-band detections cleanly within the reported errors."
        return {
            "state": "clean",
            "is_poor": False,
            "is_clean": True,
            "is_limited": False,
            "has_coverage_note": has_coverage_note,
            "text": text,
        }
    if redchi is not None and redchi < 10:
        text = (
            f"The Gaussian bump comparator fit, but reduced chi-squared is {redchi:.1f}, "
            "so the single smooth bump captures only part of the point-to-point behavior."
        )
        return {
            "state": "partial",
            "is_poor": True,
            "is_clean": False,
            "is_limited": False,
            "has_coverage_note": has_coverage_note,
            "text": text,
        }
    if redchi is not None:
        text = (
            f"The Gaussian bump comparator fit, but reduced chi-squared is {redchi:.0f}, "
            "so a single smooth bump is a poor description of the r-band detections."
        )
        return {
            "state": "poor",
            "is_poor": True,
            "is_clean": False,
            "is_limited": False,
            "has_coverage_note": has_coverage_note,
            "text": text,
        }

    rmse_clause = f" RMSE is {rmse:.2f} mag." if rmse is not None else ""
    return {
        "state": "fit_without_error_scale",
        "is_poor": False,
        "is_clean": False,
        "is_limited": False,
        "has_coverage_note": has_coverage_note,
        "text": (
            "The Gaussian bump comparator fit, but reported errors were not sufficient "
            f"for a reduced chi-squared check.{rmse_clause}"
        ),
    }


def _variability_summary(comparison) -> dict:
    if comparison is None:
        return {
            "state": "missing",
            "found_repeated": False,
            "is_limited": True,
            "text": "The variability texture comparator is missing from model_comparisons.",
        }

    status = _comparison_field(comparison, "status")
    metrics = _comparison_field(comparison, "fit_metrics") or {}
    if status == "insufficient_data":
        n = metrics.get("n_points", "too few")
        return {
            "state": "insufficient",
            "found_repeated": False,
            "is_limited": True,
            "text": (
                f"The variability texture comparator had insufficient r-band data "
                f"({n} detection(s)), so repeated or irregular texture could not be assessed."
            ),
        }
    if status != "computed":
        return {
            "state": "unavailable",
            "found_repeated": False,
            "is_limited": True,
            "text": "The variability texture comparator did not produce a computed result.",
        }

    behavior = metrics.get("behavior_hint")
    extrema = metrics.get("local_extrema_count_after_smoothing")
    material = metrics.get("variability_materially_larger_than_errors")
    if behavior == "repeated_or_irregular":
        if material is True:
            error_clause = "and the scatter is larger than typical reported errors"
        elif material is False:
            error_clause = "but the scatter is comparable to typical reported errors"
        else:
            error_clause = "with no usable error-scale comparison"
        return {
            "state": "repeated_or_irregular",
            "found_repeated": True,
            "is_limited": False,
            "text": (
                "The variability texture comparator found repeated or irregular "
                f"directional changes ({extrema} smoothed turn(s)) {error_clause}."
            ),
        }
    if behavior == "flat_or_measurement_level":
        return {
            "state": "measurement_level",
            "found_repeated": False,
            "is_limited": False,
            "text": (
                "The variability texture comparator found changes that are comparable "
                "to the reported photometric errors."
            ),
        }
    if behavior == "single_smooth_or_monotonic":
        return {
            "state": "single_smooth_or_monotonic",
            "found_repeated": False,
            "is_limited": False,
            "text": (
                "The variability texture comparator found few meaningful turns after "
                "smoothing."
            ),
        }
    return {
        "state": "mixed",
        "found_repeated": False,
        "is_limited": False,
        "text": (
            "The variability texture comparator found some turn structure, but not "
            "a clear repeated-change pattern."
        ),
    }


def build_comparison_summary(
    model_comparisons: list[ModelComparison] | None,
) -> ComparisonSummary:
    """Synthesize existing comparator outputs into a cautious case summary."""
    gaussian = _gaussian_summary(_find_comparison(model_comparisons, "gaussian_bump"))
    variability = _variability_summary(_find_comparison(model_comparisons, "variability_texture"))
    caveat = (
        "This is not a physical classification. It does not identify the object "
        "type, physical cause, or special status."
    )

    if not model_comparisons:
        return ComparisonSummary(
            headline="Comparison evidence is limited",
            summary=(
                "No model_comparisons entries were available, so Argus cannot "
                "synthesize the comparator evidence."
            ),
            caveat=caveat,
            recommended_next_check="Run the local comparators before interpreting comparison evidence.",
        )

    coverage_clause = (
        " Coverage appears sparse or uneven, so cadence may affect the comparison."
        if gaussian["has_coverage_note"] else ""
    )

    if gaussian["is_poor"] and variability["found_repeated"]:
        headline = "Not well explained by a single smooth bump"
        combined = (
            "Together, these suggest the r-band light curve is more complex than "
            "a single clean one-bump event."
        )
        next_check = (
            "Inspect the residual structure and compare against known repeated-variability behavior."
        )
    elif gaussian["is_clean"] and not variability["found_repeated"] and not variability["is_limited"]:
        headline = "Mostly consistent with a single smooth bump"
        combined = (
            "Together, these favor a simple one-bump description over repeated or "
            "irregular texture in the current r-band detections."
        )
        next_check = "Inspect residuals and verify that the pattern persists with additional local photometry."
    elif gaussian["is_poor"]:
        headline = "Single smooth bump leaves residual structure"
        combined = (
            "Together, these suggest the r-band detections are not fully captured "
            "by one smooth bump."
        )
        next_check = "Inspect the largest residuals and review cadence gaps before adding richer comparators."
    elif variability["found_repeated"]:
        headline = "Shows repeated or irregular variability texture"
        combined = (
            "Together, these suggest repeated or irregular texture in the r-band "
            "detections, even if the single-bump result is limited or mixed."
        )
        next_check = "Review the smoothed r-band sequence and check whether the turning points persist."
    elif gaussian["is_limited"] or variability["is_limited"]:
        headline = "Comparison evidence is limited"
        combined = (
            "Together, these leave the light-curve shape underconstrained by the "
            "available comparator evidence."
        )
        next_check = "Load or collect more r-band detections before interpreting comparator results."
    else:
        headline = "Mixed comparison signals"
        combined = (
            "Together, these provide a descriptive check, but neither comparator "
            "gives a strong reason to prefer repeated texture over a single smooth bump."
        )
        next_check = "Inspect the comparator residuals and review the smoothed r-band sequence."

    return ComparisonSummary(
        headline=headline,
        summary=f"{gaussian['text']} {variability['text']} {combined}{coverage_clause}",
        caveat=caveat,
        recommended_next_check=next_check,
    )


def _field(obj, field_name: str, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(field_name, default)
    return getattr(obj, field_name, default)


def _section_from_gaussian(comparison) -> tuple[EvidenceSection, dict[str, bool]]:
    if comparison is None:
        return EvidenceSection(
            title="Baseline transient-shape check",
            status="missing",
            summary="The Gaussian bump comparator is not present in this case file.",
        ), {"not_well_fit": False, "limited": True}

    status = _comparison_field(comparison, "status")
    metrics = _comparison_field(comparison, "fit_metrics") or {}
    if status == "insufficient_data":
        return EvidenceSection(
            title="Baseline transient-shape check",
            status="insufficient_data",
            summary="The Gaussian bump check could not be evaluated because too few usable detections were available.",
        ), {"not_well_fit": False, "limited": True}
    if status == "failed_fit":
        return EvidenceSection(
            title="Baseline transient-shape check",
            status="fit_failed",
            summary="The Gaussian bump comparator could not return a stable fit.",
        ), {"not_well_fit": False, "limited": True}
    if status != "fitted_baseline":
        return EvidenceSection(
            title="Baseline transient-shape check",
            status="limited",
            summary="The Gaussian bump comparator did not produce a standard fitted result.",
        ), {"not_well_fit": False, "limited": True}

    redchi = _float_metric(metrics, "reduced_chi2")
    if redchi is not None and redchi < 2:
        return EvidenceSection(
            title="Baseline transient-shape check",
            status="reasonable_fit",
            summary="The Gaussian bump comparator fit the detections reasonably within the reported errors.",
        ), {"not_well_fit": False, "limited": False}

    if redchi is not None:
        summary = (
            "The Gaussian bump comparator fit the detections but left substantial "
            f"residual structure (reduced chi-squared about {redchi:.1f})."
        )
    else:
        summary = (
            "The Gaussian bump comparator fit the detections, but the available "
            "error information limits the fit-quality assessment."
        )
    return EvidenceSection(
        title="Baseline transient-shape check",
        status="not_well_fit",
        summary=summary,
    ), {"not_well_fit": True, "limited": redchi is None}


def _section_from_variability(comparison) -> tuple[EvidenceSection, dict[str, bool]]:
    if comparison is None:
        return EvidenceSection(
            title="Variability texture",
            status="missing",
            summary="The variability texture comparator is not present in this case file.",
        ), {"complex": False, "limited": True}

    status = _comparison_field(comparison, "status")
    metrics = _comparison_field(comparison, "fit_metrics") or {}
    if status == "insufficient_data":
        return EvidenceSection(
            title="Variability texture",
            status="insufficient_data",
            summary="The variability texture check could not be evaluated because too few usable detections were available.",
        ), {"complex": False, "limited": True}
    if status != "computed":
        return EvidenceSection(
            title="Variability texture",
            status="limited",
            summary="The variability texture check did not produce a computed result.",
        ), {"complex": False, "limited": True}

    behavior = metrics.get("behavior_hint")
    extrema = metrics.get("local_extrema_count_after_smoothing")
    if behavior == "repeated_or_irregular":
        turn_clause = f" ({extrema} smoothed turn(s))" if extrema is not None else ""
        return EvidenceSection(
            title="Variability texture",
            status="complex_variability",
            summary=(
                "The light curve shows repeated or irregular directional changes"
                f"{turn_clause} beyond a simple smooth event shape."
            ),
        ), {"complex": True, "limited": False}
    if behavior == "flat_or_measurement_level":
        return EvidenceSection(
            title="Variability texture",
            status="measurement_level",
            summary="The measured changes are comparable to reported photometric errors.",
        ), {"complex": False, "limited": False}
    if behavior == "single_smooth_or_monotonic":
        return EvidenceSection(
            title="Variability texture",
            status="few_turns",
            summary="The smoothed light curve has few meaningful directional changes.",
        ), {"complex": False, "limited": False}
    return EvidenceSection(
        title="Variability texture",
        status="mixed",
        summary="The variability texture check found some structure, but not a clear repeated-change pattern.",
    ), {"complex": False, "limited": False}


def _section_from_features(feature_summary: FeatureSummary | dict | None) -> EvidenceSection:
    if feature_summary is None:
        return EvidenceSection(
            title="Standard feature summary",
            status="missing",
            summary="Standard descriptive light-curve features are not present in this case file.",
        )

    status = _field(feature_summary, "status")
    n_points = _field(feature_summary, "n_points")
    if status == "computed":
        point_clause = f" from {n_points} usable r-band point(s)" if n_points is not None else ""
        return EvidenceSection(
            title="Standard feature summary",
            status="computed",
            summary=(
                "Descriptive light-curve features were computed"
                f"{point_clause} for comparison across objects."
            ),
        )
    if status == "insufficient_data":
        return EvidenceSection(
            title="Standard feature summary",
            status="insufficient_data",
            summary="Standard descriptive features could not be computed because too few usable detections were available.",
        )
    if status == "dependency_unavailable":
        return EvidenceSection(
            title="Standard feature summary",
            status="dependency_unavailable",
            summary="Standard descriptive features were not computed because the feature dependency was unavailable.",
        )
    return EvidenceSection(
        title="Standard feature summary",
        status="limited",
        summary="Standard descriptive features are present but limited or unavailable.",
    )


def _section_from_sncosmo(comparison) -> EvidenceSection:
    if comparison is None:
        return EvidenceSection(
            title="Template-family probe",
            status="missing",
            summary="The sncosmo template-family probe is not present in this case file.",
        )

    status = _comparison_field(comparison, "status")
    if status == "fitted":
        metrics = _comparison_field(comparison, "fit_metrics") or {}
        redchi = _float_metric(metrics, "reduced_chi2")
        if redchi is not None and redchi >= 2:
            summary = (
                "A template-family fit was attempted and left residual structure "
                f"(reduced chi-squared about {redchi:.1f})."
            )
            section_status = "fit_with_residuals"
        else:
            summary = "A template-family fit was attempted and recorded as a model-family comparison."
            section_status = "fit_attempted"
        return EvidenceSection(
            title="Template-family probe",
            status=section_status,
            summary=summary,
        )

    if status == "missing_required_context":
        summary = "Template-family probing was limited because required context such as redshift is unavailable."
    elif status == "dependency_unavailable":
        summary = "Template-family probing was limited because the optional sncosmo dependency is unavailable."
    elif status == "template_unavailable":
        summary = "Template-family probing was limited because requested template data was unavailable offline."
    elif status == "insufficient_data":
        summary = "Template-family probing was limited because the usable detections were insufficient."
    elif status == "fit_failed":
        summary = "Template-family probing was attempted but did not return a stable result."
    else:
        summary = "Template-family probing is limited or unavailable in this case file."

    return EvidenceSection(
        title="Template-family probe",
        status="limited",
        summary=summary,
    )


def _section_from_cross_survey(cross_survey_context: Any) -> EvidenceSection:
    if cross_survey_context is None:
        return EvidenceSection(
            title="Cross-survey context",
            status="not_requested",
            summary="External catalog context was not requested for this offline case-file run.",
        )

    status = _field(cross_survey_context, "status", "present")
    if status in {"not_requested", "skipped"}:
        return EvidenceSection(
            title="Cross-survey context",
            status="not_requested",
            summary="External catalog context was not requested for this case-file run.",
        )
    if status == "queried":
        return EvidenceSection(
            title="Cross-survey context",
            status="queried",
            summary="SIMBAD catalog metadata is present as external context, not as an Argus classification.",
        )
    if status == "no_match":
        return EvidenceSection(
            title="Cross-survey context",
            status="no_match",
            summary="No nearby SIMBAD match was reported within the requested search radius.",
        )
    if status == "invalid_coordinates":
        return EvidenceSection(
            title="Cross-survey context",
            status="limited",
            summary="External catalog context could not be queried because valid coordinates were unavailable.",
        )
    if status in {"dependency_unavailable", "query_failed", "timeout", "failed", "error"}:
        return EvidenceSection(
            title="Cross-survey context",
            status="limited",
            summary="External catalog context was requested but remained limited or unavailable.",
        )
    return EvidenceSection(
        title="Cross-survey context",
        status=str(status),
        summary="External catalog context is available as metadata and should be treated cautiously.",
    )


def _safe_recommended_checks(
    recommended_next_checks: list[str] | None,
    *,
    gaussian_not_well_fit: bool,
    complex_variability: bool,
    sncosmo_limited: bool,
    cross_survey_missing: bool,
) -> list[str]:
    checks: list[str] = []
    if gaussian_not_well_fit:
        checks.append("Inspect residual structure visually.")
    if complex_variability:
        checks.append("Compare against known repeated-variability behavior.")
    if sncosmo_limited:
        checks.append("Add verified redshift or context before interpreting template-family probes.")
    if cross_survey_missing:
        checks.append("Run cross-survey context if network access and optional dependencies are available.")

    source_checks = " ".join(recommended_next_checks or []).lower()
    if "forced photometry" in source_checks:
        checks.append("Inspect forced photometry around recent detections if available.")
    if not checks:
        checks.append("Review the evidence sections and inspect the light curve visually.")

    deduped: list[str] = []
    for check in checks:
        if check not in deduped:
            deduped.append(check)
    return deduped[:5]


def build_evidence_narrative(
    *,
    model_comparisons: list[ModelComparison] | None,
    comparison_summary: ComparisonSummary | dict | None,
    feature_summary: FeatureSummary | dict | None,
    cross_survey_context: Any = None,
    recommended_next_checks: list[str] | None = None,
    uncertainty_notes: list[str] | None = None,
) -> EvidenceNarrative:
    """Build a readable narrative from existing case-file evidence fields."""
    gaussian = _find_comparison(model_comparisons, "gaussian_bump")
    variability = _find_comparison(model_comparisons, "variability_texture")
    sncosmo = _find_comparison(model_comparisons, "sncosmo_template_probe")

    gaussian_section, gaussian_flags = _section_from_gaussian(gaussian)
    variability_section, variability_flags = _section_from_variability(variability)
    feature_section = _section_from_features(feature_summary)
    sncosmo_section = _section_from_sncosmo(sncosmo)
    cross_survey_section = _section_from_cross_survey(cross_survey_context)

    sections = [
        gaussian_section,
        variability_section,
        feature_section,
        sncosmo_section,
        cross_survey_section,
    ]

    gaussian_not_well = gaussian_flags["not_well_fit"]
    complex_variability = variability_flags["complex"]
    sncosmo_limited = sncosmo_section.status in {"limited", "missing"}
    cross_missing = cross_survey_section.status in {"not_requested", "limited", "missing"}
    feature_computed = feature_section.status == "computed"
    has_missing_comparisons = not model_comparisons

    if gaussian_not_well and complex_variability:
        if sncosmo_limited and cross_missing:
            context_clause = "template and catalog-context checks remain limited by available context"
        elif sncosmo_limited:
            context_clause = "template-family checks remain limited by available context"
        elif cross_missing:
            context_clause = "catalog-context checks remain limited because they were not requested"
        else:
            context_clause = "standard features and available context provide supporting descriptive evidence"
        headline = "Complex light-curve behavior with limited physical interpretation"
        short_summary = (
            "The object is not well explained by a single smooth bump. Its r-band "
            "detections show repeated or irregular variability texture, while "
            f"{context_clause}."
        )
    elif has_missing_comparisons or gaussian_flags["limited"] or variability_flags["limited"]:
        headline = "Evidence is limited by available comparator context"
        short_summary = (
            "Some evidence layers are missing, failed, or limited by the available "
            "local detections. The case file supports cautious review rather than a firm conclusion."
        )
    elif complex_variability:
        headline = "Repeated or irregular variability texture"
        short_summary = (
            "The r-band detections show repeated or irregular variability texture. "
            "Other evidence layers should be reviewed before drawing stronger conclusions."
        )
    else:
        headline = "Mixed evidence with cautious interpretation"
        if comparison_summary is not None:
            short_summary = _field(comparison_summary, "summary", "")
        else:
            short_summary = (
                "The available evidence layers provide descriptive checks, but no "
                "single layer supports a strong interpretation on its own."
            )

    what_can: list[str] = []
    if gaussian_not_well:
        what_can.append("The r-band detections are not well explained by a single smooth bump.")
    if complex_variability:
        what_can.append("The r-band detections show repeated or irregular variability texture.")
    if feature_computed:
        what_can.append("Standard descriptive features are available for comparison across objects.")
    if not what_can:
        what_can.append("The current evidence supports cautious further review.")

    if uncertainty_notes:
        joined_uncertainty = " ".join(uncertainty_notes).lower()
        if "spectroscopic" in joined_uncertainty:
            what_can.append("No spectroscopic information is recorded in this case file.")

    what_cannot = [
        "Argus does not identify the object type.",
        "Argus does not certify that the source is unusual.",
        "Argus does not treat broker or catalog labels as ground truth.",
    ]
    if sncosmo_limited:
        what_cannot.append("Argus does not treat template-family probes as object identity.")

    return EvidenceNarrative(
        headline=headline,
        short_summary=short_summary,
        evidence_sections=sections,
        what_argus_can_say=what_can,
        what_argus_cannot_say=what_cannot,
        recommended_next_checks=_safe_recommended_checks(
            recommended_next_checks,
            gaussian_not_well_fit=gaussian_not_well,
            complex_variability=complex_variability,
            sncosmo_limited=sncosmo_limited,
            cross_survey_missing=cross_missing,
        ),
        caveat=(
            "This narrative summarizes evidence layers. It is not a physical classification."
        ),
    )
