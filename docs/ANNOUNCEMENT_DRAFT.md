# Argus Announcement Draft

Argus is now a public, case-file-first astronomy review aid.

The project turns local ZTF/ALeRCE light-curve data into inspectable evidence
packages: structured JSON, static HTML and Markdown reports, light-curve and
residual figures, a review-prioritized index, and a browser-based analyst
workstation served from static GitHub Pages assets.

The workstation is designed for triage rather than verdicts. Queue Mode shows a
visual field of case-file glyphs, including review priority, filters, behavior
texture, residual structure, and missing evidence. Case Mode links observed
points, Gaussian residuals, evidence text, deterministic evidence triage, and
external sky context when available. The same evidence remains accessible in the
portable static reports and JSON artifacts.

Argus keeps its boundaries visible. Broker labels and catalog matches are
metadata, not conclusions. Review priority is a queue sorting heuristic, not a
model result. The `anomaly_assessment` field is an evidence triage summary
inside a case file, not an object-identity claim.

The public demo includes a small multi-object review queue and a canonical
ZTF18abujsbq case bundle. It is intentionally lightweight: no server, no
frontend framework beyond the static workstation build, no required optional
science dependencies, and no networked catalog checks in CI.
