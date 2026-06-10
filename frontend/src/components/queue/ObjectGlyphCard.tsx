import {
  behaviorKind,
  evidenceRailItems,
  priorityEncoding,
  residualPoints,
  sparsityEncoding,
} from "../../lib/glyphEncoding";
import { REVIEW_PRIORITY_DEFINITION } from "../../lib/assessmentDisplay";
import type { CaseFileDetail, CasefileIndexEntry } from "../../types/casefile";
import { BehaviorTrace } from "./BehaviorTrace";
import { EvidenceStatusRail } from "./EvidenceStatusRail";
import { ResidualBarcode } from "./ResidualBarcode";

interface ObjectGlyphCardProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
  isSelected: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onOpenCase: () => void;
  onHover: () => void;
  onLeave: () => void;
}

function filterActive(filters: string[] | undefined, filter: string): boolean {
  return (filters ?? []).includes(filter);
}

export function ObjectGlyphCard({
  entry,
  detail,
  isSelected,
  isHovered,
  onSelect,
  onOpenCase,
  onHover,
  onLeave,
}: ObjectGlyphCardProps) {
  const priority = priorityEncoding(entry);
  const sparsity = sparsityEncoding(entry, detail);
  const behavior = behaviorKind(entry, detail);
  const residuals = residualPoints(detail);
  const railItems = evidenceRailItems(entry);
  const filters = entry.filters_observed ?? detail?.filters_observed ?? [];

  return (
    <button
      aria-label={`Inspect ${entry.oid}`}
      aria-pressed={isSelected}
      className={`group relative h-[150px] w-[260px] overflow-hidden border bg-workstation-panel text-left transition-[border-color,background-color,box-shadow,transform] duration-200 ${
        isSelected
          ? "border-workstation-accent bg-workstation-panel2 shadow-[0_0_0_1px_rgba(107,183,255,0.48),inset_0_0_0_1px_rgba(107,183,255,0.16)]"
          : "border-workstation-line hover:border-workstation-accent/60 hover:bg-workstation-panel2/70"
      } ${isHovered ? "translate-y-[-1px]" : ""}`}
      onClick={() => {
        onSelect();
        onOpenCase();
      }}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      data-testid="object-glyph-card"
      type="button"
    >
      <div
        className="absolute inset-y-0 left-0"
        style={{
          backgroundColor: priority.color,
          opacity: priority.opacity,
          width: priority.width,
        }}
      />
      <svg aria-hidden="true" className="absolute inset-0 h-full w-full" viewBox="0 0 260 150">
        {Array.from({ length: sparsity.nonDetectionTexture }, (_, index) => (
          <line
            key={index}
            opacity="0.06"
            stroke="#8aa0b5"
            strokeWidth="1"
            x1={22 + index * 11}
            x2={18 + index * 11}
            y1="20"
            y2="140"
          />
        ))}
        <BehaviorTrace kind={behavior} sparsity={sparsity} />
        <ResidualBarcode points={residuals} />
        <EvidenceStatusRail items={railItems} />
      </svg>
      <div className="relative z-10 flex h-full flex-col justify-between p-3 pl-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-workstation-muted">
              {isSelected ? "Selected Object" : "Object"}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-2 font-mono text-sm text-white">
              <span>{entry.oid}</span>
              {entry.context_enriched ? (
                <span className="border border-workstation-green/70 px-1 text-[0.58rem] uppercase tracking-[0.12em] text-workstation-green">
                  ctx
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-1">
            {(["g", "r"] as const).map((filter) => (
              <span
                className={`h-5 w-5 border text-center font-mono text-[0.62rem] leading-5 ${
                  filterActive(filters, filter)
                    ? "border-workstation-accent/70 text-workstation-text"
                    : "border-workstation-line/70 text-workstation-muted/35"
                }`}
                key={filter}
              >
                {filter}
              </span>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <p className="line-clamp-2 pr-6 text-xs leading-4 text-workstation-muted">
            {entry.headline}
          </p>
          <div className="text-right">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-workstation-muted" title={REVIEW_PRIORITY_DEFINITION}>
              {entry.review_priority
                ? `${entry.review_priority.score}/10 ${entry.review_priority.level}`
                : "priority n/a"}
            </p>
            <p
              className={`mt-1 font-mono text-[0.62rem] uppercase tracking-[0.12em] ${
                isSelected || isHovered ? "text-workstation-accent" : "text-workstation-muted/55"
              }`}
            >
              Open case
            </p>
          </div>
        </div>
      </div>
    </button>
  );
}
