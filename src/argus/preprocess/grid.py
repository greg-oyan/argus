"""Windowing, binning, and per-object tensorization. No file IO."""
from __future__ import annotations
from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from argus.config import (
    ASINH_SOFTENING, BIN_DAYS, N_CHANNELS, WINDOW_DAYS,
)
from argus.preprocess.photometry import (
    asinh_stretch, asinh_stretch_err, diffmaglim_to_noise, magerr_to_fluxerr, mag_to_flux,
)

FID_G, FID_R = 1, 2
_FID_TO_COL_FLUX = {FID_G: 0, FID_R: 3}  # column index of *_flux for each fid


@dataclass
class Event:
    mjd: float
    fid: int                # 1=g, 2=r
    flux: float             # 0.0 for upper limits
    flux_err: float
    is_upper_limit: bool


def collect_events(
    detections_df: pd.DataFrame | None,
    non_detections_df: pd.DataFrame | None,
) -> list[Event]:
    """Build a unified Event list in flux units from detection + non-detection rows."""
    events: list[Event] = []
    if detections_df is not None and len(detections_df):
        for r in detections_df.itertuples(index=False):
            mag = getattr(r, "magpsf", None)
            magerr = getattr(r, "sigmapsf", None)
            fid = getattr(r, "fid", None)
            mjd = getattr(r, "mjd", None)
            if mag is None or magerr is None or fid is None or mjd is None:
                continue
            if not (np.isfinite(mag) and np.isfinite(magerr) and np.isfinite(mjd)):
                continue
            fid = int(fid)
            if fid not in _FID_TO_COL_FLUX:
                continue
            events.append(Event(
                mjd=float(mjd), fid=fid,
                flux=float(mag_to_flux(mag)),
                flux_err=float(magerr_to_fluxerr(mag, magerr)),
                is_upper_limit=False,
            ))
    if non_detections_df is not None and len(non_detections_df):
        for r in non_detections_df.itertuples(index=False):
            lim = getattr(r, "diffmaglim", None)
            fid = getattr(r, "fid", None)
            mjd = getattr(r, "mjd", None)
            if lim is None or fid is None or mjd is None:
                continue
            if not (np.isfinite(lim) and np.isfinite(mjd)):
                continue
            fid = int(fid)
            if fid not in _FID_TO_COL_FLUX:
                continue
            events.append(Event(
                mjd=float(mjd), fid=fid,
                flux=0.0,
                flux_err=float(diffmaglim_to_noise(lim)),
                is_upper_limit=True,
            ))
    return events


def select_window(last_mjd: float, window_days: int = WINDOW_DAYS) -> tuple[float, float]:
    """Right-aligned window ending at last_mjd (inclusive on both ends)."""
    return (last_mjd - window_days, last_mjd)


def _ivw_combine(fluxes: np.ndarray, errs: np.ndarray) -> tuple[float, float]:
    """Inverse-variance weighted mean of detections in a single bin."""
    w = 1.0 / np.maximum(errs * errs, 1e-30)
    mean = float((w * fluxes).sum() / w.sum())
    err = float(1.0 / np.sqrt(w.sum()))
    return mean, err


def _uplim_combine(noises: np.ndarray) -> float:
    """Combine N independent 1σ upper-limit noises into one bin noise (quadrature)."""
    return float(1.0 / np.sqrt(np.sum(1.0 / (noises * noises))))


def bin_to_grid(
    events: list[Event],
    window_start: float,
    window_end: float,
    bin_days: int = BIN_DAYS,
) -> np.ndarray:
    """Bin events into a (T, 6) array: [g_flux, g_err, g_mask, r_flux, r_err, r_mask].

    Per bin per filter:
      • One or more detections present: inverse-variance weighted mean; flux>0, mask=1.
      • Only upper limits present: flux=0, err=quadrature-combined noise, mask=1.
      • Empty: zeros, mask=0.

    Detections and upper limits are NEVER inverse-variance-averaged together; a single
    detection in a bin makes the bin a detection bin, even if upper limits also fell in it.
    """
    n_bins = int(round((window_end - window_start) / bin_days))
    arr = np.zeros((n_bins, N_CHANNELS), dtype=np.float32)

    det_bucket: dict[tuple[int, int], list[Event]] = {}
    uplim_bucket: dict[tuple[int, int], list[Event]] = {}
    for ev in events:
        if ev.mjd < window_start or ev.mjd > window_end:
            continue
        b = int((ev.mjd - window_start) / bin_days)
        if b >= n_bins:
            b = n_bins - 1
        if b < 0:
            continue
        key = (b, ev.fid)
        (uplim_bucket if ev.is_upper_limit else det_bucket).setdefault(key, []).append(ev)

    # detections first
    for (b, fid), evs in det_bucket.items():
        col = _FID_TO_COL_FLUX[fid]
        fluxes = np.array([e.flux for e in evs], dtype=np.float64)
        errs = np.array([e.flux_err for e in evs], dtype=np.float64)
        mean, err = _ivw_combine(fluxes, errs)
        arr[b, col] = mean
        arr[b, col + 1] = err
        arr[b, col + 2] = 1.0

    # then upper limits, only into bins without a detection in that filter
    for (b, fid), evs in uplim_bucket.items():
        col = _FID_TO_COL_FLUX[fid]
        if arr[b, col + 2] > 0:
            continue
        noises = np.array([e.flux_err for e in evs], dtype=np.float64)
        arr[b, col] = 0.0
        arr[b, col + 1] = _uplim_combine(noises)
        arr[b, col + 2] = 1.0

    return arr


