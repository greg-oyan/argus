"""Conservative sncosmo template-family probe for Phase 2G.

This adapter prepares local ZTF detections for a possible sncosmo fit, then
stops unless the required context is present. It never invents redshift and it
does not identify the source type. A non-fitted result is a valid outcome.
"""
from __future__ import annotations
from typing import Any, Optional
import importlib

import numpy as np
import pandas as pd

from argus.casefile.schema import ModelComparison

MODEL_TYPE = "sncosmo_template_probe"
MODEL_NAME = "sncosmo template probe"
DEFAULT_TEMPLATE = "hsiao"
DEFAULT_MODEL_FAMILY = "sncosmo_template_family"
AB_ZP = 25.0
MIN_POINTS_FOR_SNCOSMO = 6
MIN_BANDS_FOR_SNCOSMO = 2
_FID_BANDS = {1: "ztfg", 2: "ztfr"}
_FID_LABELS = {1: "g", 2: "r"}
_CAVEAT = (
    "This provides a model-family comparison only. It does not identify the "
    "object type, physical cause, or special status."
)
_LIMITATIONS = (
    "Phenomenological model-family probe - not a physical model.",
    "sncosmo templates require contextual assumptions such as redshift, usable "
    "bandpasses, and flux-calibrated photometry.",
    "ZTF magnitudes are converted to relative flux using an AB zeropoint "
    f"convention with zp={AB_ZP:.1f}; this is a preparation step, not a physical conclusion.",
    _CAVEAT,
)


def _import_sncosmo():
    return importlib.import_module("sncosmo")


def _base_comparison(
    status: str,
    *,
    filter_used: str = "g,r",
    parameters: Optional[dict[str, Any]] = None,
    fit_metrics: Optional[dict[str, Any]] = None,
    residual_summary: Optional[list[str]] = None,
    interpretation: str,
) -> ModelComparison:
    return ModelComparison(
        name=MODEL_NAME,
        model_type=MODEL_TYPE,
        filter_used=filter_used,
        status=status,
        parameters=parameters,
        fit_metrics=fit_metrics,
        residual_summary=residual_summary or [],
        interpretation=interpretation,
        limitations=list(_LIMITATIONS),
    )


def _mag_to_flux(mag: np.ndarray, magerr: np.ndarray, zp: float = AB_ZP) -> tuple[np.ndarray, np.ndarray]:
    flux = 10.0 ** (-0.4 * (mag - zp))
    fluxerr = flux * (np.log(10.0) / 2.5) * magerr
    return flux, fluxerr


def prepare_sncosmo_photometry(
    detections: pd.DataFrame,
    *,
    zp: float = AB_ZP,
) -> dict[str, Any]:
    """Convert local ZTF detections into sncosmo-style photometry arrays."""
    if detections is None or detections.empty:
        return {
            "n_points": 0,
            "bands_used": [],
            "filter_used": "",
            "data": {
                "time": np.array([], dtype=float),
                "band": np.array([], dtype=object),
                "flux": np.array([], dtype=float),
                "fluxerr": np.array([], dtype=float),
                "zp": np.array([], dtype=float),
                "zpsys": np.array([], dtype=object),
            },
        }

    required = {"mjd", "fid", "magpsf", "sigmapsf"}
    if not required.issubset(detections.columns):
        detections = pd.DataFrame(columns=list(required))

    sub = detections[list(required)].copy()
    sub = sub[sub["fid"].isin(_FID_BANDS)]
    for col in ("mjd", "fid", "magpsf", "sigmapsf"):
        sub[col] = pd.to_numeric(sub[col], errors="coerce")
    good = (
        np.isfinite(sub["mjd"])
        & np.isfinite(sub["magpsf"])
        & np.isfinite(sub["sigmapsf"])
        & (sub["sigmapsf"] > 0)
    )
    sub = sub[good].copy()
    if sub.empty:
        return {
            "n_points": 0,
            "bands_used": [],
            "filter_used": "",
            "data": {
                "time": np.array([], dtype=float),
                "band": np.array([], dtype=object),
                "flux": np.array([], dtype=float),
                "fluxerr": np.array([], dtype=float),
                "zp": np.array([], dtype=float),
                "zpsys": np.array([], dtype=object),
            },
        }

    sub = sub.sort_values(["mjd", "fid"]).reset_index(drop=True)
    mag = sub["magpsf"].to_numpy(dtype=float)
    magerr = sub["sigmapsf"].to_numpy(dtype=float)
    flux, fluxerr = _mag_to_flux(mag, magerr, zp=zp)
    bands = sub["fid"].map(_FID_BANDS).to_numpy(dtype=object)
    band_labels = sorted({_FID_LABELS[int(fid)] for fid in sub["fid"].unique()})

    data = {
        "time": sub["mjd"].to_numpy(dtype=float),
        "band": bands,
        "flux": flux,
        "fluxerr": fluxerr,
        "zp": np.full(len(sub), float(zp), dtype=float),
        "zpsys": np.full(len(sub), "ab", dtype=object),
    }
    return {
        "n_points": int(len(sub)),
        "bands_used": band_labels,
        "filter_used": ",".join(band_labels),
        "data": data,
    }


