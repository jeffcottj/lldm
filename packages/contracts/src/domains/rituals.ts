import { Type, type Static } from "@sinclair/typebox";
import { CheckAttemptInputSchema, ResolvedCheckSchema } from "../checks.js";
import { commandEnvelope, eventEnvelope, strictObject } from "../envelopes.js";
import {
  ActorIdSchema,
  CharacterIdSchema,
  PendingCheckIdSchema,
  RitualIdSchema,
} from "../ids.js";
import { ResolvedContentReferenceSchema } from "./playable-characters.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "../validation.js";
import { SchemaVersionSchema } from "../versions.js";

export const RitualRequirementSchema = Type.Union([
  strictObject({
    kind: Type.Literal("participant_count"),
    minimum: Type.Integer({ minimum: 1, maximum: 5 }),
  }),
  strictObject({
    kind: Type.Literal("content"),
    definition: ResolvedContentReferenceSchema,
  }),
  strictObject({
    kind: Type.Literal("fictional_position"),
    tag: Type.String({ minLength: 1, maxLength: 60 }),
  }),
]);
export const RitualCostSchema = Type.Union([
  strictObject({
    kind: Type.Literal("exertion"),
    amount: Type.Integer({ minimum: 1, maximum: 3 }),
  }),
  strictObject({
    kind: Type.Literal("supply"),
    amount: Type.Integer({ minimum: 1, maximum: 7 }),
  }),
  strictObject({
    kind: Type.Literal("significant_gear"),
    definition: ResolvedContentReferenceSchema,
  }),
]);

export const RitualStateSchema = strictObject({
  schema_version: SchemaVersionSchema,
  record_kind: Type.Literal("ritual_state"),
  ritual_id: RitualIdSchema,
  definition: ResolvedContentReferenceSchema,
  status: Type.Union([
    Type.Literal("preparing"),
    Type.Literal("ready"),
    Type.Literal("awaiting_resolution"),
    Type.Literal("completed"),
    Type.Literal("interrupted"),
    Type.Literal("failed"),
  ]),
  requirements: Type.Array(RitualRequirementSchema, {
    minItems: 1,
    maxItems: 8,
  }),
  costs: Type.Array(RitualCostSchema, { minItems: 1, maxItems: 8 }),
  contributor_ids: Type.Array(CharacterIdSchema, {
    maxItems: 5,
    uniqueItems: true,
  }),
  paid_cost_count: Type.Integer({ minimum: 0 }),
  target: Type.Union([
    strictObject({ kind: Type.Literal("actor"), actor_id: ActorIdSchema }),
    strictObject({
      kind: Type.Literal("place"),
      place_tag: Type.String({ minLength: 1, maxLength: 80 }),
    }),
    strictObject({
      kind: Type.Literal("phenomenon"),
      phenomenon_tag: Type.String({ minLength: 1, maxLength: 80 }),
    }),
  ]),
});

export type RitualState = Static<typeof RitualStateSchema>;

export function validateRitualState(
  input: unknown,
): ValidationResult<RitualState> {
  const structural = validateValue(RitualStateSchema, input);
  if (!structural.success) return structural;
  const ritual = structural.value;
  const issues: ValidationIssue[] = [];
  if (ritual.paid_cost_count > ritual.costs.length) {
    issues.push({
      path: "$.paid_cost_count",
      code: "ritual.cost_overflow",
      message: "Paid cost count cannot exceed declared ritual costs.",
    });
  }
  const fullyPaid = ritual.paid_cost_count === ritual.costs.length;
  if (
    ["ready", "awaiting_resolution", "completed"].includes(ritual.status) &&
    !fullyPaid
  ) {
    issues.push({
      path: "$.status",
      code: "ritual.unpaid_cost",
      message: `${ritual.status} requires every declared cost to be paid.`,
    });
  }
  return issues.length === 0
    ? { success: true, value: ritual }
    : validationFailure(issues);
}

export function validateRitualStartEligibility(input: {
  readonly requirements_met: boolean;
  readonly costs_payable: boolean;
}): ValidationResult<true> {
  const issues: ValidationIssue[] = [];
  if (!input.requirements_met) {
    issues.push({
      path: "$.requirements_met",
      code: "ritual.unmet_requirements",
      message: "Every declared ritual requirement must be met before starting.",
    });
  }
  if (!input.costs_payable) {
    issues.push({
      path: "$.costs_payable",
      code: "ritual.unpayable_cost",
      message: "Every declared ritual cost must be payable before starting.",
    });
  }
  return issues.length === 0
    ? { success: true, value: true }
    : validationFailure(issues);
}

export const StartRitualCommandSchema = commandEnvelope(
  Type.Literal("start_ritual"),
  strictObject({
    ritual: RitualStateSchema,
    established_fictional_position_tags: Type.Array(
      Type.String({ minLength: 1, maxLength: 60 }),
      { maxItems: 16, uniqueItems: true },
    ),
  }),
);
export const ContributeRitualCommandSchema = commandEnvelope(
  Type.Literal("contribute_ritual"),
  strictObject({
    ritual_id: RitualIdSchema,
    character_id: CharacterIdSchema,
    paid_cost_index: Type.Integer({ minimum: 0 }),
  }),
);
export const ResolveRitualCommandSchema = commandEnvelope(
  Type.Literal("resolve_ritual"),
  strictObject({ ritual_id: RitualIdSchema, check: CheckAttemptInputSchema }),
);
export const InterruptRitualCommandSchema = commandEnvelope(
  Type.Literal("interrupt_ritual"),
  strictObject({
    ritual_id: RitualIdSchema,
    reason: Type.String({ minLength: 1, maxLength: 160 }),
  }),
);

export const RitualStartedEventSchema = eventEnvelope(
  Type.Literal("ritual_started"),
  strictObject({ ritual: RitualStateSchema }),
);
export const RitualContributionEventSchema = eventEnvelope(
  Type.Literal("ritual_contribution"),
  strictObject({
    ritual_id: RitualIdSchema,
    character_id: CharacterIdSchema,
    paid_cost_index: Type.Integer({ minimum: 0 }),
  }),
);
export const RitualReadyEventSchema = eventEnvelope(
  Type.Literal("ritual_ready"),
  strictObject({ ritual_id: RitualIdSchema }),
);
export const RitualResolvedEventSchema = eventEnvelope(
  Type.Literal("ritual_resolved"),
  strictObject({
    ritual_id: RitualIdSchema,
    result: ResolvedCheckSchema,
    outcome: Type.Union([Type.Literal("completed"), Type.Literal("failed")]),
  }),
);
export const RitualInterruptedEventSchema = eventEnvelope(
  Type.Literal("ritual_interrupted"),
  strictObject({
    ritual_id: RitualIdSchema,
    reason: Type.String({ minLength: 1, maxLength: 160 }),
  }),
);
export const RitualCheckPendingEventSchema = eventEnvelope(
  Type.Literal("ritual_check_pending"),
  strictObject({
    ritual_id: RitualIdSchema,
    pending_check_id: PendingCheckIdSchema,
  }),
);
