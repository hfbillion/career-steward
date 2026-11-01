import { describe, expect, it } from "vitest";

import { calculateMatchMetrics } from "../src/application/matching-policy.js";

describe("matching-policy/1.0", () => {
  it("returns perfect metrics when every requirement is strongly supported", () => {
    expect(
      calculateMatchMetrics([
        { priority: "must", assessment: "strong", confidence: 1 },
        { priority: "should", assessment: "strong", confidence: 1 },
        { priority: "nice-to-have", assessment: "strong", confidence: 1 },
      ]),
    ).toEqual({
      capabilityScore: 100,
      evidenceCoverage: 100,
      confidenceScore: 100,
      matchScore: 100,
      appliedCaps: [],
    });
  });

  it("separates capability, coverage, confidence, and final match", () => {
    expect(
      calculateMatchMetrics([
        { priority: "must", assessment: "strong", confidence: 0.9 },
        { priority: "should", assessment: "transferable", confidence: 0.8 },
        { priority: "nice-to-have", assessment: "unknown", confidence: 0 },
      ]),
    ).toEqual({
      capabilityScore: 86.9,
      evidenceCoverage: 88.9,
      confidenceScore: 76.7,
      matchScore: 84,
      appliedCaps: [],
    });
  });

  it("caps an otherwise high score when a must requirement is a gap", () => {
    expect(
      calculateMatchMetrics([
        { priority: "must", assessment: "gap", confidence: 1 },
        { priority: "must", assessment: "strong", confidence: 1 },
        { priority: "must", assessment: "strong", confidence: 1 },
        { priority: "must", assessment: "strong", confidence: 1 },
      ]),
    ).toMatchObject({ matchScore: 69, appliedCaps: ["must-gap-cap-69"] });
  });

  it("caps a high score when a must requirement is unknown", () => {
    expect(
      calculateMatchMetrics([
        { priority: "must", assessment: "unknown", confidence: 0 },
        { priority: "must", assessment: "strong", confidence: 1 },
        { priority: "must", assessment: "strong", confidence: 1 },
        { priority: "must", assessment: "strong", confidence: 1 },
      ]),
    ).toMatchObject({
      capabilityScore: 100,
      evidenceCoverage: 75,
      confidenceScore: 75,
      matchScore: 79,
      appliedCaps: ["must-unknown-cap-79"],
    });
  });

  it("returns zero metrics when no requirement can be assessed", () => {
    expect(
      calculateMatchMetrics([
        { priority: "must", assessment: "unknown", confidence: 0 },
        { priority: "should", assessment: "unknown", confidence: 0 },
      ]),
    ).toEqual({
      capabilityScore: 0,
      evidenceCoverage: 0,
      confidenceScore: 0,
      matchScore: 0,
      appliedCaps: [],
    });
  });
});
