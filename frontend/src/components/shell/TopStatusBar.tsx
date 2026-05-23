import type { CasefileIndex } from "../../types/casefile";
import { githubRepoUrl, staticDemoUrl } from "../../lib/paths";

interface TopStatusBarProps {
  index: CasefileIndex | null;
  mode: "queue" | "case";
  isLoading: boolean;
}

export function TopStatusBar({ index, mode, isLoading }: TopStatusBarProps) {
  return (
    <header className="flex min-h-12 items-center justify-between border-b border-workstation-line bg-workstation-panel px-4 text-xs uppercase tracking-[0.18em] text-workstation-muted">
      <div className="flex min-w-0 items-center gap-4">
        <span className="text-sm font-semibold normal-case tracking-normal text-workstation-text">
          Argus Analyst Workstation
        </span>
        <span className="hidden h-4 w-px bg-workstation-line sm:block" />
        <span>{mode === "queue" ? "Queue Mode" : "Case Mode"}</span>
        <span className="hidden md:inline">
          {isLoading ? "Loading index" : `${index?.case_count ?? 0} objects loaded`}
        </span>
      </div>
      <nav className="flex items-center gap-3">
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
