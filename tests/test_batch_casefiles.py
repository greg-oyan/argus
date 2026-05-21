"""Phase 2Q batch case-file generation tests."""
from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import pandas as pd

from argus.casefile.figures import FigureOutputs
from scripts import build_casefiles_batch as batch_mod


def _write_case_json(path: Path, oid: str, date: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({
            "oid": oid,
            "source_date": date,
            "generated_at": "2026-05-21T00:00:00+00:00",
            "schema_version": "1.9",
            "detection_count": 5,
            "non_detection_count": 1,
            "filters_observed": ["r"],
            "time_span_days": 4.0,
            "classification_metadata": None,
            "evidence_narrative": {
                "headline": "Prepared for inspection",
                "short_summary": "This case file is ready for review.",
            },
            "recommended_next_checks": ["Inspect residual structure visually."],
            "feature_summary": {"status": "computed"},
            "cross_survey_context": {"status": "not_requested"},
            "model_comparisons": [
                {"model_type": "gaussian_bump", "status": "fitted_baseline"},
                {"model_type": "variability_texture", "status": "computed"},
                {
                    "model_type": "sncosmo_template_probe",
                    "status": "missing_required_context",
                },
            ],
        }),
        encoding="utf-8",
    )


def _install_fake_builders(monkeypatch, *, failing_oids: set[str] | None = None):
    failing = failing_oids or set()

    def fake_build_casefile(oid, date, **kwargs):
        if oid in failing:
            raise RuntimeError(f"boom for {oid}")
        return SimpleNamespace(oid=oid, source_date=date)

    def fake_write_casefile(case, output_dir=None):
        path = Path(output_dir) / f"{case.oid}.json"
        _write_case_json(path, case.oid, case.source_date)
        return path

    def fake_write_figures(case, *, json_path, **kwargs):
        light_curve = Path(json_path).with_name(f"{case.oid}.lightcurve.png")
        residuals = Path(json_path).with_name(f"{case.oid}.residuals.png")
        light_curve.write_bytes(b"\x89PNG\r\n\x1a\n")
        residuals.write_bytes(b"\x89PNG\r\n\x1a\n")
        return FigureOutputs(light_curve=light_curve, residuals=residuals)

    def fake_write_markdown(case, *, json_path, **kwargs):
        path = Path(json_path).with_name(f"{case.oid}.casefile.md")
        path.write_text("markdown", encoding="utf-8")
        return path

    def fake_write_html(case, *, json_path, **kwargs):
        path = Path(json_path).with_name(f"{case.oid}.casefile.html")
        path.write_text("<!doctype html>", encoding="utf-8")
        return path

    monkeypatch.setattr(batch_mod, "build_casefile", fake_build_casefile)
    monkeypatch.setattr(batch_mod, "write_casefile", fake_write_casefile)
    monkeypatch.setattr(batch_mod, "write_casefile_figures", fake_write_figures)
    monkeypatch.setattr(batch_mod, "write_casefile_markdown", fake_write_markdown)
    monkeypatch.setattr(batch_mod, "write_casefile_html", fake_write_html)


def _write_parquet_oids(lightcurves_dir: Path, date: str, oids: list[str]) -> None:
    lightcurves_dir.mkdir(parents=True)
    pd.DataFrame({"oid": oids}).to_parquet(lightcurves_dir / f"{date}.parquet", index=False)


def test_batch_with_explicit_oids_json_only(tmp_path, monkeypatch):
    _install_fake_builders(monkeypatch)

    summary = batch_mod.build_casefiles_batch(
        date="2026-05-20",
        oids=["ZTFb", "ZTFa", "ZTFa"],
        output_dir=tmp_path / "casefiles",
    )

    assert summary.attempted == 2
    assert summary.succeeded == 2
    assert summary.failed == 0
    assert summary.succeeded_oids == ["ZTFa", "ZTFb"]
    assert (tmp_path / "casefiles" / "ZTFa.json").exists()
    assert not (tmp_path / "casefiles" / "ZTFa.casefile.md").exists()


