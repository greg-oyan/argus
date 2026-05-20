"""Daily ingestion CLI: pull recent ZTF objects + light curves from ALeRCE.

Usage:
    python -m scripts.ingest_daily --days 1
    python -m scripts.ingest_daily --days 60 --max-objects 0
"""
from __future__ import annotations
import argparse
import logging
import sys
from datetime import datetime, timezone

from argus.config import DEFAULT_DAYS_BACK, MAX_OBJECTS, MIN_DETECTIONS
from argus.ingest.alerce import fetch_lightcurve, get_client, query_recent_objects
from argus.ingest.storage import (
    flatten_to_dataframe,
    write_parquet,
    write_raw_lightcurve,
    write_raw_objects,
)

log = logging.getLogger("argus.ingest")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Pull ZTF alerts from ALeRCE.")
    p.add_argument("--days", type=int, default=DEFAULT_DAYS_BACK,
                   help=f"Days back to query (default: {DEFAULT_DAYS_BACK}).")
    p.add_argument("--min-detections", type=int, default=MIN_DETECTIONS,
                   help=f"ndet floor at query time (default: {MIN_DETECTIONS}).")
    p.add_argument("--max-objects", type=int, default=MAX_OBJECTS,
                   help=f"Safety cap on objects (default: {MAX_OBJECTS}). 0 = no cap.")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    log.info("Pull: days=%d min_det=%d cap=%d date=%s",
             args.days, args.min_detections, args.max_objects, date)

    client = get_client()
    cap = args.max_objects if args.max_objects > 0 else None
    objects = query_recent_objects(
        client,
        days_back=args.days,
        min_detections=args.min_detections,
        max_objects=cap,
    )
    log.info("query_objects returned %d objects", len(objects))
    if not objects:
        log.warning("No objects returned. Widen --days or lower --min-detections.")
        return 0

    write_raw_objects(objects, date=date)

    lightcurves: dict[str, dict] = {}
    for i, obj in enumerate(objects, 1):
        oid = obj.get("oid")
        if not oid:
            continue
        try:
            lc = fetch_lightcurve(client, oid)
        except Exception as e:
            log.warning("lightcurve fetch failed for %s: %s", oid, e)
            continue
        lightcurves[oid] = lc
        write_raw_lightcurve(oid, lc, date=date)
        if i % 25 == 0 or i == len(objects):
            log.info("light curves: %d/%d", i, len(objects))

    df = flatten_to_dataframe(objects, lightcurves)
    path = write_parquet(df, date=date)
    log.info("Wrote %s (%d rows)", path, len(df))
    return 0


if __name__ == "__main__":
    sys.exit(main())
