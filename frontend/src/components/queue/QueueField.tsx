import { useEffect, useRef } from "react";
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

const NAV_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "ArrowLeft",
  "ArrowRight",
  "j",
  "k",
  "J",
  "K",
  "Enter",
]);

function ignoresKeyEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return target.closest("[data-argus-skip-keynav]") !== null;
}

export function QueueField({ entries, details, onOpenCase, showHeader = true }: QueueFieldProps) {
  const selectedOid = useInvestigationStore((state) => state.selectedOid);
  const hoveredOid = useInvestigationStore((state) => state.hoveredOid);
  const setSelectedOid = useInvestigationStore((state) => state.setSelectedOid);
  const setHoveredOid = useInvestigationStore((state) => state.setHoveredOid);
  const reduceMotion = useReducedMotion();
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!selectedOid) {
      return;
    }
    const node = cardRefs.current.get(selectedOid);
    if (node) {
      node.scrollIntoView({ block: "nearest" });
    }
  }, [selectedOid]);

  useEffect(() => {
    if (entries.length === 0) {
      return undefined;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!NAV_KEYS.has(event.key)) {
        return;
      }
      if (ignoresKeyEvent(event.target)) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const currentIndex = selectedOid
        ? entries.findIndex((entry) => entry.oid === selectedOid)
        : -1;
      if (event.key === "Enter") {
        if (currentIndex >= 0) {
          event.preventDefault();
          onOpenCase(entries[currentIndex].oid);
        }
        return;
      }
      const delta =
        event.key === "ArrowDown" ||
        event.key === "ArrowRight" ||
        event.key === "j" ||
        event.key === "J"
          ? 1
          : -1;
      const nextIndex =
        currentIndex < 0
          ? delta > 0
            ? 0
            : entries.length - 1
          : Math.max(0, Math.min(entries.length - 1, currentIndex + delta));
      const nextOid = entries[nextIndex]?.oid;
      if (nextOid && nextOid !== selectedOid) {
        event.preventDefault();
        setSelectedOid(nextOid);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [entries, onOpenCase, selectedOid, setSelectedOid]);

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
            ref={(node) => {
              if (node) {
                cardRefs.current.set(entry.oid, node);
              } else {
                cardRefs.current.delete(entry.oid);
              }
            }}
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
