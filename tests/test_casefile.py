"""Phase 2B case-file tests. Offline; uses tests/fixtures/ only."""
from __future__ import annotations
import json

import pandas as pd
import pytest

from argus.casefile.build import build_casefile, write_casefile
from argus.casefile.schema import CaseFile, FeatureSummary, ModelComparison
from argus.casefile.summarize import (
    build_comparison_summary, build_evidence_narrative, candidate_explanations,
    evidence_notes, recommended_next_checks, summarize_light_curve,
    uncertainty_notes,
)
from argus.ingest.storage import flatten_to_dataframe
from argus.compare import sncosmo_templates as snc_mod
from scripts import build_casefile as cli_mod


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
        "light_curve_points", "comparison_summary", "feature_summary",
        "anomaly_assessment", "cross_survey_context", "evidence_narrative",
    }
    assert required.issubset(d.keys()), f"missing: {required - set(d.keys())}"
    assert isinstance(d["light_curve_points"], list)
    assert len(d["light_curve_points"]) == d["detection_count"]
    if d["light_curve_points"]:
        assert {"mjd", "band", "mag", "magerr"}.issubset(d["light_curve_points"][0].keys())
    assert d["comparison_summary"]["headline"]
    assert d["comparison_summary"]["summary"]
    assert d["comparison_summary"]["caveat"]
    assert d["comparison_summary"]["recommended_next_check"]
    assert d["feature_summary"]["source"] == "light-curve"
    assert d["feature_summary"]["band"] == "r"
    assert d["feature_summary"]["status"]
    assert isinstance(d["feature_summary"]["features"], dict)
    assert d["anomaly_assessment"]["status"]
    assert d["anomaly_assessment"]["label"] in {"low", "medium", "high", "unknown"}
    assert isinstance(d["anomaly_assessment"]["score"], int)
    assert d["anomaly_assessment"]["drivers"]
    assert d["anomaly_assessment"]["caveat"]
    assert d["cross_survey_context"]["status"] == "not_requested"
    assert "not requested" in d["cross_survey_context"]["interpretation"]
    assert d["evidence_narrative"]["headline"]
    assert d["evidence_narrative"]["short_summary"]
    assert d["evidence_narrative"]["evidence_sections"]
    assert d["evidence_narrative"]["what_argus_can_say"]
    assert d["evidence_narrative"]["what_argus_cannot_say"]
    assert d["evidence_narrative"]["recommended_next_checks"]
    assert d["evidence_narrative"]["caveat"]
    cross_section = next(
        section for section in d["evidence_narrative"]["evidence_sections"]
        if section["title"] == "Cross-survey context"
    )
    assert cross_section["status"] == "not_requested"


def test_uncertainty_notes_use_current_cross_survey_context_wording(fixture_layout, fixture_lightcurves):
    layout, date = fixture_layout
    oid = _pick_fixture_oid(fixture_lightcurves)
    case = build_casefile(
        oid, date,
        lightcurves_dir=layout / "lightcurves",
        raw_dir=layout / "raw",
        tensors_dir=layout / "tensors_x",
    )
    text = " ".join(case.uncertainty_notes)
    assert "cross_survey_context" in text
    assert "Phase 2B" not in text
    assert "SIMBAD/NED/Gaia cross-match" not in text


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


def test_cli_accepts_object_id_alias_and_exact_output_path(tmp_path, monkeypatch):
    case = CaseFile(
        oid="ZTFalias",
        source_date="2026-01-01",
        generated_at="2026-01-01T00:00:00+00:00",
        coordinates=None,
        available_data_sources=["parquet_detections"],
        detection_count=0,
        non_detection_count=0,
        filters_observed=[],
        first_mjd=None,
        last_mjd=None,
        time_span_days=None,
        classification_metadata=None,
        light_curve_summary=None,
        evidence_notes=[],
        candidate_explanations=[],
        uncertainty_notes=[],
        recommended_next_checks=[],
    )

    def fake_build_casefile(oid, date, **kwargs):
        assert oid == "ZTFalias"
        assert date == "2026-01-01"
        return case

    monkeypatch.setattr(cli_mod, "build_casefile", fake_build_casefile)

    out_path = tmp_path / "reports" / "ZTFalias.casefile.json"
    status = cli_mod.main([
        "--date", "2026-01-01",
        "--object-id", "ZTFalias",
        "--out", str(out_path),
        "--write-markdown",
        "--write-html",
    ])

    assert status == 0
    assert out_path.exists()
    assert (tmp_path / "reports" / "ZTFalias.casefile.md").exists()
    assert (tmp_path / "reports" / "ZTFalias.casefile.html").exists()
    assert json.loads(out_path.read_text(encoding="utf-8"))["oid"] == "ZTFalias"


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


