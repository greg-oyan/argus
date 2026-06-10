"""Phase 2P static case-file index tests."""
from __future__ import annotations

import json
from pathlib import Path

from argus.casefile.index import (
    build_casefile_index,
    compute_review_priority,
    extract_index_entry,
    render_index_html,
    review_priority_level,
    write_index_html,
    write_index_json,
)
from scripts import build_casefile_index as cli_mod


def _case_data(*, oid: str = "ZTFindex") -> dict:
    return {
        "oid": oid,
        "source_date": "2026-05-20",
        "generated_at": "2026-05-21T00:00:00+00:00",
        "schema_version": "1.11",
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
        "comparison_summary": {
            "headline": "Not well explained by a single smooth bump",
            "summary": "The simple smooth bump captures only part of the structure.",
        },
        "recommended_next_checks": ["Inspect residual structure visually."],
        "feature_summary": {"status": "computed"},
        "cross_survey_context": {"status": "not_requested"},
        "context_enriched": False,
        "anomaly_assessment": {
            "status": "available",
            "score": 8,
            "label": "high",
            "drivers": [
                "Coverage spans enough days to inspect long-baseline behavior.",
                "Gaussian bump residual scale is high.",
            ],
            "cautions": [
                "Template-family probe is limited by missing required context.",
            ],
            "caveat": "This deterministic assessment supports review triage only.",
        },
        "model_comparisons": [
            {
                "model_type": "gaussian_bump",
                "status": "fitted_baseline",
                "fit_metrics": {"reduced_chi2": 2.7},
                "residual_summary": [
                    "The data is not well described by a single bump."
                ],
            },
            {
                "model_type": "variability_texture",
                "status": "computed",
                "fit_metrics": {
                    "behavior_hint": "repeated_or_irregular",
                    "smoothed_sign_changes": 4,
                    "variability_materially_larger_than_errors": True,
                },
            },
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


def _write_low_priority_case(root: Path, *, oid: str = "ZTFlow") -> Path:
    case_dir = root / oid
    case_dir.mkdir(parents=True)
    json_path = case_dir / f"{oid}.casefile.json"
    json_path.write_text(
        json.dumps({
            "oid": oid,
            "source_date": "2026-05-20",
            "schema_version": "1.11",
        }),
        encoding="utf-8",
    )
    return json_path


def test_review_priority_score_level_and_reasons():
    priority = compute_review_priority(_case_data())

    assert priority["score"] == 9
    assert priority["level"] == "high"
    assert "not a clean fit" in priority["reasons"][0]
    assert "repeated or irregular behavior" in priority["reasons"][1]
    assert "queue sorting heuristic" in priority["caveat"]


def test_review_priority_level_mapping():
    assert review_priority_level(0) == "low"
    assert review_priority_level(2) == "low"
    assert review_priority_level(3) == "medium"
    assert review_priority_level(5) == "medium"
    assert review_priority_level(6) == "high"
    assert review_priority_level(10) == "high"


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
    assert entry["context_enriched"] is False
    assert entry["classification_metadata"]["kind"] == "external_metadata"
    assert entry["anomaly_assessment"]["status"] == "available"
    assert entry["anomaly_assessment"]["score"] == 8
    assert entry["anomaly_assessment"]["label"] == "high"
    assert entry["anomaly_assessment"]["drivers"]
    assert entry["review_priority"]["score"] == 9
    assert entry["review_priority"]["level"] == "high"
    assert entry["top_recommended_next_check"] == "Inspect residual structure visually."


def test_index_entry_marks_context_enriched_when_queried(tmp_path):
    json_path = _write_case_bundle(tmp_path, oid="ZTFcontext")
    data = json.loads(json_path.read_text(encoding="utf-8"))
    data["cross_survey_context"] = {"status": "queried"}

    entry = extract_index_entry(data, json_path, base_dir=tmp_path)
    html = render_index_html({
        "case_count": 1,
        "generated_at": "2026-05-21T00:00:00+00:00",
        "entries": [entry],
    })

    assert entry["context_enriched"] is True
    assert "Context-enriched" in html


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
    assert all("\\" not in value for value in entry["links"].values())


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
    assert entry["anomaly_assessment"]["status"] == "missing"
    assert entry["review_priority"]["score"] == 0
    assert entry["review_priority"]["level"] == "low"
    assert entry["top_recommended_next_check"] == "No next check recorded."


def test_index_sorts_by_review_priority_then_oid(tmp_path):
    _write_low_priority_case(tmp_path, oid="ZTF000low")
    _write_case_bundle(tmp_path, oid="ZTFtieB")
    _write_case_bundle(tmp_path, oid="ZTFtieA")

    index = build_casefile_index(tmp_path, generated_at="2026-05-21T00:00:00+00:00")

    assert index["sort_order"] == "review_priority_desc_then_oid"
    assert [entry["oid"] for entry in index["entries"]] == [
        "ZTFtieA",
        "ZTFtieB",
        "ZTF000low",
    ]


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
    assert "\\" not in parsed["casefile_dir"]
    assert "\\" not in json.dumps(parsed["entries"], sort_keys=True)
    assert "Argus Case-File Index" in html
    assert "Evidence triage" in html
    assert "Review priority" in html
    assert "queue sorting heuristic" in html
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
