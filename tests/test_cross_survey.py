"""Phase 2H cross-survey context tests. Offline; SIMBAD calls are mocked."""
from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

from argus.context import cross_survey as cs
from scripts import build_casefile as cli_mod


def test_not_requested_cross_survey_context():
    context = cs.build_cross_survey_context(
        {"ra": 123.45, "dec": -12.34},
        include=False,
    )

    assert context.status == "not_requested"
    assert context.sources == []
    assert "not requested" in context.interpretation
    assert "No external catalog query" in context.caveat


def test_cli_flag_triggers_cross_survey_path(monkeypatch):
    calls = {}

    class DummyContext:
        status = "not_requested"

    class DummyCase:
        oid = "ZTFdummy"
        available_data_sources = ["parquet_detections"]
        detection_count = 1
        non_detection_count = 0
        filters_observed = ["r"]
        candidate_explanations = []
        model_comparisons = []
        recommended_next_checks = []
        cross_survey_context = DummyContext()

    def fake_build_casefile(oid, date, **kwargs):
        calls["oid"] = oid
        calls["date"] = date
        calls.update(kwargs)
        return DummyCase()

    def fake_write_casefile(case):
        return Path("dummy.json")

    monkeypatch.setattr(cli_mod, "build_casefile", fake_build_casefile)
    monkeypatch.setattr(cli_mod, "write_casefile", fake_write_casefile)

    status = cli_mod.main([
        "--date", "2026-01-01",
        "--oid", "ZTFdummy",
        "--include-cross-survey-context",
        "--cross-survey-radius-arcsec", "7",
    ])

    assert status == 0
    assert calls["include_cross_survey_context"] is True
    assert calls["cross_survey_radius_arcsec"] == pytest.approx(7.0)


def test_mocked_simbad_match(monkeypatch):
    def fake_query(ra, dec, radius_arcsec, timeout_seconds):
        assert ra == pytest.approx(123.45)
        assert dec == pytest.approx(-12.34)
        assert radius_arcsec == pytest.approx(5.0)
        return [{
            "MAIN_ID": "SIMBAD J123",
            "separation_arcsec": 1.2,
            "OTYPE": "Catalog label",
            "OTYPE_S": "Catalog object type",
        }]

    monkeypatch.setattr(cs, "_query_simbad", fake_query)

    context = cs.query_simbad_context({"ra": 123.45, "dec": -12.34})

    assert context.status == "queried"
    assert context.coordinates == {"ra": 123.45, "dec": -12.34}
    assert context.search_radius_arcsec == pytest.approx(5.0)
    assert context.sources[0]["catalog"] == "SIMBAD"
    assert context.sources[0]["status"] == "matched"
    assert context.sources[0]["match_count"] == 1
    assert context.sources[0]["nearest_match"]["name"] == "SIMBAD J123"
    assert context.sources[0]["nearest_match"]["separation_arcsec"] == pytest.approx(1.2)
    assert "external catalog context only" in context.interpretation


def test_mocked_simbad_no_match(monkeypatch):
    monkeypatch.setattr(cs, "_query_simbad", lambda *args, **kwargs: [])

    context = cs.query_simbad_context({"ra": 10.0, "dec": 20.0})

    assert context.status == "no_match"
    assert context.sources[0]["status"] == "no_match"
    assert context.sources[0]["match_count"] == 0
    assert "No nearby SIMBAD match" in context.interpretation


def test_astroquery_dependency_unavailable(monkeypatch):
    def fake_query(*args, **kwargs):
        raise ImportError("No module named astroquery")

    monkeypatch.setattr(cs, "_query_simbad", fake_query)

    context = cs.query_simbad_context({"ra": 10.0, "dec": 20.0})

    assert context.status == "dependency_unavailable"
    assert context.sources == []
    assert "astroquery is not available" in context.interpretation


def test_simbad_query_exception_returns_query_failed(monkeypatch):
    def fake_query(*args, **kwargs):
        raise RuntimeError("service unavailable")

    monkeypatch.setattr(cs, "_query_simbad", fake_query)

    context = cs.query_simbad_context({"ra": 10.0, "dec": 20.0})

    assert context.status == "query_failed"
    assert context.sources[0]["catalog"] == "SIMBAD"
    assert context.sources[0]["status"] == "query_failed"
    assert "failed" in context.interpretation


def test_simbad_timeout_returns_timeout(monkeypatch):
    def fake_query(*args, **kwargs):
        raise TimeoutError("timed out")

    monkeypatch.setattr(cs, "_query_simbad", fake_query)

    context = cs.query_simbad_context({"ra": 10.0, "dec": 20.0})

    assert context.status == "timeout"
    assert context.sources[0]["status"] == "timeout"
    assert "timed out" in context.interpretation


@pytest.mark.parametrize(
    "coordinates",
    [
        None,
        {},
        {"ra": math.nan, "dec": 20.0},
        {"ra": 10.0, "dec": math.inf},
        {"ra": -1.0, "dec": 20.0},
        {"ra": 361.0, "dec": 20.0},
        {"ra": 10.0, "dec": -91.0},
        {"ra": 10.0, "dec": 91.0},
    ],
)
def test_invalid_or_missing_coordinates_do_not_query(monkeypatch, coordinates):
    def fail_query(*args, **kwargs):
        raise AssertionError("SIMBAD should not be queried for invalid coordinates")

    monkeypatch.setattr(cs, "_query_simbad", fail_query)

    context = cs.query_simbad_context(coordinates)

    assert context.status == "invalid_coordinates"
    assert context.sources == []
    assert "valid sky coordinates" in context.interpretation


def test_cross_survey_output_avoids_forbidden_physical_claims(monkeypatch):
    monkeypatch.setattr(
        cs,
        "_query_simbad",
        lambda *args, **kwargs: [{
            "MAIN_ID": "SIMBAD J123",
            "separation_arcsec": 1.2,
            "OTYPE": "External label",
        }],
    )
    contexts = [
        cs.not_requested_context(),
        cs.query_simbad_context({"ra": 10.0, "dec": 20.0}),
    ]
    forbidden = (
        "this is a variable star",
        "this is a supernova",
        "this is an agn",
        "confirmed transient",
        "new physics",
        "anomaly confirmed",
        "classification confirmed",
    )

    for context in contexts:
        text = json.dumps(context, default=lambda obj: obj.__dict__).lower()
        for phrase in forbidden:
            assert phrase not in text, f"cross_survey_context overclaims: {phrase!r}"
