# Argus

A small system that watches the sky for novel astronomical patterns that current
transient pipelines miss. The current product spine is a readable, inspectable
case-file evidence package for one object at a time — not another classifier.

**Status: Phase 1 ingestion + Phase 2a preprocessing + Phase 2B case-file foundation + Phase 2C first fitted comparator + Phase 2D descriptive variability comparator + Phase 2E comparison summary + Phase 2F standardized feature extraction + Phase 2G conservative sncosmo probe + Phase 2H optional cross-survey context + Phase 2I evidence narrative + Phase 2J Markdown export + Phase 2K static figures + Phase 2L static HTML export + Phase 2M public example bundle + Phase 2N GitHub Pages demo page + Phase 2O Gaussian residual plots complete.**

The product vision and the strategic decision behind Phase 2B live in
[`docs/ARGUS_VISION.md`](docs/ARGUS_VISION.md) and
[`docs/PHASE_2B_DECISION.md`](docs/PHASE_2B_DECISION.md).
Read them first if you're new to the repo.

## Example Case File

A generated public demo bundle is available at
[`examples/ZTF18abujsbq/`](examples/ZTF18abujsbq/). It includes:

- [HTML report](examples/ZTF18abujsbq/ZTF18abujsbq.casefile.html)
- [Markdown report](examples/ZTF18abujsbq/ZTF18abujsbq.casefile.md)
- [light-curve figure](examples/ZTF18abujsbq/ZTF18abujsbq.lightcurve.png)
- [Gaussian residual figure](examples/ZTF18abujsbq/ZTF18abujsbq.residuals.png)
- [structured JSON](examples/ZTF18abujsbq/ZTF18abujsbq.casefile.json)

This is a presentation/demo artifact for the case-file workflow, not a
physical classification.

## Demo Page

The static demo landing page lives at [`docs/index.html`](docs/index.html).
GitHub Pages can serve it by setting the Pages source to the repository's
`docs/` folder. The page duplicates the small ZTF18abujsbq demo artifacts under
`docs/examples/` so the image and report links work with relative paths on
GitHub Pages and when opened directly from disk.

## Architecture

Argus is currently a case-file-first system. The near-term product is not a
black-box anomaly score; it is a readable, inspectable evidence package for one
astronomical object at a time.

Current pipeline:

1. **Ingestion** — pull recent ZTF objects and light curves from ALeRCE; write
   raw JSON first and flattened Parquet second.
2. **Preprocessing** — convert local light-curve data into deterministic tensors
   and manifests for later modeling, while keeping classifier metadata out of
   the model input.
3. **Case-file assembly** — build a per-object JSON document from local data
   that separates observed evidence, external metadata, candidate explanations,
   uncertainty, and recommended next checks.
4. **Phenomenological comparison** — run simple offline comparators such as the
   Gaussian bump and variability-texture checks to make model fit and model
   failure legible.
5. **Feature extraction** — compute standardized descriptive light-curve
   features for cross-object comparison without turning those features into
   classifications.
6. **Optional science/context probes** — lazily use optional dependencies such
   as `sncosmo` and `astroquery`/SIMBAD for template-family probing and catalog
   context. These are external evidence layers, not Argus classifications.
7. **Evidence synthesis** — assemble comparison summaries and an evidence
   narrative that explains what Argus can say, what it cannot say, and what
   should be checked next.
8. **Presentation exports** — write JSON, optional Markdown/HTML reports, and
   optional static figures so a case file can be inspected outside the codebase.

Future work:

- Add richer physical/template comparisons when required context is available.
- Add more catalog/context sources behind the same optional, non-blocking pattern.
- Add batch comparison across objects.
- Add an autoencoder or other anomaly-ranking model only after the case-file
  layer has clarified what signal is worth ranking.
- Add a lightweight viewer/frontend once the JSON/Markdown/figure artifacts are
  stable.

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

The `sncosmo` template-probe support and `astroquery` SIMBAD context lookup are
optional. Base Argus works without them. When `sncosmo` is absent, the
case-file probe records a non-fitted `dependency_unavailable` status when a fit
would otherwise be attempted; when `astroquery` is absent, cross-survey context
records `dependency_unavailable` only if the lookup was explicitly requested.
Install the science extra to enable the optional science integrations:

```bash
pip install -e ".[science]"
```

