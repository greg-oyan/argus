"""Deterministic case-file assessment tests."""
from __future__ import annotations

import json

from argus.casefile.assessment import build_anomaly_assessment
from argus.casefile.schema import (
    CrossSurveyContext,
    FeatureSummary,
    FilterStats,
    LightCurveSummary,
    ModelComparison,
)


def _summary(*, n_detections: int = 24) -> LightCurveSummary:
    return LightCurveSummary(
        n_detections=n_detections,
        n_non_detections=5,
        filters_observed=["g", "r"] if n_detections >= 3 else ["r"],
        first_mjd=60000.0,
        last_mjd=60420.0,
        time_span_days=420.0,
        most_recent_detection_mjd=60420.0,
        longest_detection_gap_days=35.0,
        per_filter=[
            FilterStats(
                filter="g",
                n_detections=10,
                n_non_detections=2,
                mag_min=19.6,
                mag_max=20.8,
                mag_median=20.2,
                delta_mag=1.2,
            ),
            FilterStats(
                filter="r",
                n_detections=max(0, n_detections - 10),
                n_non_detections=3,
                mag_min=18.9,
                mag_max=20.0,
                mag_median=19.4,
                delta_mag=1.1,
            ),
        ] if n_detections >= 3 else [],
    )


def _comparison(model_type: str, status: str, metrics: dict) -> ModelComparison:
    return ModelComparison(
        name=model_type,
        model_type=model_type,
        filter_used="r",
        status=status,
        parameters=None,
        fit_metrics=metrics,
        residual_summary=[],
        interpretation="Synthetic assessment fixture.",
        limitations=["Review fixture only."],
    )


def _feature_summary(status: str = "computed") -> FeatureSummary:
    return FeatureSummary(
        source="light-curve",
        band="r",
        status=status,
        n_points=20 if status == "computed" else 0,
        features={"amplitude": 0.7, "standard_deviation": 0.25}
        if status == "computed" else {},
        interpretation="Descriptive features were computed.",
        caveat="Descriptive summaries only.",
    )


def test_anomaly_assessment_scores_and_records_drivers():
    assessment = build_anomaly_assessment(
        light_curve_summary=_summary(),
        model_comparisons=[
            _comparison(
                "gaussian_bump",
                "fitted_baseline",
                {"reduced_chi2": 14.0, "largest_abs_residual": 0.8},
            ),
            _comparison(
                "variability_texture",
                "computed",
                {
                    "behavior_hint": "repeated_or_irregular",
                    "variability_materially_larger_than_errors": True,
                },
            ),
            _comparison(
                "sncosmo_template_probe",
                "missing_required_context",
                {"n_points": 20},
            ),
        ],
        feature_summary=_feature_summary(),
        cross_survey_context=CrossSurveyContext(status="not_requested"),
        available_data_sources=[
            "parquet_detections",
            "raw_lightcurve_json",
            "tensor_manifest",
        ],
        tensor_manifest={
            "frac_bins_masked": 0.45,
            "total_unmasked_bins": 220,
            "n_obs_g": 10,
            "n_obs_r": 14,
            "n_uplim_g": 2,
            "n_uplim_r": 3,
            "median_g_raw_flux": 1.2,
            "median_r_raw_flux": 2.4,
        },
    )

    assert assessment.status == "available"
    assert assessment.score == 10
    assert assessment.label == "high"
    assert any("Gaussian bump" in reason for reason in assessment.drivers)
    assert any("Variability texture" in reason for reason in assessment.drivers)
    assert assessment.input_summary["observation_count"] == 24
    assert assessment.input_summary["tensor_manifest_available"] is True
    assert assessment.input_summary["tensor_frac_bins_masked"] == 0.45
    assert assessment.caveat


def test_anomaly_assessment_handles_sparse_data():
    assessment = build_anomaly_assessment(
        light_curve_summary=_summary(n_detections=2),
        model_comparisons=[],
        feature_summary=None,
        cross_survey_context={"status": "not_requested"},
        available_data_sources=["parquet_detections"],
    )

    assert assessment.status == "insufficient_data"
    assert assessment.score == 0
    assert assessment.label == "unknown"
    assert "below the minimum" in " ".join(assessment.drivers).lower()


def test_anomaly_assessment_handles_missing_optional_layers():
    assessment = build_anomaly_assessment(
        light_curve_summary=_summary(n_detections=8),
        model_comparisons=[],
        feature_summary={"status": "dependency_unavailable"},
        cross_survey_context={"status": "dependency_unavailable"},
        available_data_sources=["parquet_detections"],
        tensor_manifest=None,
    )

    assert assessment.status == "available"
    assert assessment.input_summary["feature_summary_status"] == "dependency_unavailable"
    assert assessment.input_summary["cross_survey_context_status"] == "dependency_unavailable"
    assert any("unavailable" in caution.lower() for caution in assessment.cautions)
    assert any("tensor mask diagnostics" in caution.lower() for caution in assessment.cautions)


def test_anomaly_assessment_is_deterministic():
    kwargs = dict(
        light_curve_summary=_summary(),
        model_comparisons=[
            _comparison("gaussian_bump", "fitted_baseline", {"reduced_chi2": 3.0}),
            _comparison(
                "variability_texture",
                "computed",
                {"behavior_hint": "single_smooth_or_monotonic"},
            ),
        ],
        feature_summary=_feature_summary(),
        cross_survey_context={"status": "not_requested"},
        available_data_sources=["parquet_detections"],
    )

    first = build_anomaly_assessment(**kwargs)
    second = build_anomaly_assessment(**kwargs)

    assert first == second


def test_anomaly_assessment_avoids_forbidden_physical_claims():
    assessment = build_anomaly_assessment(
        light_curve_summary=_summary(),
        model_comparisons=[
            _comparison(
                "variability_texture",
                "computed",
                {"behavior_hint": "repeated_or_irregular"},
            ),
        ],
        feature_summary=_feature_summary(),
        cross_survey_context={"status": "not_requested"},
    )
    text = json.dumps(assessment, default=lambda obj: obj.__dict__).lower()
    forbidden = (
        "this is a variable star",
        "this is a supernova",
        "this is an agn",
        "confirmed transient",
        "new physics",
        "anomaly confirmed",
        "classification confirmed",
        "discovery",
    )
    for phrase in forbidden:
        assert phrase not in text
