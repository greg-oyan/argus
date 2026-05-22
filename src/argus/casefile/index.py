"""Static case-file index generation.

The index is a review aid over existing case-file JSON artifacts. It uses a
transparent review-priority heuristic for sorting, but it does not recompute
metrics or infer physical identity.
"""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from typing import Any

from argus.config import CASEFILES_DIR

INDEX_VERSION = "1.1"
REVIEW_PRIORITY_CAVEAT = (
    "This is a review-priority heuristic for inspection only, not a model result "
    "or object-identity claim."
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


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
        return "Not available"
    if isinstance(value, float):
        return f"{value:.6g}"
    if isinstance(value, (int, bool)):
        return str(value)
    if isinstance(value, str):
        text = value.strip()
        return text if text else "Not available"
    if isinstance(value, (list, tuple, dict)):
        return json.dumps(value, sort_keys=True, default=str)
    return str(value)


def _h(value: Any) -> str:
    return escape(_plain(value), quote=True)


def _looks_like_casefile(data: Any) -> bool:
    if not isinstance(data, dict):
        return False
    return bool(data.get("oid") and data.get("source_date") and data.get("schema_version"))


def _flatten_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, dict):
        return " ".join(_flatten_text(item) for item in value.values())
    if isinstance(value, (list, tuple, set)):
        return " ".join(_flatten_text(item) for item in value)
    return str(value)


def _as_float(value: Any) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def find_casefile_json_paths(casefile_dir: Path) -> list[Path]:
    """Find likely Argus case-file JSON files under a directory."""
    root = Path(casefile_dir)
    if not root.exists():
        return []

    paths: list[Path] = []
    for path in sorted(root.rglob("*.json")):
        if path.name.lower() == "index.json":
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, UnicodeDecodeError):
            continue
        if _looks_like_casefile(data):
            paths.append(path)
    return paths


def _model_comparison(case_data: dict[str, Any], model_type: str) -> dict[str, Any]:
    for comparison in _as_list(case_data.get("model_comparisons")):
        comparison = _as_dict(comparison)
        if comparison.get("model_type") == model_type:
            return comparison
    return {}


def _model_status(case_data: dict[str, Any], model_type: str) -> str:
    comparison = _model_comparison(case_data, model_type)
    return str(comparison.get("status") or "missing")


def _summary_field(case_data: dict[str, Any], name: str) -> str:
    narrative = _as_dict(case_data.get("evidence_narrative"))
    if narrative.get(name):
        return str(narrative[name])
    comparison_summary = _as_dict(case_data.get("comparison_summary"))
    if name == "headline" and comparison_summary.get("headline"):
        return str(comparison_summary["headline"])
    if name == "short_summary" and comparison_summary.get("summary"):
        return str(comparison_summary["summary"])
    return "Evidence summary is not available for this case file."


def _artifact_base(json_path: Path, oid: str) -> str:
    name = json_path.name
    if name.endswith(".casefile.json"):
        return name.removesuffix(".casefile.json")
    if name.endswith(".json"):
        return name.removesuffix(".json")
    return oid


def _relative_link(target: Path, base_dir: Path) -> str:
    return os.path.relpath(target.resolve(), start=base_dir.resolve()).replace(os.sep, "/")


def _artifact_links(json_path: Path, oid: str, base_dir: Path) -> dict[str, str]:
    stem = _artifact_base(json_path, oid)
    candidates = {
        "json": json_path,
        "markdown": json_path.with_name(f"{stem}.casefile.md"),
        "html": json_path.with_name(f"{stem}.casefile.html"),
        "light_curve_png": json_path.with_name(f"{stem}.lightcurve.png"),
        "residual_png": json_path.with_name(f"{stem}.residuals.png"),
    }
    links: dict[str, str] = {"json": _relative_link(json_path, base_dir)}
    for key, path in candidates.items():
        if key == "json":
            continue
        if path.exists():
            links[key] = _relative_link(path, base_dir)
    return links


def review_priority_level(score: int) -> str:
    """Map a review-priority score to a readable level."""
    if score <= 2:
        return "low"
    if score <= 5:
        return "medium"
    return "high"


