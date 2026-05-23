import type { CaseFileDetailMap, CasefileIndexEntry } from "../../types/casefile";
import { useInvestigationStore } from "../../stores/investigationStore";
import { ObjectGlyphCard } from "./ObjectGlyphCard";

interface QueueFieldProps {
  entries: CasefileIndexEntry[];
  details: CaseFileDetailMap;
  onOpenCase: (oid: string) => void;
}

export function QueueField({ entries, details, onOpenCase }: QueueFieldProps) {
  const selectedOid = useInvestigationStore((state) => state.selectedOid);
  const hoveredOid = useInvestigationStore((state) => state.hoveredOid);
  const setSelectedOid = useInvestigationStore((state) => state.setSelectedOid);
  const setHoveredOid = useInvestigationStore((state) => state.setHoveredOid);

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-workstation-muted">
        No case files are present in the loaded index.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <div className="mb-4 flex items-end justify-between gap-4 border-b border-workstation-line pb-3">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
            Queue Mode
          </p>
          <h1 className="mt-1 text-lg font-semibold text-white">Evidence glyph field</h1>
        </div>
        <p className="hidden max-w-md text-right text-xs leading-5 text-workstation-muted md:block">
          Each object is encoded from existing case-file evidence: priority spine, behavior
          trace, residual barcode, filters, sparsity texture, and evidence rail.
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {entries.map((entry) => (
          <ObjectGlyphCard
            detail={details[entry.oid]}
            entry={entry}
            isHovered={hoveredOid === entry.oid}
            isSelected={selectedOid === entry.oid}
            key={entry.oid}
            onHover={() => setHoveredOid(entry.oid)}
            onLeave={() => setHoveredOid(null)}
            onOpenCase={() => onOpenCase(entry.oid)}
            onSelect={() => setSelectedOid(entry.oid)}
          />
        ))}
      </div>
    </div>
  );
}
