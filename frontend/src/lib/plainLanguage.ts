import type {
  AnomalyAssessment,
  CaseFileDetail,
  CasefileIndexEntry,
  ReviewPriority,
} from "../types/casefile";

const PLAIN_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\blight[- ]curve behavior\b/gi, "brightness pattern"],
  [/\blight[- ]curve\b/gi, "brightness over time"],
  [/\blimited physical interpretation\b/gi, "no clear standard explanation"],
  [/\bphotometric errors\b/gi, "the measurement error bars"],
  [/\bsingle smooth bump\b/gi, "a simple single-spike model"],
  [/\bgaussian bump comparator\b/gi, "the simple-spike comparison"],
  [/\bgaussian bump\b/gi, "the simple-spike comparison"],
  [/\bgaussian comparator\b/gi, "the simple-spike comparison"],
  [/\bvariability texture\b/gi, "the repeated-or-irregular pattern check"],
  [/\bcomparator\b/gi, "comparison"],
  [/\bresidual(s)?\b/gi, "leftover difference$1"],
  [/\bdetection(s)?\b/gi, "observation$1"],
  [/\bnon[- ]detection(s)?\b/gi, "non-observation$1"],
  [/\bcross[- ]survey context\b/gi, "what other sky surveys say"],
  [/\bcross[- ]match\b/gi, "match in other surveys"],
  [/\btemplate[- ]family probe\b/gi, "the check against a library of known event shapes"],
  [/\bsncosmo template\b/gi, "library of known event shapes"],
  [/\bcadence[- ]sensitive\b/gi, "depends on how close together observations are"],
  [/\bmaximum_slope\b/gi, "the steepest measured change"],
  [/\bdescriptive features\b/gi, "standard descriptive numbers"],
];

const REASON_PATTERNS: Array<[RegExp, string]> = [
  [
    /gaussian bump comparator indicates the single smooth bump is not a clean fit/i,
    "Its brightness spike didn't match a simple single-spike model that Argus tries first.",
  ],
  [
    /variability texture suggests repeated or irregular behavior/i,
    "Its brightness changes look repeated or irregular rather than a single one-off event.",
  ],
  [
    /template[- ]family probe is limited by missing required context/i,
    "Argus couldn't compare it against a library of known event shapes — some required information was missing.",
  ],
  [
    /cross[- ]survey context was not requested/i,
    "Argus didn't pull in what other sky surveys say about this object.",
  ],
  [
    /standard descriptive features were computed/i,
    "Argus measured the standard descriptive numbers (brightness range, time span, etc.) for this object.",
  ],
  [
    /a recommended next check is recorded for human review/i,
    "There's a suggested next step for a human reviewer.",
  ],
];

const DRIVER_PATTERNS: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [
    /^(\d+)\s+detections?\s+provide(?:s)?\s+(?:a\s+)?(\w+(?:ly\s+\w+)?)\s+(?:local\s+)?record\.?$/i,
    (m) => `Argus has ${m[1]} observations of this object — a ${m[2]} record of how it behaved.`,
  ],
  [
    /^coverage spans\s+([\d.]+)\s+days,?\s*enough to inspect long[- ]baseline behavior\.?$/i,
    (m) => `Observations span ${m[1]} days, long enough to see long-term behavior.`,
  ],
  [
    /^both g and r observations are present for cross[- ]band review\.?$/i,
    () => "Both color bands (g and r) were observed, so reviewers can compare them.",
  ],
  [
    /^the largest observed per[- ]band magnitude range is\s+(wide|moderate|narrow)\s*\(([\d.]+)\s*mag\)\.?$/i,
    (m) => `The brightest-to-faintest range in a single color band is ${m[1]} (${m[2]} mag).`,
  ],
  [
    /^standard descriptive light[- ]curve features were computed\.?$/i,
    () =>
      "Argus measured the standard descriptive numbers (brightness range, time span, etc.) for this object.",
  ],
];

const CAUTION_PATTERNS: Array<[RegExp, (m: RegExpExecArray) => string]> = [
  [
    /maximum_slope is cadence[- ]sensitive:\s*the steepest adjacent pair is separated by\s+([\d.]+)\s+minute\(s\)\.\s*Treat this as a sampling diagnostic, not a robust physical rate\.?/i,
    (m) =>
      `The steepest brightness change seen sits between two observations only ${m[1]} minute(s) apart — treat that as a sampling artifact, not a real rate.`,
  ],
  [
    /minimum adjacent detection spacing is\s+([\d.]+)\s+minute\(s\)\.?/i,
    (m) =>
      `The closest two consecutive observations were ${m[1]} minute(s) apart, which is very tight.`,
  ],
  [
    /template[- ]family probe is limited:\s*missing_required_context\.?/i,
    () =>
      "Argus couldn't compare it against a library of known event shapes — some required information was missing.",
  ],
];

export function plainifyText(text: string): string {
  let working = text.trim();
  for (const [pattern, replacement] of PLAIN_REPLACEMENTS) {
    working = working.replace(pattern, replacement);
  }
  return working;
}

export function plainifyReason(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  for (const [pattern, replacement] of REASON_PATTERNS) {
    if (pattern.test(trimmed)) {
      return replacement;
    }
  }
  return plainifyText(trimmed);
}

export function plainifyDriver(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  for (const [pattern, build] of DRIVER_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      return build(match);
    }
  }
  return plainifyText(trimmed);
}

