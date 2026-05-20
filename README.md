# Argus

A small system that watches the sky for novel astronomical patterns that current
transient pipelines miss. The goal is a ranked, human-readable feed of "things
worth an astronomer's attention" — not another classifier.

**Status: Phase 1 ingestion + Phase 2a preprocessing complete. Phase 2b (model) is next.**

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

## Build input tensors (Phase 2a)

```bash
python -m scripts.preprocess_tensors                    # uses most recent Parquet
python -m scripts.preprocess_tensors --date 2026-05-20  # specific date
```

This converts the flattened Parquet (detections only) plus the raw JSON
non-detections into the model-ready tensor described by the Phase 2 schema
decisions: a 200-day window right-aligned to each object's last detection,
binned at 1-day resolution, with one channel per filter for flux + error +
mask. Magnitudes are converted to flux at zeropoint 23.9 μJy; non-detections
become `flux=0` with noise derived from `diffmaglim/5`. Flux is asinh-stretched
(softening = 2.0 μJy) and per-filter median-subtracted using detection bins
only — upper-limit bins (flux=0, mask=1) are excluded from the median so they
don't bias it toward zero. Filters with zero detection bins fall back to
median = 0 and the manifest records the fallback.

Outputs land under `data/tensors/{date}.npz` (the tensor archive) and
`data/tensors/{date}.csv` (a human-readable manifest):

```
data/tensors/YYYY-MM-DD.npz
  X               (N, 200, 6) float32  — channels [g_flux, g_err, g_mask, r_flux, r_err, r_mask]
  oids            (N,)        str      — sorted, parallel to axis 0 of X
  median_g_asinh  (N,)        float32  — per-object asinh-space median (used for the subtraction)
  median_r_asinh  (N,)        float32
  window_end_mjd  (N,)        float32  — each window's right edge (= obj_lastmjd)
  channels        (6,)        str      — self-describing channel order
  meta_*                               — softening, window_days, bin_days, zp, σ, build date

data/tensors/YYYY-MM-DD.csv
  idx, oid, window_end_mjd,
  n_obs_g, n_obs_r, n_uplim_g, n_uplim_r,
  total_unmasked_bins, frac_bins_masked,
  median_g_asinh, median_r_asinh,
  median_g_raw_flux, median_r_raw_flux,
  median_g_fallback, median_r_fallback
```

Classification metadata is intentionally dropped at preprocessing — the
autoencoder must be classifier-blind. It can be rejoined by `oid` downstream
(audit, validation agent).

Before writing, sanity checks fail loudly on: any NaN/inf in `X`, duplicate
oids, length mismatches across parallel arrays, or `mask=0` bins with nonzero
flux/err. Objects are sorted by `oid` before stacking, so the same Parquet
input produces a byte-identical tensor archive across runs.

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
├── config.py                    # paths, quality cuts, tensor schema, transform params
├── ingest/
│   ├── alerce.py                # thin wrapper over the ALeRCE client
│   └── storage.py               # raw JSON + flattened Parquet writers
└── preprocess/
    ├── photometry.py            # mag↔flux, upper-limit noise, asinh + error propagation
    ├── grid.py                  # Event, windowing, binning, per-object tensorization
    └── dataset.py               # file IO, stacking, manifest, sanity checks
scripts/
├── ingest_daily.py              # ingestion CLI
└── preprocess_tensors.py        # preprocessing CLI
notebooks/
└── 02_explore_lightcurve.ipynb  # one-object Parquet-vs-raw comparison + Phase 2 schema decisions
tests/
├── fixtures/                    # 12 real objects, committed
├── test_storage.py              # ingestion parsing + storage
├── test_preprocess_photometry.py
├── test_preprocess_grid.py
└── test_preprocess_dataset.py
```

## Next

Phase 2b will train a 1D convolutional autoencoder on the tensor archive and
surface reconstruction-error outliers. The Phase 2 schema decisions and the
empirical audit plan are documented in `notebooks/02_explore_lightcurve.ipynb`.
