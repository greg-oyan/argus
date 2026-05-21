"""Phase 2J Markdown case-file export tests."""
from __future__ import annotations

from pathlib import Path

from argus.casefile.markdown import (
    markdown_path_for_json,
    render_casefile_markdown,
    write_casefile_markdown,
)
from argus.casefile.schema import (
    CaseFile,
    ComparisonSummary,
    CrossSurveyContext,
    EvidenceNarrative,
    EvidenceSection,
    FeatureSummary,
    FilterStats,
    LightCurveSummary,
    ModelComparison,
)
from scripts import build_casefile as cli_mod


def _full_case() -> CaseFile:
    summary = LightCurveSummary(
        n_detections=12,
        n_non_detections=3,
        filters_observed=["g", "r"],
        first_mjd=60000.0,
        last_mjd=60100.0,
        time_span_days=100.0,
        most_recent_detection_mjd=60100.0,
        longest_detection_gap_days=12.0,
        per_filter=[
            FilterStats(
                filter="r",
                n_detections=10,
                n_non_detections=2,
                first_mjd=60000.0,
                last_mjd=60100.0,
                mag_min=18.9,
                mag_max=20.1,
                mag_median=19.4,
                delta_mag=1.2,
            )
        ],
    )
    return CaseFile(
        oid="ZTFtest",
        source_date="2026-05-21",
        generated_at="2026-05-21T00:00:00+00:00",
        coordinates={"ra": 123.45, "dec": -12.34},
        available_data_sources=["parquet_detections", "raw_lightcurve_json"],
        detection_count=12,
        non_detection_count=3,
        filters_observed=["g", "r"],
        first_mjd=60000.0,
        last_mjd=60100.0,
        time_span_days=100.0,
        classification_metadata={"class": "External broker label", "probability": 0.7},
        light_curve_summary=summary,
        evidence_notes=["Object has local detections on file."],
        candidate_explanations=[],
        uncertainty_notes=["No spectroscopic information is on file."],
        recommended_next_checks=["Inspect residual structure visually."],
        model_comparisons=[
            ModelComparison(
                name="Gaussian bump (r-band)",
                model_type="gaussian_bump",
                filter_used="r",
                status="fitted_baseline",
                parameters={"peak_mjd": 60050.0},
                fit_metrics={"reduced_chi2": 3.2, "rmse": 0.2},
                residual_summary=["The fit leaves residual structure."],
                interpretation="The comparator found residual structure after fitting.",
                limitations=["Phenomenological comparison only."],
            )
        ],
        comparison_summary=ComparisonSummary(
            headline="Not well explained by a single smooth bump",
            summary="The comparators provide descriptive evidence for further review.",
            caveat="This is not a physical classification.",
            recommended_next_check="Inspect residual structure visually.",
        ),
        feature_summary=FeatureSummary(
            source="light-curve",
            band="r",
            status="computed",
            n_points=10,
            features={"amplitude": 0.6, "median": 19.4},
            interpretation="Descriptive light-curve features were computed.",
            caveat="Feature values are descriptive summaries only.",
        ),
        cross_survey_context=CrossSurveyContext(
            status="queried",
            coordinates={"ra": 123.45, "dec": -12.34},
            search_radius_arcsec=5.0,
            sources=[
                {
                    "catalog": "SIMBAD",
                    "status": "matched",
                    "nearest_match": {
                        "name": "Catalog object",
                        "separation_arcsec": 1.2,
                        "raw_type_label": "external label",
                    },
                    "match_count": 1,
                }
            ],
            interpretation="SIMBAD reports external catalog context only.",
            caveat="Catalog context is external evidence only.",
        ),
        evidence_narrative=EvidenceNarrative(
            headline="Complex light-curve behavior with limited physical interpretation",
            short_summary="The object is not well explained by a single smooth bump.",
            evidence_sections=[
                EvidenceSection(
                    title="Baseline transient-shape check",
                    status="not_well_fit",
                    summary="The Gaussian bump comparator left residual structure.",
                )
            ],
            what_argus_can_say=["The current evidence supports further review."],
            what_argus_cannot_say=["Argus does not identify the object type."],
            recommended_next_checks=["Inspect residual structure visually."],
            caveat="This narrative summarizes evidence layers. It is not a physical classification.",
        ),
    )


def test_markdown_renderer_with_full_casefile():
    text = render_casefile_markdown(_full_case())

    assert text.startswith("# Argus Case File: ZTFtest")
    assert "## Evidence Narrative" in text
    assert "Complex light-curve behavior" in text
    assert "## Feature Summary" in text
    assert "amplitude" in text
    assert "## Comparison Summary" in text
    assert "## Model Comparisons" in text
    assert "Gaussian bump (r-band)" in text
    assert "## Cross-Survey Context" in text
    assert "SIMBAD" in text
    assert "## Uncertainty and Next Checks" in text


def test_markdown_renderer_handles_missing_optional_fields():
    case = _full_case()
    case.evidence_narrative = None
    case.feature_summary = None
    case.comparison_summary = None
    case.cross_survey_context = None
    case.model_comparisons = []
    case.classification_metadata = None

    text = render_casefile_markdown(case)

    assert "Evidence narrative is not present" in text
    assert "Feature summary is not present" in text
    assert "Comparison summary is not present" in text
    assert "No model comparisons are present" in text
    assert "Cross-survey context is not present" in text


def test_write_casefile_markdown_uses_sibling_casefile_path(tmp_path):
    json_path = tmp_path / "ZTFtest.json"
    json_path.write_text("{}")

    path = write_casefile_markdown(_full_case(), json_path=json_path)

    assert path == tmp_path / "ZTFtest.casefile.md"
    assert path.exists()
    assert path.read_text(encoding="utf-8").startswith("# Argus Case File: ZTFtest")


def test_markdown_path_for_casefile_json_name(tmp_path):
    json_path = tmp_path / "ZTFtest.casefile.json"

    assert markdown_path_for_json(json_path) == tmp_path / "ZTFtest.casefile.md"


def test_cli_writes_markdown_when_flag_is_passed(tmp_path, monkeypatch):
    case = _full_case()
    json_path = tmp_path / "ZTFtest.json"

    monkeypatch.setattr(cli_mod, "build_casefile", lambda *args, **kwargs: case)
    monkeypatch.setattr(cli_mod, "write_casefile", lambda built_case: json_path)

    status = cli_mod.main(["--date", "2026-05-21", "--oid", "ZTFtest", "--write-markdown"])

    assert status == 0
    assert (tmp_path / "ZTFtest.casefile.md").exists()


def test_cli_does_not_write_markdown_without_flag(tmp_path, monkeypatch):
    case = _full_case()
    json_path = tmp_path / "ZTFtest.json"

    monkeypatch.setattr(cli_mod, "build_casefile", lambda *args, **kwargs: case)
    monkeypatch.setattr(cli_mod, "write_casefile", lambda built_case: json_path)

    status = cli_mod.main(["--date", "2026-05-21", "--oid", "ZTFtest"])

    assert status == 0
    assert not (tmp_path / "ZTFtest.casefile.md").exists()


def test_markdown_output_avoids_forbidden_physical_claims():
    text = render_casefile_markdown(_full_case()).lower()
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
        assert phrase not in text, f"markdown overclaims: {phrase!r}"
