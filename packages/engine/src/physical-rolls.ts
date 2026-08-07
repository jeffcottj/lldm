import {
  PHYSICAL_ROLL_REASONS,
  SCHEMA_VERSION,
  type CheckRequest,
  type ImpossibleCheckRejection,
  type PhysicalRollDisclosure,
  type PhysicalRollReason,
} from "@lldm/contracts";
import {
  buildModifierBreakdown,
  finalModifierFor,
  resolveCheck,
} from "./resolution.js";

export const MANDATORY_PHYSICAL_ROLL_REASONS = [
  "permanent_death",
  "declared_irreversible_stake",
  "named_boss_transition",
  "pivotal_scene_conclusion",
] as const satisfies readonly PhysicalRollReason[];
export const PHYSICAL_ROLL_REASON_PRECEDENCE = Object.freeze([
  ...MANDATORY_PHYSICAL_ROLL_REASONS,
  "spark_invocation",
] as const satisfies readonly PhysicalRollReason[]);

type MandatoryPhysicalReason = (typeof MANDATORY_PHYSICAL_ROLL_REASONS)[number];

type DeepReadonly<Value> = Value extends (...arguments_: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value;

export type PhysicalRollRejectionCode =
  | "action_impossible"
  | "already_resolved"
  | "spark_ineligible"
  | "eligible_roller_missing"
  | "stakes_missing";

export interface PhysicalRollRejection {
  readonly selected: false;
  readonly rejected: true;
  readonly code: PhysicalRollRejectionCode;
  readonly message: string;
}

export interface SimulatedRollSelection {
  readonly selected: false;
  readonly rejected: false;
  readonly request: CheckRequest;
}

export interface PhysicalRollSelection {
  readonly selected: true;
  readonly rejected: false;
  readonly request: CheckRequest;
  readonly primary_reason: PhysicalRollReason;
  readonly applied_reasons: readonly PhysicalRollReason[];
  readonly spark_spent: boolean;
  readonly disclosure: DeepReadonly<PhysicalRollDisclosure>;
}

export type PhysicalRollSelectionResult =
  | PhysicalRollRejection
  | SimulatedRollSelection
  | PhysicalRollSelection;

export interface PhysicalRollPolicyInput {
  readonly attempt: CheckRequest | ImpossibleCheckRejection;
  readonly mandatory_reasons: readonly MandatoryPhysicalReason[];
  readonly invoke_spark: boolean;
  readonly resolution_status: "unresolved" | "resolved";
}

function reject(
  code: PhysicalRollRejectionCode,
  message: string,
): PhysicalRollRejection {
  return Object.freeze({ selected: false, rejected: true, code, message });
}

function orderedReasons(
  supplied: readonly MandatoryPhysicalReason[],
  includeSpark: boolean,
): readonly PhysicalRollReason[] {
  const unique = MANDATORY_PHYSICAL_ROLL_REASONS.filter((reason) =>
    supplied.includes(reason),
  );
  return Object.freeze(
    includeSpark ? [...unique, "spark_invocation"] : [...unique],
  );
}

function consequenceFor(
  request: CheckRequest,
  degree: PhysicalRollDisclosure["face_to_outcome"][number]["degree"],
): string {
  const band = request.outcome_bands.find(
    (candidate) => candidate.degree === degree,
  );
  return band?.consequence ?? "The disclosed outcome applies.";
}

export function createPhysicalRollDisclosure(
  request: CheckRequest,
  reason: PhysicalRollReason,
): DeepReadonly<PhysicalRollDisclosure> | PhysicalRollRejection {
  if (request.stakes.trim().length === 0) {
    return reject(
      "stakes_missing",
      "A physical roll requires concrete stakes.",
    );
  }
  if (request.eligible_roller === undefined) {
    return reject(
      "eligible_roller_missing",
      "A physical roll requires an eligible roller.",
    );
  }

  const outcomeForFace = <
    Face extends PhysicalRollDisclosure["face_to_outcome"][number]["face"],
  >(
    face: Face,
  ) => {
    const result = resolveCheck({
      action_feasibility: "possible",
      request,
      die_face: face,
      roll_mode: "physical",
      physical_reason: reason,
    });
    if ("action_feasibility" in result) {
      throw new Error("A possible check unexpectedly resolved as impossible.");
    }
    return Object.freeze({
      face,
      degree: result.final_degree,
      consequence: consequenceFor(request, result.final_degree),
    });
  };
  const faceToOutcome = Object.freeze([
    outcomeForFace(1),
    outcomeForFace(2),
    outcomeForFace(3),
    outcomeForFace(4),
    outcomeForFace(5),
    outcomeForFace(6),
    outcomeForFace(7),
    outcomeForFace(8),
    outcomeForFace(9),
    outcomeForFace(10),
    outcomeForFace(11),
    outcomeForFace(12),
    outcomeForFace(13),
    outcomeForFace(14),
    outcomeForFace(15),
    outcomeForFace(16),
    outcomeForFace(17),
    outcomeForFace(18),
    outcomeForFace(19),
    outcomeForFace(20),
  ]);

  return Object.freeze({
    schema_version: SCHEMA_VERSION,
    actor_id: request.actor_id,
    target: request.target,
    modifier_breakdown: buildModifierBreakdown(request),
    final_modifier: finalModifierFor(request),
    outcome_bands: Object.freeze([
      Object.freeze({ ...request.outcome_bands[0] }),
      Object.freeze({ ...request.outcome_bands[1] }),
      Object.freeze({ ...request.outcome_bands[2] }),
      Object.freeze({ ...request.outcome_bands[3] }),
    ]),
    stakes: request.stakes,
    reason,
    eligible_roller: request.eligible_roller,
    face_to_outcome: faceToOutcome,
  });
}

export function selectPhysicalRoll(
  input: PhysicalRollPolicyInput,
): PhysicalRollSelectionResult {
  if (input.attempt.action_feasibility === "impossible") {
    return reject("action_impossible", input.attempt.reason);
  }
  if (input.resolution_status === "resolved") {
    return reject(
      "already_resolved",
      "A resolved check cannot become a physical roll.",
    );
  }
  if (input.invoke_spark && !input.attempt.spark_eligible) {
    return reject(
      "spark_ineligible",
      "This unresolved check is not eligible for Spark conversion.",
    );
  }

  const reasons = orderedReasons(input.mandatory_reasons, input.invoke_spark);
  if (reasons.length === 0) {
    return Object.freeze({
      selected: false,
      rejected: false,
      request: input.attempt,
    });
  }

  const request = input.invoke_spark
    ? Object.freeze({
        ...input.attempt,
        modifier_state: Object.freeze({
          ...input.attempt.modifier_state,
          edge: true,
        }),
      })
    : input.attempt;
  const primaryReason = reasons[0] ?? PHYSICAL_ROLL_REASONS[0];
  const disclosure = createPhysicalRollDisclosure(request, primaryReason);
  if ("rejected" in disclosure) return disclosure;

  return Object.freeze({
    selected: true,
    rejected: false,
    request,
    primary_reason: primaryReason,
    applied_reasons: reasons,
    spark_spent: input.invoke_spark,
    disclosure,
  });
}
