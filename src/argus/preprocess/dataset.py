"""File IO and dataset orchestration for Phase 2a preprocessing.

NOTE: ALeRCE classification metadata (obj_class, obj_classifier, obj_probability)
is intentionally NOT carried into the tensor or the manifest. The autoencoder must
be classifier-blind so anomaly rankings aren't pre-shaped by ALeRCE's notion of
"normal." Classification can be rejoined by oid downstream for audit (e.g., the
validation agent in Phase 3 or any post-hoc comparison of model rankings vs
existing labels).
"""
from __future__ import annotations
import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from argus.config import (
    ASINH_SOFTENING, BIN_DAYS, CHANNEL_ORDER, FLUX_ZEROPOINT,
    LIGHTCURVES_DIR, N_BINS, N_CHANNELS, RAW_DIR, TENSORS_DIR,
    UPPER_LIMIT_SIGMA, WINDOW_DAYS,
)
from argus.preprocess.grid import tensorize_object


def latest_parquet_date() -> str:
    files = sorted(LIGHTCURVES_DIR.glob("*.parquet"))
    if not files:
        raise FileNotFoundError(f"No parquet files in {LIGHTCURVES_DIR}")
    return files[-1].stem


def load_object_inputs(
    parquet_df: pd.DataFrame, raw_lc_dir: Path, oid: str,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Detections come from the rb-filtered Parquet; non-detections from the raw JSON."""
    det = parquet_df.loc[parquet_df["oid"] == oid, ["mjd", "fid", "magpsf", "sigmapsf"]]
    lc_path = raw_lc_dir / f"{oid}.json"
    if lc_path.exists():
        raw = json.loads(lc_path.read_text())
        nondet = pd.DataFrame(raw.get("non_detections") or [])
    else:
        nondet = pd.DataFrame()
    return det, nondet


def _sanity_check(
    X: np.ndarray,
    oids: list[str],
    medians_g: np.ndarray,
    medians_r: np.ndarray,
    window_end_mjd: np.ndarray,
) -> None:
    """Fail loudly before writing. Cheap and catches drift early."""
    n = X.shape[0]
    if not np.all(np.isfinite(X)):
        n_bad = int((~np.isfinite(X)).sum())
        raise ValueError(f"X contains {n_bad} non-finite values")
    if len(set(oids)) != len(oids):
        raise ValueError("oids are not unique")
    if len(oids) != n:
        raise ValueError(f"len(oids)={len(oids)} != X.shape[0]={n}")
    for name, arr in (("medians_g", medians_g),
                      ("medians_r", medians_r),
                      ("window_end_mjd", window_end_mjd)):
        if len(arr) != n:
            raise ValueError(f"{name} length {len(arr)} != X.shape[0] {n}")
    for col in (0, 3):
        flux = X[:, :, col]
        err = X[:, :, col + 1]
        mask = X[:, :, col + 2]
        masked_off = mask == 0
        if (masked_off & (flux != 0)).any():
            raise ValueError(f"mask=0 bins have nonzero flux in channel index {col}")
        if (masked_off & (err != 0)).any():
            raise ValueError(f"mask=0 bins have nonzero err in channel index {col + 1}")


_MANIFEST_FIELDS = (
    "idx", "oid", "window_end_mjd",
    "n_obs_g", "n_obs_r", "n_uplim_g", "n_uplim_r",
    "total_unmasked_bins", "frac_bins_masked",
    "median_g_asinh", "median_r_asinh",
    "median_g_raw_flux", "median_r_raw_flux",
    "median_g_fallback", "median_r_fallback",
)


def build_dataset(
    date: str | None = None,
    *,
    window_days: int = WINDOW_DAYS,
    bin_days: int = BIN_DAYS,
    softening: float = ASINH_SOFTENING,
    tensors_dir: Path | None = None,
) -> tuple[Path, Path, dict[str, Any]]:
    """Build tensor archive + manifest for the given date.

    Returns `(npz_path, csv_path, summary)`. Summary includes counts and any
    objects that were skipped (with reason).
    """
    if date is None:
        date = latest_parquet_date()

    parquet_path = LIGHTCURVES_DIR / f"{date}.parquet"
    if not parquet_path.exists():
        raise FileNotFoundError(parquet_path)
    df = pd.read_parquet(parquet_path)
    raw_lc_dir = RAW_DIR / date / "lightcurves"

    obj_rows = (
        df[["oid", "obj_lastmjd"]]
        .drop_duplicates(subset=["oid"])
        .dropna(subset=["obj_lastmjd"])
        .sort_values("oid")
        .reset_index(drop=True)
    )

    tensors, oids, metas, skipped = [], [], [], []
    for r in obj_rows.itertuples(index=False):
        oid = str(r.oid)
        last_mjd = float(r.obj_lastmjd)
        try:
            det, nondet = load_object_inputs(df, raw_lc_dir, oid)
            arr, meta = tensorize_object(
                det, nondet, last_mjd,
                window_days=window_days, bin_days=bin_days, softening=softening,
            )
            if arr.shape != (window_days // bin_days, N_CHANNELS):
                raise ValueError(f"unexpected tensor shape {arr.shape}")
            tensors.append(arr)
            oids.append(oid)
            metas.append(meta)
        except Exception as e:
            skipped.append({"oid": oid, "reason": f"{type(e).__name__}: {e}"})

    if not tensors:
        raise RuntimeError("No objects survived preprocessing; nothing to write.")

    X = np.stack(tensors).astype(np.float32)
    oids_arr = np.array(oids, dtype=object)
    medians_g = np.array([m["median_g_asinh"] for m in metas], dtype=np.float32)
    medians_r = np.array([m["median_r_asinh"] for m in metas], dtype=np.float32)
    window_end = np.array([m["window_end_mjd"] for m in metas], dtype=np.float32)
    channels = np.array(list(CHANNEL_ORDER), dtype=object)

    _sanity_check(X, oids, medians_g, medians_r, window_end)

    out_dir = tensors_dir or TENSORS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    npz_path = out_dir / f"{date}.npz"
    csv_path = out_dir / f"{date}.csv"

    np.savez_compressed(
        npz_path,
        X=X,
        oids=oids_arr,
        median_g_asinh=medians_g,
        median_r_asinh=medians_r,
        window_end_mjd=window_end,
        channels=channels,
        # Reproducibility: the exact transform parameters this archive was built with.
        meta_window_days=np.int32(window_days),
        meta_bin_days=np.int32(bin_days),
        meta_asinh_softening=np.float32(softening),
        meta_flux_zeropoint=np.float32(FLUX_ZEROPOINT),
        meta_upper_limit_sigma=np.int32(UPPER_LIMIT_SIGMA),
        meta_date=np.array(date, dtype=object),
        meta_built_at_utc=np.array(
            datetime.now(timezone.utc).isoformat(timespec="seconds"), dtype=object,
        ),
    )

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=_MANIFEST_FIELDS)
        writer.writeheader()
        for i, (oid, meta) in enumerate(zip(oids, metas)):
            row = {"idx": i, "oid": oid}
            for k in _MANIFEST_FIELDS[2:]:
                row[k] = meta[k]
            writer.writerow(row)

    summary = {
        "n_objects": len(oids),
        "n_skipped": len(skipped),
        "skipped": skipped,
        "X_shape": tuple(X.shape),
        "npz_path": str(npz_path),
        "csv_path": str(csv_path),
        "date": date,
    }
    return npz_path, csv_path, summary
