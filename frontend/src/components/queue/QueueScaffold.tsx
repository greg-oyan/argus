import type { CasefileIndexEntry } from "../../types/casefile";
import { useInvestigationStore } from "../../stores/investigationStore";

interface QueueScaffoldProps {
  entries: CasefileIndexEntry[];
  onOpenCase: (oid: string) => void;
}

function priorityClass(level?: string): string {
  if (level === "high") {
    return "border-workstation-red/60 text-workstation-red";
  }
  if (level === "medium") {
    return "border-workstation-amber/60 text-workstation-amber";
  }
  return "border-workstation-green/60 text-workstation-green";
}

function linkStatus(entry: CasefileIndexEntry): string {
  const links = entry.links ?? {};
  const available = [
    links.html && "HTML",
    links.markdown && "MD",
    links.json && "JSON",
    links.light_curve_png && "LC",
    links.residual_png && "RES",
  ].filter(Boolean);
  return available.length > 0 ? available.join(" / ") : "No artifacts";
}

export function QueueScaffold({ entries, onOpenCase }: QueueScaffoldProps) {
  const selectedOid = useInvestigationStore((state) => state.selectedOid);
  const setSelectedOid = useInvestigationStore((state) => state.setSelectedOid);

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-workstation-muted">
        No case files are present in the loaded index.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="sticky top-0 z-10 grid grid-cols-[160px_104px_minmax(0,1fr)_140px_120px_150px] gap-3 border-b border-workstation-line bg-workstation-panel px-4 py-3 font-mono text-[0.68rem] uppercase tracking-[0.14em] text-workstation-muted">
        <span>OID</span>
        <span>Priority</span>
        <span>Headline</span>
        <span>Detections</span>
        <span>Filters</span>
        <span>Links</span>
      </div>
      <div className="divide-y divide-workstation-line/80">
        {entries.map((entry) => {
          const selected = selectedOid === entry.oid;
          const priority = entry.review_priority;
          return (
            <button
              className={`grid w-full grid-cols-[160px_104px_minmax(0,1fr)_140px_120px_150px] gap-3 px-4 py-3 text-left text-sm transition ${
                selected
                  ? "bg-workstation-panel2 text-white"
                  : "bg-transparent text-workstation-text hover:bg-workstation-panel/70"
              }`}
              key={entry.oid}
              onClick={() => setSelectedOid(entry.oid)}
              onDoubleClick={() => onOpenCase(entry.oid)}
              type="button"
            >
              <span className="font-mono text-workstation-accent">{entry.oid}</span>
              <span
                className={`w-fit rounded-sm border px-2 py-0.5 font-mono text-xs ${priorityClass(
                  priority?.level,
                )}`}
              >
                {priority ? `${priority.score}/${priority.level}` : "n/a"}
              </span>
              <span className="truncate">{entry.headline}</span>
              <span className="font-mono text-workstation-muted">
                {entry.detection_count ?? "n/a"}
              </span>
              <span className="font-mono text-workstation-muted">
                {(entry.filters_observed ?? []).join(", ") || "n/a"}
              </span>
              <span className="truncate font-mono text-xs text-workstation-muted">
                {linkStatus(entry)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
