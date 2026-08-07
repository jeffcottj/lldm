import { type Static, Type } from "@sinclair/typebox";
import { strictObject } from "./envelopes.js";
import { CommandHashSchema, StateHashSchema } from "./hashes.js";
import {
  CampaignIdSchema,
  CommandIdSchema,
  TransactionIdSchema,
} from "./ids.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "./validation.js";
import { SchemaVersionSchema } from "./versions.js";

export const COMMAND_REJECTION_CODES = [
  "campaign_not_found",
  "content_manifest_mismatch",
  "engine_legality",
  "expected_revision_mismatch",
  "required_content_unavailable",
  "storage_migration_required",
] as const;

export const NON_CANONICAL_COMMAND_FAILURE_CODES = [
  "command_identity_collision",
  "malformed_command",
  "recovery_required",
  "storage_incompatible",
  "transaction_identity_collision",
] as const;

export const CommandRejectionCodeSchema = Type.Union(
  COMMAND_REJECTION_CODES.map((code) => Type.Literal(code)),
);
export const NonCanonicalCommandFailureCodeSchema = Type.Union(
  NON_CANONICAL_COMMAND_FAILURE_CODES.map((code) => Type.Literal(code)),
);

const TimestampSchema = Type.String({
  pattern:
    "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$",
});
const SafeDetailSchema = Type.String({ minLength: 1, maxLength: 240 });

const TransactionCommon = {
  schema_version: SchemaVersionSchema,
  campaign_id: CampaignIdSchema,
  command_id: CommandIdSchema,
  command_hash: CommandHashSchema,
  transaction_id: TransactionIdSchema,
  first_revision: Type.Integer({ minimum: 1 }),
  last_revision: Type.Integer({ minimum: 1 }),
  event_count: Type.Integer({ minimum: 1 }),
  pre_state_hash: StateHashSchema,
  post_state_hash: StateHashSchema,
  committed_at: TimestampSchema,
};

export const AcceptedTransactionRecordSchema = strictObject({
  ...TransactionCommon,
  outcome: Type.Literal("accepted"),
});
export const RejectedTransactionRecordSchema = strictObject({
  ...TransactionCommon,
  outcome: Type.Literal("rejected"),
  rejection_code: CommandRejectionCodeSchema,
  safe_detail: SafeDetailSchema,
});
export const UndoTransactionRecordSchema = strictObject({
  ...TransactionCommon,
  outcome: Type.Literal("undo"),
  undo_target_transaction_id: TransactionIdSchema,
});
export const CommittedTransactionRecordSchema = Type.Union([
  AcceptedTransactionRecordSchema,
  RejectedTransactionRecordSchema,
  UndoTransactionRecordSchema,
]);

export type CommandRejectionCode = Static<typeof CommandRejectionCodeSchema>;
export type NonCanonicalCommandFailureCode = Static<
  typeof NonCanonicalCommandFailureCodeSchema
>;
export type CommittedTransactionRecord = Static<
  typeof CommittedTransactionRecordSchema
>;

export function validateCommittedTransactionRecord(
  input: unknown,
): ValidationResult<CommittedTransactionRecord> {
  const structural = validateValue(CommittedTransactionRecordSchema, input);
  if (!structural.success) return structural;
  const transaction = structural.value;
  const issues: ValidationIssue[] = [];
  if (
    transaction.last_revision - transaction.first_revision + 1 !==
    transaction.event_count
  ) {
    issues.push({
      path: "$.event_count",
      code: "transaction.non_contiguous_range",
      message: "Event count must exactly fill the transaction revision range.",
    });
  }
  if (
    transaction.outcome === "rejected" &&
    transaction.pre_state_hash !== transaction.post_state_hash
  ) {
    issues.push({
      path: "$.post_state_hash",
      code: "transaction.rejection_changed_state",
      message: "A rejected command must preserve the mechanical state hash.",
    });
  }
  return issues.length === 0
    ? { success: true, value: transaction }
    : validationFailure(issues);
}
