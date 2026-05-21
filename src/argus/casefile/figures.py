"""Static figure generation for Argus case files."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from argus.casefile.schema import CaseFile
from argus.config import CASEFILES_DIR, LIGHTCURVES_DIR

_FID_LABELS = {1: "g", 2: "r"}
_BAND_STYLE = {
    "g": {"color": "#2ca25f", "marker": "o"},
    "r": {"color": "#de2d26", "marker": "s"},
}


@dataclass
class FigureOutputs:
    """Paths written by the static figure exporter."""
    light_curve: Path | None = None
    residuals: Path | None = None
    skipped: dict[str, str] = field(default_factory=dict)

    def paths(self) -> list[Path]:
        return [p for p in (self.light_curve, self.residuals) if p is not None]


def _import_pyplot():
    try:
        import matplotlib

        matplotlib.use("Agg", force=True)
        import matplotlib.pyplot as plt
        return plt
    except ImportError as exc:
        raise RuntimeError(
            "matplotlib is required for --write-figures. Install the dev extra "
            "or add matplotlib to the active environment."
        ) from exc


def _base_stem(json_path: Path | None, oid: str) -> str:
    if json_path is None:
        return oid
    stem = json_path.stem
    if stem.endswith(".casefile"):
        return stem.removesuffix(".casefile")
    return stem


def figure_paths_for_json(json_path: Path, oid: str) -> dict[str, Path]:
    """Return sibling figure paths for a case-file JSON path."""
    stem = _base_stem(json_path, oid)
    return {
        "light_curve": json_path.with_name(f"{stem}.lightcurve.png"),
        "residuals": json_path.with_name(f"{stem}.residuals.png"),
    }


def load_casefile_detections(
    oid: str,
    date: str,
    *,
    lightcurves_dir: Path | None = None,
) -> pd.DataFrame:
    """Load local flattened detections for a case file."""
    lc_dir = lightcurves_dir or LIGHTCURVES_DIR
    parquet_path = lc_dir / f"{date}.parquet"
    if not parquet_path.exists():
        return pd.DataFrame(columns=["mjd", "fid", "magpsf", "sigmapsf"])

    df = pd.read_parquet(parquet_path)
    if "oid" not in df.columns:
        return pd.DataFrame(columns=["mjd", "fid", "magpsf", "sigmapsf"])
    keep = [col for col in ("mjd", "fid", "magpsf", "sigmapsf") if col in df.columns]
    return df[df["oid"] == oid][keep].copy()


def _clean_detections(detections: pd.DataFrame | None) -> pd.DataFrame:
    if detections is None or detections.empty:
        return pd.DataFrame(columns=["mjd", "fid", "magpsf", "sigmapsf", "band"])
    df = detections.copy()
    for col in ("mjd", "fid", "magpsf", "sigmapsf"):
        if col not in df.columns:
            df[col] = np.nan
        df[col] = pd.to_numeric(df[col], errors="coerce")
    df = df.dropna(subset=["mjd", "magpsf"])
    df["band"] = df["fid"].map(lambda fid: _FID_LABELS.get(int(fid), str(int(fid))) if np.isfinite(fid) else "unknown")
    return df.sort_values("mjd")


def write_light_curve_figure(
    case: CaseFile,
    detections: pd.DataFrame | None,
    path: Path,
) -> Path:
    """Write a static observed light-curve PNG."""
    plt = _import_pyplot()
    df = _clean_detections(detections)

    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(9.5, 5.4), dpi=140)
    ax.set_title(f"Observed light curve: {case.oid}")
    ax.set_xlabel("MJD")
    ax.set_ylabel("Magnitude")
    ax.grid(True, alpha=0.25)

    if df.empty:
        ax.text(
            0.5,
            0.5,
            "No usable detections available",
            transform=ax.transAxes,
            ha="center",
            va="center",
        )
    else:
        for band in sorted(df["band"].dropna().unique()):
            sub = df[df["band"] == band]
            style = _BAND_STYLE.get(str(band), {"color": "#525252", "marker": "o"})
            errors = pd.to_numeric(sub["sigmapsf"], errors="coerce")
            yerr = errors.where(np.isfinite(errors) & (errors > 0))
            has_errors = yerr.notna().any()
            if has_errors:
                ax.errorbar(
                    sub["mjd"],
                    sub["magpsf"],
                    yerr=yerr,
                    fmt=style["marker"],
                    color=style["color"],
                    ecolor=style["color"],
                    elinewidth=0.8,
                    capsize=2,
                    markersize=4,
                    linestyle="none",
                    label=f"{band}-band",
                    alpha=0.85,
                )
            else:
                ax.scatter(
                    sub["mjd"],
                    sub["magpsf"],
                    marker=style["marker"],
                    color=style["color"],
                    s=22,
                    label=f"{band}-band",
                    alpha=0.85,
                )
        ax.invert_yaxis()
        ax.legend(loc="best", frameon=False)

    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
    return path


def _field(obj: Any, name: str, default=None):
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(name, default)
    return getattr(obj, name, default)


def _gaussian_residual_points(case: CaseFile) -> list[dict[str, float]]:
    for comparison in case.model_comparisons or []:
        if _field(comparison, "model_type") != "gaussian_bump":
            continue
        metrics = _field(comparison, "fit_metrics") or {}
        points = metrics.get("point_residuals") or metrics.get("residual_points")
        if isinstance(points, list):
            cleaned: list[dict[str, float]] = []
            for point in points:
                if not isinstance(point, dict):
                    continue
                try:
                    mjd = float(point.get("mjd"))
                    residual = float(point.get("residual_mag", point.get("residual")))
                except (TypeError, ValueError):
                    continue
                if np.isfinite(mjd) and np.isfinite(residual):
                    cleaned.append({"mjd": mjd, "residual_mag": residual})
            return cleaned
    return []


def write_residual_figure_if_available(case: CaseFile, path: Path) -> Path | None:
    """Write residual PNG only when point-level residual data exists."""
    points = _gaussian_residual_points(case)
    if not points:
        return None

    plt = _import_pyplot()
    df = pd.DataFrame(points).sort_values("mjd")
    path.parent.mkdir(parents=True, exist_ok=True)
    fig, ax = plt.subplots(figsize=(9.5, 4.2), dpi=140)
    ax.axhline(0.0, color="#525252", linewidth=1.0, alpha=0.8)
    ax.scatter(df["mjd"], df["residual_mag"], color="#2b6cb0", s=22, alpha=0.85)
    ax.set_title(f"Gaussian comparator residuals: {case.oid}")
    ax.set_xlabel("MJD")
    ax.set_ylabel("Residual magnitude")
    ax.grid(True, alpha=0.25)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
    return path


def write_casefile_figures(
    case: CaseFile,
    *,
    date: str | None = None,
    detections: pd.DataFrame | None = None,
    lightcurves_dir: Path | None = None,
    json_path: Path | None = None,
    output_dir: Path | None = None,
) -> FigureOutputs:
    """Write static figures for a case file and return written paths."""
    out = output_dir or (json_path.parent if json_path is not None else CASEFILES_DIR)
    stem = _base_stem(json_path, case.oid)
    light_curve_path = out / f"{stem}.lightcurve.png"
    residual_path = out / f"{stem}.residuals.png"

    if detections is None:
        if date is None:
            detections = pd.DataFrame(columns=["mjd", "fid", "magpsf", "sigmapsf"])
        else:
            detections = load_casefile_detections(
                case.oid,
                date,
                lightcurves_dir=lightcurves_dir,
            )

    outputs = FigureOutputs()
    outputs.light_curve = write_light_curve_figure(case, detections, light_curve_path)
    residual = write_residual_figure_if_available(case, residual_path)
    if residual is None:
        outputs.skipped["residuals"] = "Point-level Gaussian residual data is not present."
    else:
        outputs.residuals = residual
    return outputs
