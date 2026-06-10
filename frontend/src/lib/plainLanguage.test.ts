import { describe, expect, it } from "vitest";
import {
  nextChecksAnswer,
  plainHeadline,
  plainifyCaution,
  plainifyDriver,
  plainifyNextCheck,
  plainifyReason,
  plainifyText,
  plainReviewLevel,
  plainShortSummary,
  whatIsThisAnswer,
  whyFlaggedAnswer,
} from "./plainLanguage";
import type { CaseFileDetail, CasefileIndexEntry } from "../types/casefile";

function entry(overrides: Partial<CasefileIndexEntry> = {}): CasefileIndexEntry {
  return {
    oid: "ZTFtest1",
    headline: "Complex light-curve behavior with limited physical interpretation",
    short_summary:
      "The object is not well explained by a single smooth bump. Its r-band detections show repeated or irregular variability texture.",
    detection_count: 147,
    non_detection_count: 674,
    filters_observed: ["g", "r"],
    time_span_days: 2840,
    review_priority: {
      score: 9,
      level: "high",
      reasons: [
        "Gaussian bump comparator indicates the single smooth bump is not a clean fit.",
        "Variability texture suggests repeated or irregular behavior.",
        "Standard descriptive features were computed.",
      ],
      caveat: "Review priority is a queue sorting heuristic.",
    },
    anomaly_assessment: {
      score: 4,
      label: "moderate",
      drivers: [
        "147 detections provide a relatively dense local record.",
        "Coverage spans 2840 days, enough to inspect long-baseline behavior.",
        "Both g and r observations are present for cross-band review.",
      ],
      cautions: [
        "Template-family probe is limited: missing_required_context.",
      ],
    },
    top_recommended_next_check:
      "Run the optional cross-survey context check at RA=284, Dec=9 if network access is available.",
    ...overrides,
  };
}

describe("plainLanguage", () => {
  it("translates light-curve jargon in headline and short summary", () => {
    const headline = plainHeadline(entry());
    expect(headline).toBe(
      "Complex brightness pattern with no clear standard explanation",
    );
    const summary = plainShortSummary(entry());
    expect(summary).toContain("a simple single-spike model");
    expect(summary).toContain("repeated-or-irregular pattern check");
  });

  it("maps known review-priority reasons to plain English", () => {
    const reasons = entry().review_priority?.reasons ?? [];
    expect(plainifyReason(reasons[0])).toContain("simple single-spike model");
    expect(plainifyReason(reasons[1])).toContain("repeated or irregular");
    expect(plainifyReason(reasons[2])).toContain("standard descriptive numbers");
  });

  it("maps assessment drivers to numbers-with-context", () => {
    const drivers = entry().anomaly_assessment?.drivers ?? [];
    expect(plainifyDriver(drivers[0])).toContain("147 observations");
    expect(plainifyDriver(drivers[1])).toContain("2840 days");
    expect(plainifyDriver(drivers[2])).toContain("Both color bands");
  });

  it("maps cautions and falls back neutrally for unknown text", () => {
    expect(
      plainifyCaution(
        "maximum_slope is cadence-sensitive: the steepest adjacent pair is separated by 0.7 minute(s). Treat this as a sampling diagnostic, not a robust physical rate.",
      ),
    ).toContain("0.7 minute(s) apart");
    expect(plainifyCaution("Template-family probe is limited: missing_required_context.")).toContain(
      "library of known event shapes",
    );
    const unknown = plainifyCaution("Some unexpected new wording from a future build.");
    expect(unknown).toBe("Some unexpected new wording from a future build.");
  });

  it("maps next-check text and falls back to the cleaned original", () => {
    expect(plainifyNextCheck("Run the optional cross-survey context check at RA=284")).toContain(
      "other sky surveys",
    );
    expect(plainifyNextCheck("")).toBe("");
    expect(plainifyNextCheck("Something Argus has not been taught.")).toBe(
      "Something Argus has not been taught.",
    );
  });

  it("composes the three-question answers from existing fields only", () => {
    const what = whatIsThisAnswer(entry(), undefined);
    expect(what).toContain("ZTFtest1");
    expect(what).toContain("147 observations");
    expect(what).toContain("2840 days");
    expect(what).toContain("color bands g and r");

    const why = whyFlaggedAnswer(entry(), undefined);
    expect(why.reasons.length).toBeGreaterThan(0);
    expect(why.honestyLine).toBe(
      "This is a reason for a human to look — not a conclusion.",
    );

    const next = nextChecksAnswer(entry(), undefined);
    expect(next.items[0]).toContain("other sky surveys");
  });

  it("never invents text when fields are empty", () => {
    const empty: CasefileIndexEntry = { oid: "X", headline: "" };
    expect(plainHeadline(empty)).toBe("Flagged for human review.");
    expect(plainShortSummary(empty)).toBe("");
    expect(whyFlaggedAnswer(empty, undefined).reasons).toEqual([]);
    expect(whyFlaggedAnswer(empty, undefined).drivers).toEqual([]);
    expect(nextChecksAnswer(empty, undefined).items).toEqual([]);
  });

  it("uses detail-level fields when index is sparse and prefers detail values", () => {
    const sparse: CasefileIndexEntry = { oid: "Y", headline: "" };
    const detail: CaseFileDetail = {
      oid: "Y",
      detection_count: 22,
      filters_observed: ["g"],
      time_span_days: 30,
      recommended_next_checks: ["Inspect the light-curve carefully."],
    };
    const what = whatIsThisAnswer(sparse, detail);
    expect(what).toContain("22 observations");
    expect(what).toContain("30 days");
    expect(what).toContain("color band g");
    expect(nextChecksAnswer(sparse, detail).items[0]).toContain("brightness-over-time");
  });

  it("plainReviewLevel maps known levels and is safe for unknowns", () => {
    expect(plainReviewLevel({ score: 9, level: "high", reasons: [], caveat: "" })).toBe(
      "high priority for human review",
    );
    expect(plainReviewLevel(undefined)).toBe("queued for human review");
    expect(plainReviewLevel({ score: 0, level: "weird-tier", reasons: [], caveat: "" })).toBe(
      "queued for human review",
    );
  });

  it("plainifyText is conservative and idempotent for already-plain text", () => {
    const plain = "Two consecutive observations were observed close together.";
    expect(plainifyText(plain)).toBe(plain);
  });
});
