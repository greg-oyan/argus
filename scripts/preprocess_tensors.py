"""Build Phase 2a input tensors from the latest Parquet pull.

Usage:
    python -m scripts.preprocess_tensors                  # uses most recent Parquet
    python -m scripts.preprocess_tensors --date 2026-05-20
"""
from __future__ import annotations
import argparse
import logging
import sys

from argus.preprocess.dataset import build_dataset

log = logging.getLogger("argus.preprocess")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Build (N, 200, 6) input tensors from ALeRCE pulls.")
    p.add_argument("--date", type=str, default=None,
                   help="Pull date (YYYY-MM-DD). Default: most recent Parquet on disk.")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    npz, csv_, summary = build_dataset(date=args.date)
    log.info("date: %s", summary["date"])
    log.info("X shape: %s  dtype: float32", summary["X_shape"])
    log.info("objects kept: %d   skipped: %d", summary["n_objects"], summary["n_skipped"])
    for s in summary["skipped"][:10]:
        log.warning("  skipped %s: %s", s["oid"], s["reason"])
    if len(summary["skipped"]) > 10:
        log.warning("  ...and %d more", len(summary["skipped"]) - 10)
    log.info("wrote %s", npz)
    log.info("wrote %s", csv_)
    return 0


if __name__ == "__main__":
    sys.exit(main())
