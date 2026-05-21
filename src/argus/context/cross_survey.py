"""Optional SIMBAD context lookup for case files.

Default case-file generation does not call this module's query path. The
astroquery import is lazy so base Argus installs remain offline-safe and do not
require optional science dependencies.
"""
from __future__ import annotations

import math
from typing import Any

from argus.casefile.schema import CrossSurveyContext

DEFAULT_CROSS_SURVEY_RADIUS_ARCSEC = 5.0
_CATALOG_CAVEAT = (
    "Catalog context is external evidence only. It does not by itself identify "
    "the object or confirm special status."
)


def not_requested_context() -> CrossSurveyContext:
    """Return the default offline-safe cross-survey block."""
    return CrossSurveyContext(
        status="not_requested",
        interpretation="Cross-survey catalog context was not requested for this run.",
        caveat="No external catalog query was performed.",
    )


def _invalid_coordinates_context(
    coordinates: dict[str, Any] | None,
    radius_arcsec: float,
) -> CrossSurveyContext:
    return CrossSurveyContext(
        status="invalid_coordinates",
        coordinates=_coordinates_payload(coordinates),
        search_radius_arcsec=float(radius_arcsec),
        interpretation=(
            "Cross-survey catalog context could not be queried because the "
            "case file does not contain valid sky coordinates."
        ),
        caveat=_CATALOG_CAVEAT,
    )


def _coordinates_payload(coordinates: dict[str, Any] | None) -> dict[str, float] | None:
    valid = _validate_coordinates(coordinates)
    if valid is None:
        return None
    ra, dec = valid
    return {"ra": ra, "dec": dec}


def _validate_coordinates(coordinates: dict[str, Any] | None) -> tuple[float, float] | None:
    if not coordinates:
        return None
    try:
        ra = float(coordinates.get("ra"))
        dec = float(coordinates.get("dec"))
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(ra) and math.isfinite(dec)):
        return None
    if not (0.0 <= ra < 360.0 and -90.0 <= dec <= 90.0):
        return None
    return ra, dec


def _validate_radius(radius_arcsec: float) -> float:
    try:
        radius = float(radius_arcsec)
    except (TypeError, ValueError):
        return DEFAULT_CROSS_SURVEY_RADIUS_ARCSEC
    if not math.isfinite(radius) or radius <= 0:
        return DEFAULT_CROSS_SURVEY_RADIUS_ARCSEC
    return radius


def _import_simbad_tools():
    from astroquery.simbad import Simbad
    from astropy.coordinates import SkyCoord
    import astropy.units as u

    return Simbad, SkyCoord, u


def _query_simbad(
    ra: float,
    dec: float,
    radius_arcsec: float,
    timeout_seconds: float,
):
    Simbad, SkyCoord, u = _import_simbad_tools()
    simbad = Simbad()
    try:
        simbad.TIMEOUT = timeout_seconds
    except Exception:
        pass
    try:
        simbad.add_votable_fields("otype")
    except Exception:
        pass
    coord = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame="icrs")
    return simbad.query_region(coord, radius=radius_arcsec * u.arcsec)


def _clean_value(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "mask") and bool(getattr(value, "mask", False)):
        return None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if hasattr(value, "item"):
        try:
            return value.item()
        except Exception:
            pass
    text = str(value)
    if text in {"--", "nan", "None"}:
        return None
    return value


def _table_len(table: Any) -> int:
    if table is None:
        return 0
    try:
        return int(len(table))
    except TypeError:
        return 0


def _row_mapping(table: Any) -> dict[str, Any]:
    if table is None or _table_len(table) == 0:
        return {}
    if isinstance(table, dict):
        return table
    if isinstance(table, (list, tuple)):
        first = table[0]
        return first if isinstance(first, dict) else {}
    try:
        row = table[0]
    except Exception:
        return {}
    if isinstance(row, dict):
        return row
    colnames = list(getattr(table, "colnames", []))
    out: dict[str, Any] = {}
    for name in colnames:
        try:
            out[name] = _clean_value(row[name])
        except Exception:
            pass
    return out


def _pick_value(row: dict[str, Any], *names: str) -> Any:
    lower_map = {str(key).lower(): key for key in row}
    for name in names:
        key = lower_map.get(name.lower())
        if key is not None:
            return _clean_value(row.get(key))
    return None


def _float_or_none(value: Any) -> float | None:
    try:
        f = float(value)
        return f if math.isfinite(f) else None
    except (TypeError, ValueError):
        return None


