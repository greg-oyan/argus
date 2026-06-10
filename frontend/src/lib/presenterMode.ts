export function hasQueryFlag(name: string): boolean {
  const params = new URLSearchParams(window.location.search);
  const value = params.get(name);
  return value === "" || value === "1" || value === "true";
}

export function isPresenterMode(): boolean {
  return hasQueryFlag("presenter");
}

export function shouldSkipIntro(): boolean {
  return isPresenterMode() || hasQueryFlag("nointro");
}
