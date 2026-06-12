import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";
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

interface PanelGroup {
  // Quiet micro-label above the group; null for the chart-linked point
  // readout that leads the column.
  heading: string | null;
  panels: ReactNode[];
}

export function CaseEvidenceColumn({ entry, detail }: CaseEvidenceColumnProps) {
  const reduceMotion = useReducedMotion();
  // Panel order is unchanged from the flat list; the headings only group it.
  const groups: PanelGroup[] = [
    {
      heading: null,
      panels: [<PointInspector detail={detail} entry={entry} />],
    },
    {
      heading: "Assessment",
      panels: [
        <AssessmentPanel detail={detail} entry={entry} />,
        <EvidenceStandardPanel detail={detail} entry={entry} />,
        <EvidenceNarrativePanel detail={detail} />,
      ],
    },
    {
      heading: "Comparisons",
      panels: [
        <ComparatorInspector detail={detail} />,
        <FeatureInspector detail={detail} />,
      ],
    },
    {
      heading: "Context",
      panels: [
        <SkyContextPanel detail={detail} />,
        <NextChecksPanel detail={detail} entry={entry} />,
      ],
    },
  ];

  let panelIndex = 0;
  return (
    <div className="flex h-full flex-col gap-7 overflow-auto p-5 text-sm">
      {groups.map((group, groupIndex) => (
        <section className="flex flex-col gap-5" key={group.heading ?? `group-${groupIndex}`}>
          {group.heading ? (
            <h3 className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-workstation-muted">
              {group.heading}
            </h3>
          ) : null}
          {group.panels.map((panel) => {
            const index = panelIndex;
            panelIndex += 1;
            return (
              <motion.div
                animate={{ opacity: 1, x: 0 }}
                initial={reduceMotion ? false : { opacity: 0, x: 8 }}
                key={index}
                transition={
                  reduceMotion
                    ? { duration: 0 }
                    : { delay: 0.05 + index * 0.025, duration: 0.2, ease: [0.16, 1, 0.3, 1] }
                }
              >
                {panel}
              </motion.div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