def _nearest_match(table: Any) -> dict[str, Any]:
    row = _row_mapping(table)
    if not row:
        return {}

    name = _pick_value(row, "MAIN_ID", "main_id", "name", "ID")
    raw_type = _pick_value(row, "OTYPE", "OTYPE_S", "otype", "raw_type_label")
    catalog_type = _pick_value(row, "OTYPE_S", "OTYPE", "catalog_object_type", "otype")
    separation = _pick_value(
        row,
        "separation_arcsec",
        "SEP",
        "Sep",
        "DISTANCE_RESULT",
        "distance_result",
    )

    return {
        "name": str(name) if name is not None else None,
        "separation_arcsec": _float_or_none(separation),
        "raw_type_label": str(raw_type) if raw_type is not None else None,
        "catalog_object_type": str(catalog_type) if catalog_type is not None else None,
    }


def _matched_context(
    coordinates: dict[str, float],
    radius_arcsec: float,
    table: Any,
) -> CrossSurveyContext:
    match_count = _table_len(table)
    nearest = _nearest_match(table)
    return CrossSurveyContext(
        status="queried",
        coordinates=coordinates,
        search_radius_arcsec=float(radius_arcsec),
        sources=[
            {
                "catalog": "SIMBAD",
                "status": "matched",
                "nearest_match": nearest,
                "match_count": match_count,
            }
        ],
        interpretation=(
            "SIMBAD reports a nearby catalog object within the search radius. "
            "This is external catalog context only, not an Argus classification."
        ),
        caveat=_CATALOG_CAVEAT,
    )


def _no_match_context(
    coordinates: dict[str, float],
    radius_arcsec: float,
) -> CrossSurveyContext:
    return CrossSurveyContext(
        status="no_match",
        coordinates=coordinates,
        search_radius_arcsec=float(radius_arcsec),
        sources=[
            {
                "catalog": "SIMBAD",
                "status": "no_match",
                "nearest_match": None,
                "match_count": 0,
            }
        ],
        interpretation="No nearby SIMBAD match was found within the search radius.",
        caveat=_CATALOG_CAVEAT,
    )


def _dependency_unavailable_context(
    coordinates: dict[str, float],
    radius_arcsec: float,
    error: Exception,
) -> CrossSurveyContext:
    return CrossSurveyContext(
        status="dependency_unavailable",
        coordinates=coordinates,
        search_radius_arcsec=float(radius_arcsec),
        sources=[],
        interpretation=(
            "Cross-survey catalog context was requested, but astroquery is not "
            "available in this environment."
        ),
        caveat=f"{_CATALOG_CAVEAT} Missing optional dependency: {error}.",
    )


def _query_failed_context(
    coordinates: dict[str, float],
    radius_arcsec: float,
    status: str,
    error: Exception,
) -> CrossSurveyContext:
    if status == "timeout":
        interpretation = "The SIMBAD query timed out before catalog context could be recorded."
    else:
        interpretation = "The SIMBAD query failed before catalog context could be recorded."
    return CrossSurveyContext(
        status=status,
        coordinates=coordinates,
        search_radius_arcsec=float(radius_arcsec),
        sources=[
            {
                "catalog": "SIMBAD",
                "status": status,
                "error": str(error),
            }
        ],
        interpretation=interpretation,
        caveat=_CATALOG_CAVEAT,
    )


def query_simbad_context(
    coordinates: dict[str, Any] | None,
    *,
    radius_arcsec: float = DEFAULT_CROSS_SURVEY_RADIUS_ARCSEC,
    timeout_seconds: float = 20.0,
) -> CrossSurveyContext:
    """Query SIMBAD around coordinates and return cautious catalog metadata."""
    radius = _validate_radius(radius_arcsec)
    valid = _validate_coordinates(coordinates)
    if valid is None:
        return _invalid_coordinates_context(coordinates, radius)

    ra, dec = valid
    payload = {"ra": ra, "dec": dec}
    try:
        table = _query_simbad(ra, dec, radius, timeout_seconds)
    except ImportError as exc:
        return _dependency_unavailable_context(payload, radius, exc)
    except TimeoutError as exc:
        return _query_failed_context(payload, radius, "timeout", exc)
    except Exception as exc:
        text = f"{exc.__class__.__name__}: {exc}".lower()
        if "timeout" in text or "timed out" in text:
            return _query_failed_context(payload, radius, "timeout", exc)
        return _query_failed_context(payload, radius, "query_failed", exc)

    if _table_len(table) == 0:
        return _no_match_context(payload, radius)
    return _matched_context(payload, radius, table)


def build_cross_survey_context(
    coordinates: dict[str, Any] | None,
    *,
    include: bool = False,
    radius_arcsec: float = DEFAULT_CROSS_SURVEY_RADIUS_ARCSEC,
    timeout_seconds: float = 20.0,
) -> CrossSurveyContext:
    """Return default offline context or run the explicit opt-in SIMBAD query."""
    if not include:
        return not_requested_context()
    return query_simbad_context(
        coordinates,
        radius_arcsec=radius_arcsec,
        timeout_seconds=timeout_seconds,
    )
