import { useEffect, useMemo, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useInvestigationStore } from "../stores/investigationStore";
import type { CaseFileDetail, CaseFileDetailMap, CasefileIndex, CasefileIndexEntry } from "../types/casefile";
import { CutoutErrorFallback, ErrorBoundary } from "../components/ErrorBoundary";
import { CaseErrorState } from "../components/case/CaseErrorState";
import { CaseLoadingState } from "../components/case/CaseLoadingState";
import { LightCurvePanel } from "../components/case/LightCurvePanel";
import { StoryExpertExpander, type ExpertTab } from "../components/story/StoryExpertExpander";
import { StorySkyCutout } from "../components/story/StorySkyCutout";
import {
  activeLinkedPoint,
  linkedLightCurvePoints,
  linkedResidualPoints,
  type LinkedLightCurvePoint,
  type LinkedResidualPoint,
} from "../lib/chartSeries";
import {
  nextChecksAnswer,
  plainHeadline,
  plainReviewLevel,
  whatIsThisAnswer,
  whyFlaggedAnswer,
} from "../lib/plainLanguage";
import { isPresenterMode } from "../lib/presenterMode";
import { useTourStore } from "../lib/tour";

interface StoryRouteProps {
  index: CasefileIndex | null;
  oid: string | null;
  caseDetails: CaseFileDetailMap;
  onBackToSky: () => void;
  onNavigateRelative: (delta: number) => void;
  onOpenCase: (oid: string) => void;
}

function findEntry(
  index: CasefileIndex | null,
  oid: string | null,
): CasefileIndexEntry | undefined {
  if (!index || !oid) return undefined;
  return index.entries.find((entry) => entry.oid === oid);
}

function StoryFallback({ onBackToSky }: { onBackToSky: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-workstation-bg p-8">
      <div className="max-w-md text-center text-sm leading-6 text-workstation-muted">
        <p>No case is loaded yet.</p>
        <button
          className="argus-focus-visible mt-6 border border-workstation-accent/70 bg-workstation-accent/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-white hover:bg-workstation-accent/20"
          onClick={onBackToSky}
          type="button"
        >
          ← Back to sky
        </button>
      </div>
    </div>
  );
}

function StoryNav({
  oid,
  hasPrev,
  hasNext,
  onBackToSky,
  onPrev,
  onNext,
}: {
  oid: string;
  hasPrev: boolean;
  hasNext: boolean;
  onBackToSky: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <nav className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-workstation-line bg-workstation-bg/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="flex items-center gap-3">
        <button
          className="argus-focus-visible border border-workstation-line bg-workstation-panel px-3 py-2 text-sm text-white hover:border-workstation-accent"
          onClick={onBackToSky}
          type="button"
        >
          ← Back to sky
        </button>
        <span className="hidden font-mono text-[0.62rem] uppercase tracking-[0.18em] text-workstation-muted sm:inline">
          Esc
        </span>
      </div>
      <div className="flex items-center gap-2 font-mono text-xs text-workstation-muted">
        <span className="hidden sm:inline">{oid}</span>
        <button
          aria-label="Previous flagged object"
          className="argus-focus-visible border border-workstation-line bg-workstation-panel px-3 py-2 text-sm text-workstation-text hover:border-workstation-accent disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!hasPrev}
          onClick={onPrev}
          type="button"
        >
          ←
        </button>
        <button
          aria-label="Next flagged object"
          className="argus-focus-visible border border-workstation-line bg-workstation-panel px-3 py-2 text-sm text-workstation-text hover:border-workstation-accent disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!hasNext}
          onClick={onNext}
          type="button"
        >
          →
        </button>
      </div>
    </nav>
  );
}

