import { useEffect, useMemo, useState } from "react";
import { WorkstationFrame } from "./components/shell/WorkstationFrame";
import { loadCasefileIndex } from "./lib/casefileIndex";
import { loadCaseFileDetails } from "./lib/casefileLoader";
import { useInvestigationStore } from "./stores/investigationStore";
import type { CaseFileDetailMap, CasefileIndex } from "./types/casefile";
import { CaseRoute } from "./routes/CaseRoute";
import { QueueRoute } from "./routes/QueueRoute";

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

  const renderedRoute = useMemo(() => {
    if (route.mode === "case") {
      return CaseRoute({
        index,
        oid: route.oid ?? selectedOid,
        onBackToQueue: navigateToQueue,
        caseDetails,
      });
    }
    return QueueRoute({
      index,
      isLoading,
      error,
      onOpenCase: navigateToCase,
      selectedOid,
      caseDetails,
    });
  }, [
    caseDetails,
    error,
    index,
    isLoading,
    route,
    selectedOid,
  ]);

  return (
    <WorkstationFrame
      index={index}
      isLoading={isLoading}
      mode={route.mode}
      primary={renderedRoute.primary}
      secondary={renderedRoute.secondary}
    />
  );
}
