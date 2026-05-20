"""Phase 2B case-file tests. Offline; uses tests/fixtures/ only."""
from __future__ import annotations
import json

import pandas as pd
import pytest

from argus.casefile.build import build_casefile, write_casefile
from argus.casefile.schema import CaseFile
from argus.casefile.summarize import (
    candidate_explanations, evidence_notes, recommended_next_checks,
    summarize_light_curve, uncertainty_notes,
)
from argus.ingest.storage import flatten_to_dataframe


def _pick_fixture_oid(fixture_lightcurves: dict) -> str:
    """A fixture oid that has at least one detection — gives the richer code path."""
    for oid, lc in sorted(fixture_lightcurves.items()):
        if lc.get("detections"):
            return oid
    raise RuntimeError("no fixture oid has detections")


@pytest.fixture
def fixture_layout(tmp_path, fixture_objects, fixture_lightcurves):
    """Mirror the data/ layout in tmp_path using committed fixtures."""
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


def test_schema_serializes_to_json_round_trip(fixture_objects, fixture_lightcurves):
    """CaseFile.to_dict() ⇒ json.dumps ⇒ json.loads preserves keys and structure."""
    df = flatten_to_dataframe(fixture_objects, fixture_lightcurves)
    oid = _pick_fixture_oid(fixture_lightcurves)
    det = df[df["oid"] == oid][["mjd", "fid", "magpsf", "sigmapsf"]].copy()
    nondet = pd.DataFrame(fixture_lightcurves[oid].get("non_detections") or [])
    summary = summarize_light_curve(det, nondet)
    cf = CaseFile(
        oid=oid, source_date="2026-01-01", generated_at="2026-01-01T00:00:00+00:00",
        coordinates=None,
        available_data_sources=["parquet_detections", "raw_lightcurve_json"],
        detection_count=summary.n_detections,
        non_detection_count=summary.n_non_detections,
        filters_observed=summary.filters_observed,
        first_mjd=summary.first_mjd, last_mjd=summary.last_mjd,
        time_span_days=summary.time_span_days,
        classification_metadata=None, light_curve_summary=summary,
        evidence_notes=evidence_notes(summary, None),
        candidate_explanations=candidate_explanations(summary, None),
        uncertainty_notes=uncertainty_notes(summary, None, ["parquet_detections"]),
        recommended_next_checks=recommended_next_checks(summary, None, None),
    )
    parsed = json.loads(json.dumps(cf.to_dict(), default=str))
    assert parsed["oid"] == oid
    assert isinstance(parsed["candidate_explanations"], list)
    assert isinstance(parsed["light_curve_summary"], dict)
    assert "per_filter" in parsed["light_curve_summary"]


def test_build_from_fixtures_end_to_end(fixture_layout, fixture_lightcurves):
    tmp_path, date = fixture_layout
    oid = _pick_fixture_oid(fixture_lightcurves)
    case = build_casefile(
        oid, date,
        lightcurves_dir=tmp_path / "lightcurves",
        raw_dir=tmp_path / "raw",
        tensors_dir=tmp_path / "tensors_does_not_exist",
    )
    assert case.oid == oid
    assert case.source_date == date
    assert "parquet_detections" in case.available_data_sources
    assert "raw_lightcurve_json" in case.available_data_sources
    assert "tensor_manifest" not in case.available_data_sources


def test_required_fields_present(fixture_layout, fixture_lightcurves):
    tmp_path, date = fixture_layout
    oid = _pick_fixture_oid(fixture_lightcurves)
    case = build_casefile(
        oid, date,
        lightcurves_dir=tmp_path / "lightcurves",
        raw_dir=tmp_path / "raw",
        tensors_dir=tmp_path / "tensors_x",
    )
    d = case.to_dict()
    required = {
        "oid", "source_date", "generated_at", "coordinates",
        "available_data_sources",
        "detection_count", "non_detection_count", "filters_observed",
        "first_mjd", "last_mjd", "time_span_days",
        "classification_metadata", "light_curve_summary",
        "evidence_notes", "candidate_explanations",
        "uncertainty_notes", "recommended_next_checks",
    }
    assert required.issubset(d.keys()), f"missing: {required - set(d.keys())}"


