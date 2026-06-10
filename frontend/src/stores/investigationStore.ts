import { create } from "zustand";

export interface SelectedTimeRange {
  startMjd: number | null;
  endMjd: number | null;
}

export type QueueViewMode = "field" | "sky";

function readQueueViewMode(): QueueViewMode {
  if (typeof window === "undefined") {
    return "field";
  }
  return window.sessionStorage.getItem("argus.queueViewMode") === "sky" ? "sky" : "field";
}

function persistQueueViewMode(mode: QueueViewMode) {
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem("argus.queueViewMode", mode);
  }
}

interface InvestigationState {
  selectedOid: string | null;
  hoveredOid: string | null;
  hoveredPointId: string | null;
  selectedPointId: string | null;
  selectedTimeRange: SelectedTimeRange | null;
  linkedZoomEnabled: boolean;
  queueViewMode: QueueViewMode;
  activeComparator: string | null;
  highlightedEvidenceKey: string | null;
  focusedPanelKey: string | null;
  setSelectedOid: (oid: string | null) => void;
  setHoveredOid: (oid: string | null) => void;
  setHoveredPointId: (pointId: string | null) => void;
  setSelectedPointId: (pointId: string | null) => void;
  setQueueViewMode: (mode: QueueViewMode) => void;
  setLinkedZoomEnabled: (enabled: boolean) => void;
  clearSelectedPointId: () => void;
  clearPointSelection: () => void;
  setSelectedTimeRange: (range: SelectedTimeRange | null) => void;
  setActiveComparator: (comparator: string | null) => void;
  setHighlightedEvidenceKey: (key: string | null) => void;
  setFocusedPanelKey: (key: string | null) => void;
}

export const useInvestigationStore = create<InvestigationState>((set) => ({
  selectedOid: null,
  hoveredOid: null,
  hoveredPointId: null,
  selectedPointId: null,
  selectedTimeRange: null,
  linkedZoomEnabled: true,
  queueViewMode: readQueueViewMode(),
  activeComparator: null,
  highlightedEvidenceKey: null,
  focusedPanelKey: null,
  setSelectedOid: (selectedOid) =>
    set({ selectedOid, hoveredPointId: null, selectedPointId: null, selectedTimeRange: null }),
  setHoveredOid: (hoveredOid) => set({ hoveredOid }),
  setHoveredPointId: (hoveredPointId) => set({ hoveredPointId }),
  setSelectedPointId: (selectedPointId) =>
    set({ selectedPointId, focusedPanelKey: selectedPointId ? "point" : null }),
  setQueueViewMode: (queueViewMode) => {
    persistQueueViewMode(queueViewMode);
    set({ queueViewMode });
  },
  setLinkedZoomEnabled: (linkedZoomEnabled) => set({ linkedZoomEnabled }),
  clearSelectedPointId: () => set({ selectedPointId: null }),
  clearPointSelection: () => set({ hoveredPointId: null, selectedPointId: null }),
  setSelectedTimeRange: (selectedTimeRange) => set({ selectedTimeRange }),
  setActiveComparator: (activeComparator) => set({ activeComparator }),
  setHighlightedEvidenceKey: (highlightedEvidenceKey) => set({ highlightedEvidenceKey }),
  setFocusedPanelKey: (focusedPanelKey) => set({ focusedPanelKey }),
}));
