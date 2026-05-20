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

from argus.casefile.schema import CaseFile
from argus.casefile.summarize import (
    candidate_explanations, evidence_notes, recommended_next_checks,
    summarize_light_curve, uncertainty_notes,
)
from argus.config import CASEFILES_DIR, LIGHTCURVES_DIR, RAW_DIR, TENSORS_DIR


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


def _extract_coordinates(obj_rows: pd.DataFrame) -> Optional[dict]:
    if obj_rows.empty:
        return None
    row = obj_rows.iloc[0]
    ra = _scalar_or_none(row.get("obj_meanra"))
    dec = _scalar_or_none(row.get("obj_meandec"))
    if ra is None or dec is None:
        return None
    return {"ra": float(ra), "dec": float(dec), "ra_unit": "deg", "dec_unit": "deg"}


def build_casefile(
    oid: str,
    date: str,
    *,
    lightcurves_dir: Path | None = None,
    raw_dir: Path | None = None,
    tensors_dir: Path | None = None,
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
        evidence_notes=evidence_notes(summary, classification),
        candidate_explanations=candidate_explanations(summary, classification),
        uncertainty_notes=uncertainty_notes(summary, classification, available),
        recommended_next_checks=recommended_next_checks(summary, classification, coordinates),
    )


def write_casefile(case: CaseFile, output_dir: Path | None = None) -> Path:
    """Write `case` as JSON to `{output_dir}/{oid}.json`. Returns the path."""
    out = output_dir or CASEFILES_DIR
    out.mkdir(parents=True, exist_ok=True)
    path = out / f"{case.oid}.json"
    path.write_text(json.dumps(case.to_dict(), indent=2, default=str))
    return path
