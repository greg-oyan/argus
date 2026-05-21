"""Phase 2C/2D comparator tests. Offline; synthetic + fixture-derived inputs only."""
from __future__ import annotations
import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from argus.casefile.build import build_casefile
from argus.casefile.schema import ModelComparison
from argus.compare.residuals import compute_residuals, interpret_residuals
from argus.compare.simple_templates import (
    MIN_POINTS_FOR_FIT, fit_gaussian_bump, gaussian_bump_mag,
)
from argus.compare import sncosmo_templates as snc_mod
from argus.compare.sncosmo_templates import (
    MODEL_TYPE as SNCOSMO_MODEL_TYPE,
    build_sncosmo_template_probe,
    prepare_sncosmo_photometry,
)
from argus.compare.variability import (
    MIN_POINTS_FOR_VARIABILITY,
    interpretation_from_variability_metrics,
    summarize_variability_texture,
)
from argus.ingest.storage import flatten_to_dataframe


# ---- template behavior -------------------------------------------------------


def test_gaussian_bump_returns_array_of_matching_shape():
    t = np.linspace(0, 100, 50)
    y = gaussian_bump_mag(t, amplitude_mag=-1.0, peak_mjd=50.0, sigma_days=5.0,
                          baseline_mag=20.0)
    assert y.shape == t.shape


def test_gaussian_bump_value_at_peak_equals_baseline_plus_amplitude():
    """f(peak) = baseline + amplitude · exp(0) = baseline + amplitude."""
    v = gaussian_bump_mag(50.0, amplitude_mag=-1.5, peak_mjd=50.0,
                          sigma_days=5.0, baseline_mag=20.0)
    assert float(v) == pytest.approx(20.0 + -1.5)


def test_gaussian_bump_value_far_from_peak_approaches_baseline():
    v = gaussian_bump_mag(1000.0, amplitude_mag=-1.5, peak_mjd=50.0,
                          sigma_days=5.0, baseline_mag=20.0)
    assert float(v) == pytest.approx(20.0, abs=1e-6)


# ---- fit behavior ------------------------------------------------------------


def test_fit_recovers_synthetic_parameters_within_tolerance():
    rng = np.random.default_rng(42)
    truth = dict(amplitude_mag=-1.5, peak_mjd=60050.0, sigma_days=10.0, baseline_mag=20.0)
    mjd = np.linspace(60000.0, 60100.0, 40)
    clean = gaussian_bump_mag(mjd, **truth)
    err = np.full_like(mjd, 0.03)
    mag = clean + rng.normal(0, err, size=mjd.size)

    res = fit_gaussian_bump(mjd, mag, err)
    assert res["status"] == "fitted_baseline"
    p = res["params"]
    assert p["amplitude_mag"] == pytest.approx(truth["amplitude_mag"], abs=0.2)
    assert p["peak_mjd"] == pytest.approx(truth["peak_mjd"], abs=2.0)
    assert p["sigma_days"] == pytest.approx(truth["sigma_days"], abs=2.0)
    assert p["baseline_mag"] == pytest.approx(truth["baseline_mag"], abs=0.05)
    assert res["predicted"].shape == mjd.shape


def test_fit_returns_insufficient_data_below_minimum_points():
    """Fewer than MIN_POINTS_FOR_FIT detections ⇒ insufficient_data, no fit attempted."""
    mjd = np.array([60000.0, 60001.0, 60002.0])
    mag = np.array([20.0, 19.8, 20.1])
    err = np.array([0.1, 0.1, 0.1])
    res = fit_gaussian_bump(mjd, mag, err)
    assert res["status"] == "insufficient_data"
    assert res["n_points"] == 3
    assert "params" not in res


def test_fit_handles_zero_errors_without_crashing():
    """Some sigmapsf values can be zero or NaN; the fitter must replace them."""
    rng = np.random.default_rng(0)
    mjd = np.linspace(60000.0, 60100.0, 30)
    truth = gaussian_bump_mag(mjd, -1.0, 60050.0, 8.0, 19.5)
    mag = truth + rng.normal(0, 0.05, mjd.size)
    err = np.full_like(mjd, 0.05)
    err[0] = 0.0           # bad
    err[5] = np.nan        # bad
    res = fit_gaussian_bump(mjd, mag, err)
    assert res["status"] == "fitted_baseline"


# ---- residuals ---------------------------------------------------------------


