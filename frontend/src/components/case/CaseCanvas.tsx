import { useMemo } from "react";
import {
  activeLinkedPoint,
  linkedLightCurvePoints,
  linkedResidualPoints,
  type LinkedLightCurvePoint,
  type LinkedResidualPoint,
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
  const activeComparator = useInvestigationStore((state) => state.activeComparator);
  const residualPoints = useMemo(() => linkedResidualPoints(entry.oid, detail), [detail, entry.oid]);
  const lightCurvePoints = useMemo(() => linkedLightCurvePoints(entry.oid, detail), [detail, entry.oid]);
  const activeResidualPoint = useMemo(
    () => activeLinkedPoint(residualPoints, hoveredPointId, selectedPointId) as LinkedResidualPoint | null,
    [hoveredPointId, residualPoints, selectedPointId],
  );
  const activeLightCurvePoint = useMemo(
    () => activeLinkedPoint(lightCurvePoints, hoveredPointId, selectedPointId) as LinkedLightCurvePoint | null,
    [hoveredPointId, lightCurvePoints, selectedPointId],
  );

  let body;
  if (detail === undefined) {
    body = <CaseLoadingState />;
  } else if (detail === null) {
    body = <CaseErrorState />;
  } else {
    const gaussianFocused =
      activeComparator === "gaussian_bump" || activeComparator === "gaussian";
    body = (
      <div className="grid min-h-0 flex-1 grid-rows-[minmax(300px,1.15fr)_minmax(260px,0.85fr)] gap-4 p-4">
        <LightCurvePanel
          activePoint={activeLightCurvePoint}
          hasResidualField={residualPoints.length > 0}
          isComparatorFocused={gaussianFocused}
          oid={entry.oid}
          points={lightCurvePoints}
        />
        <ResidualPanel
          activePoint={activeResidualPoint}
          isComparatorFocused={gaussianFocused}
          oid={entry.oid}
          points={residualPoints}
        />
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
