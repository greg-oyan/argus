import { CaseCanvas } from "../components/case/CaseCanvas";
import { CaseEvidenceColumn } from "../components/case/CaseEvidenceColumn";
import type { CaseFileDetailMap, CasefileIndex } from "../types/casefile";

interface CaseRouteProps {
  index: CasefileIndex | null;
  oid: string | null;
  onBackToQueue: () => void;
  caseDetails: CaseFileDetailMap;
}

export function CaseRoute({ index, oid, onBackToQueue, caseDetails }: CaseRouteProps) {
  const entry = index?.entries.find((item) => item.oid === oid);

  if (!entry) {
    return {
      primary: (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="font-mono text-sm text-workstation-muted">No selected case is loaded.</p>
          <button
            className="argus-focus-visible border border-workstation-line px-4 py-2 text-sm hover:border-workstation-accent"
            onClick={onBackToQueue}
            type="button"
          >
            Return to queue
          </button>
        </div>
      ),
      secondary: <div className="p-5 text-sm text-workstation-muted">Case Mode</div>,
    };
  }

  const detail = caseDetails[entry.oid];

  return {
    primary: <CaseCanvas detail={detail} entry={entry} onBackToQueue={onBackToQueue} />,
    secondary: <CaseEvidenceColumn detail={detail} entry={entry} />,
  };
}
