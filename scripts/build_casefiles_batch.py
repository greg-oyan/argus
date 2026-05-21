"""Build Argus case files for multiple local objects from one pull date."""
from __future__ import annotations

import argparse
import json
import logging
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

import pandas as pd

from argus.casefile.build import build_casefile, write_casefile
from argus.casefile.figures import FigureOutputs, write_casefile_figures
from argus.casefile.html import write_casefile_html
from argus.casefile.index import (
    build_casefile_index,
    write_index_html,
    write_index_json,
)
from argus.casefile.markdown import write_casefile_markdown
from argus.config import CASEFILES_DIR, LIGHTCURVES_DIR, RAW_DIR, TENSORS_DIR

log = logging.getLogger("argus.casefile.batch")


@dataclass
class BatchFailure:
    oid: str
    error: str


@dataclass
class BatchSummary:
    date: str
    attempted: int
    succeeded: int
    failed: int
    output_dir: str
    failed_oids: list[BatchFailure] = field(default_factory=list)
    succeeded_oids: list[str] = field(default_factory=list)
    index_written: bool = False
    index_json_path: str | None = None
    index_html_path: str | None = None


def _unique_sorted(values: Iterable[str]) -> list[str]:
    return sorted({str(value) for value in values if str(value).strip()})


def discover_oids(
    date: str,
    *,
    lightcurves_dir: Path | str = LIGHTCURVES_DIR,
    raw_dir: Path | str = RAW_DIR,
) -> list[str]:
    """Discover object IDs from local Parquet and raw light-curve files."""
    found: set[str] = set()
    parquet_path = Path(lightcurves_dir) / f"{date}.parquet"
    if parquet_path.exists():
        try:
            df = pd.read_parquet(parquet_path, columns=["oid"])
        except Exception:
            df = pd.DataFrame()
        if "oid" in df.columns:
            found.update(str(oid) for oid in df["oid"].dropna().unique())

    raw_lc_dir = Path(raw_dir) / date / "lightcurves"
    if raw_lc_dir.exists():
        found.update(path.stem for path in raw_lc_dir.glob("*.json"))

    return _unique_sorted(found)


def _select_oids(
    date: str,
    *,
    oids: list[str] | None,
    limit: int | None,
    lightcurves_dir: Path | str,
    raw_dir: Path | str,
) -> list[str]:
    selected = _unique_sorted(oids) if oids else discover_oids(
        date,
        lightcurves_dir=lightcurves_dir,
        raw_dir=raw_dir,
    )
    if limit is not None:
        selected = selected[:max(limit, 0)]
    return selected


def _write_optional_artifacts(
    case,
    *,
    date: str,
    json_path: Path,
    write_markdown: bool,
    write_figures: bool,
    write_html: bool,
    lightcurves_dir: Path,
) -> None:
    figure_outputs: FigureOutputs | None = None
    if write_figures:
        figure_outputs = write_casefile_figures(
            case,
            date=date,
            lightcurves_dir=lightcurves_dir,
            json_path=json_path,
        )
    figure_paths = figure_outputs.paths() if figure_outputs is not None else None
    if write_markdown:
        write_casefile_markdown(case, json_path=json_path, figure_paths=figure_paths)
    if write_html:
        write_casefile_html(case, json_path=json_path, figure_paths=figure_paths)


