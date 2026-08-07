import {
  SCHEMA_VERSION,
  type CheckRequest,
  type DieFace,
  type ImpossibleCheckRejection,
  type ModifierBreakdown,
  type OutcomeDegree,
  type PhysicalRollReason,
  type ResolvedCheck,
  type StandardTarget,
} from "@lldm/contracts";

export const LEGAL_TOTAL_MODIFIERS = [-2, -1, 0, 1, 2, 3, 4, 5, 6] as const;
export type LegalTotalModifier = (typeof LEGAL_TOTAL_MODIFIERS)[number];

const OUTCOME_ORDER = ["Crisis", "Setback", "Success", "Triumph"] as const;

export type ResolutionInput =
  | {
      readonly action_feasibility: "impossible";
      readonly rejection: ImpossibleCheckRejection;
    }
  | {
      readonly action_feasibility: "possible";
      readonly request: CheckRequest;
      readonly die_face: DieFace;
      readonly roll_mode: "simulated";
    }
  | {
      readonly action_feasibility: "possible";
      readonly request: CheckRequest;
      readonly die_face: DieFace;
      readonly roll_mode: "physical";
      readonly physical_reason: PhysicalRollReason;
    };

function degreeForDelta(delta: number): OutcomeDegree {
  if (delta <= -5) return "Crisis";
  if (delta < 0) return "Setback";
  if (delta < 5) return "Success";
  return "Triumph";
}

function shiftDegree(
  baseDegree: OutcomeDegree,
  adjustment: -1 | 0 | 1,
): OutcomeDegree {
  const index = OUTCOME_ORDER.indexOf(baseDegree);
  const shiftedIndex = Math.max(
    0,
    Math.min(OUTCOME_ORDER.length - 1, index + adjustment),
  );
  return OUTCOME_ORDER[shiftedIndex] ?? baseDegree;
}

export function naturalFaceAdjustment(face: DieFace): -1 | 0 | 1 {
  if (face === 1) return -1;
  if (face === 20) return 1;
  return 0;
}

export interface DegreeResolution {
  readonly total: number;
  readonly target_delta: number;
  readonly base_degree: OutcomeDegree;
  readonly natural_face_adjustment: -1 | 0 | 1;
  readonly final_degree: OutcomeDegree;
}

export function resolveDegreeForTotalModifier(
  dieFace: DieFace,
  target: StandardTarget,
  finalModifier: LegalTotalModifier,
): DegreeResolution {
  const total = dieFace + finalModifier;
  const targetDelta = total - target;
  const baseDegree = degreeForDelta(targetDelta);
  const adjustment = naturalFaceAdjustment(dieFace);
  return Object.freeze({
    total,
    target_delta: targetDelta,
    base_degree: baseDegree,
    natural_face_adjustment: adjustment,
    final_degree: shiftDegree(baseDegree, adjustment),
  });
}

export function normalizeModifierState(
  modifierState: CheckRequest["modifier_state"],
): Readonly<
  Pick<ModifierBreakdown, "edge" | "hindrance" | "situational_modifier">
> {
  const edgeValue = modifierState.edge ? 2 : 0;
  const hindranceValue = modifierState.hindrance ? -2 : 0;
  return Object.freeze({
    edge: Object.freeze({ active: modifierState.edge, value: edgeValue }),
    hindrance: Object.freeze({
      active: modifierState.hindrance,
      value: hindranceValue,
    }),
    situational_modifier: (edgeValue + hindranceValue) as -2 | 0 | 2,
  });
}

export function buildModifierBreakdown(
  request: CheckRequest,
): Readonly<ModifierBreakdown> {
  const situational = normalizeModifierState(request.modifier_state);
  return Object.freeze({
    attribute: Object.freeze({
      name: request.attribute,
      value: request.attribute_rating,
    }),
    discipline: Object.freeze({
      name: request.discipline,
      value: request.discipline_rating,
    }),
    edge: situational.edge,
    hindrance: situational.hindrance,
    situational_modifier: situational.situational_modifier,
  });
}

export function finalModifierFor(request: CheckRequest): LegalTotalModifier {
  const situational = normalizeModifierState(request.modifier_state);
  return (request.attribute_rating +
    request.discipline_rating +
    situational.situational_modifier) as LegalTotalModifier;
}

export function resolveCheck(
  input: ResolutionInput,
): Readonly<ResolvedCheck> | ImpossibleCheckRejection {
  if (input.action_feasibility === "impossible") {
    return input.rejection;
  }

  const modifierBreakdown = buildModifierBreakdown(input.request);
  const finalModifier = finalModifierFor(input.request);
  const degree = resolveDegreeForTotalModifier(
    input.die_face,
    input.request.target,
    finalModifier,
  );
  const common = {
    schema_version: SCHEMA_VERSION,
    actor_id: input.request.actor_id,
    die_face: input.die_face,
    modifier_breakdown: modifierBreakdown,
    final_modifier: finalModifier,
    total: degree.total,
    target: input.request.target,
    target_delta: degree.target_delta,
    base_degree: degree.base_degree,
    natural_face_adjustment: degree.natural_face_adjustment,
    final_degree: degree.final_degree,
  } as const;

  if (input.roll_mode === "physical") {
    return Object.freeze({
      ...common,
      roll_mode: "physical",
      physical_reason: input.physical_reason,
    });
  }

  return Object.freeze({ ...common, roll_mode: "simulated" });
}
