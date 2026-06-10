import { useEffect } from "react";
import { motion } from "framer-motion";

interface ColdOpenProps {
  onComplete: () => void;
}

export const COLD_OPEN_STORAGE_KEY = "argus.workstation.coldOpenSeen.v1";

export function coldOpenWasSeen(): boolean {
  return sessionStorage.getItem(COLD_OPEN_STORAGE_KEY) === "1";
}

export function markColdOpenSeen(): void {
  sessionStorage.setItem(COLD_OPEN_STORAGE_KEY, "1");
}

export function ColdOpen({ onComplete }: ColdOpenProps) {
  useEffect(() => {
    const handleKey = () => onComplete();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onComplete]);

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="relative flex min-h-screen overflow-hidden bg-workstation-bg text-workstation-text"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      onClick={onComplete}
      role="presentation"
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="argus-cold-open-starfield absolute inset-0" />
      <div className="absolute inset-x-0 top-0 h-px bg-workstation-accent/40" />
      <div className="relative z-10 m-auto w-full max-w-5xl px-6 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-workstation-accent">
          Argus workstation
        </p>
        <h1 className="mt-5 max-w-4xl font-mono text-4xl leading-tight text-white md:text-6xl">
          Case-file evidence for astronomical review.
        </h1>
        <p className="mt-6 max-w-3xl text-base leading-7 text-workstation-muted md:text-lg">
          Inspect a static review queue, choose an object, and move into linked views of
          observed points, model residuals, evidence text, and external sky context.
        </p>
        <div className="mt-8 grid max-w-4xl gap-3 font-mono text-xs uppercase tracking-[0.16em] text-workstation-muted md:grid-cols-3">
          <span className="border border-workstation-line bg-workstation-panel/70 px-3 py-3">
            Queue Mode
          </span>
          <span className="border border-workstation-line bg-workstation-panel/70 px-3 py-3">
            Linked Case Mode
          </span>
          <span className="border border-workstation-line bg-workstation-panel/70 px-3 py-3">
            Static public artifacts
          </span>
        </div>
        <button
          className="mt-10 border border-workstation-accent/70 bg-workstation-accent/10 px-5 py-3 font-mono text-xs uppercase tracking-[0.16em] text-workstation-text hover:bg-workstation-accent/20"
          onClick={(event) => {
            event.stopPropagation();
            onComplete();
          }}
          type="button"
        >
          Enter workstation
        </button>
        <p className="mt-4 font-mono text-[0.68rem] uppercase tracking-[0.16em] text-workstation-muted">
          Click, press any key, or use ?nointro=1 to skip.
        </p>
      </div>
    </motion.div>
  );
}
