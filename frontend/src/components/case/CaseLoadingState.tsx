export function CaseLoadingState() {
  return (
    <div className="m-4 flex h-full min-h-[320px] items-center justify-center border border-dashed border-workstation-line bg-workstation-panel/60 p-8 text-center">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-muted">
          Loading Case Data
        </p>
        <p className="mt-3 text-sm text-workstation-text">
          Fetching the public case-file JSON for linked evidence views. The workstation shell
          remains available while the artifact loads.
        </p>
      </div>
    </div>
  );
}