def _get_result_value(result, *names, default=None):
    for name in names:
        if isinstance(result, dict) and name in result:
            return result[name]
        if hasattr(result, name):
            return getattr(result, name)
    return default


def _fitted_parameters(model) -> dict[str, float]:
    names = list(getattr(model, "param_names", []))
    values = list(getattr(model, "parameters", []))
    out: dict[str, float] = {}
    for name, value in zip(names, values):
        try:
            f = float(value)
        except (TypeError, ValueError):
            continue
        if np.isfinite(f):
            out[str(name)] = f
    return out


def _fit_quality(result, data: dict[str, np.ndarray], fitted_model, fitted_parameters: dict[str, float]) -> tuple[dict[str, Any], list[str]]:
    flux = np.asarray(data["flux"], dtype=float)
    fluxerr = np.asarray(data["fluxerr"], dtype=float)
    predicted = None
    try:
        predicted = fitted_model.bandflux(
            data["band"], data["time"], zp=data["zp"], zpsys=data["zpsys"]
        )
        predicted = np.asarray(predicted, dtype=float)
    except Exception:
        predicted = None

    metrics: dict[str, Any] = {
        "n_points": int(len(flux)),
        "model_family": DEFAULT_MODEL_FAMILY,
        "template_name": DEFAULT_TEMPLATE,
    }
    chi2 = _get_result_value(result, "chisq", "chi2")
    ndof = _get_result_value(result, "ndof", "dof")
    try:
        if chi2 is not None:
            metrics["chi2"] = float(chi2)
        if ndof is not None:
            metrics["degrees_of_freedom"] = int(ndof)
        if chi2 is not None and ndof:
            metrics["reduced_chi2"] = float(chi2) / float(ndof)
    except (TypeError, ValueError):
        pass

    residual_summary: list[str] = []
    if predicted is not None and predicted.shape == flux.shape:
        residual = flux - predicted
        metrics["rmse_flux"] = float(np.sqrt(np.mean(residual ** 2)))
        metrics["mae_flux"] = float(np.mean(np.abs(residual)))
        valid = np.isfinite(fluxerr) & (fluxerr > 0)
        if valid.any():
            scaled = np.abs(residual[valid] / fluxerr[valid])
            metrics["median_abs_residual_over_error"] = float(np.median(scaled))
            residual_summary.append(
                "Median absolute residual is "
                f"{metrics['median_abs_residual_over_error']:.1f} times the reported flux error."
            )
    if "reduced_chi2" in metrics:
        if metrics["reduced_chi2"] < 2:
            residual_summary.append("Reduced chi-squared is close to unity for this attempted template fit.")
        else:
            residual_summary.append(
                f"Reduced chi-squared is {metrics['reduced_chi2']:.1f}; residual structure remains."
            )
    if not residual_summary:
        residual_summary.append("Fit quality could be recorded, but residual structure was not fully characterized.")

    metrics["fitted_parameter_count"] = len(fitted_parameters)
    return metrics, residual_summary