def test_casefile_build_handles_missing_sncosmo_dependency(tmp_path, monkeypatch):
    """Even with redshift + multi-band data, absent sncosmo must not crash builds."""
    def fail_import():
        raise ImportError("forced missing sncosmo")

    monkeypatch.setattr(snc_mod, "_import_sncosmo", fail_import)

    date = "2026-01-01"
    lc_dir = tmp_path / "lightcurves"
    lc_dir.mkdir()
    rows = []
    for fid in (1, 2):
        for i in range(6):
            rows.append({
                "oid": "ZTFsynth-sncosmo",
                "mjd": 60000.0 + i * 2.0 + (0.1 if fid == 1 else 0.0),
                "fid": fid,
                "magpsf": 20.0 - 0.05 * i + 0.03 * fid,
                "sigmapsf": 0.05,
                "redshift": 0.05,
                "obj_meanra": 100.0,
                "obj_meandec": 20.0,
                "obj_class": None,
                "obj_classifier": None,
                "obj_probability": None,
                "obj_firstmjd": 60000.0,
                "obj_lastmjd": 60010.0,
                "obj_ndet": 12,
            })
    pd.DataFrame(rows).to_parquet(lc_dir / f"{date}.parquet", index=False)

    case = build_casefile(
        "ZTFsynth-sncosmo", date,
        lightcurves_dir=lc_dir,
        raw_dir=tmp_path / "raw_does_not_exist",
        tensors_dir=tmp_path / "tensors_does_not_exist",
    )
    sn_probe = [
        mc for mc in case.model_comparisons
        if mc.model_type == "sncosmo_template_probe"
    ][0]
    assert sn_probe.status == "dependency_unavailable"
    assert sn_probe.parameters is None
    assert "sncosmo" in sn_probe.interpretation


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
    import argus.casefile.assessment as assess_mod
    import argus.casefile.build as build_mod
    import argus.casefile.summarize as sum_mod
    import argus.casefile.schema as schema_mod
    src = (
        open(assess_mod.__file__, encoding="utf-8").read()
        + open(build_mod.__file__, encoding="utf-8").read()
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


def _synthetic_comparison(
    model_type: str,
    status: str,
    *,
    metrics: dict | None = None,
    residual_summary: list[str] | None = None,
) -> ModelComparison:
    return ModelComparison(
        name=model_type,
        model_type=model_type,
        filter_used="r",
        status=status,
        parameters={} if status == "fitted_baseline" else None,
        fit_metrics=metrics,
        residual_summary=residual_summary or [],
        interpretation="synthetic comparator output",
        limitations=["Phenomenological - not a physical model."],
    )


def _gaussian_comparison(
    status: str = "fitted_baseline",
    *,
    reduced_chi2: float | None = 1.1,
    n_points: int = 20,
    residual_summary: list[str] | None = None,
) -> ModelComparison:
    metrics = {"n_points": n_points, "rmse": 0.05}
    if reduced_chi2 is not None:
        metrics["reduced_chi2"] = reduced_chi2
    return _synthetic_comparison(
        "gaussian_bump",
        status,
        metrics=metrics,
        residual_summary=residual_summary,
    )


def _variability_comparison(
    status: str = "computed",
    *,
    behavior_hint: str = "single_smooth_or_monotonic",
    material: bool | None = False,
    n_points: int = 20,
    extrema: int = 1,
) -> ModelComparison:
    metrics = {
        "n_points": n_points,
        "behavior_hint": behavior_hint,
        "local_extrema_count_after_smoothing": extrema,
        "variability_materially_larger_than_errors": material,
    }
    return _synthetic_comparison("variability_texture", status, metrics=metrics)


def _sncosmo_comparison(status: str = "missing_required_context") -> ModelComparison:
    return ModelComparison(
        name="sncosmo template probe",
        model_type="sncosmo_template_probe",
        filter_used="multi",
        status=status,
        parameters=None,
        fit_metrics={"n_points": 20},
        residual_summary=[],
        interpretation="synthetic template-family probe output",
        limitations=["Model-family comparison only."],
    )


def _feature_summary(status: str = "computed") -> FeatureSummary:
    return FeatureSummary(
        source="light-curve",
        band="r",
        status=status,
        n_points=20 if status == "computed" else 0,
        features={"amplitude": 0.8} if status == "computed" else {},
        interpretation="Descriptive light-curve features were computed.",
        caveat="Feature values are descriptive summaries only and do not identify the object type.",
    )


def _section_by_title(narrative, title: str):
    return next(section for section in narrative.evidence_sections if section.title == title)


def test_comparison_summary_uses_both_comparators_when_present():
    summary = build_comparison_summary([
        _gaussian_comparison(reduced_chi2=1.2),
        _variability_comparison(),
    ])
    assert summary.headline == "Mostly consistent with a single smooth bump"
    assert "Gaussian bump comparator" in summary.summary
    assert "variability texture comparator" in summary.summary
    assert summary.recommended_next_check


def test_comparison_summary_poor_gaussian_with_variability_texture():
    summary = build_comparison_summary([
        _gaussian_comparison(reduced_chi2=42.0),
        _variability_comparison(
            behavior_hint="repeated_or_irregular",
            material=True,
            extrema=5,
        ),
    ])
    assert summary.headline == "Not well explained by a single smooth bump"
    assert "poor description" in summary.summary
    assert "repeated or irregular" in summary.summary
    assert "more complex than a single clean one-bump event" in summary.summary


def test_comparison_summary_handles_insufficient_gaussian_data():
    summary = build_comparison_summary([
        _gaussian_comparison(status="insufficient_data", reduced_chi2=None, n_points=3),
        _variability_comparison(
            behavior_hint="repeated_or_irregular",
            material=True,
            extrema=4,
        ),
    ])
    assert "insufficient r-band data" in summary.summary
    assert summary.headline == "Shows repeated or irregular variability texture"


def test_comparison_summary_handles_insufficient_variability_data():
    summary = build_comparison_summary([
        _gaussian_comparison(reduced_chi2=1.1),
        _variability_comparison(status="insufficient_data", n_points=2),
    ])
    assert summary.headline == "Comparison evidence is limited"
    assert "repeated or irregular texture could not be assessed" in summary.summary


def test_comparison_summary_handles_missing_model_comparisons():
    summary = build_comparison_summary([])
    assert summary.headline == "Comparison evidence is limited"
    assert summary.summary
    assert summary.caveat
    assert summary.recommended_next_check

    summary_from_none = build_comparison_summary(None)
    assert summary_from_none.headline == "Comparison evidence is limited"


def test_comparison_summary_avoids_forbidden_physical_claims():
    summaries = [
        build_comparison_summary([
            _gaussian_comparison(reduced_chi2=42.0),
            _variability_comparison(
                behavior_hint="repeated_or_irregular",
                material=True,
                extrema=5,
            ),
        ]),
        build_comparison_summary([]),
    ]
    forbidden = (
        "this is a variable star", "this is a supernova", "supernova",
        "this is an agn", "agn", "confirmed transient", "new physics",
        "anomaly confirmed",
    )
    for summary in summaries:
        text = " ".join([
            summary.headline,
            summary.summary,
            summary.caveat,
            summary.recommended_next_check,
        ]).lower()
        for phrase in forbidden:
            assert phrase not in text, f"comparison_summary overclaims: {phrase!r}"


def test_evidence_narrative_full_stack_present():
    narrative = build_evidence_narrative(
        model_comparisons=[
            _gaussian_comparison(reduced_chi2=42.0),
            _variability_comparison(
                behavior_hint="repeated_or_irregular",
                material=True,
                extrema=5,
            ),
            _sncosmo_comparison(),
        ],
        comparison_summary=build_comparison_summary([
            _gaussian_comparison(reduced_chi2=42.0),
            _variability_comparison(
                behavior_hint="repeated_or_irregular",
                material=True,
                extrema=5,
            ),
        ]),
        feature_summary=_feature_summary(),
        cross_survey_context={"status": "queried"},
        recommended_next_checks=["Inspect forced photometry around the object."],
        uncertainty_notes=["No spectroscopic information is on file."],
    )
    assert narrative.headline == "Complex light-curve behavior with limited physical interpretation"
    assert len(narrative.evidence_sections) == 5
    assert _section_by_title(narrative, "Baseline transient-shape check").status == "not_well_fit"
    assert _section_by_title(narrative, "Variability texture").status == "complex_variability"
    assert _section_by_title(narrative, "Standard feature summary").status == "computed"
    assert _section_by_title(narrative, "Cross-survey context").status == "queried"
    assert any("not well explained" in item for item in narrative.what_argus_can_say)
    assert any("forced photometry" in item.lower() for item in narrative.recommended_next_checks)


def test_evidence_narrative_handles_missing_feature_summary():
    narrative = build_evidence_narrative(
        model_comparisons=[
            _gaussian_comparison(reduced_chi2=1.2),
            _variability_comparison(),
            _sncosmo_comparison(),
        ],
        comparison_summary=build_comparison_summary([
            _gaussian_comparison(reduced_chi2=1.2),
            _variability_comparison(),
        ]),
        feature_summary=None,
    )
    feature_section = _section_by_title(narrative, "Standard feature summary")
    assert feature_section.status == "missing"
    assert "not present" in feature_section.summary


def test_evidence_narrative_handles_missing_cross_survey_context():
    narrative = build_evidence_narrative(
        model_comparisons=[
            _gaussian_comparison(reduced_chi2=1.2),
            _variability_comparison(),
            _sncosmo_comparison(),
        ],
        comparison_summary=build_comparison_summary([
            _gaussian_comparison(reduced_chi2=1.2),
            _variability_comparison(),
        ]),
        feature_summary=_feature_summary(),
        cross_survey_context=None,
    )
    cross_section = _section_by_title(narrative, "Cross-survey context")
    assert cross_section.status == "not_requested"
    assert "not requested" in cross_section.summary


def test_evidence_narrative_handles_cross_survey_not_requested():
    narrative = build_evidence_narrative(
        model_comparisons=[
            _gaussian_comparison(reduced_chi2=42.0),
            _variability_comparison(
                behavior_hint="repeated_or_irregular",
                material=True,
                extrema=5,
            ),
            _sncosmo_comparison(),
        ],
        comparison_summary=None,
        feature_summary=_feature_summary(),
        cross_survey_context={"status": "not_requested"},
    )
    cross_section = _section_by_title(narrative, "Cross-survey context")
    assert cross_section.status == "not_requested"
    assert "not requested" in cross_section.summary
    assert any(
        "optional dependencies" in check
        for check in narrative.recommended_next_checks
    )


def test_evidence_narrative_handles_cross_survey_dependency_unavailable():
    narrative = build_evidence_narrative(
        model_comparisons=[
            _gaussian_comparison(reduced_chi2=42.0),
            _variability_comparison(
                behavior_hint="repeated_or_irregular",
                material=True,
                extrema=5,
            ),
            _sncosmo_comparison("dependency_unavailable"),
        ],
        comparison_summary=None,
        feature_summary=_feature_summary(),
        cross_survey_context={"status": "dependency_unavailable"},
    )
    cross_section = _section_by_title(narrative, "Cross-survey context")
    assert cross_section.status == "limited"
    assert "limited or unavailable" in cross_section.summary
    assert any(
        "network access and optional dependencies" in check
        for check in narrative.recommended_next_checks
    )


def test_evidence_narrative_summarizes_sncosmo_missing_required_context():
    narrative = build_evidence_narrative(
        model_comparisons=[
            _gaussian_comparison(reduced_chi2=1.2),
            _variability_comparison(),
            _sncosmo_comparison("missing_required_context"),
        ],
        comparison_summary=None,
        feature_summary=_feature_summary(),
    )
    template_section = _section_by_title(narrative, "Template-family probe")
    assert template_section.status == "limited"
    assert "required context" in template_section.summary
    assert "redshift" in template_section.summary


def test_evidence_narrative_handles_missing_sncosmo_template_probe():
    narrative = build_evidence_narrative(
        model_comparisons=[
            _gaussian_comparison(reduced_chi2=1.2),
            _variability_comparison(),
        ],
        comparison_summary=None,
        feature_summary=_feature_summary(),
        cross_survey_context={"status": "not_requested"},
    )
    template_section = _section_by_title(narrative, "Template-family probe")
    assert template_section.status == "missing"
    assert "not present" in template_section.summary
    assert any(
        "template-family probes" in item
        for item in narrative.what_argus_cannot_say
    )


def test_evidence_narrative_handles_insufficient_comparator_data():
    narrative = build_evidence_narrative(
        model_comparisons=[
            _gaussian_comparison(status="insufficient_data", reduced_chi2=None, n_points=2),
            _variability_comparison(status="insufficient_data", n_points=2),
            _sncosmo_comparison("insufficient_data"),
        ],
        comparison_summary=None,
        feature_summary=_feature_summary("insufficient_data"),
    )
    assert narrative.headline == "Evidence is limited by available comparator context"
    assert _section_by_title(narrative, "Baseline transient-shape check").status == "insufficient_data"
    assert _section_by_title(narrative, "Variability texture").status == "insufficient_data"
    assert _section_by_title(narrative, "Standard feature summary").status == "insufficient_data"


def test_evidence_narrative_avoids_forbidden_physical_claims():
    narrative = build_evidence_narrative(
        model_comparisons=[
            _gaussian_comparison(reduced_chi2=42.0),
            _variability_comparison(
                behavior_hint="repeated_or_irregular",
                material=True,
                extrema=5,
            ),
            _sncosmo_comparison("missing_required_context"),
        ],
        comparison_summary=build_comparison_summary([
            _gaussian_comparison(reduced_chi2=42.0),
            _variability_comparison(
                behavior_hint="repeated_or_irregular",
                material=True,
                extrema=5,
            ),
        ]),
        feature_summary=_feature_summary(),
    )
    text = json.dumps(narrative, default=lambda obj: obj.__dict__).lower()
    forbidden = (
        "this is a variable star",
        "this is a supernova",
        "this is an agn",
        "confirmed transient",
        "new physics",
        "anomaly confirmed",
        "discovery",
        "classification confirmed",
    )
    for phrase in forbidden:
        assert phrase not in text, f"evidence_narrative overclaims: {phrase!r}"
