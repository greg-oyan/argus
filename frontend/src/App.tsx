import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { WorkstationFrame } from "./components/shell/WorkstationFrame";
import { SkyMain } from "./components/sky/SkyMain";
import { loadCasefileIndex } from "./lib/casefileIndex";
import { loadCaseFileDetails } from "./lib/casefileLoader";
import { useInvestigationStore } from "./stores/investigationStore";
import type { CaseFileDetailMap, CasefileIndex } from "./types/casefile";
import { CaseRoute } from "./routes/CaseRoute";

type Route =
  | { mode: "queue"; oid: null }
  | { mode: "case"; oid: string | null };

function readRoute(): Route {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [mode, oid] = hash.split("/");
  if (mode === "case") {
    return { mode: "case", oid: oid || null };
  }
  return { mode: "queue", oid: null };
}

function navigateToQueue() {
  window.location.hash = "queue";
}

function navigateToCase(oid: string) {
  window.location.hash = `case/${encodeURIComponent(oid)}`;
}

export default function App() {
  const [index, setIndex] = useState<CasefileIndex | null>(null);
  const [caseDetails, setCaseDetails] = useState<CaseFileDetailMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>(() => readRoute());
  const selectedOid = useInvestigationStore((state) => state.selectedOid);
  const setSelectedOid = useInvestigationStore((state) => state.setSelectedOid);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", handleHashChange);
    if (!window.location.hash) {
      navigateToQueue();
    }
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    let mounted = true;
    loadCasefileIndex()
      .then((data) => {
        if (!mounted) return;
        setIndex(data);
        setError(null);
        if (!useInvestigationStore.getState().selectedOid && data.entries[0]) {
          setSelectedOid(data.entries[0].oid);
        }
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unable to load case-file index.");
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [setSelectedOid]);

  useEffect(() => {
    if (!index) {
      setCaseDetails({});
      return;
    }
    let mounted = true;
    setCaseDetails({});
    loadCaseFileDetails(index.entries).then((details) => {
      if (mounted) {
        setCaseDetails(details);
      }
    });
    return () => {
      mounted = false;
    };
  }, [index]);

  useEffect(() => {
    if (route.mode === "case" && route.oid) {
      setSelectedOid(route.oid);
    }
  }, [route, setSelectedOid]);

  useEffect(() => {
    if (route.mode === "case") {
      const oid = route.oid ?? selectedOid;
      document.title = oid ? `Argus — ${oid}` : "Argus — Case";
    } else {
      document.title = "Argus — Sky";
    }
  }, [route.mode, route.oid, selectedOid]);

  useEffect(() => {
    if (route.mode !== "case") {
      return undefined;
    }
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      event.preventDefault();
      navigateToQueue();
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [route.mode]);

  if (route.mode === "queue") {
    return (
      <SkyMain
        caseDetails={caseDetails}
        error={error}
        index={index}
        isLoading={isLoading}
        onOpenCase={navigateToCase}
      />
    );
  }

  const caseRoute = CaseRoute({
    index,
    oid: route.oid ?? selectedOid,
    onBackToQueue: navigateToQueue,
    caseDetails,
  });
  const routeKey = `case-${route.oid ?? selectedOid ?? "none"}`;
  const motionInitial = reduceMotion ? false : { opacity: 0, y: 8 };
  const motionAnimate = { opacity: 1, y: 0 };
  const motionExit = reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 };
  const routeTransition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const };
  const primary = (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        animate={motionAnimate}
        className="h-full"
        exit={motionExit}
        initial={motionInitial}
        key={`primary-${routeKey}`}
        transition={routeTransition}
      >
        {caseRoute.primary}
      </motion.div>
    </AnimatePresence>
  );
  const secondary = (
    <AnimatePresence initial={false} mode="wait">
      <motion.div
        animate={motionAnimate}
        className="h-full"
        exit={motionExit}
        initial={motionInitial}
        key={`secondary-${routeKey}`}
        transition={reduceMotion ? { duration: 0 } : { ...routeTransition, delay: 0.04 }}
      >
        {caseRoute.secondary}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <WorkstationFrame
      index={index}
      isLoading={isLoading}
      mode={route.mode}
      primary={primary}
      secondary={secondary}
    />
  );
}