On Windows with Python 3.14, optional science packages may require source-build
tooling if compatible wheels are unavailable. Python 3.10 or 3.11 may be the
smoother path for the full science extras.

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

Classification metadata is intentionally dropped at preprocessing. Any future
ranking or modeling layer must be classifier-blind. Metadata can be rejoined by
`oid` downstream for audit and case-file context.

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
docs/
├── ARGUS_VISION.md              # product vision; the governing standard
└── PHASE_2B_DECISION.md         # why case-file-first, detector-second
src/argus/
├── config.py                    # paths, quality cuts, tensor schema, transform params
├── ingest/
│   ├── alerce.py                # thin wrapper over the ALeRCE client
│   └── storage.py               # raw JSON + flattened Parquet writers
├── preprocess/
│   ├── photometry.py            # mag↔flux, upper-limit noise, asinh + error propagation
│   ├── grid.py                  # Event, windowing, binning, per-object tensorization
│   └── dataset.py               # file IO, stacking, manifest, sanity checks
├── features/
│   └── light_curve_features.py   # standardized descriptive features via light-curve
├── casefile/
│   ├── schema.py                # CaseFile + summaries + comparator dataclasses
│   ├── summarize.py             # pure: evidence, candidates, uncertainty, next checks
│   ├── figures.py               # optional static PNG figures for case files
│   ├── html.py                  # static browser-readable case-file reports
│   ├── markdown.py              # presentation-ready Markdown case-file export
│   └── build.py                 # orchestration: load local files → CaseFile → JSON
├── context/
│   └── cross_survey.py          # optional SIMBAD context via astroquery
└── compare/
    ├── simple_templates.py      # Gaussian-bump template + curve_fit
    ├── sncosmo_templates.py     # cautious sncosmo model-family probe
    ├── residuals.py             # fit-quality scalars + plain-English residual interpretation
    └── variability.py           # descriptive repeated/irregular variability metrics
