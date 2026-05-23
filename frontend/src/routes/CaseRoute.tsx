import type { CasefileIndex } from "../types/casefile";
import { exampleArtifactUrl } from "../lib/paths";

interface CaseRouteProps {
  index: CasefileIndex | null;
  oid: string | null;
  onBackToQueue: () => void;
  activeComparator: string | null;
  highlightedEvidenceKey: string | null;
}

export function CaseRoute({
  index,
  oid,
  onBackToQueue,
  activeComparator,
  highlightedEvidenceKey,
}: CaseRouteProps) {
  const entry = index?.entries.find((item) => item.oid === oid);

  if (!entry) {
    return {
      primary: (
        <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
          <p className="font-mono text-sm text-workstation-muted">No selected case is loaded.</p>
          <button
            className="border border-workstation-line px-4 py-2 text-sm hover:border-workstation-accent"
            onClick={onBackToQueue}
            type="button"
          >
            Return to queue
          </button>
        </div>
      ),
      secondary: <div className="p-5 text-sm text-workstation-muted">Case Mode scaffold</div>,
    };
  }

  const htmlHref = exampleArtifactUrl(entry.links?.html);
  const lightCurveHref = exampleArtifactUrl(entry.links?.light_curve_png);
  const residualHref = exampleArtifactUrl(entry.links?.residual_png);

  return {
    primary: (
      <div className="grid h-full grid-rows-[auto_minmax(0,1fr)]">
        <div className="flex items-center justify-between border-b border-workstation-line bg-workstation-panel px-5 py-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
              Case Mode
            </p>
            <h1 className="mt-2 font-mono text-2xl text-white">{entry.oid}</h1>
          </div>
          <button
            className="border border-workstation-line px-4 py-2 text-sm text-workstation-text hover:border-workstation-accent"
            onClick={onBackToQueue}
            type="button"
          >
            Queue Mode
          </button>
        </div>
        <div className="grid grid-cols-1 gap-4 overflow-auto p-5 xl:grid-cols-2">
          <section className="border border-workstation-line bg-workstation-panel/70 p-4">
            <h2 className="font-mono text-sm uppercase tracking-[0.16em] text-workstation-muted">
              Evidence Canvas Placeholder
            </h2>
            <p className="mt-4 text-sm leading-6 text-workstation-text">{entry.short_summary}</p>
            <p className="mt-4 text-xs leading-5 text-workstation-muted">
              Phase 3A reserves this surface for linked light-curve, sky, comparator, and
              evidence views. Charts and sky overlays arrive in later phases.
            </p>
          </section>
          <section className="border border-workstation-line bg-workstation-panel/70 p-4">
            <h2 className="font-mono text-sm uppercase tracking-[0.16em] text-workstation-muted">
              Existing Artifacts
            </h2>
            <div className="mt-4 grid gap-3 text-sm">
              {htmlHref ? <a className="text-workstation-accent" href={htmlHref}>HTML report</a> : null}
              {lightCurveHref ? (
                <a className="text-workstation-accent" href={lightCurveHref}>
                  Light-curve PNG
                </a>
              ) : null}
              {residualHref ? (
                <a className="text-workstation-accent" href={residualHref}>
                  Residual PNG
                </a>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    ),
    secondary: (
      <div className="flex h-full flex-col gap-4 overflow-auto p-5 text-sm">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
            Active Investigation State
          </p>
          <dl className="mt-4 grid grid-cols-[150px_minmax(0,1fr)] gap-2 font-mono text-xs">
            <dt className="text-workstation-muted">selectedOid</dt>
            <dd>{entry.oid}</dd>
            <dt className="text-workstation-muted">activeComparator</dt>
            <dd>{activeComparator ?? "none"}</dd>
            <dt className="text-workstation-muted">highlightedEvidenceKey</dt>
            <dd>{highlightedEvidenceKey ?? "none"}</dd>
          </dl>
        </div>
        <div className="border-t border-workstation-line pt-4">
          <p className="text-xs leading-5 text-workstation-muted">
            This is the Case Mode shell only. It does not add new inference, recompute
            metrics, or change the existing case-file artifacts.
          </p>
        </div>
      </div>
    ),
  };
}
