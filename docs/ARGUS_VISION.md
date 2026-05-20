# Argus — Product Vision

## Product thesis

Argus is an AI-assisted scientific case-builder. Given a strange real object
or event from public astronomical data, Argus assembles the relevant evidence,
compares it against known explanations, shows where those explanations succeed
or fall short, exposes residual mismatch, and produces a case file that a
reasonably intelligent person can understand and act on.

The product is the case file. Everything else — pipelines, detectors,
preprocessors, models — exists to make the case file better.

## What Argus is not

- **Not another anomaly classifier.** ALeRCE, ANTARES, Lasair, and Fink
  already detect anomalies in the ZTF and Rubin alert streams. Competing
  with their detection pipelines on their terms is neither valuable nor
  winnable for a small project.
- **Not a ZTF dashboard or a generic astronomy web app.** Plenty of those
  exist, and most of them are read-only views of broker output.
- **Not an autoencoder demo.** An autoencoder may eventually become part of
  Argus, but only as a means to surface candidates worth building case files
  for, never as the product itself.

## The synthesis gap

Modern astronomy has plenty of detection pipelines and plenty of catalogs
(SIMBAD, NED, Gaia, WISE, ZTF, Rubin, …). What is scarce is the synthesis
step: collecting the relevant evidence on a single object, putting it in
conversation with the known hypotheses, and surfacing exactly where the data
doesn't fit any of them.

That synthesis is currently done by hand by astronomers who only have so many
hours, and most candidates never get the time. The bottleneck is not
detection. It is the time required to look at one candidate, gather evidence,
match it against templates, and write down whether it is interesting or just
noise. Argus aims at that bottleneck.

## Why a case file, not a score

An anomaly score points at something but does not justify itself. The reader
has to trust the model. That trust budget is expensive and the audience for
it is small: experts who already know the model's failure modes.

A case file shows its work. It separates four things explicitly:

1. **Observed evidence** — what we can read off the data directly.
2. **Candidate explanations** — hypotheses that might fit, with each one's
   rationale and where it falls short.
3. **Uncertainty** — what we do not know, what has not been checked.
4. **Recommended next checks** — concrete actions that would tighten the case.

A reasonably intelligent reader — an astronomy student, a domain-adjacent
scientist, a journalist working a science story — can read a case file and
decide for themselves whether to follow up. The same reader can't act on a
raw score.

This is the difference between "the model thinks this is weird" and "here is
why this is weird, here is what could explain it, and here is what would
disprove or confirm each candidate explanation."

## Current repo role

After Phase 1 and Phase 2a, the repo has an honest data foundation:

- **Phase 1 (ingestion).** Pulls real ZTF alerts from ALeRCE; preserves raw
  JSON as the source of truth; flattens to Parquet for downstream use.
- **Phase 2a (preprocessing).** Turns detections + non-detections into a
  model-ready tensor archive with reproducible transforms; preserves enough
  metadata that any later step can audit exactly what was done.

The data layer is solid enough to support case-file generation directly.
No additional ingestion or preprocessing work is required before the
case-file foundation can be built.

## Strategic correction — case-file-first, detector-second

The previous plan was: Phase 2b trains a 1D convolutional autoencoder. That
work is deferred.

Rationale:

- Detection is a saturated market. Brokers do it well. We are not advantaged.
- Synthesis and case-building is undersaturated and is the actual product.
- Existing broker outputs — and even manually chosen candidates — are enough
  to feed case-file generation immediately. We do not need our own detector
  to get to a useful, demonstrable product.
- A homegrown detector might still be valuable later, but only when there is
  evidence that broker outputs are missing candidates we specifically need.

This is a strategic correction, not a permanent ban on detection work.

## The first impressive demo

A single command, against local data only, produces one case file for one
real object. The case file contains:

- The object's identity (oid).
- Its sky location, if available.
- Its light curve: detections and non-detections by filter, with time span
  and brightness range.
- Any classification or cross-match context already present.
- At least one candidate explanation, or an explicit placeholder where no
  comparison model is yet attached.
- Where that explanation falls short of the data, or what uncertainty
  remains.
- A plain-English explanation of why the object is potentially interesting.
- A list of recommended next checks that would tighten or refute the case.

Nothing in this demo requires a homegrown model, an external API call, or a
web frontend. It is buildable from the data already on disk.

## Governing standard

Every future change to this repo should be evaluated against one question:

> Does this help Argus build a better scientific case from anomalous public
> data?

If the answer is no or unclear, the change probably should not happen.

If the answer is yes, the change should make explicit *which part* of the
case file it improves: evidence, candidate explanations, uncertainty, or
recommended next checks.