scripts/
├── ingest_daily.py              # ingestion CLI
├── preprocess_tensors.py        # preprocessing CLI
└── build_casefile.py            # case-file CLI
notebooks/
└── 02_explore_lightcurve.ipynb  # one-object Parquet-vs-raw comparison + Phase 2 schema decisions
tests/
├── fixtures/                    # 12 real objects, committed
├── test_storage.py
├── test_preprocess_photometry.py
├── test_preprocess_grid.py
├── test_preprocess_dataset.py
├── test_casefile.py
└── test_compare.py
```

## Build a case file (Phase 2B)

A *case file* is Argus's primary output: a per-object JSON document that
separates observed evidence, candidate explanations, uncertainty, and
recommended next checks. It is the bridge between the data engine (Phases
1 and 2a) and the future visual interface — the same JSON will drive both
human reading and any later UI layer.

```bash
python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq
python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --write-markdown
python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --write-html
python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --write-figures
python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --write-markdown --write-figures --write-html
```

Default case-file builds stay offline. To opt in to the Phase 2H SIMBAD lookup,
install the optional science extra and pass the explicit flag:

```bash
pip install -e ".[science]"
python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --include-cross-survey-context
python -m scripts.build_casefile --date 2026-05-20 --oid ZTF18abujsbq --include-cross-survey-context --cross-survey-radius-arcsec 5
```

This reads only local data (`data/lightcurves/{date}.parquet`,
`data/raw/{date}/lightcurves/{oid}.json`, and the tensor manifest at
`data/tensors/{date}.csv` if present) and writes:

```
data/casefiles/{oid}.json
data/casefiles/{oid}.casefile.md  # only when --write-markdown is passed
data/casefiles/{oid}.casefile.html  # only when --write-html is passed
data/casefiles/{oid}.lightcurve.png  # only when --write-figures is passed
data/casefiles/{oid}.residuals.png   # only when point-level residual data exists
```

Top-level fields:

| field | content |
|---|---|
| `oid`, `source_date`, `generated_at` | identity and provenance |
| `coordinates` | RA/Dec from the per-object Parquet mean, when available |
| `available_data_sources` | which of `parquet_detections`, `raw_lightcurve_json`, `tensor_manifest` were actually used |
| `detection_count`, `non_detection_count`, `filters_observed` | quick photometric inventory |
| `first_mjd`, `last_mjd`, `time_span_days` | coverage |
| `classification_metadata` | any external (ALeRCE) label, kept as metadata only |
| `light_curve_summary` | per-filter detection/non-detection counts, magnitude range, longest detection gap, most recent detection |
| `evidence_notes` | plain-English facts read off the data |
| `candidate_explanations` | external labels and placeholder hypotheses, each with `mismatch_notes` saying "no fit performed" |
| `uncertainty_notes` | what hasn't been checked (SIMBAD/NED, spectroscopy, forced photometry, fitting…) |
| `recommended_next_checks` | concrete actions that would tighten the case |
| `comparison_summary` | Phase 2E synthesis of comparator outputs: headline, summary, caveat, and recommended next check |
| `feature_summary` | Phase 2F standardized descriptive features from the external `light-curve` package |
| `cross_survey_context` | Phase 2H optional SIMBAD catalog metadata; default status is `not_requested` |
| `evidence_narrative` | Phase 2I readable synthesis of comparator, feature, template-family, optional catalog-context, uncertainty, and next-check signals |

Phase 2B emits **no fitted explanations** in `candidate_explanations` — every
entry there is either an inherited external label or a `placeholder_unfitted`
hypothesis. The governing principle is in the vision doc: the case file shows
its work and does not claim things it hasn't checked.

## Comparators (Phase 2C/2D/2E/2G)

Case files now also carry a top-level `model_comparisons` list: local,
offline checks that were actually run against the data. Phase 2C added a
**Gaussian bump on a constant baseline**, fit in magnitude space to r-band
detections via `scipy.optimize.curve_fit`.

Phase 2D adds a second r-band comparator, `variability_texture`. It does not
fit a model. It computes descriptive metrics that help distinguish a light
curve with few smooth turns from one with repeated or irregular changes:
observed magnitude range, robust scatter, local extrema/sign changes after
simple smoothing, and whether the scatter is materially larger than the
reported photometric errors.

Phase 2E adds `comparison_summary`, a short top-level synthesis built from
the existing `model_comparisons` entries. It explains whether the Gaussian
bump fit was clean or poor, whether variability texture looks repeated or
irregular, what that combination suggests, what it does not prove, and the
next check to run. It does not recompute metrics or add new dependencies.

Phase 2G adds `sncosmo_template_probe`, a conservative adapter for attempting
external template-family comparisons with `sncosmo`. The adapter prepares ZTF
detections as AB-zeropoint fluxes, but it will not force a fit when required
context is missing. In the current local case files, absent redshift normally
produces `missing_required_context`; unavailable packages or offline template
data are recorded as non-fitted statuses instead of crashing the build.
`sncosmo` is provided through the optional `science` extra, so base installs do
not need it.

The same `python -m scripts.build_casefile --date … --oid …` command now
runs the comparators and embeds their results, then writes the summary.
Each entry under `model_comparisons` has:

| field | content |
|---|---|
| `name`, `model_type`, `filter_used` | identity, such as `Gaussian bump (r-band)` / `gaussian_bump`, `Variability texture (r-band)` / `variability_texture`, or `sncosmo template probe` / `sncosmo_template_probe` |
| `status` | comparator-specific status such as `fitted_baseline`, `computed`, `insufficient_data`, `missing_required_context`, `template_unavailable`, `fit_failed`, or `dependency_unavailable` |
| `parameters` | fitted Gaussian parameters when applicable; `null` for the computed variability summary |
| `fit_metrics` | Gaussian fit metrics, or descriptive variability metrics such as magnitude range, robust scatter, smoothed sign changes, and scatter-vs-error ratios |
| `residual_points` | point-level Gaussian residuals when the Gaussian comparator fit succeeds; each point records MJD, observed magnitude, model magnitude, residual magnitude, and usable magnitude error |
| `residual_summary` | plain-English notes about where the Gaussian fit fails, or the main variability texture metrics |
| `interpretation` | one templated sentence keyed off the metrics |
| `limitations` | always includes "phenomenological — not a physical model" |

What this is **not**: a physical light-curve model. A converged Gaussian-bump
fit, a repeated-change hint, or an attempted `sncosmo` template-family fit
does *not* imply any specific source class, physical cause, or special status.
The `limitations` list says so explicitly on every comparator output, and the
test suite asserts that interpretation strings never claim otherwise.

## Standardized Features (Phase 2F)

Case files also include `feature_summary`, an offline r-band feature block
computed from already-ingested detections using the external
[`light-curve`](https://pypi.org/project/light-curve/) package. Phase 2F keeps
the subset deliberately basic: amplitude, standard deviation, median, median
absolute deviation, inter-percentile range, and maximum slope.

These values strengthen the evidence layer by making objects easier to compare
with each other. They are descriptive summaries only; they do not identify an
object type or assert a final finding. If the dependency is unavailable,
`feature_summary.status` is `dependency_unavailable` and the case-file build
continues.

## Cross-Survey Context (Phase 2H)

Case files include `cross_survey_context`, an optional external catalog-context
block. Default runs do not query the internet and record:

```json
{
  "status": "not_requested",
  "interpretation": "Cross-survey catalog context was not requested for this run.",
  "caveat": "No external catalog query was performed."
}
```

When `--include-cross-survey-context` is passed, Argus uses optional
`astroquery` support from the `science` extra to query SIMBAD around the
case-file coordinates. A nearby SIMBAD source is stored as external catalog
metadata only. It is not treated as an Argus classification, and a no-match or
failed query is recorded as a limitation rather than a conclusion.

## Evidence Narrative (Phase 2I)

Case files now include `evidence_narrative`, a top-level plain-English layer
that turns the separate evidence blocks into one readable case summary. It is
derived from existing fields such as `model_comparisons`, `comparison_summary`,
`feature_summary`, optional `cross_survey_context`, `uncertainty_notes`, and
`recommended_next_checks`; it does not rerun metrics or add new dependencies.

The narrative includes a headline, short summary, evidence sections, what Argus
can and cannot say, recommended next checks, and a caveat. If an evidence layer
is missing, unavailable, or not requested, the narrative records that limitation
instead of filling in assumptions. It remains descriptive only and does not
identify an object type or assert special status.

## Markdown Export (Phase 2J)

Case files can also be exported as presentation-ready Markdown with
`--write-markdown`. The Markdown report is written next to the JSON file as
`data/casefiles/{oid}.casefile.md` and renders the evidence narrative near the
top, followed by object metadata, light-curve summary, feature summary,
comparison summary, model comparisons, cross-survey context, uncertainty notes,
and recommended next checks.

Markdown export does not recompute metrics, query external services, or change
the JSON case file. It is a readable rendering of the existing case-file
evidence only.

## Static Figures (Phase 2K/2O)

Case files can optionally write static PNG figures with `--write-figures`.
Phase 2K writes an observed light-curve plot as
`data/casefiles/{oid}.lightcurve.png`, using local flattened detections,
per-band markers, and magnitude error bars when usable errors are available.
The magnitude axis is inverted so brighter detections appear higher.

Phase 2O stores point-level residuals for fitted Gaussian-bump comparator
outputs and writes `data/casefiles/{oid}.residuals.png` when that data is
available. The residual figure shows where the simple bump model under- or
over-predicts the observed magnitudes, which helps inspect model mismatch.
If residual points are absent, residual plots are still skipped gracefully
rather than inferred.
When `--write-markdown` and `--write-figures` are used together, the Markdown
report includes image links only for generated files, avoiding broken links.

## Static HTML Export (Phase 2L)

Case files can also be exported as static, browser-readable HTML with
`--write-html`. The report is written as
`data/casefiles/{oid}.casefile.html` and can be opened directly from disk. It
uses inline CSS only: no JavaScript, external stylesheets, fonts, CDN assets,
web server, or network access.

The HTML report renders the same evidence layers as the JSON and Markdown
artifacts: evidence narrative, optional visual summary, object metadata,
light-curve summary, feature summary, comparison summary, model comparisons,
cross-survey context, uncertainty notes, and recommended next checks. When
`--write-figures` is used in the same run, the HTML links only to generated PNG
files, so skipped residual plots do not create broken image links.

## Next

Add richer comparator families once they can be evaluated with the same
plain-language limitations and residual summaries. Add more optional
catalog-context adapters only when they can preserve the same opt-in,
metadata-only behavior. Each step is evaluated against the governing standard in
[`docs/ARGUS_VISION.md`](docs/ARGUS_VISION.md): does it help Argus build a
better scientific case from anomalous public data?