export function plainifyCaution(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  for (const [pattern, build] of CAUTION_PATTERNS) {
    const match = pattern.exec(trimmed);
    if (match) {
      return build(match);
    }
  }
  return plainifyText(trimmed);
}

export function plainifyNextCheck(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }
  if (/run the optional cross[- ]survey context check/i.test(trimmed)) {
    return "Look up what other sky surveys say about this position (an optional cross-check).";
  }
  if (/inspect the light[- ]curve/i.test(trimmed)) {
    return "Look at the brightness-over-time pattern more closely.";
  }
  if (/check the residual/i.test(trimmed)) {
    return "Compare the data against the simple-spike model and look at the leftover difference.";
  }
  return plainifyText(trimmed);
}

export function plainHeadline(entry: CasefileIndexEntry): string {
  const headline = entry.headline?.trim();
  if (!headline) {
    return "Flagged for human review.";
  }
  return plainifyText(headline);
}

export function plainShortSummary(entry: CasefileIndexEntry): string {
  const summary = entry.short_summary?.trim();
  if (!summary) {
    return "";
  }
  return plainifyText(summary);
}

interface WhatIsThisFacts {
  oid: string;
  detectionCount: number | null;
  nonDetectionCount: number | null;
  filters: string[];
  timeSpanDays: number | null;
}

function readWhatIsThisFacts(
  entry: CasefileIndexEntry,
  detail: CaseFileDetail | null | undefined,
): WhatIsThisFacts {
  return {
    oid: entry.oid,
    detectionCount: entry.detection_count ?? detail?.detection_count ?? null,
    nonDetectionCount: entry.non_detection_count ?? detail?.non_detection_count ?? null,
    filters: entry.filters_observed ?? detail?.filters_observed ?? [],
    timeSpanDays: entry.time_span_days ?? detail?.time_span_days ?? null,
  };
}

export function whatIsThisAnswer(
  entry: CasefileIndexEntry,
  detail: CaseFileDetail | null | undefined,
): string {
  const facts = readWhatIsThisFacts(entry, detail);
  const parts: string[] = [];
  parts.push(
    `${facts.oid} is an astronomical object pulled from public ZTF survey data and flagged by Argus for a human reviewer to look at.`,
  );
  const obsPieces: string[] = [];
  if (facts.detectionCount != null) {
    obsPieces.push(`${facts.detectionCount} observation${facts.detectionCount === 1 ? "" : "s"}`);
  }
  if (facts.nonDetectionCount != null && facts.nonDetectionCount > 0) {
    obsPieces.push(
      `${facts.nonDetectionCount} times Argus expected to see it but didn't (non-observations)`,
    );
  }
  if (facts.timeSpanDays != null && facts.timeSpanDays > 0) {
    obsPieces.push(`across ${facts.timeSpanDays.toFixed(0)} days`);
  }
  if (facts.filters.length) {
    obsPieces.push(`in color band${facts.filters.length === 1 ? "" : "s"} ${facts.filters.join(" and ")}`);
  }
  if (obsPieces.length) {
    parts.push(`Argus has ${obsPieces.join(", ")}.`);
  }
  return parts.join(" ");
}

export interface WhyFlaggedAnswer {
  reasons: string[];
  drivers: string[];
  honestyLine: string;
}

export function whyFlaggedAnswer(
  entry: CasefileIndexEntry,
  detail: CaseFileDetail | null | undefined,
  limit = 3,
): WhyFlaggedAnswer {
  const reviewPriority: ReviewPriority | undefined = entry.review_priority;
  const assessment: AnomalyAssessment | undefined =
    detail?.anomaly_assessment ?? entry.anomaly_assessment;
  const reasons = (reviewPriority?.reasons ?? [])
    .map(plainifyReason)
    .filter(Boolean)
    .slice(0, limit);
  const drivers = (assessment?.drivers ?? [])
    .map(plainifyDriver)
    .filter(Boolean)
    .slice(0, limit);
  return {
    reasons,
    drivers,
    honestyLine: "This is a reason for a human to look — not a conclusion.",
  };
}

export interface NextChecksAnswer {
  items: string[];
}

export function nextChecksAnswer(
  entry: CasefileIndexEntry,
  detail: CaseFileDetail | null | undefined,
  limit = 3,
): NextChecksAnswer {
  const detailChecks = (detail?.recommended_next_checks ?? [])
    .map(plainifyNextCheck)
    .filter(Boolean);
  const indexChecks: string[] = [];
  if (entry.top_recommended_next_check) {
    const plain = plainifyNextCheck(entry.top_recommended_next_check);
    if (plain) {
      indexChecks.push(plain);
    }
  }
  const merged: string[] = [];
  for (const item of [...detailChecks, ...indexChecks]) {
    if (!merged.includes(item)) {
      merged.push(item);
    }
  }
  return { items: merged.slice(0, limit) };
}

const REVIEW_LEVEL_PLAIN: Record<string, string> = {
  high: "high priority for human review",
  medium: "medium priority for human review",
  low: "lower priority for human review",
};

export function plainReviewLevel(priority: ReviewPriority | undefined): string {
  const level = priority?.level?.toLowerCase();
  if (level && REVIEW_LEVEL_PLAIN[level]) {
    return REVIEW_LEVEL_PLAIN[level];
  }
  return "queued for human review";
}
