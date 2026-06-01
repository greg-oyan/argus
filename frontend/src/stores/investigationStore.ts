import { create } from "zustand";

export interface SelectedTimeRange {
  startMjd: number | null;
  endMjd: number | null;
}

interface InvestigationState {
  selectedOid: string | null;
  hoveredOid: string | null;
  hoveredPointId: string | null;
  selectedPointId: string | null;
  selectedTimeRange: SelectedTimeRange | null;
  activeComparator: string | null;
  highlightedEvidenceKey: string | null;
  setSelectedOid: (oid: string | null) => void;
  setHoveredOid: (oid: string | null) => void;
  setHoveredPointId: (pointId: string | null) => void;
  setSelectedPointId: (pointId: string | null) => void;
  clearSelectedPointId: () => void;
  setSelectedTimeRange: (range: SelectedTimeRange | null) => void;
  setActiveComparator: (comparator: string | null) => void;
  setHighlightedEvidenceKey: (key: string | null) => void;
}

export const useInvestigationStore = create<InvestigationState>((set) => ({
  selectedOid: null,
  hoveredOid: null,
  hoveredPointId: null,
  selectedPointId: null,
  selectedTimeRange: null,
  activeComparator: null,
  highlightedEvidenceKey: null,
  setSelectedOid: (selectedOid) =>
    set({ selectedOid, hoveredPointId: null, selectedPointId: null }),
  setHoveredOid: (hoveredOid) => set({ hoveredOid }),
  setHoveredPointId: (hoveredPointId) => set({ hoveredPointId }),
  setSelectedPointId: (selectedPointId) => set({ selectedPointId }),
  clearSelectedPointId: () => set({ selectedPointId: null }),
  setSelectedTimeRange: (selectedTimeRange) => set({ selectedTimeRange }),
  setActiveComparator: (activeComparator) => set({ activeComparator }),
  setHighlightedEvidenceKey: (highlightedEvidenceKey) => set({ highlightedEvidenceKey }),
}));
