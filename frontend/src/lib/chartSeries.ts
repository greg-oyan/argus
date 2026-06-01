import { comparison } from "./glyphEncoding";
import { residualPointId } from "./pointIdentity";
import type { CaseFileDetail, ModelComparison, ResidualPoint } from "../types/casefile";

export interface LinkedResidualPoint {
  pointId: string;
  sourceIndex: number;
  mjd: number;
  observedMag: number | null;
  modelMag: number | null;
  residualMag: number;
  magerr: number | null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function gaussianComparison(
  detail: CaseFileDetail | null | undefined,
): ModelComparison | undefined {
  return comparison(detail, "gaussian_bump");
}

export function linkedResidualPoints(
  oid: string,
  detail: CaseFileDetail | null | undefined,
): LinkedResidualPoint[] {
  const residuals: ResidualPoint[] = gaussianComparison(detail)?.residual_points ?? [];
  return residuals
    .map((point, index) => {
      const mjd = finiteNumber(point.mjd);
      const residualMag = finiteNumber(point.residual_mag);
      if (mjd === null || residualMag === null) {
        return null;
      }
      return {
        pointId: residualPointId(oid, index, point),
        sourceIndex: index,
        mjd,
        observedMag: finiteNumber(point.observed_mag),
        modelMag: finiteNumber(point.model_mag),
        residualMag,
        magerr: finiteNumber(point.magerr),
      } satisfies LinkedResidualPoint;
    })
    .filter((point): point is LinkedResidualPoint => point !== null)
    .sort((a, b) => a.mjd - b.mjd || a.sourceIndex - b.sourceIndex);
}

export function activeLinkedPoint(
  points: LinkedResidualPoint[],
  hoveredPointId: string | null,
  selectedPointId: string | null,
): LinkedResidualPoint | null {
  const activeId = selectedPointId ?? hoveredPointId;
  return points.find((point) => point.pointId === activeId) ?? null;
}

export function formatMagnitude(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

export function formatMjd(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(5) : "n/a";
}
