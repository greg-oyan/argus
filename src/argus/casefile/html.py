"""Static HTML rendering for Argus case files."""
from __future__ import annotations

import json
from html import escape
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
        text = value.strip()
        return text if text else "Not available."
    if isinstance(value, dict):
        return json.dumps(value, sort_keys=True, default=str)
    if isinstance(value, (list, tuple)):
        return json.dumps(value, sort_keys=True, default=str)
    return str(value)


def _h(value: Any) -> str:
    return escape(_plain(value), quote=True)


def _tag(name: str, content: str, *, cls: str | None = None) -> str:
    class_attr = f' class="{escape(cls, quote=True)}"' if cls else ""
    return f"<{name}{class_attr}>{content}</{name}>"


def _section(title: str, body: str) -> str:
    return f'<section class="section">\n<h2>{_h(title)}</h2>\n{body}\n</section>'


def _pill(value: Any) -> str:
    return f'<span class="pill">{_h(value)}</span>'


def _definition_list(items: list[tuple[str, Any]]) -> str:
    rows = []
    for label, value in items:
        rows.append(f"<dt>{_h(label)}</dt><dd>{_h(value)}</dd>")
    return '<dl class="facts">\n' + "\n".join(rows) + "\n</dl>"


def _bullet_list(items: list[Any]) -> str:
    if not items:
        return '<p class="muted">None recorded.</p>'
    return "<ul>\n" + "\n".join(f"<li>{_h(item)}</li>" for item in items) + "\n</ul>"


def _dict_table(values: dict[str, Any] | None) -> str:
    if not values:
        return '<p class="muted">None recorded.</p>'
    rows = []
    for key in sorted(values):
        rows.append(f"<tr><th>{_h(key)}</th><td>{_h(values[key])}</td></tr>")
    return '<table class="kv"><tbody>\n' + "\n".join(rows) + "\n</tbody></table>"


def _figure_alt_text(path: Path) -> str:
    name = path.name.lower()
    if "residual" in name:
        return "Gaussian comparator residuals"
    if "lightcurve" in name or "light-curve" in name:
        return "Observed light curve"
    return "Case-file figure"


def _figure_caption(path: Path) -> str:
    name = path.name.lower()
    if "residual" in name:
        return (
            "Gaussian comparator residuals show where the simple bump model "
            "under- or over-predicts the observed magnitudes."
        )
    return _figure_alt_text(path)


def _existing_figure_paths(figure_paths: list[Path] | None) -> list[Path]:
    paths: list[Path] = []
    for figure_path in figure_paths or []:
        if figure_path is None:
            continue
        path = Path(figure_path)
        if path.exists():
            paths.append(path)
    return paths


def _render_visual_summary(figure_paths: list[Path] | None) -> str:
    paths = _existing_figure_paths(figure_paths)
    if not paths:
        return ""
    figures = []
    for path in paths:
        figures.append(
            '<figure class="figure-card">'
            f'<img src="{escape(path.name, quote=True)}" alt="{_h(_figure_alt_text(path))}">'
            f"<figcaption>{_h(_figure_caption(path))}</figcaption>"
            "</figure>"
        )
    return _section("Visual Summary", '<div class="figure-grid">\n' + "\n".join(figures) + "\n</div>")


def _render_evidence_narrative(narrative: Any) -> str:
    if narrative is None:
        return _section("Evidence Narrative", '<p class="muted">Evidence narrative is not present.</p>')

    sections = _as_list(_field(narrative, "evidence_sections"))
    section_items = []
    for item in sections:
        section_items.append(
            '<li class="evidence-item">'
            f"<strong>{_h(_field(item, 'title', 'Evidence section'))}</strong> "
            f"{_pill(_field(item, 'status', 'unknown'))}"
            f"<p>{_h(_field(item, 'summary'))}</p>"
            "</li>"
        )
    section_html = (
        "<ul class=\"evidence-list\">\n" + "\n".join(section_items) + "\n</ul>"
        if section_items else '<p class="muted">No evidence sections recorded.</p>'
    )
    body = "\n".join([
        f'<p class="headline">{_h(_field(narrative, "headline"))}</p>',
        f'<p class="lede">{_h(_field(narrative, "short_summary"))}</p>',
        "<h3>Evidence Sections</h3>",
        section_html,
        "<h3>What Argus Can Say</h3>",
        _bullet_list(_as_list(_field(narrative, "what_argus_can_say"))),
        "<h3>What Argus Cannot Say</h3>",
        _bullet_list(_as_list(_field(narrative, "what_argus_cannot_say"))),
        "<h3>Recommended Next Checks</h3>",
        _bullet_list(_as_list(_field(narrative, "recommended_next_checks"))),
        f'<p class="caveat"><strong>Caveat:</strong> {_h(_field(narrative, "caveat"))}</p>',
    ])
    return _section("Evidence Narrative", body)


