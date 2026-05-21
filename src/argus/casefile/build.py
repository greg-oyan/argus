"""Orchestration: load local data, assemble a CaseFile, write JSON.

This module is the only place in `argus.casefile` that touches the filesystem.
`summarize.py` is pure functions; `schema.py` is dataclasses. Keeping IO here
makes the rest trivially testable.
"""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pandas as pd

from argus.casefile.schema import CaseFile, ModelComparison
from argus.casefile.summarize import (
    build_comparison_summary, build_evidence_narrative, candidate_explanations,
    evidence_notes, recommended_next_checks, summarize_light_curve,
    uncertainty_notes,
)
from argus.compare.residuals import compute_residuals, interpret_residuals
from argus.compare.simple_templates import MIN_POINTS_FOR_FIT, fit_gaussian_bump
from argus.compare.sncosmo_templates import build_sncosmo_template_probe
from argus.compare.variability import (
    MIN_POINTS_FOR_VARIABILITY,
    interpretation_from_variability_metrics,
    summarize_variability_texture,
)
from argus.config import CASEFILES_DIR, LIGHTCURVES_DIR, RAW_DIR, TENSORS_DIR
from argus.context.cross_survey import (
    DEFAULT_CROSS_SURVEY_RADIUS_ARCSEC,
    build_cross_survey_context,
)
from argus.features.light_curve_features import extract_light_curve_features

# Limitations attached to every Phase 2C comparator — enforced in code so the
# case file cannot ship a fit without these caveats.
_PHASE_2C_LIMITATIONS = (
    "Phenomenological template — not a physical model. A good fit does not imply a "
    "supernova or any specific source class.",
    "Fit performed in magnitude space directly, not flux. Magnitude errors are "
    "treated as Gaussian; this is approximate for low-SNR detections.",
    "Only detections that passed the rb≥0.55 quality cut are used. Non-detections "
    "and forced photometry are not consumed by this comparator.",
)

_PHASE_2D_LIMITATIONS = (
    "Phenomenological summary - not a physical model. It does not imply any "
    "source class or physical cause.",
    "Uses only local r-band detections that passed the rb>=0.55 quality cut. "
    "Non-detections and forced photometry are not consumed by this comparator.",
    "Turning-point counts use simple rolling-median smoothing, so cadence, "
    "gaps, and noisy measurements can affect the result.",
)


def _scalar_or_none(x):
    if x is None:
        return None
    try:
        if pd.isna(x):
            return None
    except (TypeError, ValueError):
        pass
    return x


def _extract_classification(obj_rows: pd.DataFrame) -> Optional[dict]:
    """Pull classifier metadata from the per-object columns. Returns None when absent."""
    if obj_rows.empty:
        return None
    row = obj_rows.iloc[0]
    cls = _scalar_or_none(row.get("obj_class"))
    if cls is None:
        return None
    clf = _scalar_or_none(row.get("obj_classifier"))
    prob = _scalar_or_none(row.get("obj_probability"))
    return {
        "class": str(cls),
        "classifier": str(clf) if clf is not None else None,
        "probability": float(prob) if prob is not None else None,
    }