def _gaussian_priority_reason(case_data: dict[str, Any]) -> str | None:
    comparison = _model_comparison(case_data, "gaussian_bump")
    status = str(comparison.get("status") or "")
    if not comparison or status == "insufficient_data":
        return None

    comparison_summary = _as_dict(case_data.get("comparison_summary"))
    text = _flatten_text([
        status,
        comparison.get("residual_summary"),
        comparison.get("interpretation"),
        comparison_summary.get("headline"),
        comparison_summary.get("summary"),
    ]).lower()
    markers = (
        "not well explained",
        "substantial residual",
        "captures only part",
        "poorly",
    )
    metrics = _as_dict(comparison.get("fit_metrics"))
    reduced_chi2 = _as_float(metrics.get("reduced_chi2"))

    if status == "fit_failed" or any(marker in text for marker in markers):
        return "Gaussian bump comparator indicates the single smooth bump is not a clean fit."
    if reduced_chi2 is not None and reduced_chi2 >= 2.0:
        return "Gaussian bump comparator has elevated residual structure relative to reported errors."
    return None


def _variability_priority_reason(case_data: dict[str, Any]) -> str | None:
    comparison = _model_comparison(case_data, "variability_texture")
    if str(comparison.get("status") or "") != "computed":
        return None

    metrics = _as_dict(comparison.get("fit_metrics"))
    behavior_hint = str(metrics.get("behavior_hint") or "").lower()
    sign_changes = _as_float(metrics.get("smoothed_sign_changes")) or 0
    materially_larger = bool(metrics.get("variability_materially_larger_than_errors"))
    text = _flatten_text([
        comparison.get("residual_summary"),
        comparison.get("interpretation"),
    ]).lower()

    if (
        behavior_hint == "repeated_or_irregular"
        or (materially_larger and sign_changes >= 2)
        or "repeated or irregular" in text
        or "multiple meaningful turns" in text
    ):
        return "Variability texture suggests repeated or irregular behavior."
    return None


def _template_probe_reason(status: str) -> str | None:
    messages = {
        "missing_required_context": "Template-family probe is limited by missing required context.",
        "template_unavailable": "Template-family probe is limited by unavailable offline template data.",
        "fit_failed": "Template-family probe was attempted but did not produce a usable fit.",
        "dependency_unavailable": "Template-family probe is limited because an optional dependency is unavailable.",
        "insufficient_data": "Template-family probe is limited by insufficient usable data.",
    }
    return messages.get(status)


def _cross_survey_reason(status: str) -> str | None:
    messages = {
        "not_requested": "Cross-survey context was not requested.",
        "dependency_unavailable": "Cross-survey context is limited because an optional dependency is unavailable.",
    }
    return messages.get(status)


def compute_review_priority(case_data: dict[str, Any]) -> dict[str, Any]:
    """Compute a transparent review-priority heuristic from existing fields."""
    score = 0
    reasons: list[str] = []

    gaussian_reason = _gaussian_priority_reason(case_data)
    if gaussian_reason:
        score += 3
        reasons.append(gaussian_reason)

    variability_reason = _variability_priority_reason(case_data)
    if variability_reason:
        score += 2
        reasons.append(variability_reason)

    feature_summary = _as_dict(case_data.get("feature_summary"))
    if str(feature_summary.get("status") or "") == "computed":
        score += 1
        reasons.append("Standard descriptive features were computed.")

    sncosmo_status = _model_status(case_data, "sncosmo_template_probe")
    template_reason = _template_probe_reason(sncosmo_status)
    if template_reason:
        score += 1
        reasons.append(template_reason)

    cross_survey_context = _as_dict(case_data.get("cross_survey_context"))
    cross_survey_status = str(cross_survey_context.get("status") or "missing")
    cross_reason = _cross_survey_reason(cross_survey_status)
    if cross_reason:
        score += 1
        reasons.append(cross_reason)

    recommended = _as_list(case_data.get("recommended_next_checks"))
    if recommended:
        score += 1
        reasons.append("A recommended next check is recorded for human review.")

    score = max(0, min(10, score))
    if not reasons:
        reasons.append("No review-priority signals were available from the indexable fields.")
    return {
        "score": score,
        "level": review_priority_level(score),
        "reasons": reasons,
        "caveat": REVIEW_PRIORITY_CAVEAT,
    }