def _render_object_summary(case: CaseFile) -> str:
    coords = case.coordinates or {}
    coord_text = (
        f"RA={_plain(coords.get('ra'))}, Dec={_plain(coords.get('dec'))}"
        if coords else "Not available."
    )
    return _section("Object Summary", _definition_list([
        ("Object ID", case.oid),
        ("Source date", case.source_date),
        ("Coordinates", coord_text),
        ("Detections", case.detection_count),
        ("Non-detections", case.non_detection_count),
        ("Filters observed", ", ".join(case.filters_observed) if case.filters_observed else None),
        ("First MJD", case.first_mjd),
        ("Last MJD", case.last_mjd),
        ("Time span days", case.time_span_days),
        ("Schema version", case.schema_version),
    ]))


def _render_classification_metadata(metadata: dict[str, Any] | None) -> str:
    if not metadata:
        body = (
            '<p class="muted">No broker or catalog classification metadata is attached.</p>'
            '<p class="caveat">Any external labels shown here are metadata only, not Argus conclusions.</p>'
        )
    else:
        body = _dict_table(metadata)
        body += '<p class="caveat">External labels are metadata only, not Argus conclusions.</p>'
    return _section("Classification Metadata", body)


def _render_light_curve_summary(summary: Any) -> str:
    if summary is None:
        return _section("Light-Curve Summary", '<p class="muted">Light-curve summary is not present.</p>')
    per_filter = []
    for item in _as_list(_field(summary, "per_filter")):
        per_filter.append(
            "<tr>"
            f"<td>{_h(_field(item, 'filter'))}</td>"
            f"<td>{_h(_field(item, 'n_detections'))}</td>"
            f"<td>{_h(_field(item, 'n_non_detections'))}</td>"
            f"<td>{_h(_field(item, 'mag_min'))}</td>"
            f"<td>{_h(_field(item, 'mag_max'))}</td>"
            f"<td>{_h(_field(item, 'delta_mag'))}</td>"
            "</tr>"
        )
    table = (
        '<table class="kv"><thead><tr><th>Filter</th><th>Detections</th>'
        '<th>Non-detections</th><th>Mag min</th><th>Mag max</th><th>Delta mag</th>'
        "</tr></thead><tbody>"
        + "\n".join(per_filter)
        + "</tbody></table>"
        if per_filter else '<p class="muted">No per-filter summary recorded.</p>'
    )
    body = _definition_list([
        ("Detections", _field(summary, "n_detections")),
        ("Non-detections", _field(summary, "n_non_detections")),
        ("Filters observed", ", ".join(_as_list(_field(summary, "filters_observed")))),
        ("First MJD", _field(summary, "first_mjd")),
        ("Last MJD", _field(summary, "last_mjd")),
        ("Time span days", _field(summary, "time_span_days")),
        ("Most recent detection MJD", _field(summary, "most_recent_detection_mjd")),
        ("Longest detection gap days", _field(summary, "longest_detection_gap_days")),
    ])
    body += "<h3>Per-Filter Summary</h3>" + table
    return _section("Light-Curve Summary", body)


def _render_feature_summary(feature_summary: Any) -> str:
    if feature_summary is None:
        return _section("Feature Summary", '<p class="muted">Feature summary is not present.</p>')
    body = _definition_list([
        ("Source", _field(feature_summary, "source")),
        ("Band", _field(feature_summary, "band")),
        ("Status", _field(feature_summary, "status")),
        ("Usable points", _field(feature_summary, "n_points")),
    ])
    body += "<h3>Feature Values</h3>" + _dict_table(_field(feature_summary, "features") or {})
    body += _definition_list([
        ("Interpretation", _field(feature_summary, "interpretation")),
        ("Caveat", _field(feature_summary, "caveat")),
    ])
    return _section("Feature Summary", body)


