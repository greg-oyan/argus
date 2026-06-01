import type { CaseFileDetail, CasefileIndexEntry } from "../../types/casefile";

interface CaseHeaderProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
  onBackToQueue: () => void;
}

function formatFilters(filters: string[] | undefined): string {
  return filters?.length ? filters.join(", ") : "n/a";
}

export function CaseHeader({ entry, detail, onBackToQueue }: CaseHeaderProps) {
  const detections = entry.detection_count ?? detail?.detection_count ?? "n/a";
  const filters = entry.filters_observed ?? detail?.filters_observed;
  const priority = entry.review_priority;

  return (
    <header className="border-b border-workstation-line bg-workstation-panel px-5 py-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
            Case Mode
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-2xl text-white">{entry.oid}</h1>
            {priority ? (
              <span className="border border-workstation-line bg-workstation-bg/70 px-2 py-1 font-mono text-xs uppercase tracking-[0.12em] text-workstation-muted">
                review priority {priority.score}/10 {priority.level}
              </span>
            ) : null}
          </div>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-workstation-muted">
            {entry.headline}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1 font-mono">
            <dt className="text-workstation-muted">detections</dt>
            <dd>{detections}</dd>
            <dt className="text-workstation-muted">filters</dt>
            <dd>{formatFilters(filters)}</dd>
          </dl>
          <button
            className="border border-workstation-line px-4 py-2 text-sm text-workstation-text hover:border-workstation-accent"
            onClick={onBackToQueue}
            type="button"
          >
            Queue Mode
          </button>
        </div>
      </div>
    </header>
  );
}