def build_sncosmo_template_probe(
    detections: pd.DataFrame,
    *,
    redshift: Optional[float] = None,
    redshift_source: Optional[str] = None,
    template_name: str = DEFAULT_TEMPLATE,
    sncosmo_module=None,
) -> ModelComparison:
    """Attempt a conservative sncosmo template-family comparison."""
    prepared = prepare_sncosmo_photometry(detections)
    n = prepared["n_points"]
    bands_used = prepared["bands_used"]
    filter_used = prepared["filter_used"] or "g,r"
    base_metrics = {
        "model_family": DEFAULT_MODEL_FAMILY,
        "template_name": template_name,
        "bands_used": bands_used,
        "n_points": n,
        "zeropoint": AB_ZP,
        "magnitude_system": "ab",
    }

    if n < MIN_POINTS_FOR_SNCOSMO:
        return _base_comparison(
            "insufficient_data",
            filter_used=filter_used,
            fit_metrics=base_metrics,
            residual_summary=[
                f"Only {n} usable detection(s) after filtering invalid magnitude/error values."
            ],
            interpretation=(
                "sncosmo template fitting was not attempted because the available "
                "detections are not sufficient for a reliable template-family comparison."
            ),
        )

    if redshift is None:
        return _base_comparison(
            "missing_required_context",
            filter_used=filter_used,
            fit_metrics={**base_metrics, "missing_context": ["redshift"]},
            residual_summary=[
                "Redshift is unavailable in the local case-file context."
            ],
            interpretation=(
                "sncosmo template fitting was not attempted because redshift is "
                "unavailable. Argus does not invent redshift for template-family comparisons."
            ),
        )

    if len(bands_used) < MIN_BANDS_FOR_SNCOSMO:
        return _base_comparison(
            "insufficient_data",
            filter_used=filter_used,
            fit_metrics=base_metrics,
            residual_summary=[
                "Only one usable band is available after filtering; multi-band coverage is required."
            ],
            interpretation=(
                "sncosmo template fitting was not attempted because the available "
                "detections are not sufficient for a reliable template-family comparison."
            ),
        )

    try:
        z = float(redshift)
    except (TypeError, ValueError):
        z = np.nan
    if not np.isfinite(z) or z < 0:
        return _base_comparison(
            "missing_required_context",
            filter_used=filter_used,
            fit_metrics={**base_metrics, "missing_context": ["valid_redshift"]},
            residual_summary=["Redshift context is present but not a finite non-negative value."],
            interpretation=(
                "sncosmo template fitting was not attempted because valid redshift "
                "context is unavailable."
            ),
        )

    if sncosmo_module is None:
        try:
            sncosmo_module = _import_sncosmo()
        except Exception:
            return _base_comparison(
                "dependency_unavailable",
                filter_used=filter_used,
                fit_metrics={**base_metrics, "assumed_redshift_source": redshift_source},
                residual_summary=["The sncosmo Python package is not available in this environment."],
                interpretation=(
                    "sncosmo template fitting was not attempted because the required "
                    "Python package is unavailable."
                ),
            )

    try:
        model = sncosmo_module.Model(source=template_name)
    except Exception as exc:
        return _base_comparison(
            "template_unavailable",
            filter_used=filter_used,
            fit_metrics={
                **base_metrics,
                "assumed_redshift": z,
                "assumed_redshift_source": redshift_source,
                "error": f"{type(exc).__name__}: {exc}",
            },
            residual_summary=[
                "The requested sncosmo template data was not available in the offline environment."
            ],
            interpretation=(
                "sncosmo template fitting was not attempted because the requested "
                "template data was unavailable locally."
            ),
        )

    try:
        model.set(z=z)
    except Exception as exc:
        return _base_comparison(
            "fit_failed",
            filter_used=filter_used,
            fit_metrics={**base_metrics, "error": f"{type(exc).__name__}: {exc}"},
            residual_summary=["The sncosmo model could not accept the provided redshift."],
            interpretation=(
                "A sncosmo template fit was attempted but failed before optimization."
            ),
        )

    data = prepared["data"]
    try:
        result, fitted_model = sncosmo_module.fit_lc(
            data, model, ["t0", "amplitude"]
        )
    except Exception as exc:
        return _base_comparison(
            "fit_failed",
            filter_used=filter_used,
            fit_metrics={
                **base_metrics,
                "assumed_redshift": z,
                "assumed_redshift_source": redshift_source,
                "error": f"{type(exc).__name__}: {exc}",
            },
            residual_summary=["sncosmo optimization failed for this template-family comparison."],
            interpretation=(
                "A sncosmo template fit was attempted but did not return a stable result."
            ),
        )

    fitted_params = _fitted_parameters(fitted_model)
    metrics, residual_summary = _fit_quality(result, data, fitted_model, fitted_params)
    metrics.update({
        "bands_used": bands_used,
        "template_name": template_name,
        "assumed_redshift": z,
        "assumed_redshift_source": redshift_source,
        "zeropoint": AB_ZP,
        "magnitude_system": "ab",
    })
    if "reduced_chi2" in metrics and metrics["reduced_chi2"] >= 2:
        quality_clause = "The attempted fit left substantial residual structure."
    elif "reduced_chi2" in metrics:
        quality_clause = "The attempted fit returned a reduced chi-squared near unity."
    else:
        quality_clause = "The attempted fit returned parameters, but residual quality is limited."

    return _base_comparison(
        "fitted",
        filter_used=filter_used,
        parameters={
            "model_family": DEFAULT_MODEL_FAMILY,
            "template_name": template_name,
            "fitted_parameters": fitted_params,
            "assumed_redshift": z,
            "assumed_redshift_source": redshift_source,
        },
        fit_metrics=metrics,
        residual_summary=residual_summary,
        interpretation=(
            "A sncosmo template-family fit was attempted using local detections. "
            f"{quality_clause} This is a model-family comparison, not an object identity claim."
        ),
    )
