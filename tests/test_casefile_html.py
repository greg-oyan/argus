"""Phase 2L static HTML case-file export tests."""
from __future__ import annotations

from pathlib import Path

from argus.casefile.figures import FigureOutputs
from argus.casefile.html import (
    html_path_for_json,
    render_casefile_html,
    write_casefile_html,
)
from argus.casefile.schema import (
    AnomalyAssessment,
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


def _full_case(*, oid: str = "ZTFhtml") -> CaseFile:
    summary = LightCurveSummary(
        n_detections=8,
        n_non_detections=2,
        filters_observed=["g", "r"],
        first_mjd=60000.0,
        last_mjd=60010.0,
        time_span_days=10.0,
        most_recent_detection_mjd=60010.0,
        longest_detection_gap_days=3.0,
        per_filter=[
            FilterStats(
                filter="r",
                n_detections=5,
                n_non_detections=1,
                first_mjd=60000.0,
                last_mjd=60010.0,
                mag_min=19.1,
                mag_max=20.2,
                mag_median=19.7,
                delta_mag=1.1,
            )
        ],
    )
    return CaseFile(
        oid=oid,
        source_date="2026-05-21",
        generated_at="2026-05-21T00:00:00+00:00",
        coordinates={"ra": 123.45, "dec": -12.34},
        available_data_sources=["parquet_detections"],
        detection_count=8,
        non_detection_count=2,
        filters_observed=["g", "r"],
        first_mjd=60000.0,
        last_mjd=60010.0,
        time_span_days=10.0,
        classification_metadata={"class": "External label", "source": "broker metadata"},
        light_curve_summary=summary,
        evidence_notes=["The case file records local detections."],
        candidate_explanations=[],
        uncertainty_notes=["No spectroscopic information is on file."],
        recommended_next_checks=["Inspect residual structure visually."],
        model_comparisons=[
            ModelComparison(
                name="Gaussian bump (r-band)",
                model_type="gaussian_bump",
                filter_used="r",
                status="fitted_baseline",
                parameters={"peak_mjd": 60005.0},
                fit_metrics={"reduced_chi2": 4.0},
                residual_summary=["Residual structure remains visible."],
                interpretation="The comparator found residual structure after fitting.",
                limitations=["Phenomenological comparison only."],
            )
        ],
        comparison_summary=ComparisonSummary(
            headline="Not well explained by a single smooth bump",
            summary="The comparator output supports further review.",
            caveat="This is not a physical classification.",
            recommended_next_check="Inspect residual structure visually.",
        ),
        feature_summary=FeatureSummary(
            source="light-curve",
            band="r",
            status="computed",
            n_points=5,
            features={"amplitude": 0.55, "median": 19.7},
            interpretation="Descriptive light-curve features were computed.",
            caveat="Feature values are descriptive summaries only.",
        ),
        anomaly_assessment=AnomalyAssessment(
            score=6,
            label="high",
            status="available",
            drivers=["Gaussian residual structure supports early review."],
            cautions=["This is deterministic review support only."],
            input_summary={"observation_count": 8, "bands_present": ["g", "r"]},
            caveat="This deterministic assessment supports review triage only.",
        ),
        cross_survey_context=CrossSurveyContext(
            status="not_requested",
            interpretation="Cross-survey catalog context was not requested for this run.",
            caveat="No external catalog query was performed.",
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


def test_html_renderer_with_full_case_file():
    html = render_casefile_html(_full_case())

    assert "<!doctype html>" in html
    assert "Argus Case File: ZTFhtml" in html
    assert "Evidence Narrative" in html
    assert "Object Summary" in html
    assert "Classification Metadata" in html
    assert "Light-Curve Summary" in html
    assert "Feature Summary" in html
    assert "Anomaly Assessment" in html
    assert "Gaussian residual structure supports early review" in html
    assert "Comparison Summary" in html
    assert "Model Comparisons" in html
    assert "Cross-Survey Context" in html
    assert "Uncertainty and Recommended Next Checks" in html
    assert "Schema version" in html
    assert "<script" not in html.lower()


def test_html_renderer_handles_missing_optional_fields():
    case = _full_case()
    case.evidence_narrative = None
    case.feature_summary = None
    case.anomaly_assessment = None
    case.comparison_summary = None
    case.cross_survey_context = None
    case.model_comparisons = []
    case.classification_metadata = None

    html = render_casefile_html(case)

    assert "Evidence narrative is not present" in html
    assert "Feature summary is not present" in html
    assert "Anomaly assessment is not present" in html
    assert "Comparison summary is not present" in html
    assert "No model comparisons are present" in html
    assert "Cross-survey context is not present" in html
    assert "No broker or catalog classification metadata" in html


def test_write_casefile_html_uses_sibling_casefile_path(tmp_path):
    json_path = tmp_path / "ZTFhtml.json"
    json_path.write_text("{}")

    path = write_casefile_html(_full_case(), json_path=json_path)

    assert path == tmp_path / "ZTFhtml.casefile.html"
    assert path.exists()
    assert "Argus Case File: ZTFhtml" in path.read_text(encoding="utf-8")


def test_html_path_for_casefile_json_name(tmp_path):
    json_path = tmp_path / "ZTFhtml.casefile.json"

    assert html_path_for_json(json_path) == tmp_path / "ZTFhtml.casefile.html"


def test_cli_writes_html_when_flag_is_passed(tmp_path, monkeypatch):
    case = _full_case()
    json_path = tmp_path / "ZTFhtml.json"

    monkeypatch.setattr(cli_mod, "build_casefile", lambda *args, **kwargs: case)
    monkeypatch.setattr(cli_mod, "write_casefile", lambda built_case: json_path)

    status = cli_mod.main(["--date", "2026-05-21", "--oid", "ZTFhtml", "--write-html"])

    assert status == 0
    assert (tmp_path / "ZTFhtml.casefile.html").exists()


def test_cli_does_not_write_html_without_flag(tmp_path, monkeypatch):
    case = _full_case()
    json_path = tmp_path / "ZTFhtml.json"

    def fail_write_html(*args, **kwargs):
        raise AssertionError("HTML generation should not run without --write-html")

    monkeypatch.setattr(cli_mod, "build_casefile", lambda *args, **kwargs: case)
    monkeypatch.setattr(cli_mod, "write_casefile", lambda built_case: json_path)
    monkeypatch.setattr(cli_mod, "write_casefile_html", fail_write_html)

    status = cli_mod.main(["--date", "2026-05-21", "--oid", "ZTFhtml"])

    assert status == 0
    assert not (tmp_path / "ZTFhtml.casefile.html").exists()


def test_html_references_figures_only_when_present(tmp_path):
    present = tmp_path / "ZTFhtml.lightcurve.png"
    residual = tmp_path / "ZTFhtml.residuals.png"
    missing = tmp_path / "ZTFhtml.extra.png"
    present.write_bytes(b"\x89PNG\r\n\x1a\n")
    residual.write_bytes(b"\x89PNG\r\n\x1a\n")

    html = render_casefile_html(_full_case(), figure_paths=[present, residual, missing])

    assert "Visual Summary" in html
    assert 'src="ZTFhtml.lightcurve.png"' in html
    assert 'src="ZTFhtml.residuals.png"' in html
    assert "under- or over-predicts" in html
    assert "ZTFhtml.extra.png" not in html


def test_cli_html_references_generated_figures(tmp_path, monkeypatch):
    case = _full_case()
    json_path = tmp_path / "ZTFhtml.json"
    figure_path = tmp_path / "ZTFhtml.lightcurve.png"

    def fake_write_figures(*args, **kwargs):
        figure_path.write_bytes(b"\x89PNG\r\n\x1a\n")
        return FigureOutputs(light_curve=figure_path)

    monkeypatch.setattr(cli_mod, "build_casefile", lambda *args, **kwargs: case)
    monkeypatch.setattr(cli_mod, "write_casefile", lambda built_case: json_path)
    monkeypatch.setattr(cli_mod, "write_casefile_figures", fake_write_figures)

    status = cli_mod.main([
        "--date", "2026-05-21",
        "--oid", "ZTFhtml",
        "--write-figures",
        "--write-html",
    ])

    assert status == 0
    html = (tmp_path / "ZTFhtml.casefile.html").read_text(encoding="utf-8")
    assert 'src="ZTFhtml.lightcurve.png"' in html


def test_html_output_avoids_forbidden_physical_claims():
    html = render_casefile_html(_full_case()).lower()
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
        assert phrase not in html, f"html overclaims: {phrase!r}"


def test_html_escapes_unsafe_text():
    case = _full_case(oid='<script>alert("x")</script>')
    case.evidence_notes = ['Unsafe <img src=x onerror="alert(1)"> text.']

    html = render_casefile_html(case)

    assert '<script>alert("x")</script>' not in html
    assert '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;' in html
    assert '<img src=x' not in html
    assert '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;' in html
