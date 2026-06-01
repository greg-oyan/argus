import type { ResidualPoint } from "../types/casefile";

function normalizedNumber(value: number | null | undefined, digits: number): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : "na";
}

export function residualPointId(oid: string, index: number, point: ResidualPoint): string {
  const mjd = normalizedNumber(point.mjd, 6);
  const observed = normalizedNumber(point.observed_mag, 5);
  return `${oid}:r:${index}:${mjd}:${observed}`;
}