def extract_index_entry(
    case_data: dict[str, Any],
    json_path: Path,
    *,
    base_dir: Path,
) -> dict[str, Any]:
    """Extract one feed-shaped index entry from an existing case file."""
    oid = str(case_data.get("oid") or json_path.stem)
    feature_summary = _as_dict(case_data.get("feature_summary"))
    cross_survey_context = _as_dict(case_data.get("cross_survey_context"))
    recommended = _as_list(case_data.get("recommended_next_checks"))
    classification_metadata = case_data.get("classification_metadata")

    return {
        "oid": oid,
        "source_date": case_data.get("source_date"),
        "generated_at": case_data.get("generated_at"),
        "schema_version": case_data.get("schema_version"),
        "headline": _summary_field(case_data, "headline"),
        "short_summary": _summary_field(case_data, "short_summary"),
        "detection_count": case_data.get("detection_count"),
        "non_detection_count": case_data.get("non_detection_count"),
        "filters_observed": _as_list(case_data.get("filters_observed")),
        "time_span_days": case_data.get("time_span_days"),
        "classification_metadata": {
            "kind": "external_metadata",
            "value": classification_metadata,
        },
        "gaussian_comparator_status": _model_status(case_data, "gaussian_bump"),
        "variability_texture_status": _model_status(case_data, "variability_texture"),
        "feature_summary_status": str(feature_summary.get("status") or "missing"),
        "sncosmo_template_probe_status": _model_status(
            case_data, "sncosmo_template_probe"
        ),
        "cross_survey_context_status": str(cross_survey_context.get("status") or "missing"),
        "review_priority": compute_review_priority(case_data),
        "top_recommended_next_check": (
            str(recommended[0]) if recommended else "No next check recorded."
        ),
        "links": _artifact_links(json_path, oid, base_dir),
    }


def build_casefile_index(
    casefile_dir: Path | str = CASEFILES_DIR,
    *,
    output_dir: Path | str | None = None,
    generated_at: str | None = None,
) -> dict[str, Any]:
    """Build a static index document from existing case-file JSON files."""
    root = Path(casefile_dir)
    base_dir = Path(output_dir) if output_dir is not None else root
    entries: list[dict[str, Any]] = []

    for path in find_casefile_json_paths(root):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, UnicodeDecodeError):
            continue
        entries.append(extract_index_entry(data, path, base_dir=base_dir))

    entries.sort(
        key=lambda entry: (
            -int(_as_dict(entry.get("review_priority")).get("score") or 0),
            str(entry.get("oid") or ""),
        )
    )
    return {
        "index_version": INDEX_VERSION,
        "generated_at": generated_at or _utc_now(),
        "casefile_dir": str(root),
        "case_count": len(entries),
        "sort_order": "review_priority_desc_then_oid",
        "description": (
            "Static case-file review index built from existing Argus case-file JSON. "
            "Entries are sorted by a transparent review-priority heuristic for inspection."
        ),
        "entries": entries,
    }


def write_index_json(index: dict[str, Any], output_path: Path | str) -> Path:
    """Write index JSON."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(index, indent=2, default=str), encoding="utf-8")
    return path


def _status_list(entry: dict[str, Any]) -> str:
    statuses = [
        ("Gaussian", entry.get("gaussian_comparator_status")),
        ("Variability", entry.get("variability_texture_status")),
        ("Features", entry.get("feature_summary_status")),
        ("sncosmo", entry.get("sncosmo_template_probe_status")),
        ("Catalog context", entry.get("cross_survey_context_status")),
    ]
    return "\n".join(
        f'<span class="status"><strong>{_h(label)}:</strong> {_h(status)}</span>'
        for label, status in statuses
    )


def _artifact_link_list(entry: dict[str, Any]) -> str:
    labels = {
        "html": "HTML",
        "markdown": "Markdown",
        "json": "JSON",
        "light_curve_png": "Light curve",
        "residual_png": "Residuals",
    }
    links = _as_dict(entry.get("links"))
    items = []
    for key, label in labels.items():
        href = links.get(key)
        if href:
            items.append(f'<a href="{escape(str(href), quote=True)}">{_h(label)}</a>')
    if not items:
        return '<span class="muted">No linked artifacts found.</span>'
    return " ".join(items)


def _priority_block(entry: dict[str, Any]) -> str:
    priority = _as_dict(entry.get("review_priority"))
    score = int(priority.get("score") or 0)
    level = str(priority.get("level") or review_priority_level(score))
    reasons = _as_list(priority.get("reasons"))
    reason_items = "\n".join(f"<li>{_h(reason)}</li>" for reason in reasons)
    return "\n".join([
        '<div class="priority">',
        "<p><strong>Review priority:</strong> "
        f'<span class="priority-level level-{escape(level, quote=True)}">{_h(level)}</span> '
        f'<span class="priority-score">{score}/10</span></p>',
        f"<ul>{reason_items}</ul>",
        f'<p class="priority-caveat">{_h(priority.get("caveat") or REVIEW_PRIORITY_CAVEAT)}</p>',
        "</div>",
    ])


def render_index_html(index: dict[str, Any]) -> str:
    """Render a static HTML mini-feed for a case-file index."""
    entries = _as_list(index.get("entries"))
    count = int(index.get("case_count") or len(entries))
    cards: list[str] = []
    for entry in entries:
        entry = _as_dict(entry)
        filters = ", ".join(str(item) for item in _as_list(entry.get("filters_observed")))
        data_summary = (
            f"{_plain(entry.get('detection_count'))} detections, "
            f"{_plain(entry.get('non_detection_count'))} non-detections"
        )
        if filters:
            data_summary += f" in {filters}"
        if entry.get("time_span_days") is not None:
            data_summary += f"; span {_plain(entry.get('time_span_days'))} days"
        cards.append(
            '<article class="case-card">'
            f'<h2>{_h(entry.get("oid"))}</h2>'
            f'<p class="headline">{_h(entry.get("headline"))}</p>'
            f'<p>{_h(entry.get("short_summary"))}</p>'
            f'<p class="muted">{_h(data_summary)}</p>'
            f'{_priority_block(entry)}'
            '<div class="statuses">'
            f'{_status_list(entry)}'
            '</div>'
            '<p><strong>Top next check:</strong> '
            f'{_h(entry.get("top_recommended_next_check"))}</p>'
            f'<p class="links">{_artifact_link_list(entry)}</p>'
            "</article>"
        )

    if not cards:
        cards.append(
            '<article class="case-card empty">'
            "<h2>No case files available</h2>"
            "<p>No Argus case-file JSON files were found in this directory.</p>"
            "</article>"
        )

    style = """
