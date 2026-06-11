import { useCallback, useEffect, useState } from "react";
import { ErrorBoundary, RouteErrorFallback } from "./components/ErrorBoundary";
import { SkyMain } from "./components/sky/SkyMain";
import { StoryRoute } from "./routes/StoryRoute";
import { loadCasefileIndex } from "./lib/casefileIndex";
import { loadCaseFileDetails } from "./lib/casefileLoader";
import { useInvestigationStore } from "./stores/investigationStore";
import type { CaseFileDetailMap, CasefileIndex } from "./types/casefile";

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

  const navigateRelative = useCallback(
    (delta: number) => {
      const entries = index?.entries ?? [];
      if (entries.length === 0) return;
      const currentOid = route.oid ?? selectedOid;
      const currentIndex = currentOid
        ? entries.findIndex((entry) => entry.oid === currentOid)
        : -1;
      const nextIndex =
        currentIndex < 0
          ? 0
          : Math.max(0, Math.min(entries.length - 1, currentIndex + delta));
      const nextOid = entries[nextIndex]?.oid;
      if (nextOid && nextOid !== currentOid) {
        navigateToCase(nextOid);
      }
    },
    [index, route.oid, selectedOid],
  );

  const recoverToSky = () => {
    // Clear per-object investigation state so the crashed view's selections
    // cannot re-trigger the same render error after recovery.
    const store = useInvestigationStore.getState();
    store.clearPointSelection();
    store.setSelectedTimeRange(null);
    store.setActiveComparator(null);
    store.setHighlightedEvidenceKey(null);
    store.setFocusedPanelKey(null);
    navigateToQueue();
  };

  return (
    <ErrorBoundary
      fallback={(reset) => (
        <RouteErrorFallback
          onBackToSky={() => {
            recoverToSky();
            reset();
          }}
        />
      )}
      resetKey={`${route.mode}:${route.oid ?? ""}`}
    >
      {route.mode === "queue" ? (
        <SkyMain
          caseDetails={caseDetails}
          error={error}
          index={index}
          isLoading={isLoading}
          onOpenCase={navigateToCase}
        />
      ) : (
        <StoryRoute
          caseDetails={caseDetails}
          index={index}
          oid={route.oid ?? selectedOid}
          onBackToSky={navigateToQueue}
          onNavigateRelative={navigateRelative}
          onOpenCase={navigateToCase}
        />
      )}
    </ErrorBoundary>
  );
}
