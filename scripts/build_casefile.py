"""Build a case file for one object from local data, with optional context.

Usage:
    python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq
    python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --write-markdown
    python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --write-html
    python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --write-figures
    python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --include-cross-survey-context
"""
from __future__ import annotations
import argparse
import json
import logging
import sys
from pathlib import Path

from argus.casefile.build import build_casefile, write_casefile
from argus.casefile.figures import write_casefile_figures
from argus.casefile.html import write_casefile_html
from argus.casefile.markdown import write_casefile_markdown
from argus.context.cross_survey import DEFAULT_CROSS_SURVEY_RADIUS_ARCSEC

log = logging.getLogger("argus.casefile")


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Assemble a case file from local Argus data.")
    p.add_argument("--date", required=True, help="ALeRCE pull date (YYYY-MM-DD).")
    p.add_argument("--oid", "--object-id", dest="oid", required=True, help="ZTF object ID.")
    p.add_argument(
        "--casefile-dir",
        "--output-dir",
        dest="casefile_dir",
        type=Path,
        default=None,
        help="Directory for generated case-file artifacts. Default: data/casefiles.",
    )
    p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Exact JSON output path. If supplied, --casefile-dir is ignored for JSON.",
    )
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
    p.add_argument(
        "--write-markdown",
        action="store_true",
        help="Write a presentation-ready Markdown report next to the JSON case file.",
    )
    p.add_argument(
        "--write-html",
        action="store_true",
        help="Write a static HTML report next to the JSON case file.",
    )
    p.add_argument(
        "--write-figures",
        action="store_true",
        help="Write static PNG figures next to the JSON case file.",
    )
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    if args.out is not None and args.casefile_dir is not None:
        p.error("--out and --casefile-dir/--output-dir cannot be used together.")

    case = build_casefile(
        args.oid,
        args.date,
        include_cross_survey_context=args.include_cross_survey_context,
        cross_survey_radius_arcsec=args.cross_survey_radius_arcsec,
    )
    if args.out is not None:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(case.to_dict(), indent=2, default=str), encoding="utf-8")
        path = args.out
    elif args.casefile_dir is not None:
        path = write_casefile(case, output_dir=args.casefile_dir)
    else:
        path = write_casefile(case)
    figure_outputs = (
        write_casefile_figures(case, date=args.date, json_path=path)
        if args.write_figures else None
    )
    markdown_path = (
        write_casefile_markdown(
            case,
            json_path=path,
            figure_paths=figure_outputs.paths() if figure_outputs is not None else None,
        )
        if args.write_markdown else None
    )
    html_path = (
        write_casefile_html(
            case,
            json_path=path,
            figure_paths=figure_outputs.paths() if figure_outputs is not None else None,
        )
        if args.write_html else None
    )
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
    if figure_outputs is not None:
        for figure_path in figure_outputs.paths():
            log.info("wrote %s", figure_path)
        for name, reason in figure_outputs.skipped.items():
            log.info("skipped %s figure: %s", name, reason)
    if markdown_path is not None:
        log.info("wrote %s", markdown_path)
    if html_path is not None:
        log.info("wrote %s", html_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
