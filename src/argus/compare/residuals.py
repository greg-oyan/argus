"""Residual scalars and a templated plain-English interpretation.

`compute_residuals` is the numerical layer: rmse, mae, residual moments,
reduced chi-squared when defensible.

`interpret_residuals` is the narrative layer: a fixed set of structural checks
that produce one short sentence each when their condition fires. Deterministic;
no model-written prose.
"""
from __future__ import annotations
from typing import Any, Optional

import numpy as np


def compute_residuals(
    observed: np.ndarray,
    predicted: np.ndarray,
    errors: Optional[np.ndarray] = None,
    mjd: Optional[np.ndarray] = None,
    n_params: int = 4,
) -> dict[str, Any]:
    """Compute fit-quality scalars from observed vs predicted values.

    `reduced_chi2` is only set when per-point errors are all positive and
    finite and the number of points exceeds `n_params`. Otherwise it is
    omitted (rather than reported with caveats inside a number).
    """
    observed = np.asarray(observed, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    res = observed - predicted
    n = int(len(res))

    out: dict[str, Any] = {
        "n_points": n,
        "rmse": float(np.sqrt(np.mean(res ** 2))) if n > 0 else None,
        "mae": float(np.mean(np.abs(res))) if n > 0 else None,
        "residual_mean": float(np.mean(res)) if n > 0 else None,
        "residual_std": float(np.std(res)) if n > 0 else None,
        "largest_abs_residual": float(np.max(np.abs(res))) if n > 0 else None,
    }
    if mjd is not None and n > 0:
        out["largest_residual_mjd"] = float(np.asarray(mjd)[int(np.argmax(np.abs(res)))])
    if errors is not None and n > 0:
        e = np.asarray(errors, dtype=float)
        valid = np.isfinite(e) & (e > 0)
        if valid.all() and n > n_params:
            dof = n - n_params
            out["reduced_chi2"] = float(np.sum((res[valid] / e[valid]) ** 2) / dof)
    return out


def build_residual_points(
    mjd: np.ndarray,
    observed: np.ndarray,
    predicted: np.ndarray,
    errors: Optional[np.ndarray] = None,
) -> list[dict[str, float]]:
    """Return point-level magnitude residuals using observed - model convention."""
    mjd = np.asarray(mjd, dtype=float)
    observed = np.asarray(observed, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    err = None if errors is None else np.asarray(errors, dtype=float)

    points: list[dict[str, float]] = []
    for i in range(min(len(mjd), len(observed), len(predicted))):
        t = float(mjd[i])
        obs = float(observed[i])
        model = float(predicted[i])
        residual = obs - model
        if not (
            np.isfinite(t)
            and np.isfinite(obs)
            and np.isfinite(model)
            and np.isfinite(residual)
        ):
            continue
        point = {
            "mjd": t,
            "observed_mag": obs,
            "model_mag": model,
            "residual_mag": float(residual),
        }
        if err is not None and i < len(err):
            magerr = float(err[i])
            if np.isfinite(magerr) and magerr > 0:
                point["magerr"] = magerr
        points.append(point)

    return sorted(points, key=lambda point: point["mjd"])


def interpret_residuals(
    mjd: np.ndarray,
    observed: np.ndarray,
    predicted: np.ndarray,
    fit_params: dict[str, float],
) -> list[str]:
    """A short list of plain-English notes about *where* the fit failed."""
    mjd = np.asarray(mjd, dtype=float)
    observed = np.asarray(observed, dtype=float)
    predicted = np.asarray(predicted, dtype=float)
    res = observed - predicted
    n = int(len(res))
    notes: list[str] = []
    if n < 3:
        notes.append("Residual structure cannot be characterized — too few points.")
        return notes

    # 1. Concentration of absolute residuals across the three time-thirds.
    order = np.argsort(mjd)
    sorted_abs_res = np.abs(res[order])
    third = max(n // 3, 1)
    first_mean = float(sorted_abs_res[:third].mean())
    middle_mean = float(sorted_abs_res[third:2 * third].mean()) if 2 * third <= n else 0.0
    last_mean = float(sorted_abs_res[2 * third:].mean())
    means = (first_mean, middle_mean, last_mean)
    avg = sum(means) / 3.0
    if avg > 0:
        max_idx = int(np.argmax(means))
        if means[max_idx] > 1.5 * avg:
            region = ("earliest", "middle", "most recent")[max_idx]
            notes.append(
                f"Residuals are concentrated in the {region} portion of the light curve."
            )

    # 2. Where the fitted peak landed relative to the data.
    peak = fit_params.get("peak_mjd")
    sigma = fit_params.get("sigma_days")
    if peak is not None and sigma is not None and sigma > 0:
        if peak < float(mjd.min()) or peak > float(mjd.max()):
            notes.append(
                "The fitted peak time lies outside the observed time range; "
                "the baseline term is doing most of the fitting work."
            )
        else:
            near_peak = int((np.abs(mjd - peak) < sigma).sum())
            if near_peak < 2:
                notes.append(
                    "The fitted peak time falls in a region with fewer than two "
                    "nearby detections; peak placement is loosely constrained."
                )

    # 3. Uneven coverage (large gap relative to median cadence).
    sorted_mjd = np.sort(mjd)
    if len(sorted_mjd) >= 2:
        gaps = np.diff(sorted_mjd)
        med_gap = float(np.median(gaps))
        max_gap = float(gaps.max())
        if med_gap > 0 and max_gap > 10 * med_gap:
            notes.append(
                f"Coverage is highly uneven (largest gap {max_gap:.0f} days vs "
                f"median gap {med_gap:.2f} days); fit quality is limited by sparse coverage."
            )

    # 4. Residual scatter vs. fitted bump amplitude.
    res_std = float(np.std(res))
    amp = fit_params.get("amplitude_mag")
    if amp is not None and abs(amp) > 0:
        if res_std / abs(amp) > 0.5:
            notes.append(
                f"Residual scatter (σ ≈ {res_std:.2f} mag) is comparable to the "
                f"fitted bump amplitude ({amp:.2f} mag) — the data is not well "
                "described by a single bump."
            )

    if not notes:
        notes.append("No striking residual structure relative to the fit.")
    return notes
