import { describe, expect, it } from "vitest";
import {
  activeLinkedPoint,
  linkedLightCurvePoints,
  linkedResidualPoints,
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
});
