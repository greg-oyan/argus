import { create } from "zustand";

export interface SelectedTimeRange {
  startMjd: number | null;
  endMjd: number | null;
}

interface InvestigationState {
  selectedOid: string | null;
  hoveredPointId: string | null;
  selectedTimeRange: SelectedTimeRange | null;
  activeComparator: string | null;
  highlightedEvidenceKey: string | null;
  setSelectedOid: (oid: string | null) => void;
  setHoveredPointId: (pointId: string | null) => void;
  setSelectedTimeRange: (range: SelectedTimeRange | null) => void;
  setActiveComparator: (comparator: string | null) => void;
  setHighlightedEvidenceKey: (key: string | null) => void;
}

export const useInvestigationStore = create<InvestigationState>((set) => ({
  selectedOid: null,
  hoveredPointId: null,
  selectedTimeRange: null,
  activeComparator: null,
  highlightedEvidenceKey: null,
  setSelectedOid: (selectedOid) => set({ selectedOid }),
  setHoveredPointId: (hoveredPointId) => set({ hoveredPointId }),
  setSelectedTimeRange: (selectedTimeRange) => set({ selectedTimeRange }),
  setActiveComparator: (activeComparator) => set({ activeComparator }),
  setHighlightedEvidenceKey: (highlightedEvidenceKey) => set({ highlightedEvidenceKey }),
}));
