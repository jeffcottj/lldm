import { Type, type Static } from "@sinclair/typebox";
import { CheckAttemptInputSchema, ResolvedCheckSchema } from "../checks.js";
import { commandEnvelope, eventEnvelope, strictObject } from "../envelopes.js";
import { ChallengeIdSchema, PendingCheckIdSchema } from "../ids.js";
import { ResolvedContentReferenceSchema } from "./playable-characters.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "../validation.js";
import { SchemaVersionSchema } from "../versions.js";

export const BoundedTrackSchema = strictObject({
  current: Type.Integer({ minimum: 0 }),
  maximum: Type.Integer({ minimum: 1, maximum: 20 }),
});

export const ChallengeStateSchema = strictObject({
  schema_version: SchemaVersionSchema,
  record_kind: Type.Literal("challenge_state"),
  challenge_id: ChallengeIdSchema,
  definition: ResolvedContentReferenceSchema,
  progress: BoundedTrackSchema,
  danger: BoundedTrackSchema,
  tie_rule: Type.Union([
    Type.Literal("progress_wins"),
    Type.Literal("danger_wins"),
    Type.Literal("resolved_with_cost"),
  ]),
  status: Type.Union([
    Type.Literal("active"),
    Type.Literal("completed"),
    Type.Literal("failed"),
    Type.Literal("resolved_with_cost"),
  ]),
});

export type ChallengeState = Static<typeof ChallengeStateSchema>;

export function validateChallengeState(
  input: unknown,
): ValidationResult<ChallengeState> {
  const structural = validateValue(ChallengeStateSchema, input);
  if (!structural.success) return structural;
  const challenge = structural.value;
  const issues: ValidationIssue[] = [];
  if (challenge.progress.current > challenge.progress.maximum) {
    issues.push({
      path: "$.progress.current",
      code: "challenge.progress_overflow",
      message: "Progress cannot exceed its maximum.",
    });
  }
  if (challenge.danger.current > challenge.danger.maximum) {
    issues.push({
      path: "$.danger.current",
      code: "challenge.danger_overflow",
      message: "Danger cannot exceed its maximum.",
    });
  }
  if (issues.length > 0) return validationFailure(issues);

  const progressFull =
    challenge.progress.current === challenge.progress.maximum;
  const dangerFull = challenge.danger.current === challenge.danger.maximum;
  const expectedStatus =
    progressFull && dangerFull
      ? challenge.tie_rule === "progress_wins"
        ? "completed"
        : challenge.tie_rule === "danger_wins"
          ? "failed"
          : "resolved_with_cost"
      : progressFull
        ? "completed"
        : dangerFull
          ? "failed"
          : "active";
  if (challenge.status !== expectedStatus) {
    issues.push({
      path: "$.status",
      code: "challenge.lifecycle_mismatch",
      message: `Track values require status ${expectedStatus}.`,
    });
  }
  return issues.length === 0
    ? { success: true, value: challenge }
    : validationFailure(issues);
}

export const StartChallengeCommandSchema = commandEnvelope(
  Type.Literal("start_challenge"),
  strictObject({ challenge: ChallengeStateSchema }),
);
export const AdvanceChallengeCommandSchema = commandEnvelope(
  Type.Literal("advance_challenge"),
  strictObject({
    challenge_id: ChallengeIdSchema,
    check: CheckAttemptInputSchema,
  }),
);

export const ChallengeStartedEventSchema = eventEnvelope(
  Type.Literal("challenge_started"),
  strictObject({ challenge: ChallengeStateSchema }),
);
export const ChallengeTracksChangedEventSchema = eventEnvelope(
  Type.Literal("challenge_tracks_changed"),
  strictObject({
    challenge_id: ChallengeIdSchema,
    progress_before: Type.Integer({ minimum: 0 }),
    progress_after: Type.Integer({ minimum: 0 }),
    danger_before: Type.Integer({ minimum: 0 }),
    danger_after: Type.Integer({ minimum: 0 }),
    status: Type.Union([
      Type.Literal("active"),
      Type.Literal("completed"),
      Type.Literal("failed"),
      Type.Literal("resolved_with_cost"),
    ]),
    result: ResolvedCheckSchema,
  }),
);
export const ChallengeResolvedEventSchema = eventEnvelope(
  Type.Literal("challenge_resolved"),
  strictObject({
    challenge_id: ChallengeIdSchema,
    outcome: Type.Union([
      Type.Literal("completed"),
      Type.Literal("failed"),
      Type.Literal("resolved_with_cost"),
    ]),
  }),
);
export const ChallengeCheckPendingEventSchema = eventEnvelope(
  Type.Literal("challenge_check_pending"),
  strictObject({
    challenge_id: ChallengeIdSchema,
    pending_check_id: PendingCheckIdSchema,
  }),
);
