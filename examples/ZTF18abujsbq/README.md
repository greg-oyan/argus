# ZTF18abujsbq Example Case File

This directory contains a generated Argus case-file bundle for ZTF18abujsbq,
built from local ALeRCE/ZTF data from the 2026-05-20 pull.

Files:

- [ZTF18abujsbq.casefile.html](ZTF18abujsbq.casefile.html) - browser-readable report
- [ZTF18abujsbq.casefile.md](ZTF18abujsbq.casefile.md) - Markdown report
- [ZTF18abujsbq.lightcurve.png](ZTF18abujsbq.lightcurve.png) - observed light-curve figure
- [ZTF18abujsbq.residuals.png](ZTF18abujsbq.residuals.png) - Gaussian comparator residual figure
- [ZTF18abujsbq.casefile.json](ZTF18abujsbq.casefile.json) - structured case-file data

The example demonstrates Argus's case-file-first workflow: evidence narrative,
descriptive features, phenomenological comparators, optional context status,
uncertainty, and next checks. It is not a physical classification.

The residual figure shows where the simple Gaussian bump comparator under- or
over-predicts the observed magnitudes. It is a model-mismatch inspection aid,
not a physical interpretation.

The bundle is intentionally lightweight. It does not include raw ALeRCE JSON,
Parquet tables, tensor archives, or the full ignored `data/` directory.
