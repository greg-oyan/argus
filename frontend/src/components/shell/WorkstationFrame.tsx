import type { ReactNode } from "react";
import type { CasefileIndex } from "../../types/casefile";
import { TopStatusBar } from "./TopStatusBar";

interface WorkstationFrameProps {
  index: CasefileIndex | null;
  mode: "queue" | "case";
  isLoading: boolean;
  primary: ReactNode;
  secondary: ReactNode;
}

export function WorkstationFrame({
  index,
  mode,
  isLoading,
  primary,
  secondary,
}: WorkstationFrameProps) {
  return (
    <div className="min-h-screen bg-workstation-bg text-workstation-text">
      <TopStatusBar index={index} mode={mode} isLoading={isLoading} />
      <main className="grid min-h-[calc(100vh-3rem)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-h-[55vh] border-b border-workstation-line bg-workstation-bg/70 lg:border-b-0 lg:border-r">
          {primary}
        </section>
        <aside className="min-h-[45vh] bg-workstation-panel/90 shadow-[inset_1px_0_0_rgba(255,255,255,0.02)]">
          {secondary}
        </aside>
      </main>
    </div>
  );
}