def test_batch_discovers_sorted_oids_and_applies_limit(tmp_path, monkeypatch):
    _install_fake_builders(monkeypatch)
    date = "2026-05-20"
    lightcurves_dir = tmp_path / "lightcurves"
    _write_parquet_oids(lightcurves_dir, date, ["ZTFc", "ZTFa", "ZTFb"])

    summary = batch_mod.build_casefiles_batch(
        date=date,
        limit=2,
        lightcurves_dir=lightcurves_dir,
        raw_dir=tmp_path / "raw",
        output_dir=tmp_path / "casefiles",
    )

    assert summary.succeeded_oids == ["ZTFa", "ZTFb"]
    assert summary.attempted == 2


def test_batch_continues_after_one_object_fails(tmp_path, monkeypatch):
    _install_fake_builders(monkeypatch, failing_oids={"ZTFbad"})

    summary = batch_mod.build_casefiles_batch(
        date="2026-05-20",
        oids=["ZTFok1", "ZTFbad", "ZTFok2"],
        output_dir=tmp_path / "casefiles",
    )

    assert summary.attempted == 3
    assert summary.succeeded == 2
    assert summary.failed == 1
    assert [failure.oid for failure in summary.failed_oids] == ["ZTFbad"]
    assert summary.succeeded_oids == ["ZTFok1", "ZTFok2"]


def test_batch_fail_fast_stops_after_first_failure(tmp_path, monkeypatch):
    _install_fake_builders(monkeypatch, failing_oids={"ZTFbad"})

    summary = batch_mod.build_casefiles_batch(
        date="2026-05-20",
        oids=["ZTFok1", "ZTFbad", "ZTFok2"],
        output_dir=tmp_path / "casefiles",
        fail_fast=True,
    )

    assert summary.attempted == 1
    assert summary.succeeded_oids == []
    assert summary.failed == 1


def test_batch_writes_optional_artifacts_and_index(tmp_path, monkeypatch):
    _install_fake_builders(monkeypatch)

    summary = batch_mod.build_casefiles_batch(
        date="2026-05-20",
        oids=["ZTFone"],
        output_dir=tmp_path / "casefiles",
        write_markdown=True,
        write_figures=True,
        write_html=True,
        write_index=True,
    )

    out = tmp_path / "casefiles"
    assert summary.index_written is True
    assert Path(summary.index_json_path).exists()
    assert Path(summary.index_html_path).exists()
    assert (out / "ZTFone.casefile.md").exists()
    assert (out / "ZTFone.casefile.html").exists()
    assert (out / "ZTFone.lightcurve.png").exists()
    assert (out / "ZTFone.residuals.png").exists()
    index = json.loads((out / "index.json").read_text(encoding="utf-8"))
    assert index["case_count"] == 1
    assert index["entries"][0]["oid"] == "ZTFone"


def test_batch_cli_writes_index(tmp_path, monkeypatch):
    _install_fake_builders(monkeypatch)

    status = batch_mod.main([
        "--date", "2026-05-20",
        "--oids", "ZTFcli",
        "--casefile-dir", str(tmp_path / "casefiles"),
        "--write-index",
    ])

    assert status == 0
    assert (tmp_path / "casefiles" / "index.json").exists()
    assert (tmp_path / "casefiles" / "index.html").exists()


def test_no_network_imports_in_batch_script():
    src = Path(batch_mod.__file__).read_text(encoding="utf-8")
    forbidden = (
        "import requests",
        "from requests",
        "urllib.request",
        "import urllib",
        "import httpx",
        "from httpx",
        "from alerce",
        "import alerce",
    )
    for phrase in forbidden:
        assert phrase not in src


def test_batch_script_avoids_forbidden_physical_claims():
    text = Path(batch_mod.__file__).read_text(encoding="utf-8").lower()
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