function WhatAmILookingAtPopover() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-block">
      <button
        aria-expanded={open}
        className="argus-focus-visible rounded-full border border-workstation-line/70 bg-workstation-panel/70 px-2 py-0.5 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-workstation-muted hover:border-workstation-accent/70 hover:text-white"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        ⓘ What am I looking at?
      </button>
      {open ? (
        <div className="absolute left-0 top-9 z-30 max-w-sm border border-workstation-line bg-workstation-panel/95 p-4 text-xs leading-5 text-workstation-muted shadow-lg backdrop-blur sm:left-auto sm:right-0">
          <p>
            Argus is a review aid, not a detector. It pulls objects from public sky-survey
            data, runs simple comparison checks, and flags ones the simple checks don't
            explain — for human review.
          </p>
          <p className="mt-2">
            Everything below is evidence for why this one was flagged, organized so a
            person can decide whether it's worth a closer look.
          </p>
          <p className="mt-2">
            This is not a confirmed discovery or classification. It's a starting point.
          </p>
          <button
            className="argus-focus-visible mt-3 border border-workstation-line/70 px-2 py-1 font-mono text-[0.62rem] uppercase tracking-[0.18em] text-workstation-muted hover:border-workstation-accent/70 hover:text-white"
            onClick={() => setOpen(false)}
            type="button"
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}

function StoryHeader({ entry }: { entry: CasefileIndexEntry }) {
  const headline = plainHeadline(entry);
  const reviewLevel = plainReviewLevel(entry.review_priority);
  return (
    <header className="bg-workstation-bg px-4 pb-10 pt-12 sm:px-8 sm:pb-14 sm:pt-16">
      <div className="mx-auto max-w-3xl">
        <p className="font-mono text-xs uppercase tracking-[0.22em] text-workstation-accent">
          {entry.oid}
        </p>
        <h1 className="mt-4 text-3xl font-semibold leading-tight text-white sm:text-4xl sm:leading-[1.15]">
          {headline}
        </h1>
        <p className="mt-3 font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          {reviewLevel}
        </p>
        <div className="mt-6">
          <WhatAmILookingAtPopover />
        </div>
      </div>
    </header>
  );
}

function ThreeQuestions({
  entry,
  detail,
}: {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
}) {
  const reduceMotion = useReducedMotion();
  const whatIs = whatIsThisAnswer(entry, detail);
  const why = whyFlaggedAnswer(entry, detail);
  const next = nextChecksAnswer(entry, detail);

  const blocks: Array<{ title: string; body: ReactNode }> = [
    {
      title: "What is this?",
      body: <p>{whatIs}</p>,
    },
    {
      title: "Why was it flagged?",
      body: (
        <div>
          {why.reasons.length ? (
            <ul className="space-y-2">
              {why.reasons.map((reason) => (
                <li className="border-l border-workstation-line pl-3" key={reason}>
                  {reason}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Argus did not record specific reasons for this object beyond placing it in
              the review queue.
            </p>
          )}
          {why.drivers.length ? (
            <div className="mt-4">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-workstation-muted">
                Supporting numbers
              </p>
              <ul className="mt-2 space-y-2">
                {why.drivers.map((driver) => (
                  <li className="border-l border-workstation-line pl-3" key={driver}>
                    {driver}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-4 border-t border-workstation-line pt-3 text-xs leading-5 text-workstation-muted">
            {why.honestyLine}
          </p>
        </div>
      ),
    },
    {
      title: "What would an astronomer check next?",
      body: next.items.length ? (
        <ul className="space-y-2">
          {next.items.map((item) => (
            <li className="border-l border-workstation-line pl-3" key={item}>
              {item}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          No specific next-check is recorded in this case file.
        </p>
      ),
    },
  ];

  return (
    <section className="bg-workstation-panel/40 px-4 py-14 sm:px-8 sm:py-20">
      <div className="mx-auto max-w-3xl space-y-14 sm:space-y-16">
        {blocks.map((block, index) => (
          <motion.div
            animate={{ opacity: 1, y: 0 }}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            key={block.title}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { delay: 0.05 + index * 0.06, duration: 0.28, ease: [0.16, 1, 0.3, 1] as const }
            }
          >
            <p className="font-mono text-3xl font-light leading-none text-workstation-accent/45 sm:text-4xl">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h2 className="mt-3 text-xl font-semibold text-white sm:text-2xl">
              {block.title}
            </h2>
            <div className="mt-5 text-[17px] leading-[1.7] text-white">{block.body}</div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

function StoryHero({
  entry,
  detail,
  residuals,
  lightCurvePoints,
  activeLightCurvePoint,
}: {
  entry: CasefileIndexEntry;
  detail: CaseFileDetail | null | undefined;
  residuals: LinkedResidualPoint[];
  lightCurvePoints: LinkedLightCurvePoint[];
  activeLightCurvePoint: LinkedLightCurvePoint | null;
}) {
  void detail;
  const reduceMotion = useReducedMotion();
  const tourStep = useTourStore((state) => state.step);
  const setTourStep = useTourStore((state) => state.setStep);
  const presenter = isPresenterMode();
  const showTourStep3 = !presenter && tourStep === "3";
  return (
    <div className="relative mx-auto max-w-4xl px-4 pb-14 pt-10 sm:px-8 sm:pb-20 sm:pt-14">
      <LightCurvePanel
        activePoint={activeLightCurvePoint}
        hasResidualField={residuals.length > 0}
        oid={entry.oid}
        points={lightCurvePoints}
        storyMode
      />
      {showTourStep3 ? (
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          aria-label="Step 3 of 3"
          className="pointer-events-auto absolute left-4 right-4 top-32 z-30 mx-auto max-w-xs border border-workstation-accent/70 bg-workstation-panel/95 p-5 shadow-lg backdrop-blur sm:left-12 sm:right-auto"
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, transition: { duration: 0.2 } }}
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          role="dialog"
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="font-mono text-[0.62rem] uppercase tracking-[0.22em] text-workstation-muted">
            3 of 3
          </p>
          <p className="mt-3 text-base leading-7 text-white">
            Press play to watch its brightness change over time — the pattern is why
            Argus flagged it.
          </p>
          <div className="mt-5 flex items-center justify-end">
            <button
              autoFocus
              className="argus-focus-visible border border-workstation-accent bg-workstation-accent/15 px-5 py-2 font-mono text-xs uppercase tracking-[0.22em] text-white hover:bg-workstation-accent/25"
              onClick={() => setTourStep("done")}
              type="button"
            >
              Got it
            </button>
          </div>
        </motion.div>
      ) : null}
    </div>
  );
}

export function StoryRoute({
  index,
  oid,
  caseDetails,
  onBackToSky,
  onNavigateRelative,
  onOpenCase,
}: StoryRouteProps) {
  const [activeExpertTab, setActiveExpertTab] = useState<ExpertTab | null>(null);
  const reduceMotion = useReducedMotion();
  // The per-object subtree below is keyed on the oid, so the expander
  // remounts closed on navigation; keep the parent's mirror of its state in
  // sync or arrow-key navigation would stay disabled after leaving the queue
  // tab.
  useEffect(() => {
    setActiveExpertTab(null);
  }, [oid]);
  const tourStep = useTourStore((state) => state.step);
  const setTourStep = useTourStore((state) => state.setStep);
  // The sky arms the tour on first marker open; the story view advances it
  // to the visible step 3 once the case is loaded.
  useEffect(() => {
    if (tourStep === "armed" && !isPresenterMode()) {
      setTourStep("3");
    }
  }, [tourStep, setTourStep]);
  // Esc dismisses the tour from step 3; Enter "Got it"s.
  useEffect(() => {
    if (tourStep !== "3") return undefined;
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      if (event.key === "Escape" || event.key === "Enter") {
        event.preventDefault();
        setTourStep("done");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tourStep, setTourStep]);
  const entry = findEntry(index, oid);
  const hoveredPointId = useInvestigationStore((state) => state.hoveredPointId);
  const selectedPointId = useInvestigationStore((state) => state.selectedPointId);
  const detail: CaseFileDetail | null | undefined = entry
    ? caseDetails[entry.oid]
    : undefined;
  const residualPoints = useMemo(
    () => (entry ? linkedResidualPoints(entry.oid, detail) : []),
    [detail, entry],
  );
  const lightCurvePoints = useMemo(
    () => (entry ? linkedLightCurvePoints(entry.oid, detail) : []),
    [detail, entry],
  );
  const activeLightCurvePoint = useMemo(
    () =>
      activeLinkedPoint(lightCurvePoints, hoveredPointId, selectedPointId) as
        | LinkedLightCurvePoint
        | null,
    [hoveredPointId, lightCurvePoints, selectedPointId],
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (activeExpertTab === "queue") {
      return undefined;
    }
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      if (event.key === "ArrowLeft") {
        onNavigateRelative(-1);
      } else if (event.key === "ArrowRight") {
        onNavigateRelative(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeExpertTab, onNavigateRelative]);

  if (!entry) {
    return <StoryFallback onBackToSky={onBackToSky} />;
  }

  const entries = index?.entries ?? [];
  const currentIndex = entries.findIndex((item) => item.oid === entry.oid);
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < entries.length - 1;

  if (detail === undefined) {
    return (
      <div className="min-h-screen bg-workstation-bg">
        <StoryNav
          hasNext={hasNext}
          hasPrev={hasPrev}
          oid={entry.oid}
          onBackToSky={onBackToSky}
          onNext={() => onNavigateRelative(1)}
          onPrev={() => onNavigateRelative(-1)}
        />
        <CaseLoadingState />
      </div>
    );
  }
  if (detail === null) {
    return (
      <div className="min-h-screen bg-workstation-bg">
        <StoryNav
          hasNext={hasNext}
          hasPrev={hasPrev}
          oid={entry.oid}
          onBackToSky={onBackToSky}
          onNext={() => onNavigateRelative(1)}
          onPrev={() => onNavigateRelative(-1)}
        />
        <CaseErrorState />
      </div>
    );
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="min-h-screen bg-workstation-bg"
      data-testid="story-root"
      initial={reduceMotion ? false : { opacity: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <StoryNav
        hasNext={hasNext}
        hasPrev={hasPrev}
        oid={entry.oid}
        onBackToSky={onBackToSky}
        onNext={() => onNavigateRelative(1)}
        onPrev={() => onNavigateRelative(-1)}
      />
      {/*
        Keyed on the oid so navigating between objects remounts the whole
        per-object subtree (sky cutout, charts, question blocks, expert
        expander) instead of transitioning components in place. Aladin and
        playback state never survive an object change this way.
      */}
      <div key={entry.oid}>
        <StoryHeader entry={entry} />
        <section className="bg-workstation-panel/40 px-4 pb-10 pt-10 sm:px-8 sm:pb-14 sm:pt-14">
          <div className="mx-auto max-w-4xl">
            {/* If only the cutout throws, the rest of the story (chart,
                questions) keeps working and the cutout shows its existing
                failure-state styling. */}
            <ErrorBoundary fallback={() => <CutoutErrorFallback />}>
              <StorySkyCutout detail={detail} />
            </ErrorBoundary>
            <p className="mt-3 text-sm leading-6 text-workstation-muted">
              The region of sky around this object.
            </p>
          </div>
        </section>
        <StoryHero
          activeLightCurvePoint={activeLightCurvePoint}
          detail={detail}
          entry={entry}
          lightCurvePoints={lightCurvePoints}
          residuals={residualPoints}
        />
        <ThreeQuestions detail={detail} entry={entry} />
        <StoryExpertExpander
          caseDetails={caseDetails}
          detail={detail}
          entries={entries}
          entry={entry}
          onActiveTabChange={setActiveExpertTab}
          onBackToQueue={onBackToSky}
          onOpenCase={onOpenCase}
        />
      </div>
    </motion.div>
  );
}
