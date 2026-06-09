import { describe, expect, it } from "vitest";
import {
  behaviorKind,
  evidenceRailItems,
  priorityEncoding,
  sparsityEncoding,
} from "./glyphEncoding";
import type { CaseFileDetail, CasefileIndexEntry } from "../types/casefile";

function entry(overrides: Partial<CasefileIndexEntry> = {}): CasefileIndexEntry {
  return {
    oid: "ZTFglyph",
    headline: "Not well explained by a single smooth bump",
    short_summary: "Shows repeated or irregular texture.",
    detection_count: 36,
    non_detection_count: 9,
    filters_observed: ["g", "r"],
    gaussian_comparator_status: "fitted_baseline",
    variability_texture_status: "computed",
    feature_summary_status: "computed",
    sncosmo_template_probe_status: "missing_required_context",
    cross_survey_context_status: "not_requested",
    review_priority: {
      score: 8,
      level: "high",
      reasons: [],
      caveat: "Review support only.",
    },
    ...overrides,
  };
}

describe("glyphEncoding", () => {
  it("encodes review priority with stronger high-priority spine", () => {
    const high = priorityEncoding(entry());
    const low = priorityEncoding(entry({ review_priority: { score: 1, level: "low", reasons: [], caveat: "" } }));

    expect(high.width).toBeGreaterThan(low.width);
    expect(high.opacity).toBeGreaterThan(low.opacity);
  });

  it("uses comparator details and text to infer behavior kind", () => {
    const detail: CaseFileDetail = {
      oid: "ZTFglyph",
      model_comparisons: [
        {
          model_type: "variability_texture",
          fit_metrics: { behavior_hint: "repeated_or_irregular" },
        },
      ],
    };

    expect(behaviorKind(entry({ headline: "Quiet case", short_summary: "" }), detail)).toBe(
      "repeated_or_irregular",
    );
    expect(
      behaviorKind(entry({ detection_count: 2, headline: "Sparse case", short_summary: "" }), undefined),
    ).toBe("insufficient_data");
  });

  it("maps evidence rail statuses and sparsity deterministically", () => {
    const rail = evidenceRailItems(entry());
    const sparsity = sparsityEncoding(entry(), {
      oid: "ZTFglyph",
      light_curve_summary: {
        longest_detection_gap_days: 25,
        time_span_days: 100,
      },
    });

    expect(rail.map((item) => item.label)).toEqual(["F", "G", "V", "T", "C"]);
    expect(rail.find((item) => item.label === "T")?.state).toBe("limited");
    expect(sparsity.gapFraction).toBe(0.25);
    expect(sparsity.detectionDots).toBeGreaterThan(0);
  });
});
