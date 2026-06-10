"""Deterministic Markdown rendering for Argus case files."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from argus.casefile.schema import CaseFile
from argus.config import CASEFILES_DIR


def _field(obj: Any, name: str, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def _plain(value: Any) -> str:
    if value is None:
        return "Not available."
    if isinstance(value, float):
        return f"{value:.6g}"
    if isinstance(value, (int, bool)):
        return str(value)
    if isinstance(value, str):
        return value.strip() if value.strip() else "Not available."
    if isinstance(value, dict):
        return json.dumps(value, sort_keys=True, default=str)
    if isinstance(value, (list, tuple)):
        return json.dumps(value, sort_keys=True, default=str)
    return str(value)


def _line_item(label: str, value: Any) -> str:
    return f"- **{label}:** {_plain(value)}"


def _bullet_lines(items: list[Any]) -> list[str]:
    if not items:
        return ["- None recorded."]
    return [f"- {_plain(item)}" for item in items]


def _dict_lines(values: dict[str, Any] | None) -> list[str]:
    if not values:
        return ["- None recorded."]
    lines: list[str] = []
    for key in sorted(values):
        lines.append(_line_item(str(key), values[key]))
    return lines


def _section(title: str, lines: list[str]) -> list[str]:
    out = [f"## {title}", ""]
    out.extend(lines or ["Not available."])
    out.append("")
    return out


def _figure_alt_text(path: Path) -> str:
    name = path.name.lower()
    if "residual" in name:
        return "Gaussian comparator residuals"
    if "lightcurve" in name or "light-curve" in name:
        return "Observed light curve"
    return "Case-file figure"


def _figure_caption(path: Path) -> str | None:
    name = path.name.lower()
    if "residual" in name:
        return (
            "Gaussian comparator residuals show where the simple bump model "
            "under- or over-predicts the observed magnitudes."
        )
    return None


def _render_visual_summary(figure_paths: list[Path] | None) -> list[str]:
    if not figure_paths:
        return []
    lines: list[str] = []
    for path in figure_paths:
        lines.append(f"![{_figure_alt_text(path)}]({path.name})")
        caption = _figure_caption(path)
        if caption:
            lines.append("")
            lines.append(caption)
        lines.append("")
    return _section("Visual Summary", lines)


def _render_evidence_narrative(narrative: Any) -> list[str]:
    if narrative is None:
        return _section("Evidence Narrative", ["Evidence narrative is not present in this case file."])

    lines = [
        _line_item("Headline", _field(narrative, "headline")),
        "",
        _plain(_field(narrative, "short_summary")),
        "",
        "### Evidence Sections",
        "",
    ]
    sections = _as_list(_field(narrative, "evidence_sections"))
    if not sections:
        lines.append("- None recorded.")
    else:
        for item in sections:
            title = _field(item, "title", "Evidence section")
            status = _field(item, "status", "unknown")
            summary = _field(item, "summary")
            lines.append(f"- **{_plain(title)}** (`{_plain(status)}`): {_plain(summary)}")

    lines.extend(["", "### What Argus Can Say", ""])
    lines.extend(_bullet_lines(_as_list(_field(narrative, "what_argus_can_say"))))
    lines.extend(["", "### What Argus Cannot Say", ""])
    lines.extend(_bullet_lines(_as_list(_field(narrative, "what_argus_cannot_say"))))
    lines.extend(["", "### Recommended Next Checks", ""])
    lines.extend(_bullet_lines(_as_list(_field(narrative, "recommended_next_checks"))))
    lines.extend(["", _line_item("Caveat", _field(narrative, "caveat"))])
    return _section("Evidence Narrative", lines)


def _render_object_summary(case: CaseFile) -> list[str]:
    coordinates = case.coordinates or {}
    coord_text = (
        f"RA={_plain(coordinates.get('ra'))}, Dec={_plain(coordinates.get('dec'))}"
        if coordinates else "Not available."
    )
    return _section("Object Summary", [
        _line_item("Object ID", case.oid),
        _line_item("Source date", case.source_date),
        _line_item("Available data sources", ", ".join(case.available_data_sources) if case.available_data_sources else None),
        _line_item("Coordinates", coord_text),
        _line_item("Detections", case.detection_count),
        _line_item("Non-detections", case.non_detection_count),
        _line_item("Filters observed", ", ".join(case.filters_observed) if case.filters_observed else None),
        _line_item("First MJD", case.first_mjd),
        _line_item("Last MJD", case.last_mjd),
        _line_item("Time span days", case.time_span_days),
        _line_item("Schema version", case.schema_version),
    ])


def _render_classification_metadata(metadata: dict[str, Any] | None) -> list[str]:
    if not metadata:
        return _section("Classification Metadata", [
            "No broker or catalog classification metadata is attached to this case file.",
            "",
            "Any external labels shown here are metadata only, not Argus conclusions.",
        ])
    lines = _dict_lines(metadata)
    lines.extend(["", "External labels are metadata only, not Argus conclusions."])
    return _section("Classification Metadata", lines)


def _render_light_curve_summary(summary: Any) -> list[str]:
    if summary is None:
        return _section("Light-Curve Summary", ["Light-curve summary is not present."])

    lines = [
        _line_item("Detections", _field(summary, "n_detections")),
        _line_item("Non-detections", _field(summary, "n_non_detections")),
        _line_item("Filters observed", ", ".join(_as_list(_field(summary, "filters_observed")))),
        _line_item("First MJD", _field(summary, "first_mjd")),
        _line_item("Last MJD", _field(summary, "last_mjd")),
        _line_item("Time span days", _field(summary, "time_span_days")),
        _line_item("Most recent detection MJD", _field(summary, "most_recent_detection_mjd")),
        _line_item("Longest detection gap days", _field(summary, "longest_detection_gap_days")),
        "",
        "### Per-Filter Summary",
        "",
    ]
    per_filter = _as_list(_field(summary, "per_filter"))
    if not per_filter:
        lines.append("- None recorded.")
    else:
        for item in per_filter:
            label = _field(item, "filter", "filter")
            details = [
                f"detections={_plain(_field(item, 'n_detections'))}",
                f"non_detections={_plain(_field(item, 'n_non_detections'))}",
                f"mag_min={_plain(_field(item, 'mag_min'))}",
                f"mag_max={_plain(_field(item, 'mag_max'))}",
                f"delta_mag={_plain(_field(item, 'delta_mag'))}",
            ]
            lines.append(f"- **{_plain(label)}:** {', '.join(details)}")
    return _section("Light-Curve Summary", lines)


def _render_feature_summary(feature_summary: Any) -> list[str]:
    if feature_summary is None:
        return _section("Feature Summary", ["Feature summary is not present."])
    lines = [
        _line_item("Source", _field(feature_summary, "source")),
        _line_item("Band", _field(feature_summary, "band")),
        _line_item("Status", _field(feature_summary, "status")),
        _line_item("Usable points", _field(feature_summary, "n_points")),
        "",
        "### Feature Values",
        "",
    ]
    lines.extend(_dict_lines(_field(feature_summary, "features") or {}))
    quality_notes = _as_list(_field(feature_summary, "feature_quality_notes"))
    if quality_notes:
        lines.extend(["", "### Feature Quality Notes", ""])
        lines.extend(_bullet_lines(quality_notes))
    diagnostics = _field(feature_summary, "feature_diagnostics") or {}
    if diagnostics:
        lines.extend(["", "### Feature Diagnostics", ""])
        lines.extend(_dict_lines(diagnostics))
    lines.extend([
        "",
        _line_item("Interpretation", _field(feature_summary, "interpretation")),
        _line_item("Caveat", _field(feature_summary, "caveat")),
    ])
    return _section("Feature Summary", lines)


def _render_anomaly_assessment(assessment: Any) -> list[str]:
    if assessment is None:
        return _section("Evidence Triage Assessment", [
            "The anomaly_assessment field is not present in this case file.",
        ])

    lines = [
        (
            "`anomaly_assessment` is an evidence triage summary inside this case file. "
            "It summarizes available signals for review; it is not an object-identity claim."
        ),
        "",
        _line_item("Status", _field(assessment, "status")),
        _line_item("Score", _field(assessment, "score")),
        _line_item("Label", _field(assessment, "label")),
        "",
        "### Drivers",
        "",
    ]
    lines.extend(_bullet_lines(_as_list(_field(assessment, "drivers"))))
    lines.extend(["", "### Cautions", ""])
    lines.extend(_bullet_lines(_as_list(_field(assessment, "cautions"))))
    lines.extend(["", "### Input Summary", ""])
    lines.extend(_dict_lines(_field(assessment, "input_summary") or {}))
    lines.extend(["", _line_item("Caveat", _field(assessment, "caveat"))])
    return _section("Evidence Triage Assessment", lines)


def _render_comparison_summary(summary: Any) -> list[str]:
    if summary is None:
        return _section("Comparison Summary", ["Comparison summary is not present."])
    return _section("Comparison Summary", [
        _line_item("Headline", _field(summary, "headline")),
        "",
        _plain(_field(summary, "summary")),
        "",
        _line_item("Caveat", _field(summary, "caveat")),
        _line_item("Recommended next check", _field(summary, "recommended_next_check")),
    ])


def _render_model_comparisons(comparisons: list[Any]) -> list[str]:
    lines: list[str] = []
    if not comparisons:
        return _section("Model Comparisons", ["No model comparisons are present."])

    for comparison in comparisons:
        lines.extend([
            f"### {_plain(_field(comparison, 'name', 'Model comparison'))}",
            "",
            _line_item("Model type", _field(comparison, "model_type")),
            _line_item("Filter used", _field(comparison, "filter_used")),
            _line_item("Status", _field(comparison, "status")),
            "",
            "**Parameters**",
            "",
        ])
        lines.extend(_dict_lines(_field(comparison, "parameters") or {}))
        lines.extend(["", "**Fit Metrics**", ""])
        lines.extend(_dict_lines(_field(comparison, "fit_metrics") or {}))
        lines.extend(["", "**Residual Summary**", ""])
        lines.extend(_bullet_lines(_as_list(_field(comparison, "residual_summary"))))
        lines.extend([
            "",
            _line_item("Interpretation", _field(comparison, "interpretation")),
            "",
        ])
    return _section("Model Comparisons", lines)


def _render_cross_survey_context(context: Any) -> list[str]:
    if context is None:
        return _section("Cross-Survey Context", ["Cross-survey context is not present."])
    lines = [
        _line_item("Status", _field(context, "status")),
        _line_item("Coordinates", _field(context, "coordinates")),
        _line_item("Search radius arcsec", _field(context, "search_radius_arcsec")),
        "",
        "### Sources",
        "",
    ]
    sources = _as_list(_field(context, "sources"))
    if not sources:
        lines.append("- None recorded.")
    else:
        for source in sources:
            catalog = _field(source, "catalog", "Catalog")
            status = _field(source, "status", "unknown")
            match_count = _field(source, "match_count")
            nearest = _field(source, "nearest_match")
            lines.append(
                f"- **{_plain(catalog)}** (`{_plain(status)}`): "
                f"match_count={_plain(match_count)}; nearest_match={_plain(nearest)}"
            )
    lines.extend([
        "",
        _line_item("Interpretation", _field(context, "interpretation")),
        _line_item("Caveat", _field(context, "caveat")),
    ])
    return _section("Cross-Survey Context", lines)


def _render_uncertainty_and_next_checks(case: CaseFile) -> list[str]:
    lines = ["### Evidence Notes", ""]
    lines.extend(_bullet_lines(case.evidence_notes))
    lines.extend(["", "### Uncertainty Notes", ""])
    lines.extend(_bullet_lines(case.uncertainty_notes))
    lines.extend(["", "### Recommended Next Checks", ""])
    lines.extend(_bullet_lines(case.recommended_next_checks))
    return _section("Uncertainty and Next Checks", lines)


def render_casefile_markdown(
    case: CaseFile,
    *,
    figure_paths: list[Path] | None = None,
) -> str:
    """Render a CaseFile as presentation-ready Markdown."""
    lines: list[str] = [f"# Argus Case File: {case.oid}", ""]
    lines.extend(_render_visual_summary(figure_paths))
    lines.extend(_render_evidence_narrative(case.evidence_narrative))
    lines.extend(_render_object_summary(case))
    lines.extend(_render_classification_metadata(case.classification_metadata))
    lines.extend(_render_light_curve_summary(case.light_curve_summary))
    lines.extend(_render_feature_summary(case.feature_summary))
    lines.extend(_render_anomaly_assessment(case.anomaly_assessment))
    lines.extend(_render_comparison_summary(case.comparison_summary))
    lines.extend(_render_model_comparisons(case.model_comparisons))
    lines.extend(_render_cross_survey_context(case.cross_survey_context))
    lines.extend(_render_uncertainty_and_next_checks(case))
    return "\n".join(lines).rstrip() + "\n"


def markdown_path_for_json(json_path: Path) -> Path:
    """Return the sibling `.casefile.md` path for a case-file JSON path."""
    if json_path.name.endswith(".casefile.json"):
        return json_path.with_suffix(".md")
    return json_path.with_name(f"{json_path.stem}.casefile.md")


def write_casefile_markdown(
    case: CaseFile,
    *,
    json_path: Path | None = None,
    output_dir: Path | None = None,
    figure_paths: list[Path] | None = None,
) -> Path:
    """Write a Markdown report next to the JSON case file or into output_dir."""
    if json_path is not None:
        path = markdown_path_for_json(json_path)
    else:
        out = output_dir or CASEFILES_DIR
        path = out / f"{case.oid}.casefile.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    existing_figures: list[Path] = []
    for figure_path in figure_paths or []:
        if figure_path is None:
            continue
        path_obj = Path(figure_path)
        if path_obj.exists():
            existing_figures.append(path_obj)
    path.write_text(
        render_casefile_markdown(case, figure_paths=existing_figures),
        encoding="utf-8",
    )
    return path
