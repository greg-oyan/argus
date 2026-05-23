export function casefileIndexUrl(): string {
  return import.meta.env.DEV ? __ARGUS_DEV_INDEX_URL__ : "../examples/index.json";
}

export function exampleArtifactUrl(relativePath?: string): string | undefined {
  if (!relativePath) {
    return undefined;
  }
  const base = import.meta.env.DEV ? __ARGUS_DEV_EXAMPLES_BASE_URL__ : "../examples/";
  return `${base}${relativePath}`;
}

export function staticDemoUrl(): string {
  return import.meta.env.DEV ? __ARGUS_DEV_DEMO_URL__ : "../index.html";
}

export const githubRepoUrl = "https://github.com/greg-oyan/argus";
