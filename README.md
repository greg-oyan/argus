# Argus

A small system that watches the sky for novel astronomical patterns that current
transient pipelines miss. The goal is a ranked, human-readable feed of "things
worth an astronomer's attention" — not another classifier.

**Status: Phase 1 — ingestion only.**

## Architecture (target)

1. **Ingestion** — pull live transient alerts from the Zwicky Transient Facility
   via the [ALeRCE](https://alerce.online) broker. *(this phase)*
2. **Detection** — convolutional autoencoder on light curves; flag
   reconstruction-error outliers.
3. **Validation** — agent that cross-references flagged anomalies against SIMBAD
   and NED to filter known objects.
4. **Context** — agent that writes a plain-English explanation of why each
   surviving anomaly is weird.
5. **Output** — ranked feed.

## Why ALeRCE for ingestion

The raw ZTF Kafka stream is firehose-level and requires a running consumer. For
a batch novelty-detection project on a laptop, ALeRCE is the right abstraction:
free, no key, single `pip` install, returns full multi-band light curves per
object, and already attaches classifications and cross-matches we'll lean on
in later phases.

## Install

Python ≥3.10. Tested on 3.14.

```bash
python -m venv .venv
.venv/Scripts/activate           # PowerShell:  .\.venv\Scripts\Activate.ps1
pip install -e ".[dev]"
```

## Run a pull

```bash
python -m scripts.ingest_daily --days 1                  # tiny dev pull
python -m scripts.ingest_daily --days 3                  # default
python -m scripts.ingest_daily --days 60 --max-objects 0 # larger pull, no cap
```

What you get on disk:

```
data/
├── raw/
│   └── YYYY-MM-DD/
│       ├── objects.json                 # ALeRCE object summaries (source of truth)
│       └── lightcurves/
│           └── ZTF<id>.json             # one full light curve per object
└── lightcurves/
    └── YYYY-MM-DD.parquet               # flattened: 1 row per detection
```

`data/` is gitignored — raw JSON is the canonical record, Parquet is a
convenience layer. You can rebuild the Parquet from raw without re-hitting the
API by calling `flatten_to_dataframe` + `write_parquet` directly.

## What's filtered, and what isn't

Quality cuts:

- `--min-detections 5` at query time (`ndet ≥ 5`)
- `rb ≥ 0.55` at flatten time (real-bogus score, per-detection)

We deliberately do **not** filter on ALeRCE's classification. Classifications
are the assumption Argus is built to stress-test — if we filter on them we
inherit their definition of normal, which would gut the project. The classifier
label, classifier name, and probability are carried as `obj_class` /
`obj_classifier` / `obj_probability` metadata columns instead.

## Reproducibility

The pipeline is deterministic given the broker's state:

- Every run writes raw API responses under `data/raw/{date}/` first.
- The Parquet table is a pure function of those JSON files.
- Tests run against captured fixtures in `tests/fixtures/` (12 real objects from
  the 2026-05-20 pull) and never touch the network.

```bash
python -m pytest -q
```

## Repository layout

```
src/argus/
├── config.py                    # paths, quality cuts, defaults
└── ingest/
    ├── alerce.py                # thin wrapper over the ALeRCE client
    └── storage.py               # raw JSON + flattened Parquet writers
scripts/
└── ingest_daily.py              # CLI entry point
tests/
├── fixtures/                    # 12 real objects, committed
└── test_storage.py              # parsing + storage logic
```

## Next

Phase 2 will train an autoencoder on the flattened light curves and surface
reconstruction-error outliers. Until then this repo just produces clean data.
