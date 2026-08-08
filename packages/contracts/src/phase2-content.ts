import { Type, type Static } from "@sinclair/typebox";
import { strictObject } from "./envelopes.js";
import { ActorIdSchema, ObjectiveIdSchema, ZoneIdSchema } from "./ids.js";
import { ResolvedContentReferenceSchema } from "./domains/playable-characters.js";
import { SchemaVersionSchema } from "./versions.js";
import {
  type ValidationResult,
  validateValue,
  validationFailure,
} from "./validation.js";

export const EncounterCompositionVariantSchema = strictObject({
  schema_version: SchemaVersionSchema,
  record_kind: Type.Literal("encounter_composition_variant"),
  variant_key: Type.Union([
    Type.Literal("party_3"),
    Type.Literal("party_4"),
    Type.Literal("party_5"),
  ]),
  party_size: Type.Union([Type.Literal(3), Type.Literal(4), Type.Literal(5)]),
  hero_starting_zones: Type.Array(ZoneIdSchema, { minItems: 3, maxItems: 5 }),
  enemies: Type.Array(
    strictObject({
      actor_id: ActorIdSchema,
      definition: ResolvedContentReferenceSchema,
      starting_zone_id: ZoneIdSchema,
      reinforcement: Type.Boolean(),
    }),
    { minItems: 1, maxItems: 12 },
  ),
  reinforcement_trigger: Type.Union([
    Type.Literal("none"),
    Type.Literal("round_2"),
    Type.Literal("objective_progress_2"),
  ]),
  primary_objective_id: ObjectiveIdSchema,
  objective_definition: ResolvedContentReferenceSchema,
  boss_overlay_definition: ResolvedContentReferenceSchema,
  objective_pressure: Type.Integer({ minimum: 1, maximum: 5 }),
});

export const Phase2EncounterVariantsSchema = Type.Tuple([
  EncounterCompositionVariantSchema,
  EncounterCompositionVariantSchema,
  EncounterCompositionVariantSchema,
]);

export type EncounterCompositionVariant = Static<
  typeof EncounterCompositionVariantSchema
>;

export function validatePhase2EncounterVariants(
  input: unknown,
): ValidationResult<readonly EncounterCompositionVariant[]> {
  const structural = validateValue(Phase2EncounterVariantsSchema, input);
  if (!structural.success) return structural;
  const variants = structural.value;
  const expected = [3, 4, 5] as const;
  for (const [index, size] of expected.entries()) {
    const variant = variants[index];
    if (
      variant === undefined ||
      variant.party_size !== size ||
      variant.variant_key !== `party_${size}` ||
      variant.hero_starting_zones.length !== size
    )
      return validationFailure([
        {
          path: `$[${index}]`,
          code: "encounter.party_variant_mismatch",
          message: `Variant ${index} must author party size ${size}.`,
        },
      ]);
  }
  return { success: true, value: variants };
}
