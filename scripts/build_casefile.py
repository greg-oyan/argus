"""Build a Phase 2B case file for one object, from local data only.

Usage:
    python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq
"""
from __future__ import annotations
import argparse
import logging
import sys

from argus.casefile.build import build_casefile, write_casefile

log = logging.getLogger("argus.casefile")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Assemble a case file from local Argus data.")
    p.add_argument("--date", required=True, help="ALeRCE pull date (YYYY-MM-DD).")
    p.add_argument("--oid", required=True, help="ZTF object ID.")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    case = build_casefile(args.oid, args.date)
    path = write_casefile(case)
    log.info("oid: %s", case.oid)
    log.info("data sources used: %s", ", ".join(case.available_data_sources) or "(none)")
    log.info(
        "evidence: %d detections, %d non-detections across filter(s) %s",
        case.detection_count, case.non_detection_count,
        ", ".join(case.filters_observed) or "(none)",
    )
    log.info("candidate explanations: %d", len(case.candidate_explanations))
    log.info("recommended next checks: %d", len(case.recommended_next_checks))
    log.info("wrote %s", path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
