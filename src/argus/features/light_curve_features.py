"""Standardized descriptive features via the external `light-curve` package.

Phase 2F keeps this layer deliberately small: one r-band feature summary built
from already-ingested detections. The adapter is defensive so case-file builds
continue to work when the optional package is not installed.
"""
from __future__ import annotations
from dataclasses import asdict
import importlib
from typing import Optional

import numpy as np

from argus.casefile.schema import FeatureSummary

SOURCE = "light-curve"
MIN_POINTS_FOR_FEATURES = 5
_CAVEAT = (
    "Feature values are descriptive summaries only and do not identify the "
    "object type."
)


def _import_light_curve():
    return importlib.import_module("light_curve")


def _clean_arrays(
    mjd,
    mag,
    magerr: Optional[np.ndarray],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    t = np.atleast_1d(np.asarray(mjd, dtype=float))
    y = np.atleast_1d(np.asarray(mag, dtype=float))
    if y.shape != t.shape:
        return np.array([]), np.array([]), np.array([])

    if magerr is None:
        e = np.full_like(t, np.nan, dtype=float)
    else:
        e_in = np.atleast_1d(np.asarray(magerr, dtype=float))
        e = e_in if e_in.shape == t.shape else np.full_like(t, np.nan, dtype=float)

    good = np.isfinite(t) & np.isfinite(y)
    t = t[good]
    y = y[good]
    e = e[good]
    if len(t) == 0:
        return t, y, e

    valid_err = np.isfinite(e) & (e > 0)
    fallback = float(np.median(e[valid_err])) if valid_err.any() else 0.1
    e = np.where(valid_err, e, fallback)

    order = np.argsort(t)
    t = t[order]
    y = y[order]
    e = e[order]

    unique_t, inverse = np.unique(t, return_inverse=True)
    if len(unique_t) == len(t):
        return t, y, e

    y_folded = np.empty_like(unique_t, dtype=float)
    e_folded = np.empty_like(unique_t, dtype=float)
    for i in range(len(unique_t)):
        mask = inverse == i
        weights = 1.0 / (e[mask] ** 2)
        weight_sum = float(np.sum(weights))
        y_folded[i] = float(np.sum(y[mask] * weights) / weight_sum)
        e_folded[i] = float(np.sqrt(1.0 / weight_sum))
    return unique_t, y_folded, e_folded


def _feature_extractors(lc):
    return [
        lc.Amplitude(),
        lc.StandardDeviation(),
        lc.Median(),
        lc.MedianAbsoluteDeviation(),
        lc.InterPercentileRange(quantile=0.25),
        lc.MaximumSlope(),
    ]


def _plain_feature_value(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return None
    return value if np.isfinite(value) else None


def _interpret_computed_features(features: dict[str, float | None], band: str) -> str:
    amplitude = features.get("amplitude")
    std = features.get("standard_deviation")

    if amplitude is None:
        range_clause = "The observed brightness range could not be summarized."
    else:
        observed_range = 2.0 * amplitude
        if observed_range >= 1.0:
            range_clause = f"The {band}-band observed brightness range is wide ({observed_range:.2f} mag)."
        elif observed_range <= 0.2:
            range_clause = f"The {band}-band observed brightness range is narrow ({observed_range:.2f} mag)."
        else:
            range_clause = f"The {band}-band observed brightness range is moderate ({observed_range:.2f} mag)."

    if std is None:
        scatter_clause = "Scatter could not be summarized."
    elif std >= 0.20:
        scatter_clause = f"Standardized scatter is high for this detection set ({std:.2f} mag)."
    elif std <= 0.05:
        scatter_clause = f"Standardized scatter is low for this detection set ({std:.2f} mag)."
    else:
        scatter_clause = f"Standardized scatter is moderate for this detection set ({std:.2f} mag)."

    return (
        f"Descriptive light-curve features were computed for {band}-band detections "
        f"using the light-curve package. {range_clause} {scatter_clause} These "
        "features support comparison across objects."
    )


def extract_light_curve_features(
    mjd,
    mag,
    magerr=None,
    *,
    band: str = "r",
) -> FeatureSummary:
    """Compute a small, stable feature subset for one band.

    The computation is offline and uses only the arrays provided by the caller.
    """
    t, y, e = _clean_arrays(mjd, mag, magerr)
    n = int(len(y))
    if n < MIN_POINTS_FOR_FEATURES:
        return FeatureSummary(
            source=SOURCE,
            band=band,
            status="insufficient_data",
            n_points=n,
            features={},
            interpretation=(
                f"Standardized light-curve features were not computed for {band}-band: "
                f"only {n} usable detection(s) were available, below the minimum of "
                f"{MIN_POINTS_FOR_FEATURES}."
            ),
            caveat=_CAVEAT,
        )

    try:
        lc = _import_light_curve()
    except Exception:
        return FeatureSummary(
            source=SOURCE,
            band=band,
            status="dependency_unavailable",
            n_points=n,
            features={},
            interpretation=(
                "The light-curve package is not available, so standardized "
                "descriptive features were not computed. The case file remains "
                "usable without this optional evidence layer."
            ),
            caveat=_CAVEAT,
        )

    try:
        extractor = lc.Extractor(*_feature_extractors(lc))
        raw_values = extractor(t, y, e)
        names = list(extractor.names)
        values = np.atleast_1d(np.asarray(raw_values, dtype=float))
        features = {
            str(name): _plain_feature_value(value)
            for name, value in zip(names, values)
        }
    except Exception as exc:
        return FeatureSummary(
            source=SOURCE,
            band=band,
            status="failed",
            n_points=n,
            features={},
            interpretation=(
                "The light-curve package was available, but feature extraction "
                f"failed with {type(exc).__name__}: {exc}."
            ),
            caveat=_CAVEAT,
        )

    return FeatureSummary(
        source=SOURCE,
        band=band,
        status="computed",
        n_points=n,
        features=features,
        interpretation=_interpret_computed_features(features, band),
        caveat=_CAVEAT,
    )


def feature_summary_to_dict(summary: FeatureSummary) -> dict:
    """Convenience helper for callers that need a JSON-ready dict."""
    return asdict(summary)