def _build_gaussian_bump_comparison(
    detections: pd.DataFrame, filter_name: str, fid: int,
) -> ModelComparison:
    """Fit (or honestly decline to fit) one Gaussian bump for one filter."""
    sub = detections[detections["fid"] == fid] if "fid" in detections.columns else detections.iloc[0:0]
    sub = sub.dropna(subset=["mjd", "magpsf", "sigmapsf"])
    n = len(sub)
    name = f"Gaussian bump ({filter_name}-band)"
    common = dict(
        name=name,
        model_type="gaussian_bump",
        filter_used=filter_name,
        limitations=list(_PHASE_2C_LIMITATIONS),
    )

    if n < MIN_POINTS_FOR_FIT:
        return ModelComparison(
            **common,
            status="insufficient_data",
            parameters=None,
            fit_metrics={"n_points": int(n)},
            residual_summary=[
                f"Only {n} detection(s) in {filter_name}-band — below the "
                f"minimum of {MIN_POINTS_FOR_FIT} required to fit a "
                "4-parameter Gaussian bump."
            ],
            interpretation=(
                f"No comparator was fit in {filter_name}-band: not enough "
                "detections survive the quality cut."
            ),
        )

    mjd = sub["mjd"].to_numpy(dtype=float)
    mag = sub["magpsf"].to_numpy(dtype=float)
    magerr = sub["sigmapsf"].to_numpy(dtype=float)

    result = fit_gaussian_bump(mjd, mag, magerr)
    if result["status"] == "failed_fit":
        return ModelComparison(
            **common,
            status="failed_fit",
            parameters=None,
            fit_metrics={"n_points": result["n_points"], "error": result["error"]},
            residual_summary=[
                "The optimizer failed to converge on a Gaussian-bump fit for the "
                f"{filter_name}-band detections."
            ],
            interpretation=(
                "The comparator could not return a stable fit. This is itself "
                "informative — the data is not well-described by a Gaussian bump "
                "with these initial conditions."
            ),
        )

    predicted = result["predicted"]
    metrics = compute_residuals(
        observed=mag, predicted=predicted, errors=magerr, mjd=mjd,
        n_params=result["n_params"],
    )
    residual_notes = interpret_residuals(mjd, mag, predicted, result["params"])

    # Templated interpretation built from the metrics. Deterministic, not generative.
    rmse = metrics["rmse"]
    redchi = metrics.get("reduced_chi2")
    if redchi is None:
        quality_clause = f"RMSE = {rmse:.2f} mag."
    elif redchi < 2:
        quality_clause = (
            f"RMSE = {rmse:.2f} mag, reduced χ² ≈ {redchi:.1f} — the bump shape "
            "is consistent with the data within the reported errors."
        )
    elif redchi < 10:
        quality_clause = (
            f"RMSE = {rmse:.2f} mag, reduced χ² ≈ {redchi:.1f} — the bump shape "
            "captures the average behavior but not the point-to-point variability."
        )
    else:
        quality_clause = (
            f"RMSE = {rmse:.2f} mag, reduced χ² ≈ {redchi:.0f} — the bump shape "
            "does not fit the data; reduced χ² is far above unity."
        )

    interpretation = (
        f"A single Gaussian bump was fit to the {filter_name}-band detections. "
        f"{quality_clause} See residual_summary for where the fit fails."
    )

    return ModelComparison(
        **common,
        status="fitted_baseline",
        parameters=result["params"],
        fit_metrics=metrics,
        residual_summary=residual_notes,
        interpretation=interpretation,
    )


def _build_variability_comparison(
    detections: pd.DataFrame, filter_name: str, fid: int,
) -> ModelComparison:
    """Compute descriptive repeated/irregular variability metrics for one filter."""
    sub = detections[detections["fid"] == fid] if "fid" in detections.columns else detections.iloc[0:0]
    if {"mjd", "magpsf"}.issubset(sub.columns):
        sub = sub.dropna(subset=["mjd", "magpsf"])
    else:
        sub = pd.DataFrame(columns=["mjd", "magpsf", "sigmapsf"])
    name = f"Variability texture ({filter_name}-band)"
    common = dict(
        name=name,
        model_type="variability_texture",
        filter_used=filter_name,
        parameters=None,
        limitations=list(_PHASE_2D_LIMITATIONS),
    )

    mjd = sub["mjd"].to_numpy(dtype=float) if "mjd" in sub.columns else []
    mag = sub["magpsf"].to_numpy(dtype=float) if "magpsf" in sub.columns else []
    magerr = sub["sigmapsf"].to_numpy(dtype=float) if "sigmapsf" in sub.columns else None
    result = summarize_variability_texture(mjd, mag, magerr)

    if result["status"] == "insufficient_data":
        return ModelComparison(
            **common,
            status="insufficient_data",
            fit_metrics={
                "n_points": result["n_points"],
                "minimum_points": result["minimum_points"],
            },
            residual_summary=[
                f"Only {result['n_points']} detection(s) in {filter_name}-band - "
                f"below the minimum of {MIN_POINTS_FOR_VARIABILITY} required for "
                "the variability texture summary."
            ],
            interpretation=interpretation_from_variability_metrics(result, filter_name),
        )

    metrics = {k: v for k, v in result.items() if k != "status"}
    material = metrics["variability_materially_larger_than_errors"]
    if material is True:
        error_note = "Robust scatter is materially larger than the reported errors."
    elif material is False:
        error_note = "Robust scatter is comparable to the reported errors."
    else:
        error_note = "Reported errors are missing or unusable for scatter comparison."

    residual_summary = [
        (
            f"Observed {filter_name}-band range: "
            f"{metrics['observed_mag_range']:.2f} mag; robust scatter: "
            f"{metrics['robust_scatter_mag']:.2f} mag."
        ),
        (
            f"After {metrics['smoothing_window_points']}-point smoothing, counted "
            f"{metrics['local_extrema_count_after_smoothing']} local extrema/sign "
            "change(s)."
        ),
        error_note,
    ]

    return ModelComparison(
        **common,
        status="computed",
        fit_metrics=metrics,
        residual_summary=residual_summary,
        interpretation=interpretation_from_variability_metrics(result, filter_name),
    )


