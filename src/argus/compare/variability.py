"""Descriptive variability comparator for Phase 2D.

This module measures the shape texture of one filtered light curve. It is not a
classifier and it does not attach a physical meaning to the source. The goal is
only to separate "few smooth turns" from "repeated or irregular changes" well
enough for a human-readable case file.
"""
from __future__ import annotations
from typing import Any, Optional

import numpy as np

MIN_POINTS_FOR_VARIABILITY = 5
MATERIAL_SCATTER_TO_ERROR_RATIO = 3.0
MATERIAL_RANGE_TO_ERROR_RATIO = 6.0
REPEATED_EXTREMA_THRESHOLD = 3


def _as_clean_sorted_arrays(
    mjd: np.ndarray,
    mag: np.ndarray,
    magerr: Optional[np.ndarray],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    t = np.atleast_1d(np.asarray(mjd, dtype=float))
    y = np.atleast_1d(np.asarray(mag, dtype=float))

    if magerr is None:
        e = np.full_like(t, np.nan, dtype=float)
    else:
        e_in = np.atleast_1d(np.asarray(magerr, dtype=float))
        e = e_in if e_in.shape == t.shape else np.full_like(t, np.nan, dtype=float)

    if y.shape != t.shape:
        return np.array([]), np.array([]), np.array([])

    good = np.isfinite(t) & np.isfinite(y)
    t = t[good]
    y = y[good]
    e = e[good]
    if len(t) == 0:
        return t, y, e

    order = np.argsort(t)
    return t[order], y[order], e[order]


def _rolling_median(values: np.ndarray, window: int) -> np.ndarray:
    if window <= 1 or len(values) <= 2:
        return values.copy()
    half = window // 2
    out = np.empty_like(values, dtype=float)
    for i in range(len(values)):
        lo = max(0, i - half)
        hi = min(len(values), i + half + 1)
        out[i] = float(np.median(values[lo:hi]))
    return out


def _smoothing_window(n_points: int) -> int:
    if n_points >= 15:
        return 5
    if n_points >= 5:
        return 3
    return 1


def _compressed_delta_signs(values: np.ndarray, tolerance: float) -> list[int]:
    signs: list[int] = []
    for delta in np.diff(values):
        if abs(float(delta)) <= tolerance:
            continue
        sign = 1 if delta > 0 else -1
        if not signs or signs[-1] != sign:
            signs.append(sign)
    return signs


def summarize_variability_texture(
    mjd: np.ndarray,
    mag: np.ndarray,
    magerr: Optional[np.ndarray] = None,
) -> dict[str, Any]:
    """Return non-physical variability texture metrics for one light curve.

    The returned numbers are descriptive only: range, robust scatter, a smoothed
    turning-point count, and whether scatter is large relative to reported
    photometric errors when those errors are usable.
    """
    t, y, e = _as_clean_sorted_arrays(mjd, mag, magerr)
    n = int(len(y))
    if n < MIN_POINTS_FOR_VARIABILITY:
        return {
            "status": "insufficient_data",
            "n_points": n,
            "minimum_points": MIN_POINTS_FOR_VARIABILITY,
        }

    mag_min = float(np.min(y))
    mag_max = float(np.max(y))
    mag_median = float(np.median(y))
    observed_range = float(mag_max - mag_min)
    robust_scatter = float(1.4826 * np.median(np.abs(y - mag_median)))
    time_span = float(np.max(t) - np.min(t)) if n > 1 else 0.0

    valid_errors = e[np.isfinite(e) & (e > 0)]
    if len(valid_errors):
        median_error = float(np.median(valid_errors))
        scatter_to_error = float(robust_scatter / median_error) if median_error > 0 else None
        range_to_error = float(observed_range / median_error) if median_error > 0 else None
        materially_larger = bool(
            (scatter_to_error is not None and scatter_to_error >= MATERIAL_SCATTER_TO_ERROR_RATIO)
            or (range_to_error is not None and range_to_error >= MATERIAL_RANGE_TO_ERROR_RATIO)
        )
    else:
        median_error = None
        scatter_to_error = None
        range_to_error = None
        materially_larger = None

    window = _smoothing_window(n)
    smoothed = _rolling_median(y, window)
    if median_error is not None:
        tolerance = max(0.02, 0.5 * median_error)
    else:
        tolerance = max(0.02, 0.05 * robust_scatter)
    signs = _compressed_delta_signs(smoothed, tolerance)
    sign_changes = max(0, len(signs) - 1)
    local_extrema = sign_changes

    if materially_larger is False:
        behavior_hint = "flat_or_measurement_level"
    elif local_extrema >= REPEATED_EXTREMA_THRESHOLD:
        behavior_hint = "repeated_or_irregular"
    elif local_extrema <= 1:
        behavior_hint = "single_smooth_or_monotonic"
    else:
        behavior_hint = "mixed"

    return {
        "status": "computed",
        "n_points": n,
        "time_span_days": time_span,
        "mag_min": mag_min,
        "mag_max": mag_max,
        "mag_median": mag_median,
        "observed_mag_range": observed_range,
        "robust_scatter_mag": robust_scatter,
        "median_photometric_error_mag": median_error,
        "scatter_to_error_ratio": scatter_to_error,
        "range_to_error_ratio": range_to_error,
        "variability_materially_larger_than_errors": materially_larger,
        "smoothing_window_points": window,
        "sign_change_tolerance_mag": float(tolerance),
        "smoothed_sign_changes": sign_changes,
        "local_extrema_count_after_smoothing": local_extrema,
        "behavior_hint": behavior_hint,
    }


def interpretation_from_variability_metrics(metrics: dict[str, Any], filter_name: str = "r") -> str:
    """Plain-English interpretation of the descriptive metrics."""
    if metrics.get("status") == "insufficient_data":
        return (
            f"The {filter_name}-band variability check was not computed: only "
            f"{metrics.get('n_points', 0)} detection(s) were available, below the "
            f"minimum of {metrics.get('minimum_points', MIN_POINTS_FOR_VARIABILITY)}. "
            "This does not support a conclusion about the light-curve shape."
        )

    n = metrics["n_points"]
    mag_range = metrics["observed_mag_range"]
    scatter = metrics["robust_scatter_mag"]
    extrema = metrics["local_extrema_count_after_smoothing"]
    window = metrics["smoothing_window_points"]
    material = metrics["variability_materially_larger_than_errors"]
    behavior = metrics["behavior_hint"]

    if material is True:
        error_clause = "The scatter is materially larger than the reported photometric errors."
    elif material is False:
        error_clause = "The scatter is comparable to the reported photometric errors."
    else:
        error_clause = (
            "Reported photometric errors were missing or unusable, so scatter "
            "cannot be compared to error size."
        )

    if behavior == "repeated_or_irregular":
        shape_clause = (
            "The smoothed sequence has multiple meaningful turns, which suggests "
            "repeated or irregular brightness changes more than one smooth bump."
        )
    elif behavior == "single_smooth_or_monotonic":
        shape_clause = (
            "The smoothed sequence has few meaningful turns, so this check does "
            "not favor repeated changes over one smooth episode."
        )
    elif behavior == "flat_or_measurement_level":
        shape_clause = (
            "The measured changes are small relative to the reported errors, so "
            "this check treats the sequence as measurement-level or nearly flat."
        )
    else:
        shape_clause = (
            "The smoothed sequence has some turn structure, but the result is "
            "mixed rather than a clear repeated-change pattern."
        )

    return (
        f"The {filter_name}-band detections ({n} point(s)) span {mag_range:.2f} mag "
        f"with robust scatter {scatter:.2f} mag. After {window}-point smoothing, "
        f"{extrema} local extrema/sign change(s) were counted. {error_clause} "
        f"{shape_clause} This is descriptive only: it does not identify an object "
        "type, physical cause, or special status."
    )
