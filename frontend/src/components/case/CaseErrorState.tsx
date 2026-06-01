interface CaseErrorStateProps {
  message?: string;
}

export function CaseErrorState({ message = "The case-file JSON could not be loaded." }: CaseErrorStateProps) {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center border border-workstation-line bg-workstation-panel/60 p-8 text-center">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-red">
          Case Data Unavailable
        </p>
        <p className="mt-3 max-w-md text-sm leading-6 text-workstation-muted">{message}</p>
      </div>
    </div>
  );
}
