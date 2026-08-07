import { Type, type Static } from "@sinclair/typebox";
import {
  ATTRIBUTES,
  AttributeRatingSchema,
  AttributeSchema,
  DISCIPLINES,
  DisciplineRatingSchema,
  DisciplineSchema,
} from "./checks.js";
import { strictObject } from "./envelopes.js";
import {
  ActorIdSchema,
  CharacterIdSchema,
  ContentDefinitionIdSchema,
} from "./ids.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "./validation.js";
import { SchemaVersionSchema } from "./versions.js";

const NarrativeTextSchema = Type.String({ minLength: 1 });
const OptionalNarrativeTextSchema = Type.String();

export const AttributeAssignmentSchema = strictObject({
  attribute: AttributeSchema,
  rating: AttributeRatingSchema,
});
export const DisciplineAssignmentSchema = strictObject({
  discipline: DisciplineSchema,
  rating: DisciplineRatingSchema,
});

function gearSlotSchema<Slot extends 1 | 2 | 3 | 4>(slot: Slot) {
  return strictObject({
    slot: Type.Literal(slot),
    item: Type.Union([
      Type.Null(),
      strictObject({
        label: NarrativeTextSchema,
        note: Type.Optional(OptionalNarrativeTextSchema),
      }),
    ]),
  });
}

export const SignificantGearSlotsSchema = Type.Tuple([
  gearSlotSchema(1),
  gearSlotSchema(2),
  gearSlotSchema(3),
  gearSlotSchema(4),
]);

export const CharacterFoundationSchema = strictObject({
  schema_version: SchemaVersionSchema,
  record_kind: Type.Literal("character_foundation"),
  character_id: CharacterIdSchema,
  actor_id: ActorIdSchema,
  display_name: NarrativeTextSchema,
  rank: Type.Literal(1),
  attributes: Type.Array(AttributeAssignmentSchema, {
    minItems: 4,
    maxItems: 4,
  }),
  disciplines: Type.Array(DisciplineAssignmentSchema, {
    minItems: 8,
    maxItems: 8,
  }),
  drive: NarrativeTextSchema,
  bond: NarrativeTextSchema,
  significant_gear: SignificantGearSlotsSchema,
  signature_technique_concept: NarrativeTextSchema,
  heritage_gift_ref: ContentDefinitionIdSchema,
  upbringing_ref: ContentDefinitionIdSchema,
  archetype_ref: ContentDefinitionIdSchema,
});

export type CharacterFoundation = Static<typeof CharacterFoundationSchema>;

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
  });
}

function textIssues(
  value: string,
  path: string,
  minimum: number,
  maximum: number,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const length = [...value].length;
  if (value !== value.trim()) {
    issues.push({
      path,
      code: "text.not_trimmed",
      message: "Leading and trailing whitespace are not allowed.",
    });
  }
  if (length < minimum || length > maximum) {
    issues.push({
      path,
      code: "text.code_point_length",
      message: `Expected ${minimum} to ${maximum} Unicode code points.`,
    });
  }
  if (containsControlCharacter(value)) {
    issues.push({
      path,
      code: "text.control_character",
      message: "Control characters are not allowed.",
    });
  }
  return issues;
}

function exactAssignmentIssues(
  actual: readonly string[],
  expected: readonly string[],
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const firstIndex = new Map<string, number>();
  actual.forEach((identifier, index) => {
    const earlierIndex = firstIndex.get(identifier);
    if (earlierIndex === undefined) {
      firstIndex.set(identifier, index);
      return;
    }
    issues.push({
      path: `${path}[${index}]`,
      code: "allocation.duplicate",
      message: `${identifier} duplicates the assignment at index ${earlierIndex}.`,
    });
  });
  expected.forEach((identifier) => {
    if (!firstIndex.has(identifier)) {
      issues.push({
        path,
        code: "allocation.missing",
        message: `${identifier} is missing.`,
      });
    }
  });
  return issues;
}

function ratingDistributionIssues(
  ratings: readonly number[],
  expectedCounts: Readonly<Record<number, number>>,
  path: string,
): ValidationIssue[] {
  const counts = new Map<number, number>();
  ratings.forEach((rating) => {
    counts.set(rating, (counts.get(rating) ?? 0) + 1);
  });
  const matches = Object.entries(expectedCounts).every(
    ([rating, count]) => counts.get(Number(rating)) === count,
  );
  return matches
    ? []
    : [
        {
          path,
          code: "allocation.distribution",
          message: "Ratings do not match the required starting allocation.",
        },
      ];
}

export function validateCharacterFoundation(
  input: unknown,
): ValidationResult<CharacterFoundation> {
  const structural = validateValue(CharacterFoundationSchema, input);
  if (!structural.success) {
    return structural;
  }

  const character = structural.value;
  const issues: ValidationIssue[] = [
    ...exactAssignmentIssues(
      character.attributes.map(({ attribute }) => attribute),
      ATTRIBUTES,
      "$.attributes",
    ),
    ...ratingDistributionIssues(
      character.attributes.map(({ rating }) => rating),
      { 0: 1, 1: 2, 2: 1 },
      "$.attributes",
    ),
    ...exactAssignmentIssues(
      character.disciplines.map(({ discipline }) => discipline),
      DISCIPLINES,
      "$.disciplines",
    ),
    ...ratingDistributionIssues(
      character.disciplines.map(({ rating }) => rating),
      { 0: 4, 1: 3, 2: 1 },
      "$.disciplines",
    ),
    ...textIssues(character.display_name, "$.display_name", 1, 40),
    ...textIssues(character.drive, "$.drive", 1, 160),
    ...textIssues(character.bond, "$.bond", 1, 160),
    ...textIssues(
      character.signature_technique_concept,
      "$.signature_technique_concept",
      1,
      160,
    ),
  ];

  character.significant_gear.forEach(({ item }, index) => {
    if (item === null) return;
    issues.push(
      ...textIssues(
        item.label,
        `$.significant_gear[${index}].item.label`,
        1,
        60,
      ),
    );
    if (item.note !== undefined) {
      issues.push(
        ...textIssues(
          item.note,
          `$.significant_gear[${index}].item.note`,
          0,
          120,
        ),
      );
    }
  });

  return issues.length > 0
    ? validationFailure(issues)
    : { success: true, value: character };
}
