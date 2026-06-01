import type { CaseFileDetail, CasefileIndexEntry } from "../../types/casefile";
import { ComparatorInspector } from "./ComparatorInspector";
import { EvidenceNarrativePanel } from "./EvidenceNarrativePanel";
import { FeatureInspector } from "./FeatureInspector";
import { NextChecksPanel } from "./NextChecksPanel";
import { PointInspector } from "./PointInspector";
import { SkyContextPanel } from "./SkyContextPanel";

interface CaseEvidenceColumnProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
}

export function CaseEvidenceColumn({ entry, detail }: CaseEvidenceColumnProps) {
  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-sm">
      <PointInspector detail={detail} entry={entry} />
      <EvidenceNarrativePanel detail={detail} />
      <ComparatorInspector detail={detail} />
      <FeatureInspector detail={detail} />
      <SkyContextPanel detail={detail} />
      <NextChecksPanel detail={detail} entry={entry} />
    </div>
  );
}
