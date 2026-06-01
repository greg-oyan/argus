import { comparison } from "./glyphEncoding";
import { residualPointId } from "./pointIdentity";
import type { SelectedTimeRange } from "../stores/investigationStore";
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

export function residualAbsoluteValue(point: LinkedResidualPoint | null | undefined): number {
  return typeof point?.residualMag === "number" && Number.isFinite(point.residualMag)
    ? Math.abs(point.residualMag)
    : 0;
}

export function largestResidualPoint(points: LinkedResidualPoint[]): LinkedResidualPoint | null {
  return points.reduce<LinkedResidualPoint | null>((largest, point) => {
    if (!largest || residualAbsoluteValue(point) > residualAbsoluteValue(largest)) {
      return point;
    }
    return largest;
  }, null);
}

export function isHighResidualPoint(
  point: LinkedResidualPoint | null,
  points: LinkedResidualPoint[],
): boolean {
  if (!point || points.length === 0) {
    return false;
  }
  const largest = residualAbsoluteValue(largestResidualPoint(points));
  if (largest <= 0) {
    return false;
  }
  return residualAbsoluteValue(point) >= Math.max(0.35, largest * 0.75);
}

export interface TimeBounds {
  min: number;
  max: number;
}

export function timeBounds(points: LinkedResidualPoint[]): TimeBounds | null {
  if (points.length === 0) {
    return null;
  }
  const mjds = points.map((point) => point.mjd);
  return { min: Math.min(...mjds), max: Math.max(...mjds) };
}

export function timeRangeToPercent(
  points: LinkedResidualPoint[],
  range: SelectedTimeRange | null,
): { start: number; end: number } {
  const bounds = timeBounds(points);
  if (!bounds || range?.startMjd == null || range?.endMjd == null || bounds.max <= bounds.min) {
    return { start: 0, end: 100 };
  }
  const start = ((Math.max(bounds.min, range.startMjd) - bounds.min) / (bounds.max - bounds.min)) * 100;
  const end = ((Math.min(bounds.max, range.endMjd) - bounds.min) / (bounds.max - bounds.min)) * 100;
  return {
    start: Math.max(0, Math.min(100, start)),
    end: Math.max(0, Math.min(100, end)),
  };
}

export interface SelectedWindowStats {
  count: number;
  maxAbsResidual: number | null;
  containsLargestResidual: boolean;
}

export function selectedWindowStats(
  points: LinkedResidualPoint[],
  range: SelectedTimeRange | null,
): SelectedWindowStats | null {
  if (range?.startMjd == null || range?.endMjd == null) {
    return null;
  }
  const start = Math.min(range.startMjd, range.endMjd);
  const end = Math.max(range.startMjd, range.endMjd);
  const inRange = points.filter((point) => point.mjd >= start && point.mjd <= end);
  const largest = largestResidualPoint(points);
  const maxAbsResidual = inRange.reduce<number | null>((current, point) => {
    const absResidual = residualAbsoluteValue(point);
    return current === null || absResidual > current ? absResidual : current;
  }, null);
  return {
    count: inRange.length,
    maxAbsResidual,
    containsLargestResidual: Boolean(
      largest && inRange.some((point) => point.pointId === largest.pointId),
    ),
  };
}

export function formatMagnitude(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

export function formatMjd(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(5) : "n/a";
}
