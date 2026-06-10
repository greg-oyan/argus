interface GlossaryEntry {
  term: string;
  definition: string;
}

const ENTRIES: GlossaryEntry[] = [
  {
    term: "Magnitude",
    definition:
      "How bright the object looks. The scale runs backward: lower numbers mean brighter objects.",
  },
  {
    term: "MJD",
    definition:
      "Modified Julian Date — a way to write the time of an observation as a single decimal number of days.",
  },
  {
    term: "Residual",
    definition:
      "The leftover difference between what was observed and what a simple model predicted. Big residuals mean the model didn't fit.",
  },
  {
    term: "Comparator",
    definition:
      "One of the simple models Argus compares each object against (for example, a single-spike model). Their job is to make easy explanations easy to rule out.",
  },
];

export function StoryGlossary() {
  return (
    <section
      aria-label="Glossary"
      className="grid gap-3 sm:grid-cols-2"
      data-testid="story-glossary"
    >
      {ENTRIES.map((entry) => (
        <article
          className="border border-workstation-line bg-workstation-bg/60 p-4"
          key={entry.term}
        >
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-workstation-accent">
            {entry.term}
          </p>
          <p className="mt-2 text-sm leading-6 text-workstation-text">{entry.definition}</p>
        </article>
      ))}
    </section>
  );
}
