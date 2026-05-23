import type { CasefileIndex } from "../types/casefile";
import { casefileIndexUrl } from "./paths";

function assertCasefileIndex(value: unknown): asserts value is CasefileIndex {
  if (!value || typeof value !== "object") {
    throw new Error("Case-file index response was empty or invalid.");
  }
  const candidate = value as Partial<CasefileIndex>;
  if (!Array.isArray(candidate.entries)) {
    throw new Error("Case-file index is missing its entries array.");
  }
}

export async function loadCasefileIndex(): Promise<CasefileIndex> {
  const response = await fetch(casefileIndexUrl(), {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Unable to load case-file index (${response.status}).`);
  }
  const data: unknown = await response.json();
  assertCasefileIndex(data);
  return data;
}
