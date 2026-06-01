import type { CasefileIndex } from "../../types/casefile";
import { githubRepoUrl, staticDemoUrl } from "../../lib/paths";
import { useInvestigationStore } from "../../stores/investigationStore";

interface TopStatusBarProps {
  index: CasefileIndex | null;
  mode: "queue" | "case";
  isLoading: boolean;
}

export function TopStatusBar({ index, mode, isLoading }: TopStatusBarProps) {
  const selectedOid = useInvestigationStore((state) => state.selectedOid);
  const activeComparator = useInvestigationStore((state) => state.activeComparator);
  const hoveredPointId = useInvestigationStore((state) => state.hoveredPointId);
  const selectedPointId = useInvestigationStore((state) => state.selectedPointId);
  const pointState = selectedPointId ? "point pinned" : hoveredPointId ? "point hover" : "no point focus";

  return (
    <header className="flex min-h-12 items-center justify-between border-b border-workstation-line bg-workstation-panel/95 px-4 text-xs uppercase tracking-[0.18em] text-workstation-muted shadow-[0_1px_0_rgba(255,255,255,0.03)]">
      <div className="flex min-w-0 items-center gap-4">
        <span className="text-sm font-semibold normal-case tracking-normal text-workstation-text">
          Argus Analyst Workstation
        </span>
        <span className="hidden h-4 w-px bg-workstation-line sm:block" />
        <span>{mode === "queue" ? "Queue Mode" : "Case Mode"}</span>
        <span className="hidden md:inline">
          {isLoading ? "Loading index" : `${index?.case_count ?? 0} objects loaded`}
        </span>
        {selectedOid ? (
          <span className="hidden max-w-[180px] truncate text-workstation-text lg:inline">
            selected {selectedOid}
          </span>
        ) : null}
        {mode === "case" ? (
          <span className="hidden text-workstation-muted xl:inline">
            {activeComparator ?? "no comparator focus"} / {pointState}
          </span>
        ) : null}
      </div>
      <nav className="flex items-center gap-3">
        <a className="hover:text-workstation-accent" href="#queue">
          Queue
        </a>
        <a className="hover:text-workstation-accent" href={staticDemoUrl()}>
          Static Demo
        </a>
        <a className="hover:text-workstation-accent" href={githubRepoUrl}>
          GitHub
        </a>
      </nav>
    </header>
  );
}