def test_compute_residuals_matches_manual_calculation():
    obs = np.array([1.0, 2.0, 3.0, 4.0])
    pred = np.array([1.1, 1.9, 3.2, 4.0])
    err = np.array([0.1, 0.1, 0.1, 0.1])
    mjd = np.array([10.0, 11.0, 12.0, 13.0])
    m = compute_residuals(obs, pred, errors=err, mjd=mjd, n_params=1)
    res = obs - pred  # [-0.1, 0.1, -0.2, 0.0]
    assert m["n_points"] == 4
    assert m["rmse"] == pytest.approx(float(np.sqrt(np.mean(res ** 2))))
    assert m["mae"] == pytest.approx(float(np.mean(np.abs(res))))
    assert m["residual_mean"] == pytest.approx(float(np.mean(res)))
    assert m["residual_std"] == pytest.approx(float(np.std(res)))
    assert m["largest_abs_residual"] == pytest.approx(0.2)
    assert m["largest_residual_mjd"] == pytest.approx(12.0)
    # reduced chi-squared with n_params=1, dof=3
    chi2 = float(np.sum((res / err) ** 2))
    assert m["reduced_chi2"] == pytest.approx(chi2 / 3.0)


def test_compute_residuals_omits_reduced_chi2_when_errors_missing():
    m = compute_residuals(np.array([1.0, 2.0]), np.array([1.0, 2.0]))
    assert "reduced_chi2" not in m


def test_interpret_residuals_flags_uneven_coverage():
    """Big trailing gap ⇒ note about uneven coverage."""
    mjd = np.concatenate([np.linspace(0, 30, 20), [1000.0]])
    obs = np.zeros_like(mjd)
    pred = np.zeros_like(mjd)
    fit_params = {"amplitude_mag": -1.0, "peak_mjd": 15.0, "sigma_days": 5.0,
                  "baseline_mag": 20.0}
    notes = interpret_residuals(mjd, obs, pred, fit_params)
    assert any("uneven" in n.lower() or "gap" in n.lower() for n in notes)


def test_interpret_residuals_flags_peak_outside_data():
    mjd = np.linspace(60000, 60100, 30)
    obs = np.zeros_like(mjd)
    pred = np.zeros_like(mjd)
    fit_params = {"amplitude_mag": -1.0, "peak_mjd": 70000.0, "sigma_days": 5.0,
                  "baseline_mag": 20.0}
    notes = interpret_residuals(mjd, obs, pred, fit_params)
    assert any("outside the observed time range" in n for n in notes)


# ---- descriptive variability comparator -------------------------------------


def test_variability_texture_normal_single_bump_has_few_turns():
    mjd = np.linspace(60000.0, 60100.0, 40)
    mag = gaussian_bump_mag(mjd, -1.0, 60050.0, 9.0, 20.0)
    err = np.full_like(mjd, 0.03)

    metrics = summarize_variability_texture(mjd, mag, err)

    assert metrics["status"] == "computed"
    assert metrics["observed_mag_range"] == pytest.approx(1.0, abs=0.03)
    assert metrics["local_extrema_count_after_smoothing"] <= 1
    assert metrics["behavior_hint"] == "single_smooth_or_monotonic"


def test_variability_texture_returns_insufficient_data():
    metrics = summarize_variability_texture(
        np.array([1.0, 2.0, 3.0]),
        np.array([20.0, 19.9, 20.1]),
        np.array([0.05, 0.05, 0.05]),
    )
    assert metrics["status"] == "insufficient_data"
    assert metrics["n_points"] == 3
    assert metrics["minimum_points"] == MIN_POINTS_FOR_VARIABILITY


def test_variability_texture_handles_missing_and_nan_errors():
    mjd = np.linspace(0.0, 30.0, 12)
    mag = 20.0 + 0.2 * np.sin(mjd / 3.0)
    err = np.full_like(mjd, np.nan)
    err[0] = 0.0

    metrics = summarize_variability_texture(mjd, mag, err)
    text = interpretation_from_variability_metrics(metrics, "r")

    assert metrics["status"] == "computed"
    assert metrics["median_photometric_error_mag"] is None
    assert metrics["variability_materially_larger_than_errors"] is None
    assert "missing or unusable" in text


