"""Persist pulls as raw JSON (source of truth) + flattened Parquet (convenience)."""
from __future__ import annotations
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

from argus.config import RAW_DIR, LIGHTCURVES_DIR, MIN_REAL_BOGUS


def _today() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def raw_paths(date: str | None = None, root: Path | None = None) -> tuple[Path, Path]:
    """Return (objects_dir, lightcurves_dir) under {root}/raw/{date}/."""
    base = (root or RAW_DIR) / (date or _today())
    return base, base / "lightcurves"


def write_raw_objects(
    objects: list[dict[str, Any]],
    date: str | None = None,
    root: Path | None = None,
) -> Path:
    base, _ = raw_paths(date, root)
    base.mkdir(parents=True, exist_ok=True)
    path = base / "objects.json"
    path.write_text(json.dumps(objects, indent=2, default=str))
    return path


def write_raw_lightcurve(
    oid: str,
    lightcurve: dict[str, Any],
    date: str | None = None,
    root: Path | None = None,
) -> Path:
    _, lc_dir = raw_paths(date, root)
    lc_dir.mkdir(parents=True, exist_ok=True)
    path = lc_dir / f"{oid}.json"
    path.write_text(json.dumps(lightcurve, indent=2, default=str))
    return path


# Object-summary fields kept as metadata on every detection row. We carry the
# classifier output as a column (never a filter) so downstream code can audit it.
_OBJECT_META_FIELDS = (
    "ndet",
    "firstmjd",
    "lastmjd",
    "meanra",
    "meandec",
    "class",
    "classifier",
    "probability",
)


def flatten_to_dataframe(
    objects: list[dict[str, Any]],
    lightcurves: dict[str, dict[str, Any]],
    min_rb: float = MIN_REAL_BOGUS,
) -> pd.DataFrame:
    """One row per detection. Quality cut: drops detections with rb < min_rb.

    Object-level fields (incl. classification) are joined onto every row so the
    autoencoder can group by oid without a second join.
    """
    obj_by_oid = {o.get("oid"): o for o in objects if o.get("oid")}
    rows: list[dict[str, Any]] = []
    for oid, lc in lightcurves.items():
        meta = obj_by_oid.get(oid, {})
        meta_cols = {f"obj_{k}": meta.get(k) for k in _OBJECT_META_FIELDS}
        for det in (lc.get("detections") or []):
            rb = det.get("rb")
            if rb is not None and rb < min_rb:
                continue
            rows.append({
                "oid": oid,
                "candid": det.get("candid"),
                "mjd": det.get("mjd"),
                "fid": det.get("fid"),
                "magpsf": det.get("magpsf"),
                "sigmapsf": det.get("sigmapsf"),
                "magap": det.get("magap"),
                "sigmagap": det.get("sigmagap"),
                "diffmaglim": det.get("diffmaglim"),
                "rb": rb,
                "drb": det.get("drb"),
                "isdiffpos": det.get("isdiffpos"),
                "ra": det.get("ra"),
                "dec": det.get("dec"),
                **meta_cols,
            })
    return pd.DataFrame(rows)


def write_parquet(
    df: pd.DataFrame,
    date: str | None = None,
    root: Path | None = None,
) -> Path:
    out_dir = root or LIGHTCURVES_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{date or _today()}.parquet"
    df.to_parquet(path, index=False)
    return path
