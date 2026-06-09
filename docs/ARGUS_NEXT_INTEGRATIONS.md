# Argus Next Integration References

This note records external astronomy/UI projects worth inspecting before future
Argus integration work. It is research context only. It does not add new
dependencies, network calls, model logic, or product claims.

## Guardrails

- Keep Argus case-file-first: public artifacts should remain inspectable JSON,
  Markdown, HTML, PNG, and workstation views.
- Treat broker and catalog labels as external metadata, not Argus conclusions.
- Keep science integrations optional, lazy, and offline-safe in tests.
- Prefer small adapters over importing another platform's architecture.
- Preserve the review queue framing. Queue priority is a transparent inspection
  aid, not a detector verdict.

## References To Inspect

### SNAD ZTF Viewer

- Repository: https://github.com/snad-space/ztf-viewer
- Public viewer: https://ztf.snad.space/
- Useful ideas: compact ZTF object pages, folded/raw light-curve inspection,
  external cross-match presentation, and expert-review ergonomics.
- Argus boundary: use as UX reference only. Do not depend on the SNAD service
  for default builds or tests.

### Aladin Lite

- Repository: https://github.com/cds-astro/aladin-lite
- Documentation: https://aladin.cds.unistra.fr/AladinLite/doc/
- API docs: https://cds-astro.github.io/aladin-lite/A.html
- Useful ideas: embeddable sky context, HiPS survey backgrounds, object marker
  overlays, and browser-side sky navigation.
- Argus boundary: already used only in the static workstation browser layer.
  It must not affect Python case-file generation or offline tests.

### SkyPortal / Fritz / Kowalski

- SkyPortal repository: https://github.com/skyportal/skyportal
- Fritz repository: https://github.com/fritz-marshal/fritz
- Kowalski repository: https://github.com/skyportal/kowalski
- Useful ideas: queue triage, source pages, saved reviewer state, provenance,
  and broker/archive separation.
- Argus boundary: Argus should stay a lightweight artifact generator and static
  workstation unless a future task explicitly asks for a service-backed system.

### light-curve

- Python repository: https://github.com/light-curve/light-curve-python
- Project repository: https://github.com/light-curve/light-curve
- Useful ideas: standardized descriptive feature extraction, feature docs, and
  cadence-aware feature interpretation.
- Argus boundary: keep current feature subset small and descriptive. Advanced
  extractors should be added only when their inputs and caveats can be recorded.

### astrobase

- Repository: https://github.com/waqasbhatti/astrobase
- Documentation: https://astrobase.readthedocs.io/
- Useful ideas: time-series utilities, period-search patterns, batch review
  conventions, and plotting conventions.
- Argus boundary: do not add another large science dependency without a narrow
  adapter and tests that prove graceful absence.

### Playwright

- Documentation: https://playwright.dev/
- Useful ideas: optional browser smoke tests for the static workstation and
  GitHub Pages artifacts.
- Argus boundary: not added in the current hardening pass to avoid increasing CI
  weight. Vitest helper tests cover the deterministic frontend logic for now.

## Candidate Future Work

- Add a tiny Playwright smoke test only if browser coverage becomes necessary:
  load `docs/workstation/index.html`, verify the queue count, select one object,
  and confirm Case Mode renders observed light-curve points.
- Add a generalized external-context schema only when a second real context
  source is implemented. Until then, the single SIMBAD adapter remains clear and
  easier to audit.
- Extend cadence diagnostics for additional features when there is a concrete
  feature-value failure mode to explain.