def test_variability_texture_constant_data_is_measurement_level():
    mjd = np.linspace(0.0, 20.0, 15)
    mag = np.full_like(mjd, 19.7)
    err = np.full_like(mjd, 0.05)

    metrics = summarize_variability_texture(mjd, mag, err)

    assert metrics["status"] == "computed"
    assert metrics["observed_mag_range"] == pytest.approx(0.0)
    assert metrics["robust_scatter_mag"] == pytest.approx(0.0)
    assert metrics["local_extrema_count_after_smoothing"] == 0
    assert metrics["variability_materially_larger_than_errors"] is False
    assert metrics["behavior_hint"] == "flat_or_measurement_level"


def test_variability_texture_noisy_repeated_data_is_flagged():
    rng = np.random.default_rng(123)
    mjd = np.linspace(0.0, 120.0, 80)
    mag = 19.8 + 0.35 * np.sin(2.0 * np.pi * mjd / 30.0)
    mag = mag + rng.normal(0.0, 0.015, size=mjd.size)
    err = np.full_like(mjd, 0.04)

    metrics = summarize_variability_texture(mjd, mag, err)

    assert metrics["status"] == "computed"
    assert metrics["local_extrema_count_after_smoothing"] >= 3
    assert metrics["variability_materially_larger_than_errors"] is True
    assert metrics["behavior_hint"] == "repeated_or_irregular"


def test_variability_interpretation_avoids_forbidden_physical_language():
    rng = np.random.default_rng(7)
    mjd = np.linspace(0.0, 80.0, 50)
    mag = 20.0 + 0.3 * np.sin(2.0 * np.pi * mjd / 20.0)
    mag = mag + rng.normal(0.0, 0.02, size=mjd.size)
    err = np.full_like(mjd, 0.05)
    metrics = summarize_variability_texture(mjd, mag, err)
    text = interpretation_from_variability_metrics(metrics, "r").lower()

    forbidden = (
        "variable star", "this confirms a transient", "confirmed transient",
        "new physics", "supernova", "agn", "definitely a",
    )
    for phrase in forbidden:
        assert phrase not in text


# ---- sncosmo template probe --------------------------------------------------


def _sncosmo_ready_dataframe(n_per_band: int = 5) -> pd.DataFrame:
    rows = []
    for fid, offset in ((1, 0.0), (2, 0.08)):
        for i in range(n_per_band):
            rows.append({
                "mjd": 60000.0 + i * 2.0 + offset,
                "fid": fid,
                "magpsf": 20.0 - 0.08 * i + 0.05 * fid,
                "sigmapsf": 0.05,
            })
    return pd.DataFrame(rows)


def test_sncosmo_probe_dependency_unavailable(monkeypatch):
    def fail_import():
        raise ImportError("forced missing dependency")

    monkeypatch.setattr(snc_mod, "_import_sncosmo", fail_import)
    df = _sncosmo_ready_dataframe()
    result = build_sncosmo_template_probe(df, redshift=0.05, redshift_source="test")
    assert result.status == "dependency_unavailable"
    assert result.model_type == SNCOSMO_MODEL_TYPE
    assert result.parameters is None
    assert result.fit_metrics["bands_used"] == ["g", "r"]


def test_sncosmo_probe_template_unavailable_offline():
    class FakeSncosmo:
        @staticmethod
        def Model(source):
            raise RuntimeError(f"no local template: {source}")

    result = build_sncosmo_template_probe(
        _sncosmo_ready_dataframe(),
        redshift=0.05,
        redshift_source="test",
        sncosmo_module=FakeSncosmo,
    )
    assert result.status == "template_unavailable"
    assert "unavailable locally" in result.interpretation


def test_sncosmo_probe_missing_redshift_context():
    result = build_sncosmo_template_probe(_sncosmo_ready_dataframe())
    assert result.status == "missing_required_context"
    assert "redshift" in result.fit_metrics["missing_context"]
    assert "does not invent redshift" in result.interpretation


def test_sncosmo_probe_insufficient_data():
    df = _sncosmo_ready_dataframe(n_per_band=2)
    result = build_sncosmo_template_probe(df, redshift=0.05, redshift_source="test")
    assert result.status == "insufficient_data"
    assert result.fit_metrics["n_points"] == 4


