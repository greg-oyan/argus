import { comparison } from "./glyphEncoding";
import { residualPointId } from "./pointIdentity";
import type { SelectedTimeRange } from "../stores/investigationStore";
import type { CaseFileDetail, LightCurvePoint, ModelComparison, ResidualPoint } from "../types/casefile";

export interface LinkedResidualPoint {
  pointId: string;
  sourceIndex: number;
  mjd: number;
  observedMag: number | null;
  modelMag: number | null;
  residualMag: number;
  magerr: number | null;
}

export interface LinkedLightCurvePoint {
  pointId: string;
  sourceIndex: number;
  mjd: number;
  observedMag: number | null;
  modelMag: number | null;
  residualMag: number | null;
  magerr: number | null;
  band: string | null;
}

export type LinkedChartPoint = LinkedResidualPoint | LinkedLightCurvePoint;

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

function lightCurvePointId(oid: string, index: number, point: LightCurvePoint): string {
  return `${oid}:lightcurve:${index}:${point.mjd}`;
}

function residualPointToLightCurvePoint(point: LinkedResidualPoint): LinkedLightCurvePoint {
  return {
    pointId: point.pointId,
    sourceIndex: point.sourceIndex,
    mjd: point.mjd,
    observedMag: point.observedMag,
    modelMag: point.modelMag,
    residualMag: point.residualMag,
    magerr: point.magerr,
    band: "r",
  };
}

export function linkedLightCurvePoints(
  oid: string,
  detail: CaseFileDetail | null | undefined,
): LinkedLightCurvePoint[] {
  const residualLinked = linkedResidualPoints(oid, detail);
  if (residualLinked.length > 0) {
    return residualLinked.map(residualPointToLightCurvePoint);
  }

  const observedPoints: LightCurvePoint[] = detail?.light_curve_points ?? [];
  const linked: LinkedLightCurvePoint[] = [];
  observedPoints.forEach((point, index) => {
    const mjd = finiteNumber(point.mjd);
    const observedMag = finiteNumber(point.mag);
    if (mjd === null || observedMag === null) {
      return;
    }
    linked.push({
      pointId: lightCurvePointId(oid, index, point),
      sourceIndex: index,
      mjd,
      observedMag,
      modelMag: null,
      residualMag: null,
      magerr: finiteNumber(point.magerr),
      band: point.band ?? null,
    });
  });
  return linked.sort((a, b) => a.mjd - b.mjd || a.sourceIndex - b.sourceIndex);
}

export function activeLinkedPoint<T extends { pointId: string }>(
  points: T[],
  hoveredPointId: string | null,
  selectedPointId: string | null,
): T | null {
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

export function timeBounds(points: Array<{ mjd: number }>): TimeBounds | null {
  if (points.length === 0) {
    return null;
  }
  const mjds = points.map((point) => point.mjd);
  return { min: Math.min(...mjds), max: Math.max(...mjds) };
}

export function timeRangeToPercent(
  points: Array<{ mjd: number }>,
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

// Modified Julian Date 0 corresponds to JD 2400000.5 = 1858-11-17 00:00:00 UTC.
// UTC vs TT/UT1 drift over the ~25-year span we typically render is <40s,
// which is well under one day and so invisible on month/year labels. We do
// not claim precision finer than the label granularity.
const MJD_UNIX_EPOCH_MS = Date.UTC(1858, 10, 17, 0, 0, 0);
const DAY_MS = 86_400_000;

export function mjdToUtcDate(mjd: number): Date {
  return new Date(MJD_UNIX_EPOCH_MS + mjd * DAY_MS);
}

export interface PaddedDomain {
  min: number;
  max: number;
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// X domain (time): exact data extent + 2% padding on each side. Single-point
// data degenerates to ±0.5 day around the value so the chart still renders.
export function lightCurveTimeDomain(points: Array<{ mjd: number }>): PaddedDomain {
  if (points.length === 0) {
    // Fallback: a 1-day window around MJD 0. Caller should normally have
    // points before calling; this exists to make the math safe.
    return { min: -0.5, max: 0.5 };
  }
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    if (!Number.isFinite(point.mjd)) continue;
    if (point.mjd < min) min = point.mjd;
    if (point.mjd > max) max = point.mjd;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: -0.5, max: 0.5 };
  }
  const span = max - min;
  if (span === 0) {
    return { min: min - 0.5, max: max + 0.5 };
  }
  const pad = span * 0.02;
  return { min: min - pad, max: max + pad };
}

// Y domain (magnitude): exact data extent across observed + model values
// (so the model curve is never clipped) plus 0.4 mag on each side. Single
// magnitude degenerates to ±0.5 around the value. Caller is responsible for
// keeping yAxis.inverse = true; this only computes [min, max].
export function lightCurveMagDomain(
  points: Array<{ observedMag: number | null; modelMag: number | null }>,
): PaddedDomain {
  let min = Infinity;
  let max = -Infinity;
  for (const point of points) {
    const o = finiteOrNull(point.observedMag);
    const m = finiteOrNull(point.modelMag);
    if (o !== null) {
      if (o < min) min = o;
      if (o > max) max = o;
    }
    if (m !== null) {
      if (m < min) min = m;
      if (m > max) max = m;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return { min: -0.5, max: 0.5 };
  }
  const span = max - min;
  if (span === 0) {
    return { min: min - 0.5, max: max + 0.5 };
  }
  return { min: min - 0.4, max: max + 0.4 };
}

export type AxisLabelGranularity = "year" | "month-year";

const YEAR_DAYS = 365.25;

// Label granularity follows the visible span: 3 years or more => year labels
// only; under 3 years => month + year. The 3-year threshold keeps the demo
// case (2018-2026, ~8 years) on year ticks and a short outburst window on
// month ticks.
export function axisLabelGranularity(spanDays: number): AxisLabelGranularity {
  return spanDays >= 3 * YEAR_DAYS ? "year" : "month-year";
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatMjdAxisLabel(mjd: number, granularity: AxisLabelGranularity): string {
  if (!Number.isFinite(mjd)) return "";
  const date = mjdToUtcDate(mjd);
  if (granularity === "year") {
    return String(date.getUTCFullYear());
  }
  return `${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatMjdAsDate(mjd: number): string {
  if (!Number.isFinite(mjd)) return "n/a";
  const date = mjdToUtcDate(mjd);
  return `${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function formatMjdAsMonthYear(mjd: number): string {
  if (!Number.isFinite(mjd)) return "n/a";
  const date = mjdToUtcDate(mjd);
  return `${MONTH_LONG[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}
