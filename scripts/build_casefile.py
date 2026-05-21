"""Build a case file for one object from local data, with optional context.

Usage:
    python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq
    python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --include-cross-survey-context
"""
from __future__ import annotations
import argparse
import logging
import sys

from argus.casefile.build import build_casefile, write_casefile
from argus.context.cross_survey import DEFAULT_CROSS_SURVEY_RADIUS_ARCSEC

log = logging.getLogger("argus.casefile")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Assemble a case file from local Argus data.")
    p.add_argument("--date", required=True, help="ALeRCE pull date (YYYY-MM-DD).")
    p.add_argument("--oid", required=True, help="ZTF object ID.")
    p.add_argument(
        "--include-cross-survey-context",
        action="store_true",
        help="Opt in to a SIMBAD cross-survey lookup via optional astroquery.",
    )
    p.add_argument(
        "--cross-survey-radius-arcsec",
        type=float,
        default=DEFAULT_CROSS_SURVEY_RADIUS_ARCSEC,
        help="SIMBAD search radius in arcseconds when cross-survey context is requested.",
    )
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    case = build_casefile(
        args.oid,
        args.date,
        include_cross_survey_context=args.include_cross_survey_context,
        cross_survey_radius_arcsec=args.cross_survey_radius_arcsec,
    )
    path = write_casefile(case)
    log.info("oid: %s", case.oid)
    log.info("data sources used: %s", ", ".join(case.available_data_sources) or "(none)")
    log.info(
        "evidence: %d detections, %d non-detections across filter(s) %s",
        case.detection_count, case.non_detection_count,
        ", ".join(case.filters_observed) or "(none)",
    )
    log.info("candidate explanations: %d", len(case.candidate_explanations))
    log.info("model comparisons: %d", len(case.model_comparisons))
    for mc in case.model_comparisons:
        log.info("  - %s [%s] %s", mc.name, mc.filter_used, mc.status)
    if case.cross_survey_context is not None:
        log.info("cross-survey context: %s", case.cross_survey_context.status)
    log.info("recommended next checks: %d", len(case.recommended_next_checks))
    log.info("wrote %s", path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
