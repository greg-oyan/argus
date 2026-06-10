# Golden Case Context Enrichment

The committed public examples are offline-safe generated artifacts. They do not
require optional science dependencies or live catalog access.

For a manually enriched local demo case, install the optional science extra and
build the canonical case with cross-survey context enabled:

```bash
pip install -e ".[science]"
python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --include-cross-survey-context --cross-survey-radius-arcsec 5 --write-markdown --write-figures --write-html
```

If you decide to curate the enriched result for the public demo, copy only the
generated case-file artifacts into `examples/ZTF18abujsbq/` and
`docs/examples/ZTF18abujsbq/`, then regenerate the public indexes. Do not commit
raw ALeRCE JSON, Parquet, tensors, or the local `data/` directory.

Cross-survey context is external metadata. A SIMBAD match, non-match, or failed
query is not an Argus object-identity claim.
