"""Thin wrapper around the ALeRCE v2 client. Single seam between Argus and the broker."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Any

from alerce.core import Alerce

from argus.config import MIN_DETECTIONS, PAGE_SIZE


def current_mjd() -> float:
    """Modified Julian Date for now (UTC). MJD epoch is 1858-11-17 00:00 UTC."""
    epoch = datetime(1858, 11, 17, tzinfo=timezone.utc)
    return (datetime.now(timezone.utc) - epoch).total_seconds() / 86400.0


def get_client() -> Alerce:
    return Alerce()


def query_recent_objects(
    client: Alerce,
    days_back: int,
    min_detections: int = MIN_DETECTIONS,
    max_objects: int | None = None,
    page_size: int = PAGE_SIZE,
) -> list[dict[str, Any]]:
    """Return object summaries with new detections in the last `days_back` days.

    Only quality cuts (ndet floor, time window). No classification filter — the
    classifier output is preserved as a metadata column downstream.
    """
    threshold_mjd = current_mjd() - days_back
    page = 1
    out: list[dict[str, Any]] = []
    while True:
        df = client.query_objects(
            survey="ztf",
            ndet=min_detections,
            lastmjd=threshold_mjd,
            page=page,
            page_size=page_size,
            format="pandas",
        )
        if df is None or len(df) == 0:
            break
        out.extend(df.to_dict(orient="records"))
        if max_objects and len(out) >= max_objects:
            return out[:max_objects]
        if len(df) < page_size:
            break
        page += 1
    return out


def fetch_lightcurve(client: Alerce, oid: str) -> dict[str, Any]:
    """Full light curve: detections, non-detections, and forced photometry."""
    return client.query_lightcurve(oid=oid, survey="ztf", format="json")
