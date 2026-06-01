import { useMemo } from "react";
import {
  activeLinkedPoint,
  linkedResidualPoints,
} from "../../lib/chartSeries";
import { useInvestigationStore } from "../../stores/investigationStore";
import type { CaseFileDetail, CasefileIndexEntry } from "../../types/casefile";
import { CaseErrorState } from "./CaseErrorState";
import { CaseHeader } from "./CaseHeader";
import { CaseLoadingState } from "./CaseLoadingState";
import { LightCurvePanel } from "./LightCurvePanel";
import { ResidualPanel } from "./ResidualPanel";

interface CaseCanvasProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
  onBackToQueue: () => void;
}

export function CaseCanvas({ entry, detail, onBackToQueue }: CaseCanvasProps) {
  const hoveredPointId = useInvestigationStore((state) => state.hoveredPointId);
  const selectedPointId = useInvestigationStore((state) => state.selectedPointId);
  const points = useMemo(() => linkedResidualPoints(entry.oid, detail), [detail, entry.oid]);
  const activePoint = useMemo(
    () => activeLinkedPoint(points, hoveredPointId, selectedPointId),
    [hoveredPointId, points, selectedPointId],
  );

  let body;
  if (detail === undefined) {
    body = <CaseLoadingState />;
  } else if (detail === null) {
    body = <CaseErrorState />;
  } else {
    body = (
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(300px,1.15fr)_minmax(260px,0.85fr)] gap-4 p-4">
        <LightCurvePanel activePoint={activePoint} oid={entry.oid} points={points} />
        <ResidualPanel activePoint={activePoint} oid={entry.oid} points={points} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[calc(100vh-3rem)] flex-col">
      <CaseHeader detail={detail} entry={entry} onBackToQueue={onBackToQueue} />
      {body}
    </div>
  );
}
