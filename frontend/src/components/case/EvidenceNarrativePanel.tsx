import { useInvestigationStore } from "../../stores/investigationStore";
import type { CaseFileDetail, EvidenceSection } from "../../types/casefile";

interface EvidenceNarrativePanelProps {
  detail: CaseFileDetail | null | undefined;
}

function sectionKey(section: EvidenceSection): string {
  return `${section.title} ${section.status ?? ""} ${section.summary ?? ""}`.toLowerCase();
}

function sectionIsFocused(
  section: EvidenceSection,
  activeComparator: string | null,
  highlightedEvidenceKey: string | null,
): boolean {
  const text = sectionKey(section);
  const active = `${activeComparator ?? ""} ${highlightedEvidenceKey ?? ""}`.toLowerCase();
  if (!active.trim()) {
    return false;
  }
  if (active.includes("gaussian") && (text.includes("gaussian") || text.includes("bump"))) {
    return true;
  }
  if (active.includes("variability") && text.includes("variability")) {
    return true;
  }
  if (active.includes("feature") && text.includes("feature")) {
    return true;
  }
  if ((active.includes("sncosmo") || active.includes("template")) && text.includes("template")) {
    return true;
  }
  if ((active.includes("cross") || active.includes("catalog")) && text.includes("catalog")) {
    return true;
  }
  return text.includes(active.trim());
}

export function EvidenceNarrativePanel({ detail }: EvidenceNarrativePanelProps) {
  const activeComparator = useInvestigationStore((state) => state.activeComparator);
  const highlightedEvidenceKey = useInvestigationStore((state) => state.highlightedEvidenceKey);
  const setHighlightedEvidenceKey = useInvestigationStore(
    (state) => state.setHighlightedEvidenceKey,
  );
  const setFocusedPanelKey = useInvestigationStore((state) => state.setFocusedPanelKey);
  const narrative = detail?.evidence_narrative;
  const sections = narrative?.evidence_sections ?? [];

  return (
    <section
      className="border border-workstation-line bg-workstation-panel/80"
      onMouseEnter={() => setFocusedPanelKey("evidence_narrative")}
    >
      <div className="border-b border-workstation-line px-3 py-2">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Evidence Narrative
        </p>
        <p className="mt-1 text-xs leading-5 text-workstation-muted">
          Sections respond to comparator focus and highlighted evidence keys.
        </p>
      </div>

      <div className="max-h-[330px] overflow-auto p-3">
        <h2 className="font-mono text-sm text-white">
          {narrative?.headline ?? detail?.comparison_summary?.headline ?? "Narrative unavailable"}
        </h2>
        <p className="mt-2 text-xs leading-5 text-workstation-muted">
          {narrative?.short_summary ??
            detail?.comparison_summary?.summary ??
            "No narrative summary is present in this case-file artifact."}
        </p>

        {sections.length ? (
          <div className="mt-4 space-y-2">
            {sections.map((section) => {
              const focused = sectionIsFocused(section, activeComparator, highlightedEvidenceKey);
              return (
                <button
                  className={`w-full border p-3 text-left ${
                    focused
                      ? "border-workstation-accent/70 bg-workstation-bg/80"
                      : "border-workstation-line bg-workstation-bg/40"
                  }`}
                  key={`${section.title}-${section.status}`}
                  onClick={() => {
                    setHighlightedEvidenceKey(section.title);
                    setFocusedPanelKey("evidence_narrative");
                  }}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-mono text-xs uppercase tracking-[0.12em] text-workstation-text">
                      {section.title}
                    </h3>
                    <span className="font-mono text-[0.68rem] text-workstation-muted">
                      {section.status ?? "recorded"}
                    </span>
                  </div>
                  {section.summary ? (
                    <p className="mt-2 text-xs leading-5 text-workstation-muted">
                      {section.summary}
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}

        <p className="mt-4 border-t border-workstation-line pt-3 text-xs leading-5 text-workstation-muted">
          This panel organizes existing case-file evidence only; it does not identify the object.
        </p>
      </div>
    </section>
  );
}