def build_casefiles_batch(
    *,
    date: str,
    oids: list[str] | None = None,
    limit: int | None = None,
    write_markdown: bool = False,
    write_figures: bool = False,
    write_html: bool = False,
    write_index: bool = False,
    fail_fast: bool = False,
    lightcurves_dir: Path | str = LIGHTCURVES_DIR,
    raw_dir: Path | str = RAW_DIR,
    tensors_dir: Path | str = TENSORS_DIR,
    output_dir: Path | str = CASEFILES_DIR,
) -> BatchSummary:
    """Build case files for a deterministic set of local object IDs."""
    lc_dir = Path(lightcurves_dir)
    rw_dir = Path(raw_dir)
    ts_dir = Path(tensors_dir)
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    selected = _select_oids(
        date,
        oids=oids,
        limit=limit,
        lightcurves_dir=lc_dir,
        raw_dir=rw_dir,
    )
    failures: list[BatchFailure] = []
    succeeded_oids: list[str] = []
    attempted = 0

    for oid in selected:
        attempted += 1
        try:
            case = build_casefile(
                oid,
                date,
                lightcurves_dir=lc_dir,
                raw_dir=rw_dir,
                tensors_dir=ts_dir,
            )
            json_path = write_casefile(case, output_dir=out_dir)
            _write_optional_artifacts(
                case,
                date=date,
                json_path=json_path,
                write_markdown=write_markdown,
                write_figures=write_figures,
                write_html=write_html,
                lightcurves_dir=lc_dir,
            )
            succeeded_oids.append(oid)
            log.info("built case file for %s", oid)
        except Exception as exc:
            failure = BatchFailure(oid=oid, error=f"{type(exc).__name__}: {exc}")
            failures.append(failure)
            log.error("failed case file for %s: %s", oid, failure.error)
            if fail_fast:
                break

    index_json_path = None
    index_html_path = None
    if write_index:
        index = build_casefile_index(out_dir, output_dir=out_dir)
        index_json = write_index_json(index, out_dir / "index.json")
        index_html = write_index_html(index, out_dir / "index.html")
        index_json_path = str(index_json)
        index_html_path = str(index_html)

    return BatchSummary(
        date=date,
        attempted=attempted,
        succeeded=len(succeeded_oids),
        failed=len(failures),
        output_dir=str(out_dir),
        failed_oids=failures,
        succeeded_oids=succeeded_oids,
        index_written=write_index,
        index_json_path=index_json_path,
        index_html_path=index_html_path,
    )


def _log_summary(summary: BatchSummary) -> None:
    log.info("date: %s", summary.date)
    log.info("attempted: %d", summary.attempted)
    log.info("succeeded: %d", summary.succeeded)
    log.info("failed: %d", summary.failed)
    log.info("output directory: %s", summary.output_dir)
    if summary.index_written:
        log.info("index written: %s, %s", summary.index_json_path, summary.index_html_path)
    else:
        log.info("index written: no")
    for failure in summary.failed_oids:
        log.error("failed oid: %s - %s", failure.oid, failure.error)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build case files for multiple local Argus objects."
    )
    parser.add_argument("--date", required=True, help="ALeRCE pull date (YYYY-MM-DD).")
    parser.add_argument("--limit", type=int, default=None, help="Maximum number of sorted OIDs to build.")
    parser.add_argument("--oids", nargs="+", help="Explicit OIDs to build.")
    parser.add_argument("--write-markdown", action="store_true", help="Write Markdown for each case file.")
    parser.add_argument("--write-figures", action="store_true", help="Write static figures for each case file.")
    parser.add_argument("--write-html", action="store_true", help="Write HTML for each case file.")
    parser.add_argument("--write-index", action="store_true", help="Write index.json and index.html after the batch.")
    parser.add_argument("--fail-fast", action="store_true", help="Stop after the first per-object failure.")
    parser.add_argument("--casefile-dir", default=str(CASEFILES_DIR), help="Output directory for case files.")
    parser.add_argument("--lightcurves-dir", default=str(LIGHTCURVES_DIR), help="Directory containing flattened Parquet files.")
    parser.add_argument("--raw-dir", default=str(RAW_DIR), help="Directory containing raw light-curve JSON files.")
    parser.add_argument("--tensors-dir", default=str(TENSORS_DIR), help="Directory containing tensor manifests.")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    summary = build_casefiles_batch(
        date=args.date,
        oids=args.oids,
        limit=args.limit,
        write_markdown=args.write_markdown,
        write_figures=args.write_figures,
        write_html=args.write_html,
        write_index=args.write_index,
        fail_fast=args.fail_fast,
        lightcurves_dir=args.lightcurves_dir,
        raw_dir=args.raw_dir,
        tensors_dir=args.tensors_dir,
        output_dir=args.casefile_dir,
    )
    _log_summary(summary)

    print(json.dumps({
        "date": summary.date,
        "attempted": summary.attempted,
        "succeeded": summary.succeeded,
        "failed": summary.failed,
        "output_dir": summary.output_dir,
        "failed_oids": [failure.__dict__ for failure in summary.failed_oids],
        "index_written": summary.index_written,
        "index_json_path": summary.index_json_path,
        "index_html_path": summary.index_html_path,
    }, indent=2))
    return 1 if summary.failed else 0


if __name__ == "__main__":
    sys.exit(main())
