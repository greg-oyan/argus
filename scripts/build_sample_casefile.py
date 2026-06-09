"""Build one demo case file from committed fixtures only.

This is a fresh-clone smoke workflow for the public demo layer. It performs no
network calls and writes normal Argus artifacts from fixture data into ignored
local output directories by default.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from argus.casefile.build import build_casefile, write_casefile
from argus.casefile.figures import write_casefile_figures
from argus.casefile.html import write_casefile_html
from argus.casefile.markdown import write_casefile_markdown
from argus.config import DATA_DIR, REPO_ROOT
from argus.ingest.storage import flatten_to_dataframe, write_raw_lightcurve, write_raw_objects

DEFAULT_SAMPLE_DATE = "2026-01-01"
DEFAULT_SAMPLE_OID = "ZTF19aaaajqs"
DEFAULT_CASEFILE_DIR = DATA_DIR / "sample_casefiles"
DEFAULT_WORKSPACE_DIR = DATA_DIR / "sample_fixture_input"
FIXTURE_OBJECTS_PATH = REPO_ROOT / "tests" / "fixtures" / "objects.json"
FIXTURE_LIGHTCURVE_DIR = REPO_ROOT / "tests" / "fixtures" / "lightcurves"


def _load_fixture_case(oid: str) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
    objects = json.loads(FIXTURE_OBJECTS_PATH.read_text(encoding="utf-8"))
    matching = [item for item in objects if item.get("oid") == oid]
    if not matching:
        raise FileNotFoundError(f"No fixture object metadata is available for {oid}.")

    lightcurve_path = FIXTURE_LIGHTCURVE_DIR / f"{oid}.json"
    if not lightcurve_path.exists():
        raise FileNotFoundError(f"No fixture light curve is available for {oid}.")
    lightcurve = json.loads(lightcurve_path.read_text(encoding="utf-8"))
    return matching, {oid: lightcurve}


def _materialize_local_inputs(
    objects: list[dict[str, Any]],
    lightcurves: dict[str, dict[str, Any]],
    *,
    date: str,
    workspace_dir: Path,
) -> tuple[Path, Path, Path]:
    lightcurves_dir = workspace_dir / "lightcurves"
    raw_dir = workspace_dir / "raw"
    tensors_dir = workspace_dir / "tensors_not_required"
    lightcurves_dir.mkdir(parents=True, exist_ok=True)

    df = flatten_to_dataframe(objects, lightcurves)
    df.to_parquet(lightcurves_dir / f"{date}.parquet", index=False)
    write_raw_objects(objects, date=date, root=raw_dir)
    for oid, lightcurve in lightcurves.items():
        write_raw_lightcurve(oid, lightcurve, date=date, root=raw_dir)
    return lightcurves_dir, raw_dir, tensors_dir


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build a single Argus sample case file from committed fixtures."
    )
    parser.add_argument("--oid", default=DEFAULT_SAMPLE_OID, help="Fixture object ID to build.")
    parser.add_argument("--date", default=DEFAULT_SAMPLE_DATE, help="Synthetic fixture pull date.")
    parser.add_argument(
        "--casefile-dir",
        type=Path,
        default=DEFAULT_CASEFILE_DIR,
        help="Output directory for generated case-file artifacts.",
    )
    parser.add_argument(
        "--workspace-dir",
        type=Path,
        default=DEFAULT_WORKSPACE_DIR,
        help="Ignored local workspace for fixture-shaped parquet and raw JSON inputs.",
    )
    parser.add_argument("--no-markdown", action="store_true", help="Skip Markdown export.")
    parser.add_argument("--no-html", action="store_true", help="Skip HTML export.")
    parser.add_argument("--no-figures", action="store_true", help="Skip PNG figure export.")
    args = parser.parse_args(argv)

    objects, lightcurves = _load_fixture_case(args.oid)
    lightcurves_dir, raw_dir, tensors_dir = _materialize_local_inputs(
        objects,
        lightcurves,
        date=args.date,
        workspace_dir=args.workspace_dir,
    )

    case = build_casefile(
        args.oid,
        args.date,
        lightcurves_dir=lightcurves_dir,
        raw_dir=raw_dir,
        tensors_dir=tensors_dir,
    )
    json_path = write_casefile(case, output_dir=args.casefile_dir)
    figure_outputs = None
    if not args.no_figures:
        figure_outputs = write_casefile_figures(
            case,
            date=args.date,
            json_path=json_path,
            lightcurves_dir=lightcurves_dir,
        )
    markdown_path = None
    if not args.no_markdown:
        markdown_path = write_casefile_markdown(
            case,
            json_path=json_path,
            figure_paths=figure_outputs.paths() if figure_outputs is not None else None,
        )
    html_path = None
    if not args.no_html:
        html_path = write_casefile_html(
            case,
            json_path=json_path,
            figure_paths=figure_outputs.paths() if figure_outputs is not None else None,
        )

    summary = {
        "oid": case.oid,
        "source": "committed fixtures",
        "network": "not_used",
        "json": str(json_path),
        "markdown": str(markdown_path) if markdown_path else None,
        "html": str(html_path) if html_path else None,
        "figures": [str(path) for path in figure_outputs.paths()] if figure_outputs else [],
        "workspace_dir": str(args.workspace_dir),
    }
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
