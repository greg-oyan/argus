import { motion, useReducedMotion } from "framer-motion";
import type { CaseFileDetail, CasefileIndexEntry } from "../../types/casefile";
import { AssessmentPanel } from "./AssessmentPanel";
import { ComparatorInspector } from "./ComparatorInspector";
import { EvidenceNarrativePanel } from "./EvidenceNarrativePanel";
import { EvidenceStandardPanel } from "./EvidenceStandardPanel";
import { FeatureInspector } from "./FeatureInspector";
import { NextChecksPanel } from "./NextChecksPanel";
import { PointInspector } from "./PointInspector";
import { SkyContextPanel } from "./SkyContextPanel";

interface CaseEvidenceColumnProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
}

export function CaseEvidenceColumn({ entry, detail }: CaseEvidenceColumnProps) {
  const reduceMotion = useReducedMotion();
  const panels = [
    <PointInspector detail={detail} entry={entry} />,
    <AssessmentPanel detail={detail} entry={entry} />,
    <EvidenceStandardPanel detail={detail} entry={entry} />,
    <EvidenceNarrativePanel detail={detail} />,
    <ComparatorInspector detail={detail} />,
    <FeatureInspector detail={detail} />,
    <SkyContextPanel detail={detail} />,
    <NextChecksPanel detail={detail} entry={entry} />,
  ];

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-3 text-sm">
      {panels.map((panel, index) => (
        <motion.div
          animate={{ opacity: 1, x: 0 }}
          initial={reduceMotion ? false : { opacity: 0, x: 8 }}
          key={index}
          transition={reduceMotion ? { duration: 0 } : { delay: 0.05 + index * 0.025, duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {panel}
        </motion.div>
      ))}
    </div>
  );
}