def _build_model_comparisons(detections: pd.DataFrame) -> list[ModelComparison]:
    """Run the Phase 2C/2D comparator suite.

    Phase 2C fits a Gaussian bump on r-band detections. Phase 2D adds a
    descriptive r-band variability texture summary. If r-band has insufficient
    data, each comparator still runs and honestly reports `insufficient_data`.
    """
    if detections is None or detections.empty:
        gaussian = ModelComparison(
            name="Gaussian bump (r-band)",
            model_type="gaussian_bump",
            filter_used="r",
            status="insufficient_data",
            parameters=None,
            fit_metrics={"n_points": 0},
            residual_summary=["No detections available in any filter."],
            interpretation="No comparator was fit: no detections survive the quality cut.",
            limitations=list(_PHASE_2C_LIMITATIONS),
        )
        variability = _build_variability_comparison(pd.DataFrame(), "r", fid=2)
        return [gaussian, variability]
    return [
        _build_gaussian_bump_comparison(detections, "r", fid=2),
        _build_variability_comparison(detections, "r", fid=2),
    ]


def _build_feature_summary(detections: pd.DataFrame, filter_name: str, fid: int):
    """Compute the Phase 2F standardized feature summary for one filter."""
    sub = detections[detections["fid"] == fid] if "fid" in detections.columns else detections.iloc[0:0]
    if {"mjd", "magpsf"}.issubset(sub.columns):
        sub = sub.dropna(subset=["mjd", "magpsf"])
    else:
        sub = pd.DataFrame(columns=["mjd", "magpsf", "sigmapsf"])

    mjd = sub["mjd"].to_numpy(dtype=float) if "mjd" in sub.columns else []
    mag = sub["magpsf"].to_numpy(dtype=float) if "magpsf" in sub.columns else []
    magerr = sub["sigmapsf"].to_numpy(dtype=float) if "sigmapsf" in sub.columns else None
    return extract_light_curve_features(mjd, mag, magerr, band=filter_name)


def _extract_coordinates(obj_rows: pd.DataFrame) -> Optional[dict]:
    if obj_rows.empty:
        return None
    row = obj_rows.iloc[0]
    ra = _scalar_or_none(row.get("obj_meanra"))
    dec = _scalar_or_none(row.get("obj_meandec"))
    if ra is None or dec is None:
        return None
    return {"ra": float(ra), "dec": float(dec), "ra_unit": "deg", "dec_unit": "deg"}


def _extract_redshift_context(obj_rows: pd.DataFrame) -> tuple[Optional[float], Optional[str]]:
    """Pull redshift if a future local data source provides one."""
    if obj_rows.empty:
        return None, None
    row = obj_rows.iloc[0]
    for col in ("redshift", "obj_redshift", "host_redshift", "z"):
        z = _scalar_or_none(row.get(col))
        if z is not None:
            try:
                return float(z), col
            except (TypeError, ValueError):
                return None, None
    return None, None


