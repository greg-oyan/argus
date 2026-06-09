"""Deterministic case-file assessment helpers.

This module deliberately uses only values already present in a case file build:
local light-curve summaries, optional tensor-manifest diagnostics, comparator
statuses, feature summaries, and cross-survey context status. It does not fit a
model, query the network, or infer object identity.
"""
from __future__ import annotations

import math
from typing import Any

from argus.casefile.schema import AnomalyAssessment

ASSESSMENT_CAVEAT = (
    "This deterministic assessment supports review triage only. It is not a "
    "classification, model verdict, or claim about physical identity."
)


def _field(obj: Any, name: str, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def _as_float(value: Any) -> float | None:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def _as_int(value: Any, default: int = 0) -> int:
    try:
        result = int(value)
    except (TypeError, ValueError):
        return default
    return result


def _find_comparison(model_comparisons: list[Any] | None, model_type: str) -> Any:
    for comparison in model_comparisons or []:
        if _field(comparison, "model_type") == model_type:
            return comparison
    return None


def _metric(comparison: Any, name: str) -> float | None:
    metrics = _field(comparison, "fit_metrics") or {}
    if not isinstance(metrics, dict):
        return None
    return _as_float(metrics.get(name))


def _feature_value(feature_summary: Any, name: str) -> float | None:
    features = _field(feature_summary, "features") or {}
    if not isinstance(features, dict):
        return None
    return _as_float(features.get(name))


def _per_filter_ranges(
    summary: Any,
) -> tuple[dict[str, float], dict[str, float], dict[str, float]]:
    ranges: dict[str, float] = {}
    medians: dict[str, float] = {}
    brightest_to_median: dict[str, float] = {}
    for item in _as_list(_field(summary, "per_filter")):
        band = _field(item, "filter")
        if not band:
            continue
        delta = _as_float(_field(item, "delta_mag"))
        median = _as_float(_field(item, "mag_median"))
        mag_min = _as_float(_field(item, "mag_min"))
        if delta is not None:
            ranges[str(band)] = delta
        if median is not None:
            medians[str(band)] = median
        if median is not None and mag_min is not None:
            brightest_to_median[str(band)] = median - mag_min
    return ranges, medians, brightest_to_median


def _tensor_input_summary(tensor_manifest: dict[str, Any] | None) -> dict[str, Any]:
    if not tensor_manifest:
        return {
            "tensor_manifest_available": False,
            "tensor_frac_bins_masked": None,
            "tensor_total_unmasked_bins": None,
            "tensor_observation_counts": None,
            "tensor_flux_medians": None,
        }

    return {
        "tensor_manifest_available": True,
        "tensor_frac_bins_masked": _as_float(tensor_manifest.get("frac_bins_masked")),
        "tensor_total_unmasked_bins": _as_int(
            tensor_manifest.get("total_unmasked_bins"), default=0
        ),
        "tensor_observation_counts": {
            "g": _as_int(tensor_manifest.get("n_obs_g"), default=0),
            "r": _as_int(tensor_manifest.get("n_obs_r"), default=0),
            "g_upper_limits": _as_int(tensor_manifest.get("n_uplim_g"), default=0),
            "r_upper_limits": _as_int(tensor_manifest.get("n_uplim_r"), default=0),
        },
        "tensor_flux_medians": {
            "g": _as_float(tensor_manifest.get("median_g_raw_flux")),
            "r": _as_float(tensor_manifest.get("median_r_raw_flux")),
        },
    }


def assessment_label(score: int) -> str:
    """Map a deterministic review score to a compact label."""
    if score <= 2:
        return "low"
    if score <= 5:
        return "medium"
    return "high"


def build_anomaly_assessment(
    *,
    light_curve_summary: Any,
    model_comparisons: list[Any] | None,
    feature_summary: Any = None,
    cross_survey_context: Any = None,
    available_data_sources: list[str] | None = None,
    tensor_manifest: dict[str, Any] | None = None,
) -> AnomalyAssessment:
    """Build a deterministic review assessment from existing case-file evidence."""
    n_detections = _as_int(_field(light_curve_summary, "n_detections"), default=0)
    n_non_detections = _as_int(_field(light_curve_summary, "n_non_detections"), default=0)
    bands = [str(band) for band in _as_list(_field(light_curve_summary, "filters_observed"))]
    time_span = _as_float(_field(light_curve_summary, "time_span_days"))
    ranges, medians, brightest_to_median = _per_filter_ranges(light_curve_summary)
    max_range = max(ranges.values()) if ranges else None
    max_brightest_to_median = (
        max(brightest_to_median.values()) if brightest_to_median else None
    )
    dual_band_median_difference = (
        abs(medians["g"] - medians["r"])
        if "g" in medians and "r" in medians else None
    )

    gaussian = _find_comparison(model_comparisons, "gaussian_bump")
    variability = _find_comparison(model_comparisons, "variability_texture")
    sncosmo = _find_comparison(model_comparisons, "sncosmo_template_probe")
    variability_metrics = _field(variability, "fit_metrics") or {}

    input_summary: dict[str, Any] = {
        "observation_count": n_detections,
        "non_detection_count": n_non_detections,
        "time_span_days": time_span,
        "bands_present": bands,
        "data_sources": list(available_data_sources or []),
        "per_filter_mag_range": ranges,
        "max_observed_mag_range": max_range,
        "brightest_to_median_delta_mag": brightest_to_median,
        "max_brightest_to_median_delta_mag": max_brightest_to_median,
        "dual_band_median_difference_mag": dual_band_median_difference,
        "gaussian_status": _field(gaussian, "status", "missing"),
        "variability_texture_status": _field(variability, "status", "missing"),
        "variability_behavior_hint": (
            variability_metrics.get("behavior_hint")
            if isinstance(variability_metrics, dict) else None
        ),
        "feature_summary_status": _field(feature_summary, "status", "missing"),
        "sncosmo_template_probe_status": _field(sncosmo, "status", "missing"),
        "cross_survey_context_status": _field(cross_survey_context, "status", "missing"),
    }
    input_summary.update(_tensor_input_summary(tensor_manifest))

    drivers: list[str] = []
    cautions: list[str] = []

    if light_curve_summary is None or n_detections < 3:
        drivers.append(
            f"Only {n_detections} usable detection(s) are present, below the "
            "minimum for a stable review assessment."
        )
        cautions.append("Load more local detections before using this assessment for triage.")
        cautions.append(ASSESSMENT_CAVEAT)
        return AnomalyAssessment(
            score=0,
            label="unknown",
            status="insufficient_data",
            drivers=drivers,
            cautions=cautions,
            input_summary=input_summary,
            caveat=ASSESSMENT_CAVEAT,
        )

    score = 0

    if n_detections >= 20:
        score += 2
        drivers.append(f"{n_detections} detections provide a relatively dense local record.")
    elif n_detections >= 8:
        score += 1
        drivers.append(f"{n_detections} detections provide a usable local record.")
    else:
        cautions.append(f"Only {n_detections} detections are available, so sparse sampling limits confidence.")

    if time_span is None:
        cautions.append("The light-curve time span could not be computed.")
    elif time_span >= 365:
        score += 2
        drivers.append(f"Coverage spans {time_span:.0f} days, enough to inspect long-baseline behavior.")
    elif time_span >= 30:
        score += 1
        drivers.append(f"Coverage spans {time_span:.0f} days, enough to compare early and later behavior.")
    else:
        cautions.append(f"Coverage spans only {time_span:.0f} days.")

    if len(set(bands)) >= 2:
        score += 1
        drivers.append("Both g and r observations are present for cross-band review.")
    else:
        cautions.append("Only one observed filter is present in the local case-file summary.")

    if max_range is not None:
        if max_range >= 1.0:
            score += 2
            drivers.append(f"The largest observed per-band magnitude range is wide ({max_range:.2f} mag).")
        elif max_range >= 0.4:
            score += 1
            drivers.append(f"The largest observed per-band magnitude range is moderate ({max_range:.2f} mag).")

    if dual_band_median_difference is not None and dual_band_median_difference >= 0.5:
        score += 1
        drivers.append(
            "Median g/r magnitudes differ enough to merit cross-band inspection "
            f"({dual_band_median_difference:.2f} mag)."
        )

    if max_brightest_to_median is not None and max_brightest_to_median >= 0.5:
        score += 1
        drivers.append(
            "Brightest-to-median magnitude delta is substantial "
            f"({max_brightest_to_median:.2f} mag)."
        )

    feature_status = _field(feature_summary, "status")
    if feature_status == "computed":
        score += 1
        drivers.append("Standard descriptive light-curve features were computed.")
        amplitude = _feature_value(feature_summary, "amplitude")
        std = _feature_value(feature_summary, "standard_deviation")
        if amplitude is not None and 2.0 * amplitude >= 1.0:
            score += 1
            drivers.append(f"Feature amplitude implies a wide observed range ({2.0 * amplitude:.2f} mag).")
        if std is not None and std >= 0.20:
            score += 1
            drivers.append(f"Feature scatter is high for this detection set ({std:.2f} mag).")
        for note in _as_list(_field(feature_summary, "feature_quality_notes")):
            cautions.append(str(note))
    elif feature_status in {"insufficient_data", "dependency_unavailable", "failed"}:
        cautions.append(f"Feature summary status is {feature_status}.")

    gaussian_status = _field(gaussian, "status")
    if gaussian_status == "fitted_baseline":
        redchi = _metric(gaussian, "reduced_chi2")
        largest = _metric(gaussian, "largest_abs_residual")
        if redchi is not None and redchi >= 10:
            score += 2
            drivers.append(f"Gaussian bump residual scale is high (reduced chi-squared about {redchi:.1f}).")
        elif redchi is not None and redchi >= 2:
            score += 1
            drivers.append(f"Gaussian bump fit leaves elevated residual structure (reduced chi-squared about {redchi:.1f}).")
        if largest is not None and largest >= 0.5:
            score += 1
            drivers.append(f"Largest Gaussian residual is {largest:.2f} mag.")
    elif gaussian_status in {"insufficient_data", "failed_fit", "missing"}:
        cautions.append(f"Gaussian bump comparator status is {gaussian_status or 'missing'}.")

    variability_status = _field(variability, "status")
    if variability_status == "computed" and isinstance(variability_metrics, dict):
        behavior = variability_metrics.get("behavior_hint")
        materially_larger = variability_metrics.get("variability_materially_larger_than_errors")
        if behavior == "repeated_or_irregular":
            score += 2
            drivers.append("Variability texture shows repeated or irregular directional changes.")
        if materially_larger is True:
            score += 1
            drivers.append("Variability texture scatter is materially larger than typical reported errors.")
    elif variability_status in {"insufficient_data", "missing"}:
        cautions.append(f"Variability texture status is {variability_status or 'missing'}.")

    sncosmo_status = _field(sncosmo, "status", "missing")
    if sncosmo_status in {
        "missing_required_context",
        "template_unavailable",
        "fit_failed",
        "dependency_unavailable",
        "insufficient_data",
    }:
        cautions.append(f"Template-family probe is limited: {sncosmo_status}.")

    cross_status = _field(cross_survey_context, "status", "missing")
    if cross_status in {"not_requested", "dependency_unavailable", "invalid_coordinates", "query_failed", "timeout"}:
        cautions.append(f"Catalog-context status is {cross_status}; external context remains limited.")
    elif cross_status in {"queried", "no_match"}:
        cautions.append(f"Catalog-context status is {cross_status}; treat it as external metadata only.")

    mask_fraction = _as_float(input_summary.get("tensor_frac_bins_masked"))
    if mask_fraction is None:
        cautions.append("Tensor mask diagnostics are unavailable for this object.")
    elif mask_fraction >= 0.95:
        cautions.append(f"Tensor coverage is sparse: {mask_fraction:.0%} of band/time bins are masked.")
    else:
        drivers.append(f"Tensor mask diagnostics are available ({mask_fraction:.0%} bins masked).")

    if not drivers:
        drivers.append("No strong review signals were available from the current local evidence.")

    score = max(0, min(10, score))
    if ASSESSMENT_CAVEAT not in cautions:
        cautions.append(ASSESSMENT_CAVEAT)

    return AnomalyAssessment(
        score=score,
        label=assessment_label(score),
        status="available",
        drivers=drivers,
        cautions=cautions,
        input_summary=input_summary,
        caveat=ASSESSMENT_CAVEAT,
    )
