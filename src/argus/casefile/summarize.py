"""Pure functions that compute the four parts of a case file from local data.

Every function here is deterministic and offline. No model output, no network,
no generative prose: only templated English driven by the numbers in front of us.
"""
from __future__ import annotations
from typing import Optional

import numpy as np
import pandas as pd

from argus.casefile.schema import (
    CandidateExplanation, FilterStats, LightCurveSummary,
)

_FID_NAME = {1: "g", 2: "r"}


def _opt_float(x) -> Optional[float]:
    try:
        f = float(x)
        return f if np.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def summarize_light_curve(
    detections: pd.DataFrame,
    non_detections: pd.DataFrame,
) -> LightCurveSummary:
    """Structured summary of the photometric record from local files."""
    n_det = int(len(detections)) if detections is not None else 0
    n_nondet = int(len(non_detections)) if non_detections is not None else 0

    filters_observed: set[str] = set()
    if n_det and "fid" in detections.columns:
        filters_observed |= {_FID_NAME[int(f)] for f in detections["fid"].dropna().unique() if int(f) in _FID_NAME}
    if n_nondet and "fid" in non_detections.columns:
        filters_observed |= {_FID_NAME[int(f)] for f in non_detections["fid"].dropna().unique() if int(f) in _FID_NAME}

    all_mjd: list[float] = []
    if n_det and "mjd" in detections.columns:
        all_mjd.extend(float(x) for x in detections["mjd"].dropna())
    if n_nondet and "mjd" in non_detections.columns:
        all_mjd.extend(float(x) for x in non_detections["mjd"].dropna())

    first_mjd = min(all_mjd) if all_mjd else None
    last_mjd = max(all_mjd) if all_mjd else None
    time_span = (last_mjd - first_mjd) if (first_mjd is not None and last_mjd is not None) else None

    most_recent_det = _opt_float(detections["mjd"].max()) if n_det and "mjd" in detections.columns else None

    longest_gap: Optional[float] = None
    if n_det >= 2 and "mjd" in detections.columns:
        sorted_mjd = sorted(float(x) for x in detections["mjd"].dropna())
        if len(sorted_mjd) >= 2:
            longest_gap = float(max(b - a for a, b in zip(sorted_mjd, sorted_mjd[1:])))

    per_filter: list[FilterStats] = []
    for fid, fname in _FID_NAME.items():
        d_f = detections[detections["fid"] == fid] if n_det and "fid" in detections.columns else pd.DataFrame()
        nd_f = (non_detections[non_detections["fid"] == fid]
                if n_nondet and "fid" in non_detections.columns else pd.DataFrame())
        if len(d_f) == 0 and len(nd_f) == 0:
            continue
        d_mjd = d_f["mjd"].dropna() if "mjd" in d_f.columns else pd.Series(dtype=float)
        nd_mjd = nd_f["mjd"].dropna() if "mjd" in nd_f.columns else pd.Series(dtype=float)
        first = float(d_mjd.min()) if len(d_mjd) else (float(nd_mjd.min()) if len(nd_mjd) else None)
        last = float(d_mjd.max()) if len(d_mjd) else (float(nd_mjd.max()) if len(nd_mjd) else None)
        mags = d_f["magpsf"].dropna() if "magpsf" in d_f.columns else pd.Series(dtype=float)
        mag_min = float(mags.min()) if len(mags) else None
        mag_max = float(mags.max()) if len(mags) else None
        mag_med = float(mags.median()) if len(mags) else None
        delta = (mag_max - mag_min) if (mag_min is not None and mag_max is not None) else None
        per_filter.append(FilterStats(
            filter=fname,
            n_detections=int(len(d_f)),
            n_non_detections=int(len(nd_f)),
            first_mjd=first, last_mjd=last,
            mag_min=mag_min, mag_max=mag_max, mag_median=mag_med, delta_mag=delta,
        ))

    return LightCurveSummary(
        n_detections=n_det,
        n_non_detections=n_nondet,
        filters_observed=sorted(filters_observed),
        first_mjd=first_mjd,
        last_mjd=last_mjd,
        time_span_days=time_span,
        most_recent_detection_mjd=most_recent_det,
        longest_detection_gap_days=longest_gap,
        per_filter=per_filter,
    )


def evidence_notes(
    summary: LightCurveSummary,
    classification: Optional[dict],
) -> list[str]:
    """Plain-English facts read directly off the data. No inference, no narrative."""
    notes: list[str] = []
    notes.append(
        f"Object has {summary.n_detections} rb-filtered detection(s) "
        f"and {summary.n_non_detections} non-detection(s) on file."
    )
    if summary.filters_observed:
        notes.append(f"Filters observed: {', '.join(summary.filters_observed)}.")
    if summary.first_mjd is not None and summary.last_mjd is not None and summary.time_span_days is not None:
        notes.append(
            f"Coverage spans MJD {summary.first_mjd:.2f} to {summary.last_mjd:.2f} "
            f"({summary.time_span_days:.0f} days)."
        )
    if summary.most_recent_detection_mjd is not None:
        notes.append(f"Most recent detection: MJD {summary.most_recent_detection_mjd:.2f}.")
    if summary.longest_detection_gap_days is not None:
        notes.append(
            f"Longest gap between consecutive detections: "
            f"{summary.longest_detection_gap_days:.0f} days."
        )
    for f in summary.per_filter:
        if f.n_detections > 0 and f.mag_min is not None and f.mag_max is not None and f.delta_mag is not None:
            notes.append(
                f"In {f.filter}-band: {f.n_detections} detection(s), magnitude "
                f"{f.mag_min:.2f}–{f.mag_max:.2f} "
                f"(Δm = {f.delta_mag:.2f}); {f.n_non_detections} non-detection(s)."
            )
        elif f.n_detections == 0 and f.n_non_detections > 0:
            notes.append(
                f"In {f.filter}-band: 0 detections and {f.n_non_detections} non-detection(s). "
                f"Source was below detection threshold whenever ZTF looked in {f.filter}."
            )
    if classification and classification.get("class"):
        clf = classification.get("classifier") or "unknown classifier"
        prob = classification.get("probability")
        prob_str = f"p={prob:.2f}" if isinstance(prob, (int, float)) else "probability unknown"
        notes.append(
            f"External classifier ({clf}) labels this object as: "
            f"{classification['class']} ({prob_str})."
        )
    else:
        notes.append("No external classification label is attached to this object in local data.")
    return notes


