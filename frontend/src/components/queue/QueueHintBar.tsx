import { useState } from "react";
import { isPresenterMode } from "../../lib/presenterMode";

const HINT_STORAGE_KEY = "argus.workstation.queueHintDismissed.v1";

function hintDismissed(): boolean {
  return sessionStorage.getItem(HINT_STORAGE_KEY) === "1";
}

function dismissHint(): void {
  sessionStorage.setItem(HINT_STORAGE_KEY, "1");
}

export function QueueHintBar() {
  const [isVisible, setIsVisible] = useState(() => !isPresenterMode() && !hintDismissed());

  if (!isVisible) {
    return null;
  }

  return (
    <div className="border-b border-workstation-line bg-workstation-panel2/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-4xl text-xs leading-5 text-workstation-muted">
          Reviewer path: select a glyph, inspect linked observations and residuals in Case Mode,
          then open the static report or JSON when you need the portable case-file artifact.
        </p>
        <button
          className="argus-state-pill hover:border-workstation-accent/70 hover:text-workstation-text"
          onClick={() => {
            dismissHint();
            setIsVisible(false);
          }}
          type="button"
        >
          hide hint
        </button>
      </div>
    </div>
  );
}
