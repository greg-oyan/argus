# Argus Announcement Draft

Argus is now a public, case-file-first astronomy review aid.

- Live workstation: <https://greg-oyan.github.io/argus/workstation/>
- About: <https://greg-oyan.github.io/argus/>

You arrive *inside* the visualization. The workstation root is a full-screen
sky view; the objects Argus flagged sit on it as glowing priority-encoded
markers. Click one and the view flies in and opens that object's story page —
a single vertical layout that explains the case in plain English, with the
brightness-over-time light curve as the hero and three questions answered from
the case-file JSON: *what is this*, *why was it flagged*, *what would an
astronomer check next*.

The technical evidence didn't disappear. It moved one click away, into an
"Expert view" expander that contains the full evidence panels (assessment,
residuals, comparators, features, narrative, sky context), the
priority-ordered queue table, and a short glossary for the precise terms.

Argus keeps its boundaries visible. Broker labels and catalog matches are
metadata, not conclusions. Review priority is a queue sorting heuristic, not a
model result. The `anomaly_assessment` field is an evidence triage summary
inside a case file, not an object-identity claim.

The public demo includes a small multi-object review queue and a canonical
ZTF18abujsbq case bundle. It is intentionally lightweight: no server, no
frontend framework beyond the static workstation build, no required optional
science dependencies, and no networked catalog checks in CI.
