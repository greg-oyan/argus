# Phase 2B Decision Memo

## Decision

Phase 2B builds the **case-file foundation** before training any homegrown
detector. The autoencoder previously slated for Phase 2b is deferred.

## Why

1. **Synthesis is the differentiator, not detection.** Brokers already detect
   anomalies. Argus's product hypothesis is that turning a flagged object
   into an assembled, honest, readable case is the scarce work.
2. **Brokers + manual candidates are enough input for now.** We can produce
   case files immediately from existing local data — no detector required
   to demonstrate the product.
3. **A detector is reversible work.** If case files surface a need for our
   own anomaly model later (e.g., to catch candidates brokers miss), we can
   add one then. Building it now bets compute and complexity on a hypothesis
   we have no evidence for yet.
4. **Demoability.** A working case-file CLI produces something a non-expert
   can read and react to. A reconstruction-error histogram is not.

## What Phase 2B builds

- A new subpackage `src/argus/casefile/` with:
  - `schema.py` — dataclasses for the case-file structure.
  - `summarize.py` — pure functions that compute evidence, candidate
    explanations, uncertainty, and next checks from local data.
  - `build.py` — orchestration: load local data → assemble a `CaseFile`.
- `scripts/build_casefile.py` — CLI: `--date YYYY-MM-DD --oid ZTF…`.
- `data/casefiles/{oid}.json` — output, gitignored under the existing
  `data/` rule.
- Offline tests against the existing committed fixtures.
- A README section explaining what a case file is and how to build one.

## What Phase 2B does not build

- No homegrown ML model. No autoencoder. No training loop.
- No network calls. No SIMBAD, NED, Gaia, or other external integrations.
  (Those will arrive as evidence-source plugins in a later phase.)
- No web frontend. Output is JSON; visual rendering is downstream work.
- No fitted physical models. Candidate explanations are placeholders for
  now, honestly labeled as such.
- No generative-LLM-written narrative. Plain English where used, but
  templated and deterministic; no model-driven prose.

## Success criterion

A single command produces one honest case file for one real object from
local data alone. The JSON separates observed evidence from candidate
explanations from uncertainty from recommended next checks. Tests pass
offline. The case file does not claim anything that has not been checked.