def test_sncosmo_probe_filters_invalid_nan_values():
    df = _sncosmo_ready_dataframe(n_per_band=4)
    df.loc[0, "magpsf"] = np.nan
    df.loc[1, "sigmapsf"] = np.nan
    df.loc[2, "sigmapsf"] = 0.0

    prepared = prepare_sncosmo_photometry(df)

    assert prepared["n_points"] == len(df) - 3
    assert np.isfinite(prepared["data"]["flux"]).all()
    assert np.isfinite(prepared["data"]["fluxerr"]).all()
    assert (prepared["data"]["fluxerr"] > 0).all()


def test_sncosmo_probe_successful_mocked_fit_path():
    class FakeModel:
        param_names = ["z", "t0", "amplitude"]
        parameters = [0.05, 60005.0, 1.2]

        def __init__(self, source):
            self.source = source

        def set(self, **kwargs):
            self.z = kwargs["z"]

    class FakeFittedModel(FakeModel):
        def __init__(self, data):
            super().__init__("fake")
            self._data = data
            self.parameters = [0.05, 60005.0, 1.2]

        def bandflux(self, bands, times, zp, zpsys):
            return np.asarray(self._data["flux"]) - 0.2 * np.asarray(self._data["fluxerr"])

    class FakeSncosmo:
        @staticmethod
        def Model(source):
            return FakeModel(source)

        @staticmethod
        def fit_lc(data, model, params):
            return {"chisq": 3.0, "ndof": 5}, FakeFittedModel(data)

    result = build_sncosmo_template_probe(
        _sncosmo_ready_dataframe(),
        redshift=0.05,
        redshift_source="test_redshift",
        sncosmo_module=FakeSncosmo,
    )
    assert result.status == "fitted"
    assert result.parameters["template_name"] == "hsiao"
    assert result.parameters["assumed_redshift"] == pytest.approx(0.05)
    assert result.fit_metrics["reduced_chi2"] == pytest.approx(0.6)
    assert result.fit_metrics["rmse_flux"] > 0
    assert result.residual_summary


def test_sncosmo_probe_avoids_forbidden_physical_claims():
    results = [
        build_sncosmo_template_probe(_sncosmo_ready_dataframe()),
        build_sncosmo_template_probe(_sncosmo_ready_dataframe(n_per_band=2), redshift=0.05),
    ]
    forbidden = (
        "this is a supernova", "this is type ia", "this is type ii",
        "this is an agn", "confirmed transient", "new physics",
        "anomaly confirmed",
    )
    for result in results:
        text = " ".join([
            result.interpretation,
            " ".join(result.residual_summary),
            " ".join(result.limitations),
        ]).lower()
        for phrase in forbidden:
            assert phrase not in text


# ---- case-file integration ---------------------------------------------------


@pytest.fixture
def fixture_layout(tmp_path, fixture_objects, fixture_lightcurves):
    date = "2026-01-01"
    df = flatten_to_dataframe(fixture_objects, fixture_lightcurves)
    lc_dir = tmp_path / "lightcurves"
    lc_dir.mkdir()
    df.to_parquet(lc_dir / f"{date}.parquet", index=False)
    raw_dir = tmp_path / "raw" / date / "lightcurves"
    raw_dir.mkdir(parents=True)
    for oid, lc in fixture_lightcurves.items():
        (raw_dir / f"{oid}.json").write_text(json.dumps(lc))
    return tmp_path, date


def _pick_r_band_rich_oid(fixture_lightcurves: dict) -> str | None:
    """Try to find a fixture oid with ≥5 r-band detections that PASS the rb≥0.55 cut
    (i.e., that will actually survive into the flattened Parquet the comparator reads)."""
    for oid, lc in sorted(fixture_lightcurves.items()):
        r = sum(
            1 for d in (lc.get("detections") or [])
            if d.get("fid") == 2 and (d.get("rb") or 0) >= 0.55
        )
        if r >= MIN_POINTS_FOR_FIT:
            return oid
    return None


