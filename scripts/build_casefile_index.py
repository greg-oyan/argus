"""Build a static index over generated Argus case files."""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from argus.casefile.index import (
    build_casefile_index,
    write_index_html,
    write_index_json,
)
from argus.config import CASEFILES_DIR

log = logging.getLogger("argus.casefile.index")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build a static review index from existing Argus case-file JSON."
    )
    parser.add_argument(
        "--casefile-dir",
        default=str(CASEFILES_DIR),
        help="Directory containing generated case-file JSON files.",
    )
    parser.add_argument(
        "--output-json",
        default=None,
        help="Path for the index JSON. Defaults to {casefile-dir}/index.json.",
    )
    parser.add_argument(
        "--write-html",
        action="store_true",
        help="Also write a static HTML index next to the JSON index.",
    )
    parser.add_argument(
        "--output-html",
        default=None,
        help="Path for the HTML index. Defaults to the JSON path with .html suffix.",
    )
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
    )

    casefile_dir = Path(args.casefile_dir)
    output_json = Path(args.output_json) if args.output_json else casefile_dir / "index.json"
    output_html = Path(args.output_html) if args.output_html else output_json.with_suffix(".html")

    index = build_casefile_index(casefile_dir, output_dir=output_json.parent)
    json_path = write_index_json(index, output_json)
    log.info("case files indexed: %d", index["case_count"])
    log.info("wrote %s", json_path)

    if args.write_html:
        html_path = write_index_html(index, output_html)
        log.info("wrote %s", html_path)

    return 0


if __name__ == "__main__":
    sys.exit(main())
