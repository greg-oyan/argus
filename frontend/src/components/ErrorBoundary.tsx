import { Component, type ErrorInfo, type ReactNode } from "react";

// Phase 6B seatbelt: a single uncaught render error must never blank the
// app again (React 19 unmounts the entire root when a commit-phase error
// escapes every boundary). The route-level boundary keeps a recoverable
// fallback on screen; a smaller boundary isolates the story sky cutout so
// an imagery crash cannot take the rest of the story with it.

interface ErrorBoundaryProps {
  children: ReactNode;
  // Rendered when a descendant throws. Receives a reset callback that
  // clears the caught error so the children render again.
  fallback: (reset: () => void) => ReactNode;
  // Optional: when this value changes (e.g. the route), any caught error is
  // cleared automatically so navigation recovers the view.
  resetKey?: unknown;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Argus view crashed:", error, info.componentStack);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.error !== null && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (this.state.error !== null) {
      return this.props.fallback(this.reset);
    }
    return this.props.children;
  }
}

interface RouteErrorFallbackProps {
  onBackToSky: () => void;
}

// App-level fallback card. Deliberately framework-free styling-wise: it must
// render even when the crashed view left stores or props in a bad state.
export function RouteErrorFallback({ onBackToSky }: RouteErrorFallbackProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-workstation-bg p-8">
      <div className="max-w-md border border-workstation-line bg-workstation-panel/70 p-6 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Argus
        </p>
        <p className="mt-3 text-sm leading-6 text-white">
          Something went wrong rendering this view.
        </p>
        <p className="mt-2 text-xs leading-5 text-workstation-muted">
          The case-file data is unaffected. You can return to the sky or reload
          the page.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button
            className="argus-focus-visible border border-workstation-accent/70 bg-workstation-accent/10 px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-white hover:bg-workstation-accent/20"
            onClick={onBackToSky}
            type="button"
          >
            ← Back to the sky
          </button>
          <button
            className="argus-focus-visible border border-workstation-line bg-workstation-panel px-4 py-2 font-mono text-xs uppercase tracking-[0.18em] text-workstation-text hover:border-workstation-accent"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}

// Story cutout fallback: the existing failure-state styling from
// StorySkyCutout, so an imagery render crash reads exactly like an imagery
// load failure — the rest of the story keeps working.
export function CutoutErrorFallback() {
  return (
    <section className="border border-workstation-line bg-workstation-panel/70">
      <div className="argus-missing-state min-h-[180px]">
        Sky imagery couldn't load — it streams from an external astronomy service.
      </div>
    </section>
  );
}
