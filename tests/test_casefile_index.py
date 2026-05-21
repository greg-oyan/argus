"""Phase 2P static case-file index tests."""
from __future__ import annotations

import json
from pathlib import Path

from argus.casefile.index import (
    build_casefile_index,
    extract_index_entry,
    render_index_html,
    write_index_html,
    write_index_json,
)
from scripts import build_casefile_index as cli_mod


def _case_data(*, oid: str = "ZTFindex") -> dict:
    return {
        "oid": oid,
        "source_date": "2026-05-20",
        "generated_at": "2026-05-21T00:00:00+00:00",
        "schema_version": "1.9",
        "detection_count": 12,
        "non_detection_count": 3,
        "filters_observed": ["g", "r"],
        "time_span_days": 42.0,
        "classification_metadata": {
            "class": "external broker label",
            "classifier": "broker",
        },
        "evidence_narrative": {
            "headline": "Complex light-curve behavior with limited physical interpretation",
            "short_summary": "The case file records repeated evidence-layer signals.",
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
    }


def _write_case_bundle(root: Path, *, oid: str = "ZTFindex") -> Path:
    case_dir = root / oid
    case_dir.mkdir(parents=True)
    json_path = case_dir / f"{oid}.casefile.json"
    json_path.write_text(json.dumps(_case_data(oid=oid)), encoding="utf-8")
    for suffix in (
        "casefile.html",
        "casefile.md",
        "lightcurve.png",
        "residuals.png",
    ):
        path = case_dir / f"{oid}.{suffix}"
        if path.suffix == ".png":
            path.write_bytes(b"\x89PNG\r\n\x1a\n")
        else:
            path.write_text("demo", encoding="utf-8")
    return json_path


def test_index_entry_extraction_from_full_case_file(tmp_path):
    json_path = _write_case_bundle(tmp_path)
    data = json.loads(json_path.read_text(encoding="utf-8"))

    entry = extract_index_entry(data, json_path, base_dir=tmp_path)

    assert entry["oid"] == "ZTFindex"
    assert entry["headline"].startswith("Complex")
    assert entry["gaussian_comparator_status"] == "fitted_baseline"
    assert entry["variability_texture_status"] == "computed"
    assert entry["feature_summary_status"] == "computed"
    assert entry["sncosmo_template_probe_status"] == "missing_required_context"
    assert entry["cross_survey_context_status"] == "not_requested"
    assert entry["classification_metadata"]["kind"] == "external_metadata"
    assert entry["top_recommended_next_check"] == "Inspect residual structure visually."


def test_index_entry_links_available_artifacts_with_relative_paths(tmp_path):
    json_path = _write_case_bundle(tmp_path, oid="ZTFlinks")
    data = json.loads(json_path.read_text(encoding="utf-8"))

    entry = extract_index_entry(data, json_path, base_dir=tmp_path)

    assert entry["links"] == {
        "json": "ZTFlinks/ZTFlinks.casefile.json",
        "markdown": "ZTFlinks/ZTFlinks.casefile.md",
        "html": "ZTFlinks/ZTFlinks.casefile.html",
        "light_curve_png": "ZTFlinks/ZTFlinks.lightcurve.png",
        "residual_png": "ZTFlinks/ZTFlinks.residuals.png",
    }


def test_index_handles_missing_optional_fields(tmp_path):
    case_dir = tmp_path / "case"
    case_dir.mkdir()
    json_path = case_dir / "missing.casefile.json"
    json_path.write_text(
        json.dumps({
            "oid": "ZTFmissing",
            "source_date": "2026-05-20",
            "schema_version": "1.9",
        }),
        encoding="utf-8",
    )

    index = build_casefile_index(tmp_path, generated_at="2026-05-21T00:00:00+00:00")
    entry = index["entries"][0]

    assert index["case_count"] == 1
    assert entry["headline"] == "Evidence summary is not available for this case file."
    assert entry["gaussian_comparator_status"] == "missing"
    assert entry["feature_summary_status"] == "missing"
    assert entry["cross_survey_context_status"] == "missing"
    assert entry["top_recommended_next_check"] == "No next check recorded."


def test_index_handles_zero_case_files(tmp_path):
    index = build_casefile_index(tmp_path, generated_at="2026-05-21T00:00:00+00:00")
    html = render_index_html(index)

    assert index["case_count"] == 0
    assert index["entries"] == []
    assert "0 case files available." in html
    assert "No Argus case-file JSON files were found" in html


def test_index_json_and_html_writers(tmp_path):
    _write_case_bundle(tmp_path)
    index = build_casefile_index(tmp_path, generated_at="2026-05-21T00:00:00+00:00")

    json_path = write_index_json(index, tmp_path / "index.json")
    html_path = write_index_html(index, tmp_path / "index.html")

    parsed = json.loads(json_path.read_text(encoding="utf-8"))
    html = html_path.read_text(encoding="utf-8")
    assert parsed["case_count"] == 1
    assert "Argus Case-File Index" in html
    assert "ZTFindex/ZTFindex.casefile.html" in html
    assert "ZTFindex/ZTFindex.residuals.png" in html
    assert "<script" not in html.lower()


def test_cli_writes_index_json_and_html(tmp_path):
    _write_case_bundle(tmp_path, oid="ZTFcli")

    status = cli_mod.main(["--casefile-dir", str(tmp_path), "--write-html"])

    assert status == 0
    assert (tmp_path / "index.json").exists()
    assert (tmp_path / "index.html").exists()
    parsed = json.loads((tmp_path / "index.json").read_text(encoding="utf-8"))
    assert parsed["entries"][0]["oid"] == "ZTFcli"


def test_index_output_avoids_forbidden_physical_claims(tmp_path):
    _write_case_bundle(tmp_path)
    index = build_casefile_index(tmp_path, generated_at="2026-05-21T00:00:00+00:00")
    text = (json.dumps(index, sort_keys=True) + render_index_html(index)).lower()
    forbidden = (
        "this is a variable star",
        "this is a supernova",
        "this is an agn",
        "confirmed transient",
        "new physics",
        "anomaly confirmed",
        "classification confirmed",
        "discovery",
        "ranked by anomaly score",
    )
    for phrase in forbidden:
        assert phrase not in text, f"case-file index overclaims: {phrase!r}"
