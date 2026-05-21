# Argus AI Coding Agent Instructions

These instructions are for AI coding agents working in this repository. They
capture the project rules that should persist across individual prompts.

## Project Shape

Argus is case-file-first. The current product is a readable evidence package
and review queue for astronomical objects, not a black-box classifier and not
an autoencoder-first system.

Treat autoencoders, anomaly ranking, and scored feeds as future work unless a
prompt explicitly asks for them. Do not reframe the current architecture around
an anomaly detector.

## Scientific Framing

Argus must remain cautious and phenomenological. Do not write language implying
that Argus has identified, confirmed, or physically classified an object.

Forbidden claims and phrases include:

- "this is a variable star"
- "this is a supernova"
- "this is an AGN"
- "confirmed transient"
- "new physics"
- "anomaly confirmed"
- "classification confirmed"
- "discovery"

Use language like "not well explained by a single smooth bump", "shows repeated
or irregular variability texture", "external catalog metadata", and
"recommended next check".

## Metadata Is Not Truth

Broker and catalog labels are external metadata, not Argus conclusions. ALeRCE
classifications, SIMBAD labels, and future catalog labels must be framed as
reported metadata.

Preferred wording:

- "ALeRCE labels..."
- "SIMBAD reports..."
- "The case file records external metadata..."

Avoid wording like:

- "Argus determines..."
- "Argus confirms..."
- "This object is..."

## Change Scope

Prefer small, surgical, reviewable changes.

- Touch only files needed for the requested phase.
- Do not refactor unrelated code.
- Do not clean up adjacent code unless required by the task.
- Match existing module boundaries, naming, and style.
- Keep generated outputs deterministic where possible.

## Dependencies And Network

Do not add dependencies unless explicitly requested. Science dependencies should
stay optional and lazy whenever possible.

The base install and default test path must remain offline-safe. Do not add
network calls unless explicitly requested. Mock networked integrations in tests.
Cross-survey and catalog context must remain explicit opt-in behavior.

## Data Boundaries

Do not commit raw data under `data/`; `data/` remains ignored.

Do not commit raw ALeRCE JSON, Parquet, tensors, or large generated data unless
the prompt explicitly asks for it. Public demo artifacts belong under
`examples/` and `docs/examples/` only when intentionally curated.

When exports or schema change, update the curated demo artifacts when relevant:

- `examples/ZTF18abujsbq/`
- `docs/examples/ZTF18abujsbq/`
- `examples/index.*`
- `docs/examples/index.*`

## Testing

Add or update tests for behavior changes. Run the full offline suite before a
commit:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Do not commit or push failing tests unless the user explicitly instructs you to
do so and the failure is clearly documented.

## Documentation

Update `README.md` when behavior, CLI flags, outputs, examples, or architecture
change. Keep the architecture case-file-first. Do not reintroduce the old
autoencoder-first roadmap as the current architecture.

## Commit And Push

Only commit and push when the prompt explicitly asks for it. If asked to commit
and push, run tests first, use a clear commit message, and push to `origin/main`
unless instructed otherwise.

## Preferred Workflow

1. Inspect existing code, tests, docs, and generated examples first.
2. State assumptions if anything is ambiguous.
3. Make the smallest change that satisfies the goal.
4. Add or update tests.
5. Run `.\.venv\Scripts\python.exe -m pytest -q`.
6. Update README or docs if behavior changed.
7. Regenerate curated examples and docs examples if exports changed.
8. Commit and push only if requested.
