"""Phenomenological light-curve templates and their fitters.

Phase 2C contains exactly one comparator: a Gaussian bump on a constant
baseline, fit in magnitude space. It is deliberately the simplest non-trivial
transient shape, with four parameters whose meanings are unambiguous. A
Gaussian bump fits anything that brightens and fades roughly symmetrically;
an SN does that, but so do many other things. No physical interpretation is
implied.
"""
from __future__ import annotations
from typing import Any

import numpy as np
from scipy.optimize import curve_fit

MIN_POINTS_FOR_FIT = 5
_N_PARAMS = 4


def gaussian_bump_mag(
    mjd,
    amplitude_mag: float,
    peak_mjd: float,
    sigma_days: float,
    baseline_mag: float,
):
    """Magnitude-space Gaussian bump on a constant baseline.

        mag(t) = baseline_mag + amplitude_mag · exp(-(t − peak_mjd)² / (2 · sigma_days²))

    `amplitude_mag` is negative when the bump corresponds to a brightening
    (smaller magnitude → brighter source). `sigma_days` is the bump width.
    """
    t = np.asarray(mjd, dtype=float)
    return baseline_mag + amplitude_mag * np.exp(
        -((t - peak_mjd) ** 2) / (2.0 * sigma_days ** 2)
    )


def fit_gaussian_bump(
    mjd: np.ndarray,
    mag: np.ndarray,
    magerr: np.ndarray,
) -> dict[str, Any]:
    """Fit a Gaussian bump in magnitude space.

    Returns one of three result shapes, all dict-typed for easy logging:
      • {"status": "insufficient_data", "n_points": n}
      • {"status": "failed_fit", "error": "...", "n_points": n}
      • {"status": "fitted_baseline", "n_points": n, "params": {...},
         "param_errors": {...}, "predicted": np.ndarray}
    """
    mjd = np.asarray(mjd, dtype=float)
    mag = np.asarray(mag, dtype=float)
    magerr = np.asarray(magerr, dtype=float)
    n = int(len(mjd))

    if n < MIN_POINTS_FOR_FIT:
        return {"status": "insufficient_data", "n_points": n}

    # Initial guesses. Brightest point seeds peak position; spread of MJDs seeds width.
    baseline_init = float(np.median(mag))
    brightest = int(np.argmin(mag))
    amplitude_init = float(mag[brightest] - baseline_init)  # negative when brightening
    peak_init = float(mjd[brightest])
    sigma_init = max(float((mjd.max() - mjd.min()) / 4.0), 1.0)

    # Replace bad errors with the median of the good ones (or 0.1 if all are bad).
    good = np.isfinite(magerr) & (magerr > 0)
    if good.any():
        fallback = float(np.median(magerr[good]))
    else:
        fallback = 0.1
    safe_err = np.where(good, magerr, fallback)

    try:
        popt, pcov = curve_fit(
            gaussian_bump_mag, mjd, mag,
            p0=[amplitude_init, peak_init, sigma_init, baseline_init],
            sigma=safe_err, absolute_sigma=True,
            maxfev=10_000,
        )
    except Exception as e:
        return {"status": "failed_fit", "error": f"{type(e).__name__}: {e}", "n_points": n}

    perr = np.sqrt(np.abs(np.diag(pcov)))
    params = {
        "amplitude_mag": float(popt[0]),
        "peak_mjd": float(popt[1]),
        "sigma_days": float(abs(popt[2])),
        "baseline_mag": float(popt[3]),
    }
    param_errors = {
        "amplitude_mag": float(perr[0]),
        "peak_mjd": float(perr[1]),
        "sigma_days": float(perr[2]),
        "baseline_mag": float(perr[3]),
    }
    predicted = gaussian_bump_mag(mjd, *popt)
    return {
        "status": "fitted_baseline",
        "n_points": n,
        "params": params,
        "param_errors": param_errors,
        "predicted": predicted,
        "n_params": _N_PARAMS,
    }
