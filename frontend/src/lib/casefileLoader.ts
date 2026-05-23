import type { CaseFileDetail, CaseFileDetailMap, CasefileIndexEntry } from "../types/casefile";
import { exampleArtifactUrl } from "./paths";

function isCaseFileDetail(value: unknown): value is CaseFileDetail {
  return Boolean(value && typeof value === "object" && "oid" in value);
}

export async function loadCaseFileDetail(
  entry: CasefileIndexEntry,
): Promise<CaseFileDetail | null> {
  const url = exampleArtifactUrl(entry.links?.json);
  if (!url) {
    return null;
  }
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      return null;
    }
    const data: unknown = await response.json();
    return isCaseFileDetail(data) ? data : null;
  } catch {
    return null;
  }
}

export async function loadCaseFileDetails(
  entries: CasefileIndexEntry[],
): Promise<CaseFileDetailMap> {
  const pairs = await Promise.all(
    entries.map(async (entry) => [entry.oid, await loadCaseFileDetail(entry)] as const),
  );
  return Object.fromEntries(pairs);
}