def asinh_and_median_subtract(
    arr: np.ndarray,
    softening: float = ASINH_SOFTENING,
) -> tuple[np.ndarray, dict[str, Any]]:
    """Apply asinh to flux/err (per filter), subtract per-filter median over detection bins only.

    Detection bins = mask=1 AND flux>0. Upper-limit bins (mask=1, flux=0) are excluded
    from the median. If a filter has zero detection bins, median falls back to 0.0 and
    a *_fallback flag is set in the returned metadata. Mask=0 bins remain (0, 0, 0).
    """
    out = arr.copy()
    medians_asinh: dict[str, float] = {}
    medians_raw_flux: dict[str, float] = {}
    fallback: dict[str, bool] = {}

    for fname, col in (("g", 0), ("r", 3)):
        flux = out[:, col].astype(np.float64).copy()
        err = out[:, col + 1].astype(np.float64).copy()
        mask = out[:, col + 2]

        det_bins = (mask > 0) & (flux > 0)
        stretched_flux = asinh_stretch(flux, softening)
        stretched_err = asinh_stretch_err(flux, err, softening)

        if det_bins.any():
            med_asinh = float(np.median(stretched_flux[det_bins]))
            med_raw = float(np.median(flux[det_bins]))
            fb = False
        else:
            med_asinh = 0.0
            med_raw = 0.0
            fb = True

        observed = mask > 0
        stretched_flux[observed] -= med_asinh
        # mask=0 bins: enforce (0, 0, 0)
        stretched_flux[~observed] = 0.0
        stretched_err[~observed] = 0.0

        out[:, col] = stretched_flux.astype(np.float32)
        out[:, col + 1] = stretched_err.astype(np.float32)
        medians_asinh[fname] = med_asinh
        medians_raw_flux[fname] = med_raw
        fallback[fname] = fb

    return out, {
        "median_g_asinh": medians_asinh["g"],
        "median_r_asinh": medians_asinh["r"],
        "median_g_raw_flux": medians_raw_flux["g"],
        "median_r_raw_flux": medians_raw_flux["r"],
        "median_g_fallback": fallback["g"],
        "median_r_fallback": fallback["r"],
    }


def tensorize_object(
    detections_df: pd.DataFrame | None,
    non_detections_df: pd.DataFrame | None,
    last_mjd: float,
    *,
    window_days: int = WINDOW_DAYS,
    bin_days: int = BIN_DAYS,
    softening: float = ASINH_SOFTENING,
) -> tuple[np.ndarray, dict[str, Any]]:
    """Full per-object pipeline: events → window → bin → asinh + median-subtract → diagnostics."""
    events = collect_events(detections_df, non_detections_df)
    start, end = select_window(last_mjd, window_days)
    binned = bin_to_grid(events, start, end, bin_days)
    final, transform_meta = asinh_and_median_subtract(binned, softening)

    in_window = [e for e in events if start <= e.mjd <= end]
    n_obs_g = sum(1 for e in in_window if not e.is_upper_limit and e.fid == FID_G)
    n_obs_r = sum(1 for e in in_window if not e.is_upper_limit and e.fid == FID_R)
    n_uplim_g = sum(1 for e in in_window if e.is_upper_limit and e.fid == FID_G)
    n_uplim_r = sum(1 for e in in_window if e.is_upper_limit and e.fid == FID_R)

    g_mask = final[:, 2] > 0
    r_mask = final[:, 5] > 0
    total_unmasked = int(g_mask.sum() + r_mask.sum())
    total_slots = 2 * final.shape[0]
    frac_bins_masked = 1.0 - total_unmasked / total_slots

    return final, {
        "window_end_mjd": float(end),
        "n_obs_g": n_obs_g,
        "n_obs_r": n_obs_r,
        "n_uplim_g": n_uplim_g,
        "n_uplim_r": n_uplim_r,
        "total_unmasked_bins": total_unmasked,
        "frac_bins_masked": float(frac_bins_masked),
        **transform_meta,
    }
