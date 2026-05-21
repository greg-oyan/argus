"""Phase 2F standardized feature extraction tests. Offline synthetic inputs only."""
from __future__ import annotations
from pathlib import Path

import numpy as np
import pytest

from argus.features import light_curve_features as lcf
from argus.features.light_curve_features import (
    MIN_POINTS_FOR_FEATURES,
    extract_light_curve_features,
)


def _normal_arrays(n: int = 30):
    mjd = np.linspace(60000.0, 60100.0, n)
    mag = 20.0 + 0.25 * np.sin(np.linspace(0.0, 3.0 * np.pi, n))
    err = np.full_like(mjd, 0.05)
    return mjd, mag, err


def test_light_curve_feature_extraction_normal_data():
    mjd, mag, err = _normal_arrays()
    summary = extract_light_curve_features(mjd, mag, err, band="r")

    assert summary.source == "light-curve"
    assert summary.band == "r"
    assert summary.status == "computed"
    assert summary.n_points == len(mjd)
    assert summary.features["amplitude"] > 0
    assert summary.features["standard_deviation"] > 0
    assert "Descriptive light-curve features were computed" in summary.interpretation


def test_light_curve_feature_extraction_insufficient_data():
    summary = extract_light_curve_features(
        np.array([1.0, 2.0, 3.0]),
        np.array([20.0, 20.1, 19.9]),
        np.array([0.05, 0.05, 0.05]),
        band="r",
    )

    assert summary.status == "insufficient_data"
    assert summary.n_points == 3
    assert summary.features == {}
    assert str(MIN_POINTS_FOR_FEATURES) in summary.interpretation


def test_light_curve_feature_extraction_constant_data():
    mjd = np.linspace(0.0, 10.0, 12)
    mag = np.full_like(mjd, 19.5)
    err = np.full_like(mjd, 0.04)

    summary = extract_light_curve_features(mjd, mag, err, band="r")

    assert summary.status == "computed"
    assert summary.features["amplitude"] == pytest.approx(0.0)
    assert summary.features["standard_deviation"] == pytest.approx(0.0)
    assert "narrow" in summary.interpretation


def test_light_curve_feature_extraction_drops_nan_magnitudes():
    mjd, mag, err = _normal_arrays(10)
    mag[2] = np.nan
    mag[7] = np.nan

    summary = extract_light_curve_features(mjd, mag, err, band="r")

    assert summary.status == "computed"
    assert summary.n_points == 8
    assert all(value is None or np.isfinite(value) for value in summary.features.values())


def test_light_curve_feature_extraction_handles_missing_nan_errors():
    mjd, mag, err = _normal_arrays()
    err[:] = np.nan

    summary_with_nan_errors = extract_light_curve_features(mjd, mag, err, band="r")
    summary_without_errors = extract_light_curve_features(mjd, mag, None, band="r")

    assert summary_with_nan_errors.status == "computed"
    assert summary_without_errors.status == "computed"
    assert summary_with_nan_errors.features["amplitude"] == pytest.approx(
        summary_without_errors.features["amplitude"]
    )


def test_light_curve_feature_extraction_folds_duplicate_times():
    mjd = np.array([3.0, 1.0, 2.0, 2.0, 4.0, 5.0])
    mag = np.array([20.0, 19.9, 20.1, 20.0, 19.8, 20.2])
    err = np.full_like(mjd, 0.05)

    summary = extract_light_curve_features(mjd, mag, err, band="r")

    assert summary.status == "computed"
    assert summary.n_points == 5
    assert summary.features["amplitude"] > 0


def test_light_curve_feature_extraction_dependency_fallback(monkeypatch):
    def fail_import():
        raise ImportError("forced missing dependency")

    monkeypatch.setattr(lcf, "_import_light_curve", fail_import)
    mjd, mag, err = _normal_arrays()

    summary = extract_light_curve_features(mjd, mag, err, band="r")

    assert summary.status == "dependency_unavailable"
    assert summary.n_points == len(mjd)
    assert summary.features == {}
    assert "not available" in summary.interpretation


def test_light_curve_feature_summary_avoids_forbidden_physical_language():
    summaries = [
        extract_light_curve_features(*_normal_arrays(), band="r"),
        extract_light_curve_features(
            np.array([1.0, 2.0]),
            np.array([20.0, 19.8]),
            np.array([0.05, 0.05]),
            band="r",
        ),
    ]
    forbidden = (
        "variable star", "supernova", "agn", "confirmed transient",
        "new physics", "anomaly confirmed", "classification",
    )
    for summary in summaries:
        text = f"{summary.interpretation} {summary.caveat}".lower()
        for phrase in forbidden:
            assert phrase not in text


def test_no_network_imports_in_feature_modules():
    import argus.features as pkg

    feature_dir = Path(pkg.__file__).parent
    src = "".join(p.read_text(encoding="utf-8") for p in feature_dir.glob("*.py"))
    for forbidden in (
        "import requests", "from requests", "urllib.request", "import urllib",
        "import httpx", "from httpx", "from alerce", "import alerce",
    ):
        assert forbidden not in src, f"feature modules must not import {forbidden!r}"
