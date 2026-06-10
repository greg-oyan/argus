import { create } from "zustand";

export type TourStep = "1" | "2" | "armed" | "3" | "done";

const KEY = "argus.workstation.tour.v1";

function read(): TourStep {
  if (typeof window === "undefined") return "1";
  try {
    const v = window.sessionStorage.getItem(KEY);
    if (v === "1" || v === "2" || v === "armed" || v === "3" || v === "done") {
      return v;
    }
  } catch {
    /* noop */
  }
  return "1";
}

function persist(step: TourStep) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, step);
  } catch {
    /* noop */
  }
}

interface TourState {
  step: TourStep;
  setStep: (step: TourStep) => void;
}

export const useTourStore = create<TourState>((set) => ({
  step: read(),
  setStep: (step) => {
    persist(step);
    set({ step });
  },
}));
