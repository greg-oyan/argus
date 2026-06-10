import { useState } from "react";
import type { CaseFileDetail, CaseFileDetailMap, CasefileIndexEntry } from "../../types/casefile";
import { CaseCanvas } from "../case/CaseCanvas";
import { CaseEvidenceColumn } from "../case/CaseEvidenceColumn";
import { QueueField } from "../queue/QueueField";
import { StoryGlossary } from "./StoryGlossary";

type ExpertTab = "evidence" | "queue" | "glossary";

interface StoryExpertExpanderProps {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
  entries: CasefileIndexEntry[];
  caseDetails: CaseFileDetailMap;
  onBackToQueue: () => void;
  onOpenCase: (oid: string) => void;
  onActiveTabChange?: (tab: ExpertTab | null) => void;
}

const TAB_LABEL: Record<ExpertTab, string> = {
  evidence: "Evidence panels",
  queue: "Queue table",
  glossary: "Glossary",
};

export function StoryExpertExpander({
  entry,
  detail,
  entries,
  caseDetails,
  onBackToQueue,
  onOpenCase,
  onActiveTabChange,
}: StoryExpertExpanderProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ExpertTab>("evidence");

  function update(nextOpen: boolean, nextTab: ExpertTab) {
    setOpen(nextOpen);
    setTab(nextTab);
    onActiveTabChange?.(nextOpen ? nextTab : null);
  }

  return (
    <section className="border-t border-workstation-line bg-workstation-bg px-4 py-10 sm:px-8 sm:py-12">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border border-workstation-line bg-workstation-panel/70 px-4 py-3">
          <div>
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-workstation-muted">
              For the technically curious
            </p>
            <p className="mt-1 text-sm text-white">
              Full evidence panels, the priority-ordered queue table, and a short
              glossary
            </p>
          </div>
          <button
            aria-expanded={open}
            className="argus-focus-visible border border-workstation-accent/70 bg-workstation-accent/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-white hover:bg-workstation-accent/20"
            data-testid="story-expert-toggle"
            onClick={() => update(!open, tab)}
            type="button"
          >
            {open ? "Hide expert view" : "Open expert view"}
          </button>
        </div>
        {open ? (
          <div className="mt-6" data-testid="story-expert-content">
            <div
              className="flex border-b border-workstation-line"
              data-argus-skip-keynav
              role="tablist"
            >
              {(Object.keys(TAB_LABEL) as ExpertTab[]).map((id) => (
                <button
                  aria-controls={`expert-tab-${id}`}
                  aria-selected={tab === id}
                  className={`argus-focus-visible border-b-2 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] transition-colors ${
                    tab === id
                      ? "border-workstation-accent text-white"
                      : "border-transparent text-workstation-muted hover:text-workstation-text"
                  }`}
                  data-testid={`story-expert-tab-${id}`}
                  id={`expert-tab-button-${id}`}
                  key={id}
                  onClick={() => update(true, id)}
                  role="tab"
                  type="button"
                >
                  {TAB_LABEL[id]}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {tab === "evidence" ? (
                <div
                  aria-labelledby="expert-tab-button-evidence"
                  className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"
                  id="expert-tab-evidence"
                  role="tabpanel"
                >
                  <div className="min-h-[480px] border border-workstation-line bg-workstation-bg/40">
                    <CaseCanvas
                      detail={detail}
                      entry={entry}
                      onBackToQueue={onBackToQueue}
                    />
                  </div>
                  <div className="min-h-[480px] border border-workstation-line bg-workstation-panel/70">
                    <CaseEvidenceColumn detail={detail} entry={entry} />
                  </div>
                </div>
              ) : null}
              {tab === "queue" ? (
                <div
                  aria-labelledby="expert-tab-button-queue"
                  className="min-h-[480px] border border-workstation-line bg-workstation-bg/40"
                  id="expert-tab-queue"
                  role="tabpanel"
                >
                  <div className="border-b border-workstation-line bg-workstation-panel/70 px-4 py-3 text-xs text-workstation-muted">
                    Arrow keys / j / k move through the queue, Enter opens a case. The
                    selected row is highlighted.
                  </div>
                  <QueueField
                    details={caseDetails}
                    entries={entries}
                    onOpenCase={onOpenCase}
                    showHeader={false}
                  />
                </div>
              ) : null}
              {tab === "glossary" ? (
                <div
                  aria-labelledby="expert-tab-button-glossary"
                  id="expert-tab-glossary"
                  role="tabpanel"
                >
                  <StoryGlossary />
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export type { ExpertTab };