:root { color-scheme: light; }
body {
  margin: 0;
  background: #f6f8fb;
  color: #1b2430;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  line-height: 1.55;
}
main { max-width: 1120px; margin: 0 auto; padding: 42px 20px 56px; }
header { border-bottom: 1px solid #d8dee8; padding-bottom: 24px; margin-bottom: 24px; }
h1 { margin: 0 0 10px; font-size: clamp(2rem, 5vw, 4rem); letter-spacing: 0; }
h2 { margin: 0 0 10px; font-size: 1.35rem; letter-spacing: 0; }
p { margin: 0 0 12px; }
a { color: #174ea6; text-underline-offset: 0.18em; }
.lede { max-width: 780px; color: #5e6a78; font-size: 1.12rem; }
.count { display: inline-block; margin-top: 8px; color: #24476f; font-weight: 700; }
.case-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
.case-card {
  background: #ffffff;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  padding: 18px;
}
.headline { font-weight: 700; }
.muted { color: #5e6a78; }
.priority {
  background: #f8fbff;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  margin: 14px 0;
  padding: 12px;
}
.priority ul { margin: 8px 0; padding-left: 20px; }
.priority li { margin: 4px 0; }
.priority-level {
  display: inline-block;
  border-radius: 999px;
  color: #ffffff;
  font-size: 0.84rem;
  font-weight: 700;
  margin-left: 4px;
  padding: 3px 8px;
}
.level-high { background: #9f3a38; }
.level-medium { background: #9a6a00; }
.level-low { background: #386641; }
.priority-score { color: #24476f; font-weight: 700; margin-left: 6px; }
.priority-caveat { color: #5e6a78; font-size: 0.9rem; margin-bottom: 0; }
.statuses { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.status { background: #eef4ff; border-radius: 999px; color: #24476f; padding: 5px 9px; font-size: 0.9rem; }
.links { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 0; }
.links a { font-weight: 700; }
footer { color: #5e6a78; font-size: 0.9rem; margin-top: 28px; }
"""
    return "\n".join([
        "<!doctype html>",
        '<html lang="en">',
        "<head>",
        '<meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width, initial-scale=1">',
        "<title>Argus Case-File Index</title>",
        f"<style>{style}</style>",
        "</head>",
        "<body>",
        "<main>",
        "<header>",
        "<h1>Argus Case-File Index</h1>",
        '<p class="lede">A static review queue of generated case files. '
        "This mini-feed sorts existing evidence packages by a transparent "
        "review-priority heuristic and links to their artifacts.</p>",
        f'<span class="count">{count} case file{"s" if count != 1 else ""} available.</span>',
        "</header>",
        '<section class="case-grid">',
        "\n".join(cards),
        "</section>",
        "<footer>",
        "Built from existing case-file JSON. Review priority supports inspection "
        "only; it does not decide object identity or assert a final finding.",
        f" Generated {_h(index.get('generated_at'))}.",
        "</footer>",
        "</main>",
        "</body>",
        "</html>",
        "",
    ])


def write_index_html(index: dict[str, Any], output_path: Path | str) -> Path:
    """Write index HTML."""
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_index_html(index), encoding="utf-8")
    return path
