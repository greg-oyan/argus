import { motion, useReducedMotion } from "framer-motion";
import type { CaseFileDetailMap, CasefileIndexEntry } from "../../types/casefile";
import { useInvestigationStore } from "../../stores/investigationStore";
import { ObjectGlyphCard } from "./ObjectGlyphCard";

interface QueueFieldProps {
  entries: CasefileIndexEntry[];
  details: CaseFileDetailMap;
  onOpenCase: (oid: string) => void;
  showHeader?: boolean;
}

export function QueueField({ entries, details, onOpenCase, showHeader = true }: QueueFieldProps) {
  const selectedOid = useInvestigationStore((state) => state.selectedOid);
  const hoveredOid = useInvestigationStore((state) => state.hoveredOid);
  const setSelectedOid = useInvestigationStore((state) => state.setSelectedOid);
  const setHoveredOid = useInvestigationStore((state) => state.setHoveredOid);
  const reduceMotion = useReducedMotion();

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-workstation-muted">
        No case files are present in the loaded index.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      {showHeader ? (
        <div className="mb-4 flex items-end justify-between gap-4 border-b border-workstation-line pb-3">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
              Queue Mode
            </p>
            <h1 className="mt-1 text-lg font-semibold text-white">Evidence glyph field</h1>
            <p className="mt-1 font-mono text-xs text-workstation-muted">
              {entries.length} objects prepared for linked-view inspection
              {selectedOid ? ` / selected ${selectedOid}` : ""}
            </p>
          </div>
          <p className="hidden max-w-md text-right text-xs leading-5 text-workstation-muted md:block">
            Select an object to move from the review field into its evidence canvas. The same
            priority spine, behavior trace, residual barcode, filters, and evidence rail carry
            into Case Mode.
          </p>
        </div>
      ) : null}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {entries.map((entry, index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            key={entry.oid}
            transition={reduceMotion ? { duration: 0 } : { delay: Math.min(index * 0.016, 0.6), duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <ObjectGlyphCard
              detail={details[entry.oid]}
              entry={entry}
              isHovered={hoveredOid === entry.oid}
              isSelected={selectedOid === entry.oid}
              onHover={() => setHoveredOid(entry.oid)}
              onLeave={() => setHoveredOid(null)}
              onOpenCase={() => onOpenCase(entry.oid)}
              onSelect={() => setSelectedOid(entry.oid)}
            />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