def test_casefile_has_non_empty_model_comparisons(fixture_layout, fixture_lightcurves):
    layout, date = fixture_layout
    oid = sorted(fixture_lightcurves.keys())[0]
    case = build_casefile(oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x")
    assert case.model_comparisons, "model_comparisons must always be populated"
    for mc in case.model_comparisons:
        assert mc.status in {
            "fitted_baseline", "computed", "insufficient_data", "failed_fit",
            "fitted", "missing_required_context", "template_unavailable",
            "fit_failed", "dependency_unavailable",
        }


def test_casefile_includes_sncosmo_template_probe(fixture_layout, fixture_lightcurves):
    layout, date = fixture_layout
    oid = sorted(fixture_lightcurves.keys())[0]
    case = build_casefile(oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x")
    model_types = [mc.model_type for mc in case.model_comparisons]
    assert "gaussian_bump" in model_types
    assert "variability_texture" in model_types
    assert SNCOSMO_MODEL_TYPE in model_types
    sn_probe = [mc for mc in case.model_comparisons if mc.model_type == SNCOSMO_MODEL_TYPE][0]
    assert sn_probe.status == "missing_required_context"
    assert sn_probe.parameters is None


def test_casefile_includes_variability_texture_comparison(fixture_layout, fixture_lightcurves):
    layout, date = fixture_layout
    oid = sorted(fixture_lightcurves.keys())[0]
    case = build_casefile(oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x")
    matches = [mc for mc in case.model_comparisons if mc.model_type == "variability_texture"]
    assert len(matches) == 1
    mc = matches[0]
    assert mc.filter_used == "r"
    assert mc.parameters is None
    assert mc.fit_metrics is not None
    assert "n_points" in mc.fit_metrics
    assert "phenomenological" in " ".join(mc.limitations).lower()


def test_phenomenological_limitation_always_present(fixture_layout, fixture_lightcurves):
    """Honesty: every comparator carries the 'not a physical model' caveat."""
    layout, date = fixture_layout
    oid = sorted(fixture_lightcurves.keys())[0]
    case = build_casefile(oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x")
    for mc in case.model_comparisons:
        joined = " ".join(mc.limitations).lower()
        assert "phenomenological" in joined
        assert "not a physical model" in joined or "not imply" in joined


def test_interpretation_does_not_claim_physical_meaning(fixture_layout, fixture_lightcurves):
    """The interpretation string must not assert that the object IS a supernova etc."""
    layout, date = fixture_layout
    oid = sorted(fixture_lightcurves.keys())[0]
    case = build_casefile(oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x")
    forbidden = ("this is a supernova", "confirmed supernova", "new physics",
                 "this is an agn", "definitely a", "confirmed transient")
    for mc in case.model_comparisons:
        text = mc.interpretation.lower()
        for phrase in forbidden:
            assert phrase not in text, f"interpretation overclaims: {phrase!r} in {text!r}"


def test_no_fitted_status_without_actual_fit(fixture_layout, fixture_lightcurves):
    """Honesty: status='fitted_baseline' requires populated params + fit_metrics."""
    layout, date = fixture_layout
    oid = sorted(fixture_lightcurves.keys())[0]
    case = build_casefile(oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x")
    for mc in case.model_comparisons:
        if mc.status == "fitted_baseline":
            assert mc.parameters is not None and len(mc.parameters) >= 1
            assert mc.fit_metrics is not None and "rmse" in mc.fit_metrics
        elif mc.status == "fitted":
            assert mc.parameters is not None and len(mc.parameters) >= 1
            assert mc.fit_metrics is not None and "n_points" in mc.fit_metrics
        elif mc.status == "computed":
            assert mc.parameters is None
            assert mc.fit_metrics is not None and "n_points" in mc.fit_metrics
        else:
            # insufficient_data / failed_fit ⇒ parameters must NOT pretend to be a fit
            assert mc.parameters is None


def test_no_network_imports_in_compare_module():
    import argus.compare as pkg
    compare_dir = Path(pkg.__file__).parent
    src = "".join(p.read_text(encoding="utf-8") for p in compare_dir.glob("*.py"))
    for forbidden in ("import requests", "from requests", "urllib.request",
                      "import urllib", "import httpx", "from httpx",
                      "from alerce", "import alerce"):
        assert forbidden not in src, f"compare package must not import {forbidden!r}"


def test_rich_fixture_oid_produces_fitted_baseline_when_available(fixture_layout, fixture_lightcurves):
    """If at least one fixture has enough r-band detections, the comparator should succeed."""
    layout, date = fixture_layout
    oid = _pick_r_band_rich_oid(fixture_lightcurves)
    if oid is None:
        pytest.skip("no fixture oid has >=5 r-band detections")
    case = build_casefile(oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x")
    mc = case.model_comparisons[0]
    assert mc.status == "fitted_baseline"
    assert mc.fit_metrics["n_points"] >= MIN_POINTS_FOR_FIT
