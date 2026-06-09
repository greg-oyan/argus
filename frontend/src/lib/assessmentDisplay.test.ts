import { describe, expect, it } from "vitest";
import {
  assessmentCautions,
  assessmentCaveat,
  assessmentDrivers,
  assessmentFromSources,
  assessmentLabel,
  assessmentStatus,
  formatAssessmentScore,
} from "./assessmentDisplay";
import type { CaseFileDetail, CasefileIndexEntry } from "../types/casefile";

describe("assessmentDisplay", () => {
  const entry: CasefileIndexEntry = {
    oid: "ZTFassess",
    headline: "Index headline",
    anomaly_assessment: {
      status: "available",
      score: 4,
      label: "medium",
      drivers: ["index driver"],
      cautions: ["index caution"],
      caveat: "Index caveat.",
    },
  };

  it("prefers detailed case-file assessment over index assessment", () => {
    const detail: CaseFileDetail = {
      oid: "ZTFassess",
      anomaly_assessment: {
        status: "available",
        score: 8,
        label: "high",
        drivers: ["detail driver"],
        cautions: ["detail caution"],
        caveat: "Detail caveat.",
      },
    };

    const assessment = assessmentFromSources(entry, detail);

    expect(formatAssessmentScore(assessment)).toBe("8/10");
    expect(assessmentLabel(assessment)).toBe("high");
    expect(assessmentStatus(assessment)).toBe("available");
    expect(assessmentDrivers(assessment)).toEqual(["detail driver"]);
    expect(assessmentCautions(assessment)).toEqual(["detail caution"]);
    expect(assessmentCaveat(assessment)).toBe("Detail caveat.");
  });

  it("falls back to index assessment and safe unknown labels", () => {
    const assessment = assessmentFromSources(entry, undefined);

    expect(formatAssessmentScore(assessment)).toBe("4/10");
    expect(assessmentDrivers(assessment)).toEqual(["index driver"]);
    expect(formatAssessmentScore(undefined)).toBe("n/a");
    expect(assessmentLabel({ label: "   " })).toBe("unknown");
    expect(assessmentStatus(undefined)).toBe("missing");
    expect(assessmentCaveat(undefined)).toContain("does not identify the object");
  });

  it("limits drivers and cautions while dropping blank items", () => {
    const assessment = {
      drivers: ["one", " ", "two", "three"],
      cautions: ["alpha", "", "beta"],
    };

    expect(assessmentDrivers(assessment, 2)).toEqual(["one", "two"]);
    expect(assessmentCautions(assessment, 1)).toEqual(["alpha"]);
  });
});
