import {
  OUTCOME_DEGREES,
  STANDARD_TARGETS,
  type DieFace,
  type OutcomeDegree,
} from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import { createPhysicalRollDisclosure } from "./physical-rolls.js";
import {
  enumerateOutcomeCounts,
  formatOutcomePercentage,
} from "./probability.js";
import {
  LEGAL_TOTAL_MODIFIERS,
  normalizeModifierState,
  resolveDegreeForTotalModifier,
} from "./resolution.js";
import { requestForModifier } from "./test-helpers.js";

const degreeIndex = new Map<OutcomeDegree, number>(
  OUTCOME_DEGREES.map((degree, index) => [degree, index]),
);

describe("all 900 supported target/modifier/face combinations", () => {
  it("enumerates exactly one valid outcome per combination", () => {
    let visited = 0;
    for (const target of STANDARD_TARGETS) {
      for (const modifier of LEGAL_TOTAL_MODIFIERS) {
        const counts = enumerateOutcomeCounts(target, modifier);
        expect(
          Object.values(counts).reduce((sum, count) => sum + count, 0),
        ).toBe(20);
        expect(
          Object.values(counts).reduce(
            (sum, count) =>
              sum + Number.parseInt(formatOutcomePercentage(count), 10),
            0,
          ),
        ).toBe(100);
        for (let face = 1; face <= 20; face += 1) {
          const result = resolveDegreeForTotalModifier(
            face as DieFace,
            target,
            modifier,
          );
          expect(OUTCOME_DEGREES).toContain(result.final_degree);
          expect(
            Math.abs(
              (degreeIndex.get(result.final_degree) ?? -99) -
                (degreeIndex.get(result.base_degree) ?? 99),
            ),
          ).toBeLessThanOrEqual(1);
          visited += 1;
        }
      }
    }
    expect(visited).toBe(5 * 9 * 20);
  });

  it("is monotonic across modifiers for every non-natural face", () => {
    for (const target of STANDARD_TARGETS) {
      for (let face = 2; face <= 19; face += 1) {
        let previous = -1;
        for (const modifier of LEGAL_TOTAL_MODIFIERS) {
          const result = resolveDegreeForTotalModifier(
            face as DieFace,
            target,
            modifier,
          );
          const current = degreeIndex.get(result.final_degree) ?? -1;
          expect(current).toBeGreaterThanOrEqual(previous);
          previous = current;
        }
      }
    }
  });

  it("keeps every disclosed face synchronized with resolution", () => {
    for (const target of STANDARD_TARGETS) {
      for (const modifier of LEGAL_TOTAL_MODIFIERS) {
        const disclosure = createPhysicalRollDisclosure(
          requestForModifier(modifier, target),
          "pivotal_scene_conclusion",
        );
        if ("rejected" in disclosure) {
          throw new Error(
            `Disclosure rejected target ${target}, modifier ${modifier}.`,
          );
        }
        expect(disclosure.face_to_outcome).toHaveLength(20);
        for (const mapping of disclosure.face_to_outcome) {
          expect(mapping.degree).toBe(
            resolveDegreeForTotalModifier(mapping.face, target, modifier)
              .final_degree,
          );
        }
      }
    }
  });
});

describe("modifier normalization", () => {
  it.each([
    { edge: false, hindrance: false, expected: 0 },
    { edge: true, hindrance: false, expected: 2 },
    { edge: false, hindrance: true, expected: -2 },
    { edge: true, hindrance: true, expected: 0 },
  ])(
    "normalizes $edge/$hindrance to $expected",
    ({ edge, hindrance, expected }) => {
      expect(
        normalizeModifierState({ edge, hindrance }).situational_modifier,
      ).toBe(expected);
    },
  );
});
