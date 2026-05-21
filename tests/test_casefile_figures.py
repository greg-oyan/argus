"""Phase 2K static case-file figure tests."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pandas as pd

from argus.casefile.figures import (
    FigureOutputs,
    figure_paths_for_json,
    write_casefile_figures,
    write_light_curve_figure,
)
from argus.casefile.markdown import write_casefile_markdown
from argus.casefile.schema import CaseFile, LightCurveSummary, ModelComparison
from scripts import build_casefile as cli_mod


def _case(model_comparisons: list[ModelComparison] | None = None) -> CaseFile:
    summary = LightCurveSummary(
        n_detections=5,
        n_non_detections=0,
        filters_observed=["g", "r"],
        first_mjd=60000.0,
        last_mjd=60004.0,
        time_span_days=4.0,
        most_recent_detection_mjd=60004.0,
        longest_detection_gap_days=1.0,
        per_filter=[],
    )
    return CaseFile(
        oid="ZTFfig",
        source_date="2026-05-21",
        generated_at="2026-05-21T00:00:00+00:00",
        coordinates=None,
        available_data_sources=["parquet_detections"],
        detection_count=5,
        non_detection_count=0,
        filters_observed=["g", "r"],
        first_mjd=60000.0,
        last_mjd=60004.0,
        time_span_days=4.0,
        classification_metadata=None,
        light_curve_summary=summary,
        evidence_notes=[],
        candidate_explanations=[],
        uncertainty_notes=[],
        recommended_next_checks=[],
        model_comparisons=model_comparisons or [],
    )


def _detections() -> pd.DataFrame:
    return pd.DataFrame({
        "mjd": [60000.0, 60001.0, 60002.0, 60003.0, 60004.0],
        "fid": [1, 2, 1, 2, 2],
        "magpsf": [20.0, 19.7, 20.2, 19.5, 19.8],
        "sigmapsf": [0.1, 0.08, 0.11, 0.07, 0.09],
    })


def _assert_png(path: Path):
    assert path.exists()
    assert path.read_bytes().startswith(b"\x89PNG")


def test_light_curve_figure_generation_g_and_r(tmp_path):
    path = write_light_curve_figure(_case(), _detections(), tmp_path / "ZTFfig.lightcurve.png")

    _assert_png(path)


def test_light_curve_figure_generation_one_band_nan_errors(tmp_path):
    detections = pd.DataFrame({
        "mjd": [60000.0, 60001.0, 60002.0],
        "fid": [2, 2, 2],
        "magpsf": [19.9, 19.6, 19.8],
        "sigmapsf": [np.nan, np.nan, np.nan],
    })

    path = write_light_curve_figure(_case(), detections, tmp_path / "one-band.png")

    _assert_png(path)


def test_light_curve_figure_generation_insufficient_data(tmp_path):
    path = write_light_curve_figure(
        _case(),
        pd.DataFrame(columns=["mjd", "fid", "magpsf", "sigmapsf"]),
        tmp_path / "empty.png",
    )

    _assert_png(path)


def test_casefile_figures_skip_missing_residual_data(tmp_path):
    outputs = write_casefile_figures(_case(), detections=_detections(), output_dir=tmp_path)

    _assert_png(outputs.light_curve)
    assert outputs.residuals is None
    assert outputs.skipped["residuals"] == "Point-level Gaussian residual data is not present."


def test_casefile_figures_write_residuals_when_point_data_exists(tmp_path):
    comparison = ModelComparison(
        name="Gaussian bump (r-band)",
        model_type="gaussian_bump",
        filter_used="r",
        status="fitted_baseline",
        parameters={},
        fit_metrics={"n_points": 2},
        residual_summary=[],
        interpretation="Comparator residuals were recorded.",
        limitations=[],
        residual_points=[
            {
                "mjd": 60000.0,
                "observed_mag": 19.9,
                "model_mag": 19.8,
                "residual_mag": 0.1,
                "magerr": 0.08,
            },
            {
                "mjd": 60001.0,
                "observed_mag": 19.7,
                "model_mag": 19.9,
                "residual_mag": -0.2,
                "magerr": 0.07,
            },
        ],
    )

    outputs = write_casefile_figures(
        _case([comparison]),
        detections=_detections(),
        output_dir=tmp_path,
    )

    _assert_png(outputs.light_curve)
    _assert_png(outputs.residuals)
    assert "residuals" not in outputs.skipped


def test_figure_paths_for_json():
    paths = figure_paths_for_json(Path("ZTFfig.casefile.json"), "ZTFfig")

    assert paths["light_curve"] == Path("ZTFfig.lightcurve.png")
    assert paths["residuals"] == Path("ZTFfig.residuals.png")


def test_cli_writes_figures_when_requested(tmp_path, monkeypatch):
    json_path = tmp_path / "ZTFfig.json"
    written = tmp_path / "ZTFfig.lightcurve.png"

    def fake_write_figures(*args, **kwargs):
        written.write_bytes(b"\x89PNG\r\n\x1a\n")
        return FigureOutputs(light_curve=written)

    monkeypatch.setattr(cli_mod, "build_casefile", lambda *args, **kwargs: _case())
    monkeypatch.setattr(cli_mod, "write_casefile", lambda case: json_path)
    monkeypatch.setattr(cli_mod, "write_casefile_figures", fake_write_figures)

    status = cli_mod.main(["--date", "2026-05-21", "--oid", "ZTFfig", "--write-figures"])

    assert status == 0
    assert written.exists()


def test_cli_does_not_write_figures_unless_requested(tmp_path, monkeypatch):
    json_path = tmp_path / "ZTFfig.json"

    def fail_write_figures(*args, **kwargs):
        raise AssertionError("figure generation should not run without --write-figures")

    monkeypatch.setattr(cli_mod, "build_casefile", lambda *args, **kwargs: _case())
    monkeypatch.setattr(cli_mod, "write_casefile", lambda case: json_path)
    monkeypatch.setattr(cli_mod, "write_casefile_figures", fail_write_figures)

    status = cli_mod.main(["--date", "2026-05-21", "--oid", "ZTFfig"])

    assert status == 0


def test_markdown_references_figures_only_when_present(tmp_path):
    json_path = tmp_path / "ZTFfig.json"
    present = tmp_path / "ZTFfig.lightcurve.png"
    residual = tmp_path / "ZTFfig.residuals.png"
    missing = tmp_path / "ZTFfig.extra.png"
    present.write_bytes(b"\x89PNG\r\n\x1a\n")
    residual.write_bytes(b"\x89PNG\r\n\x1a\n")

    markdown_path = write_casefile_markdown(
        _case(),
        json_path=json_path,
        figure_paths=[present, residual, missing],
    )
    text = markdown_path.read_text(encoding="utf-8")

    assert "## Visual Summary" in text
    assert "![Observed light curve](ZTFfig.lightcurve.png)" in text
    assert "![Gaussian comparator residuals](ZTFfig.residuals.png)" in text
    assert "under- or over-predicts" in text
    assert "ZTFfig.extra.png" not in text


def test_cli_markdown_references_generated_figures(tmp_path, monkeypatch):
    json_path = tmp_path / "ZTFfig.json"
    figure_path = tmp_path / "ZTFfig.lightcurve.png"

    def fake_write_figures(*args, **kwargs):
        figure_path.write_bytes(b"\x89PNG\r\n\x1a\n")
        return FigureOutputs(light_curve=figure_path)

    monkeypatch.setattr(cli_mod, "build_casefile", lambda *args, **kwargs: _case())
    monkeypatch.setattr(cli_mod, "write_casefile", lambda case: json_path)
    monkeypatch.setattr(cli_mod, "write_casefile_figures", fake_write_figures)

    status = cli_mod.main([
        "--date", "2026-05-21",
        "--oid", "ZTFfig",
        "--write-figures",
        "--write-markdown",
    ])

    assert status == 0
    text = (tmp_path / "ZTFfig.casefile.md").read_text(encoding="utf-8")
    assert "![Observed light curve](ZTFfig.lightcurve.png)" in text


def test_figure_text_avoids_forbidden_physical_claims():
    import argus.casefile.figures as figures_mod

    text = Path(figures_mod.__file__).read_text(encoding="utf-8").lower()
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
        assert phrase not in text, f"figure text overclaims: {phrase!r}"