def _render_comparison_summary(summary: Any) -> str:
    if summary is None:
        return _section("Comparison Summary", '<p class="muted">Comparison summary is not present.</p>')
    return _section("Comparison Summary", "\n".join([
        f'<p class="headline">{_h(_field(summary, "headline"))}</p>',
        f'<p>{_h(_field(summary, "summary"))}</p>',
        _definition_list([
            ("Caveat", _field(summary, "caveat")),
            ("Recommended next check", _field(summary, "recommended_next_check")),
        ]),
    ]))


def _render_model_comparisons(comparisons: list[Any]) -> str:
    if not comparisons:
        return _section("Model Comparisons", '<p class="muted">No model comparisons are present.</p>')
    blocks = []
    for comparison in comparisons:
        body = _definition_list([
            ("Model type", _field(comparison, "model_type")),
            ("Filter used", _field(comparison, "filter_used")),
            ("Status", _field(comparison, "status")),
        ])
        body += "<h4>Parameters</h4>" + _dict_table(_field(comparison, "parameters") or {})
        body += "<h4>Fit Metrics</h4>" + _dict_table(_field(comparison, "fit_metrics") or {})
        body += "<h4>Residual Summary</h4>" + _bullet_list(_as_list(_field(comparison, "residual_summary")))
        body += _definition_list([("Interpretation", _field(comparison, "interpretation"))])
        blocks.append(f'<article class="comparison"><h3>{_h(_field(comparison, "name", "Model comparison"))}</h3>{body}</article>')
    return _section("Model Comparisons", "\n".join(blocks))


def _render_cross_survey_context(context: Any) -> str:
    if context is None:
        return _section("Cross-Survey Context", '<p class="muted">Cross-survey context is not present.</p>')
    sources = []
    for source in _as_list(_field(context, "sources")):
        sources.append(
            "<tr>"
            f"<td>{_h(_field(source, 'catalog'))}</td>"
            f"<td>{_h(_field(source, 'status'))}</td>"
            f"<td>{_h(_field(source, 'match_count'))}</td>"
            f"<td>{_h(_field(source, 'nearest_match'))}</td>"
            "</tr>"
        )
    source_table = (
        '<table class="kv"><thead><tr><th>Catalog</th><th>Status</th><th>Match count</th>'
        '<th>Nearest match</th></tr></thead><tbody>'
        + "\n".join(sources)
        + "</tbody></table>"
        if sources else '<p class="muted">No catalog sources recorded.</p>'
    )
    body = _definition_list([
        ("Status", _field(context, "status")),
        ("Coordinates", _field(context, "coordinates")),
        ("Search radius arcsec", _field(context, "search_radius_arcsec")),
    ])
    body += "<h3>Sources</h3>" + source_table
    body += _definition_list([
        ("Interpretation", _field(context, "interpretation")),
        ("Caveat", _field(context, "caveat")),
    ])
    return _section("Cross-Survey Context", body)


def _render_uncertainty_and_next_checks(case: CaseFile) -> str:
    body = "<h3>Evidence Notes</h3>" + _bullet_list(case.evidence_notes)
    body += "<h3>Uncertainty Notes</h3>" + _bullet_list(case.uncertainty_notes)
    body += "<h3>Recommended Next Checks</h3>" + _bullet_list(case.recommended_next_checks)
    return _section("Uncertainty and Recommended Next Checks", body)


