import { Type, type Static } from "@sinclair/typebox";
import { CheckAttemptInputSchema, ResolvedCheckSchema } from "../checks.js";
import { commandEnvelope, eventEnvelope, strictObject } from "../envelopes.js";
import {
  ActorIdSchema,
  LeverageIdSchema,
  PendingCheckIdSchema,
  SocialLimitIdSchema,
} from "../ids.js";
import { ResolvedContentReferenceSchema } from "./playable-characters.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "../validation.js";
import { SchemaVersionSchema } from "../versions.js";

export const InformationVisibilitySchema = Type.Union([
  Type.Literal("public"),
  Type.Literal("seat_private"),
  Type.Literal("host_control"),
]);
const VisibleStatementSchema = strictObject({
  text: Type.String({ minLength: 1, maxLength: 200 }),
  visibility: InformationVisibilitySchema,
});
export const SocialStanceSchema = Type.Union([
  Type.Literal("closed"),
  Type.Literal("guarded"),
  Type.Literal("receptive"),
  Type.Literal("aligned"),
]);
export const HardLimitSchema = strictObject({
  social_limit_id: SocialLimitIdSchema,
  statement: VisibleStatementSchema,
});
export const LeverageSchema = strictObject({
  leverage_id: LeverageIdSchema,
  label: Type.String({ minLength: 1, maxLength: 80 }),
  visibility: InformationVisibilitySchema,
});

export const SocialStateSchema = strictObject({
  schema_version: SchemaVersionSchema,
  record_kind: Type.Literal("social_state"),
  npc_actor_id: ActorIdSchema,
  definition: ResolvedContentReferenceSchema,
  motives: Type.Array(VisibleStatementSchema, { minItems: 1, maxItems: 6 }),
  fears: Type.Array(VisibleStatementSchema, { maxItems: 6 }),
  stance: SocialStanceSchema,
  leverage: Type.Array(LeverageSchema, { maxItems: 6 }),
  leverage_capacity: Type.Integer({ minimum: 0, maximum: 6 }),
  hard_limits: Type.Array(HardLimitSchema, { minItems: 1, maxItems: 6 }),
});

export type SocialState = Static<typeof SocialStateSchema>;

function duplicateIds(
  values: readonly string[],
  path: string,
): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  values.forEach((value, index) => {
    if (seen.has(value)) {
      issues.push({
        path: `${path}[${index}]`,
        code: "social.duplicate_identity",
        message: `${value} appears more than once.`,
      });
    }
    seen.add(value);
  });
  return issues;
}

export function validateSocialState(
  input: unknown,
): ValidationResult<SocialState> {
  const structural = validateValue(SocialStateSchema, input);
  if (!structural.success) return structural;
  const state = structural.value;
  const issues = [
    ...duplicateIds(
      state.leverage.map(({ leverage_id }) => leverage_id),
      "$.leverage",
    ),
    ...duplicateIds(
      state.hard_limits.map(({ social_limit_id }) => social_limit_id),
      "$.hard_limits",
    ),
  ];
  if (state.leverage.length > state.leverage_capacity) {
    issues.push({
      path: "$.leverage",
      code: "social.leverage_overflow",
      message: "Leverage count cannot exceed its capacity.",
    });
  }
  return issues.length === 0
    ? { success: true, value: state }
    : validationFailure(issues);
}

export function validateSocialStateTransition(
  previousInput: unknown,
  nextInput: unknown,
): ValidationResult<SocialState> {
  const previous = validateSocialState(previousInput);
  if (!previous.success) return previous;
  const next = validateSocialState(nextInput);
  if (!next.success) return next;
  const previousLimits = JSON.stringify(previous.value.hard_limits);
  const nextLimits = JSON.stringify(next.value.hard_limits);
  if (previousLimits !== nextLimits) {
    return validationFailure([
      {
        path: "$.hard_limits",
        code: "social.hard_limit_override",
        message: "A social transition cannot remove or rewrite a hard limit.",
      },
    ]);
  }
  return next;
}

export const EstablishSocialStateCommandSchema = commandEnvelope(
  Type.Literal("establish_social_state"),
  strictObject({ social_state: SocialStateSchema }),
);
export const AttemptSocialShiftCommandSchema = commandEnvelope(
  Type.Literal("attempt_social_shift"),
  strictObject({
    npc_actor_id: ActorIdSchema,
    check: CheckAttemptInputSchema,
    requested_stance: SocialStanceSchema,
    challenged_limit_id: Type.Union([Type.Null(), SocialLimitIdSchema]),
  }),
);
export const CreateLeverageCommandSchema = commandEnvelope(
  Type.Literal("create_leverage"),
  strictObject({ npc_actor_id: ActorIdSchema, leverage: LeverageSchema }),
);
export const SpendLeverageCommandSchema = commandEnvelope(
  Type.Literal("spend_leverage"),
  strictObject({
    npc_actor_id: ActorIdSchema,
    leverage_id: LeverageIdSchema,
  }),
);

export const SocialStateEstablishedEventSchema = eventEnvelope(
  Type.Literal("social_state_established"),
  strictObject({ social_state: SocialStateSchema }),
);
export const SocialStanceChangedEventSchema = eventEnvelope(
  Type.Literal("social_stance_changed"),
  strictObject({
    npc_actor_id: ActorIdSchema,
    previous: SocialStanceSchema,
    current: SocialStanceSchema,
    result: ResolvedCheckSchema,
  }),
);
export const LeverageCreatedEventSchema = eventEnvelope(
  Type.Literal("leverage_created"),
  strictObject({ npc_actor_id: ActorIdSchema, leverage: LeverageSchema }),
);
export const LeverageSpentEventSchema = eventEnvelope(
  Type.Literal("leverage_spent"),
  strictObject({ npc_actor_id: ActorIdSchema, leverage_id: LeverageIdSchema }),
);
export const SocialCheckPendingEventSchema = eventEnvelope(
  Type.Literal("social_check_pending"),
  strictObject({
    npc_actor_id: ActorIdSchema,
    pending_check_id: PendingCheckIdSchema,
    requested_stance: SocialStanceSchema,
    challenged_limit_id: Type.Union([Type.Null(), SocialLimitIdSchema]),
  }),
);
