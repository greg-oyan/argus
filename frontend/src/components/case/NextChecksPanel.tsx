import { useInvestigationStore } from "../../stores/investigationStore";
import type { CaseFileDetail, CasefileIndexEntry } from "../../types/casefile";

interface NextChecksPanelProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export function NextChecksPanel({ entry, detail }: NextChecksPanelProps) {
  const activeComparator = useInvestigationStore((state) => state.activeComparator);
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const nextChecks = uniqueStrings([
    ...(detail?.recommended_next_checks ?? []),
    ...(detail?.evidence_narrative?.recommended_next_checks ?? []),
    detail?.comparison_summary?.recommended_next_check,
    entry.top_recommended_next_check,
  ]);
  const uncertaintyNotes = detail?.uncertainty_notes ?? [];
  const missingContext =
    entry.cross_survey_context_status === "not_requested" ||
    entry.cross_survey_context_status === "dependency_unavailable" ||
    entry.sncosmo_template_probe_status === "missing_required_context" ||
    activeComparator === "sncosmo_template_probe" ||
    activeComparator === "template" ||
    activeComparator === "catalog";

  return (
    <section
      className={`border bg-workstation-panel/80 ${
        missingContext ? "border-workstation-amber/70" : "border-workstation-line"
      }`}
      onMouseEnter={() => setFocusedPanelKey("next_checks")}
    >
      <div className="border-b border-workstation-line px-3 py-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Next Checks
        </p>
        <p className="mt-1 text-xs leading-5 text-workstation-muted">
          Missing evidence and context stay visible beside the linked charts.
        </p>
      </div>

      <div className="max-h-[280px] overflow-auto p-3">
        {missingContext ? (
          <p className="mb-3 border-l border-workstation-amber/70 pl-3 text-xs leading-5 text-workstation-text">
            Missing context is part of the current evidence state. Treat the next checks as
            inspection prompts, not conclusions.
          </p>
        ) : null}

        {nextChecks.length ? (
          <ol className="space-y-2 text-xs leading-5 text-workstation-muted">
            {nextChecks.map((check, index) => (
              <li className="grid grid-cols-[24px_minmax(0,1fr)] gap-2" key={check}>
                <span className="font-mono text-workstation-muted">{index + 1}</span>
                <span>{check}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-workstation-muted">No recommended next checks are present.</p>
        )}

        {uncertaintyNotes.length ? (
          <div className="mt-4 border-t border-workstation-line pt-3">
            <p className="mb-2 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-workstation-muted">
              Uncertainty notes
            </p>
            <ul className="space-y-2 text-xs leading-5 text-workstation-muted">
              {uncertaintyNotes.map((note) => (
                <li className="border-l border-workstation-line pl-3" key={note}>
                  {note}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
