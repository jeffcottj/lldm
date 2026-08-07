import { Type, type Static } from "@sinclair/typebox";
import { strictObject } from "./envelopes.js";
import { SeedFingerprintSchema } from "./hashes.js";
import { CampaignIdSchema, CommandIdSchema } from "./ids.js";
import {
  RandomnessAlgorithmVersionSchema,
  SchemaVersionSchema,
} from "./versions.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "./validation.js";

export const RandomPurposeSchema = Type.String({
  minLength: 1,
  maxLength: 96,
  pattern: "^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$",
});

export const RandomDrawRecordSchema = strictObject({
  schema_version: SchemaVersionSchema,
  algorithm_version: RandomnessAlgorithmVersionSchema,
  seed_fingerprint: SeedFingerprintSchema,
  campaign_id: CampaignIdSchema,
  command_id: CommandIdSchema,
  purpose: RandomPurposeSchema,
  purpose_local_index: Type.Integer({ minimum: 0 }),
  minimum: Type.Integer(),
  maximum: Type.Integer(),
  realized_value: Type.Integer(),
  rejection_count: Type.Integer({ minimum: 0 }),
});

export type RandomPurpose = Static<typeof RandomPurposeSchema>;
export type RandomDrawRecord = Static<typeof RandomDrawRecordSchema>;

export function validateRandomDrawRecord(
  input: unknown,
): ValidationResult<RandomDrawRecord> {
  const structural = validateValue(RandomDrawRecordSchema, input);
  if (!structural.success) return structural;
  const draw = structural.value;
  const issues: ValidationIssue[] = [];
  if (draw.minimum > draw.maximum) {
    issues.push({
      path: "$.maximum",
      code: "random.invalid_range",
      message: "Maximum must be greater than or equal to minimum.",
    });
  } else if (
    draw.realized_value < draw.minimum ||
    draw.realized_value > draw.maximum
  ) {
    issues.push({
      path: "$.realized_value",
      code: "random.value_out_of_range",
      message: "Realized value must fall within the requested range.",
    });
  }
  return issues.length === 0
    ? { success: true, value: draw }
    : validationFailure(issues);
}