def test_write_casefile_writes_json(tmp_path, fixture_layout, fixture_lightcurves):
    layout, date = fixture_layout
    oid = _pick_fixture_oid(fixture_lightcurves)
    case = build_casefile(
        oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x",
    )
    out_dir = tmp_path / "casefiles"
    path = write_casefile(case, output_dir=out_dir)
    assert path.exists() and path.suffix == ".json"
    parsed = json.loads(path.read_text())
    assert parsed["oid"] == oid


def test_missing_raw_lightcurve_handled_gracefully(tmp_path):
    """If the raw JSON file is absent, build_casefile must still produce a CaseFile
    from whatever Parquet rows are present, and record what was missing."""
    date = "2026-01-01"
    lc_dir = tmp_path / "lightcurves"
    lc_dir.mkdir()
    df = pd.DataFrame([{
        "oid": "ZTFsynth1", "mjd": 60000.0, "fid": 1, "magpsf": 19.0, "sigmapsf": 0.1,
        "obj_meanra": 100.0, "obj_meandec": 20.0,
        "obj_class": None, "obj_classifier": None, "obj_probability": None,
        "obj_firstmjd": 60000.0, "obj_lastmjd": 60000.0, "obj_ndet": 1,
    }])
    df.to_parquet(lc_dir / f"{date}.parquet", index=False)

    case = build_casefile(
        "ZTFsynth1", date,
        lightcurves_dir=lc_dir,
        raw_dir=tmp_path / "raw_does_not_exist",
        tensors_dir=tmp_path / "tensors_does_not_exist",
    )
    assert case.available_data_sources == ["parquet_detections"]
    assert case.non_detection_count == 0
    assert case.detection_count == 1
    # Uncertainty notes must reflect missing data
    assert any("tensor manifest" in n.lower() for n in case.uncertainty_notes)


def test_unclassified_object_still_has_placeholder_candidates(fixture_layout, fixture_lightcurves):
    """No classifier label ⇒ candidate_explanations still returns placeholders, all honest."""
    layout, date = fixture_layout
    oid = _pick_fixture_oid(fixture_lightcurves)
    case = build_casefile(
        oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x",
    )
    placeholders = [c for c in case.candidate_explanations if c.status == "placeholder_unfitted"]
    assert len(placeholders) >= 1
    for c in case.candidate_explanations:
        # honesty guardrail: every candidate carries mismatch_notes
        assert c.mismatch_notes


def test_phase_2b_emits_no_fitted_statuses(fixture_layout, fixture_lightcurves):
    """The schema allows only `external_label` and `placeholder_unfitted` in Phase 2B."""
    layout, date = fixture_layout
    oid = _pick_fixture_oid(fixture_lightcurves)
    case = build_casefile(
        oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x",
    )
    for c in case.candidate_explanations:
        assert c.status in {"placeholder_unfitted", "external_label"}, (
            f"Phase 2B must not emit a {c.status!r} candidate."
        )


def test_no_network_imports_in_casefile_module():
    """Catch accidental introduction of network-dependent imports in the casefile package."""
    import argus.casefile.build as build_mod
    import argus.casefile.summarize as sum_mod
    import argus.casefile.schema as schema_mod
    src = (
        open(build_mod.__file__, encoding="utf-8").read()
        + open(sum_mod.__file__, encoding="utf-8").read()
        + open(schema_mod.__file__, encoding="utf-8").read()
    )
    for forbidden in ("import requests", "from requests", "urllib.request",
                      "import urllib", "import httpx", "from httpx",
                      "from alerce", "import alerce"):
        assert forbidden not in src, (
            f"casefile package must not import {forbidden!r} — Phase 2B is offline."
        )


def test_missing_date_raises_clear_error(tmp_path):
    with pytest.raises(FileNotFoundError):
        build_casefile(
            "ZTFwhatever", "1900-01-01",
            lightcurves_dir=tmp_path, raw_dir=tmp_path, tensors_dir=tmp_path,
        )


def test_filters_observed_matches_data(fixture_layout, fixture_lightcurves):
    layout, date = fixture_layout
    oid = _pick_fixture_oid(fixture_lightcurves)
    case = build_casefile(
        oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x",
    )
    # only g, r are valid filter labels in our schema
    assert set(case.filters_observed).issubset({"g", "r"})
    assert case.filters_observed == sorted(case.filters_observed)