def build_casefile(
    oid: str,
    date: str,
    *,
    lightcurves_dir: Path | None = None,
    raw_dir: Path | None = None,
    tensors_dir: Path | None = None,
    include_cross_survey_context: bool = False,
    cross_survey_radius_arcsec: float = DEFAULT_CROSS_SURVEY_RADIUS_ARCSEC,
) -> CaseFile:
    """Assemble a CaseFile for `oid` from local files for `date`.

    Reads from the flattened Parquet, raw light-curve JSON, and (if present) the
    tensor manifest. Any of those sources may be missing; the case file records
    which were actually used in `available_data_sources` and uncertainty notes.
    """
    lc_dir = lightcurves_dir or LIGHTCURVES_DIR
    rw_dir = raw_dir or RAW_DIR
    ts_dir = tensors_dir or TENSORS_DIR

    parquet_path = lc_dir / f"{date}.parquet"
    if not parquet_path.exists():
        raise FileNotFoundError(f"No parquet for date {date}: {parquet_path}")

    df = pd.read_parquet(parquet_path)
    obj_rows = df[df["oid"] == oid]

    available: list[str] = []
    if not obj_rows.empty:
        available.append("parquet_detections")

    if not obj_rows.empty:
        detections = obj_rows[["mjd", "fid", "magpsf", "sigmapsf"]].copy()
    else:
        detections = pd.DataFrame()

    raw_lc_path = rw_dir / date / "lightcurves" / f"{oid}.json"
    if raw_lc_path.exists():
        available.append("raw_lightcurve_json")
        raw = json.loads(raw_lc_path.read_text())
        non_det = pd.DataFrame(raw.get("non_detections") or [])
    else:
        non_det = pd.DataFrame()

    manifest_path = ts_dir / f"{date}.csv"
    if manifest_path.exists():
        try:
            manifest = pd.read_csv(manifest_path)
            if (manifest["oid"] == oid).any():
                available.append("tensor_manifest")
        except Exception:
            pass

    if not available:
        raise FileNotFoundError(
            f"No local data found for oid={oid} date={date}. Searched: "
            f"{parquet_path}, {raw_lc_path}, {manifest_path}."
        )

    summary = summarize_light_curve(detections, non_det)
    classification = _extract_classification(obj_rows)
    coordinates = _extract_coordinates(obj_rows)
    redshift, redshift_source = _extract_redshift_context(obj_rows)

    model_comps = _build_model_comparisons(detections)
    model_comps.append(
        build_sncosmo_template_probe(
            detections,
            redshift=redshift,
            redshift_source=redshift_source,
        )
    )
    comp_summary = build_comparison_summary(model_comps)
    feature_summary = _build_feature_summary(detections, "r", fid=2)
    cross_survey_context = build_cross_survey_context(
        coordinates,
        include=include_cross_survey_context,
        radius_arcsec=cross_survey_radius_arcsec,
    )
    evidence = evidence_notes(summary, classification)
    candidates = candidate_explanations(summary, classification)
    uncertainties = uncertainty_notes(summary, classification, available)
    next_checks = recommended_next_checks(summary, classification, coordinates)
    evidence_narrative = build_evidence_narrative(
        model_comparisons=model_comps,
        comparison_summary=comp_summary,
        feature_summary=feature_summary,
        cross_survey_context=cross_survey_context,
        recommended_next_checks=next_checks,
        uncertainty_notes=uncertainties,
    )

    return CaseFile(
        oid=oid,
        source_date=date,
        generated_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        coordinates=coordinates,
        available_data_sources=available,
        detection_count=summary.n_detections,
        non_detection_count=summary.n_non_detections,
        filters_observed=summary.filters_observed,
        first_mjd=summary.first_mjd,
        last_mjd=summary.last_mjd,
        time_span_days=summary.time_span_days,
        classification_metadata=classification,
        light_curve_summary=summary,
        evidence_notes=evidence,
        candidate_explanations=candidates,
        uncertainty_notes=uncertainties,
        recommended_next_checks=next_checks,
        model_comparisons=model_comps,
        comparison_summary=comp_summary,
        feature_summary=feature_summary,
        cross_survey_context=cross_survey_context,
        evidence_narrative=evidence_narrative,
    )


def write_casefile(case: CaseFile, output_dir: Path | None = None) -> Path:
    """Write `case` as JSON to `{output_dir}/{oid}.json`. Returns the path."""
    out = output_dir or CASEFILES_DIR
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{case.oid}.json"
    path.write_text(json.dumps(case.to_dict(), indent=2, default=str))
    return path