_PLACEHOLDER_CANDIDATES: tuple[tuple[str, str], ...] = (
    ("Type Ia supernova",
     "Rise + decline over ~30–60 days with characteristic g–r color evolution. "
     "Worth fitting once a template comparator is wired in."),
    ("AGN variability",
     "Stochastic variability on month-to-year timescales, often coincident with "
     "a galactic nucleus. Worth checking host galaxy proximity."),
    ("Stellar flare / CV outburst",
     "Short, blue-leaning brightening. Worth checking the timescale of any "
     "detection cluster and presence of a nearby stellar host."),
)


def candidate_explanations(
    summary: LightCurveSummary,
    classification: Optional[dict],
) -> list[CandidateExplanation]:
    """Phase 2B emits only `external_label` and `placeholder_unfitted` candidates.

    No fitting happens here; every candidate carries a `mismatch_notes` field
    saying so explicitly. The structure is what matters at this stage — once a
    comparator exists, each placeholder gets replaced by a fitted candidate.
    """
    out: list[CandidateExplanation] = []
    if classification and classification.get("class"):
        out.append(CandidateExplanation(
            name=str(classification["class"]),
            status="external_label",
            rationale=(
                f"ALeRCE's {classification.get('classifier', 'unknown')} classifier "
                "assigned this label."
            ),
            mismatch_notes=(
                "External labels are inherited, not verified. Argus has not yet "
                "checked the data against this hypothesis."
            ),
            source="ALeRCE classifier metadata",
        ))
    for name, rationale in _PLACEHOLDER_CANDIDATES:
        out.append(CandidateExplanation(
            name=name,
            status="placeholder_unfitted",
            rationale=rationale,
            mismatch_notes=(
                "No fit has been performed in Phase 2B. This is a placeholder for "
                "the comparator that will replace it."
            ),
            source="default placeholder set",
        ))
    return out


def uncertainty_notes(
    summary: LightCurveSummary,
    classification: Optional[dict],
    available_sources: list[str],
) -> list[str]:
    notes: list[str] = []
    notes.append("No SIMBAD/NED/Gaia cross-match has been performed in Phase 2B.")
    notes.append("No spectroscopic information is on file.")
    notes.append("No forced-photometry follow-up has been requested.")
    notes.append(
        "Candidate explanations above are placeholders, not fits, so mismatch "
        "magnitudes and goodness-of-fit values are not yet available."
    )
    if "tensor_manifest" not in available_sources:
        notes.append(
            "No tensor manifest was found locally for this date; per-object "
            "preprocessing statistics were not joined into this case file."
        )
    if not (classification and classification.get("class")):
        notes.append("No external classification label is present in local data.")
    if summary.n_detections == 0:
        notes.append(
            "There are zero rb-filtered detections within the local Parquet. "
            "All photometric statements above derive from non-detection upper "
            "limits and any unfiltered raw data on disk."
        )
    return notes


def recommended_next_checks(
    summary: LightCurveSummary,
    classification: Optional[dict],
    coordinates: Optional[dict],
) -> list[str]:
    checks: list[str] = []
    if coordinates and "ra" in coordinates and "dec" in coordinates:
        checks.append(
            f"Cross-match position (RA={coordinates['ra']:.5f}, "
            f"Dec={coordinates['dec']:.5f}) against SIMBAD and NED for any "
            "known counterpart."
        )
        checks.append(
            "Search PanSTARRS at this position for a candidate host galaxy "
            "and record offset from any nearby extended source."
        )
    else:
        checks.append("Recover sky coordinates and cross-match against SIMBAD and NED.")
    if summary.most_recent_detection_mjd is not None:
        checks.append(
            f"Pull ZTF forced photometry in a ±90-day window around the most "
            f"recent detection (MJD {summary.most_recent_detection_mjd:.2f})."
        )
    checks.append(
        "Once a template comparator exists, fit a Type Ia SN template (and the "
        "other placeholder hypotheses) and record residuals in this case file."
    )
    if (summary.most_recent_detection_mjd is not None
            and summary.last_mjd is not None
            and (summary.last_mjd - summary.most_recent_detection_mjd) < 60):
        checks.append(
            "If the source is still active (last detection within ~60 days), "
            "request follow-up spectroscopy."
        )
    return checks