_STYLE = """
:root { color-scheme: light; }
body {
  margin: 0;
  background: #f6f7f9;
  color: #1f2933;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.55;
}
main { max-width: 1080px; margin: 0 auto; padding: 32px 20px 48px; }
.hero {
  background: #0f172a;
  color: #ffffff;
  border-radius: 10px;
  padding: 28px 32px;
  margin-bottom: 22px;
}
.hero p { margin: 6px 0 0; color: #dbe4ee; }
h1, h2, h3, h4 { line-height: 1.2; }
h1 { margin: 0; font-size: 2rem; }
h2 { margin: 0 0 16px; font-size: 1.35rem; }
h3 { margin: 20px 0 8px; font-size: 1.05rem; }
h4 { margin: 18px 0 8px; }
.section {
  background: #ffffff;
  border: 1px solid #d9e2ec;
  border-radius: 10px;
  padding: 22px 24px;
  margin: 18px 0;
}
.headline { font-size: 1.1rem; font-weight: 700; margin-top: 0; }
.lede { font-size: 1.02rem; color: #334e68; }
.muted { color: #627d98; }
.caveat {
  color: #52606d;
  background: #f0f4f8;
  border-left: 4px solid #9fb3c8;
  padding: 10px 12px;
  border-radius: 6px;
}
.pill {
  display: inline-block;
  border-radius: 999px;
  padding: 2px 8px;
  margin-left: 6px;
  background: #e0f2fe;
  color: #075985;
  font-size: 0.85rem;
  font-weight: 650;
}
.facts {
  display: grid;
  grid-template-columns: minmax(160px, 260px) 1fr;
  gap: 8px 18px;
}
.facts dt { font-weight: 700; color: #334e68; }
.facts dd { margin: 0; }
.kv { width: 100%; border-collapse: collapse; margin: 10px 0 16px; }
.kv th, .kv td {
  border-bottom: 1px solid #e4e7eb;
  padding: 8px 10px;
  text-align: left;
  vertical-align: top;
}
.kv th { color: #334e68; background: #f8fafc; }
.evidence-list { padding-left: 20px; }
.evidence-item { margin-bottom: 12px; }
.evidence-item p { margin: 6px 0 0; }
.comparison {
  border: 1px solid #e4e7eb;
  border-radius: 8px;
  padding: 14px 16px;
  margin: 14px 0;
}
.figure-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 18px;
}
.figure-card { margin: 0; }
.figure-card img {
  width: 100%;
  height: auto;
  border: 1px solid #d9e2ec;
  border-radius: 8px;
  background: #fff;
}
.figure-card figcaption { margin-top: 6px; color: #52606d; font-size: 0.95rem; }
footer { color: #627d98; font-size: 0.9rem; margin-top: 28px; text-align: center; }
"""


def render_casefile_html(
    case: CaseFile,
    *,
    figure_paths: list[Path] | None = None,
) -> str:
    """Render a static, local HTML case-file report."""
    visual_summary = _render_visual_summary(figure_paths)
    sections = [
        _render_evidence_narrative(case.evidence_narrative),
        visual_summary,
        _render_object_summary(case),
        _render_classification_metadata(case.classification_metadata),
        _render_light_curve_summary(case.light_curve_summary),
        _render_feature_summary(case.feature_summary),
        _render_comparison_summary(case.comparison_summary),
        _render_model_comparisons(case.model_comparisons),
        _render_cross_survey_context(case.cross_survey_context),
        _render_uncertainty_and_next_checks(case),
    ]
    body = "\n".join(section for section in sections if section)
    footer = (
        f"<footer>Schema version {_h(case.schema_version)}"
        f" · Generated {_h(case.generated_at)}</footer>"
    )
    return "\n".join([
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        f"<title>Argus Case File: {_h(case.oid)}</title>",
        f"<style>{_STYLE}</style>",
        "</head>",
        "<body>",
        "<main>",
        '<header class="hero">',
        f"<h1>Argus Case File: {_h(case.oid)}</h1>",
        "<p>Static evidence report generated from the local case-file JSON.</p>",
        "</header>",
        body,
        footer,
        "</main>",
        "</body>",
        "</html>",
        "",
    ])


def html_path_for_json(json_path: Path) -> Path:
    """Return the sibling `.casefile.html` path for a case-file JSON path."""
    if json_path.name.endswith(".casefile.json"):
        return json_path.with_suffix(".html")
    return json_path.with_name(f"{json_path.stem}.casefile.html")


def write_casefile_html(
    case: CaseFile,
    *,
    json_path: Path | None = None,
    output_dir: Path | None = None,
    figure_paths: list[Path] | None = None,
) -> Path:
    """Write a static HTML report next to the JSON case file or into output_dir."""
    if json_path is not None:
        path = html_path_for_json(json_path)
    else:
        out = output_dir or CASEFILES_DIR
        path = out / f"{case.oid}.casefile.html"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_casefile_html(case, figure_paths=figure_paths), encoding="utf-8")
    return path
