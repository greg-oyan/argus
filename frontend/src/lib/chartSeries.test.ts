import { describe, expect, it } from "vitest";
import {
  activeLinkedPoint,
  axisLabelGranularity,
  formatMjdAsDate,
  formatMjdAxisLabel,
  lightCurveMagDomain,
  lightCurveTimeDomain,
  linkedLightCurvePoints,
  linkedResidualPoints,
  mjdToUtcDate,
  timeRangeToPercent,
} from "./chartSeries";
import type { CaseFileDetail } from "../types/casefile";

describe("chartSeries", () => {
  it("uses Gaussian residual points as linked light-curve points when available", () => {
    const detail: CaseFileDetail = {
      oid: "ZTFchart",
      model_comparisons: [
        {
          model_type: "gaussian_bump",
          residual_points: [
            {
              mjd: 60001,
              observed_mag: 19.2,
              model_mag: 19.0,
              residual_mag: 0.2,
              magerr: 0.08,
            },
          ],
        },
      ],
      light_curve_points: [
        { mjd: 60000, band: "g", mag: 20.1, magerr: 0.1 },
      ],
    };

    const residuals = linkedResidualPoints("ZTFchart", detail);
    const lightCurve = linkedLightCurvePoints("ZTFchart", detail);

    expect(residuals).toHaveLength(1);
    expect(lightCurve).toHaveLength(1);
    expect(lightCurve[0]).toMatchObject({
      mjd: 60001,
      observedMag: 19.2,
      modelMag: 19.0,
      residualMag: 0.2,
      band: "r",
    });
  });

  it("falls back to observed light-curve points when residuals are unavailable", () => {
    const detail: CaseFileDetail = {
      oid: "ZTFfallback",
      light_curve_points: [
        { mjd: 60003, band: "r", mag: 19.8, magerr: 0.12 },
        { mjd: 60001, band: "g", mag: 20.4, magerr: null },
        { mjd: Number.NaN, band: "r", mag: 20.1 },
      ],
      model_comparisons: [
        {
          model_type: "gaussian_bump",
          status: "insufficient_data",
          residual_points: null,
        },
      ],
    };

    const points = linkedLightCurvePoints("ZTFfallback", detail);

    expect(points).toHaveLength(2);
    expect(points.map((point) => point.band)).toEqual(["g", "r"]);
    expect(points[0]).toMatchObject({
      mjd: 60001,
      observedMag: 20.4,
      modelMag: null,
      residualMag: null,
    });
  });

  it("prefers selected point over hovered point and maps selected time range", () => {
    const points = [
      { pointId: "a", mjd: 10 },
      { pointId: "b", mjd: 20 },
      { pointId: "c", mjd: 30 },
    ];

    expect(activeLinkedPoint(points, "a", "c")?.pointId).toBe("c");
    expect(timeRangeToPercent(points, { startMjd: 15, endMjd: 25 })).toEqual({
      start: 25,
      end: 75,
    });
  });

  it("converts MJD to a UTC calendar date", () => {
    const date = mjdToUtcDate(60000);
    expect(date.getUTCFullYear()).toBe(2023);
    expect(date.getUTCMonth()).toBe(1); // February (zero-based)
    expect(date.getUTCDate()).toBe(25);
    // The "May 12, 2021 (MJD 59346.2)" tooltip example from the spec.
    expect(formatMjdAsDate(59346.2)).toBe("May 12, 2021");
  });

  it("computes a padded time domain from the data extent", () => {
    const domain = lightCurveTimeDomain([{ mjd: 58000 }, { mjd: 58100 }, { mjd: 58050 }]);
    // 2% of the 100-day span on each side.
    expect(domain.min).toBeCloseTo(57998, 6);
    expect(domain.max).toBeCloseTo(58102, 6);
  });

  it("degenerates a single-point time domain to a 1-day window", () => {
    const domain = lightCurveTimeDomain([{ mjd: 59000 }]);
    expect(domain.min).toBe(58999.5);
    expect(domain.max).toBe(59000.5);
  });

  it("computes a padded magnitude domain across observed and model values", () => {
    const domain = lightCurveMagDomain([
      { observedMag: 19.2, modelMag: 19.0 },
      { observedMag: 20.4, modelMag: null },
      { observedMag: null, modelMag: 18.6 },
    ]);
    // min uses the model value 18.6, max uses the observed value 20.4, ±0.4 pad.
    expect(domain.min).toBeCloseTo(18.2, 6);
    expect(domain.max).toBeCloseTo(20.8, 6);
  });

  it("degenerates a single-magnitude domain to ±0.5", () => {
    const domain = lightCurveMagDomain([{ observedMag: 19.5, modelMag: null }]);
    expect(domain.min).toBe(19.0);
    expect(domain.max).toBe(20.0);
  });

  it("uses year labels for spans over ~3 years and month-year for shorter spans", () => {
    expect(axisLabelGranularity(4 * 365.25)).toBe("year");
    expect(axisLabelGranularity(2 * 365.25)).toBe("month-year");
    // The demo object spans ~7.7 years -> year-only ticks.
    expect(formatMjdAxisLabel(58370.1, "year")).toBe("2018");
    expect(formatMjdAxisLabel(59346.2, "month-year")).toBe("May 2021");
  });
});
