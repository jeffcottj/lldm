import {
  OUTCOME_DEGREES,
  type DieFace,
  type OutcomeDegree,
  type StandardTarget,
} from "@lldm/contracts";
import {
  type LegalTotalModifier,
  resolveDegreeForTotalModifier,
} from "./resolution.js";

export type OutcomeCounts = Readonly<Record<OutcomeDegree, number>>;

export function enumerateOutcomeCounts(
  target: StandardTarget,
  modifier: LegalTotalModifier,
): OutcomeCounts {
  const mutableCounts: Record<OutcomeDegree, number> = {
    Crisis: 0,
    Setback: 0,
    Success: 0,
    Triumph: 0,
  };
  for (let face = 1; face <= 20; face += 1) {
    const degree = resolveDegreeForTotalModifier(
      face as DieFace,
      target,
      modifier,
    ).final_degree;
    mutableCounts[degree] += 1;
  }
  return Object.freeze(
    Object.fromEntries(
      OUTCOME_DEGREES.map((degree) => [degree, mutableCounts[degree]]),
    ) as Record<OutcomeDegree, number>,
  );
}

export function formatOutcomePercentage(count: number): string {
  if (!Number.isInteger(count) || count < 0 || count > 20) {
    throw new RangeError("Outcome count must be an integer from 0 through 20.");
  }
  return `${count * 5}%`;
}
