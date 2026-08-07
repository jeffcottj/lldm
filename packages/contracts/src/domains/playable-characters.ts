import { Type, type Static } from "@sinclair/typebox";
import {
  CharacterFoundationSchema,
  SignificantGearSlotsSchema,
} from "../characters.js";
import { commandEnvelope, eventEnvelope, strictObject } from "../envelopes.js";
import {
  CharacterIdSchema,
  ConditionIdSchema,
  ContentDefinitionIdSchema,
  RitualIdSchema,
  SceneIdSchema,
  WoundIdSchema,
} from "../ids.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "../validation.js";
import {
  ContentDefinitionRevisionSchema,
  SchemaVersionSchema,
} from "../versions.js";
import {
  CONDITION_DURATIONS,
  EXERTION_MAXIMUM,
} from "../mechanical-constants.js";

export const CHARACTER_RANKS = [1, 2, 3, 4] as const;
export const CharacterRankSchema = Type.Union(
  CHARACTER_RANKS.map((rank) => Type.Literal(rank)),
);

export const ResolvedContentReferenceSchema = strictObject({
  content_definition_id: ContentDefinitionIdSchema,
  definition_revision: ContentDefinitionRevisionSchema,
});

const NullableResolvedContentReferenceSchema = Type.Union([
  Type.Null(),
  ResolvedContentReferenceSchema,
]);

function significantGearSelectionSlotSchema<Slot extends 1 | 2 | 3 | 4>(
  slot: Slot,
) {
  return strictObject({
    slot: Type.Literal(slot),
    definition: NullableResolvedContentReferenceSchema,
  });
}

export const SignificantGearSelectionSlotsSchema = Type.Tuple([
  significantGearSelectionSlotSchema(1),
  significantGearSelectionSlotSchema(2),
  significantGearSelectionSlotSchema(3),
  significantGearSelectionSlotSchema(4),
]);

function resolvedSignificantGearSlotSchema<Slot extends 1 | 2 | 3 | 4>(
  slot: Slot,
) {
  return Type.Union([
    strictObject({
      slot: Type.Literal(slot),
      definition: Type.Null(),
      status: Type.Literal("empty"),
    }),
    strictObject({
      slot: Type.Literal(slot),
      definition: ResolvedContentReferenceSchema,
      status: Type.Union([Type.Literal("ready"), Type.Literal("spent")]),
    }),
  ]);
}

export const ResolvedSignificantGearSlotsSchema = Type.Tuple([
  resolvedSignificantGearSlotSchema(1),
  resolvedSignificantGearSlotSchema(2),
  resolvedSignificantGearSlotSchema(3),
  resolvedSignificantGearSlotSchema(4),
]);

export const ResolvedCharacterOptionsSchema = strictObject({
  heritage_gift: ResolvedContentReferenceSchema,
  upbringing: ResolvedContentReferenceSchema,
  archetype: ResolvedContentReferenceSchema,
  path: NullableResolvedContentReferenceSchema,
  talent: NullableResolvedContentReferenceSchema,
  capstone: NullableResolvedContentReferenceSchema,
  signature_technique: ResolvedContentReferenceSchema,
});

function woundSlotSchema<Slot extends 1 | 2 | 3>(slot: Slot) {
  return Type.Union([
    strictObject({ slot: Type.Literal(slot), status: Type.Literal("empty") }),
    strictObject({
      slot: Type.Literal(slot),
      status: Type.Literal("filled"),
      wound_id: WoundIdSchema,
      name: Type.String({ minLength: 1, maxLength: 80 }),
    }),
  ]);
}

export const WoundSlotsSchema = Type.Tuple([
  woundSlotSchema(1),
  woundSlotSchema(2),
  woundSlotSchema(3),
]);

export const CharacterResourceStateSchema = strictObject({
  guard: strictObject({
    current: Type.Integer({ minimum: 0 }),
    maximum: Type.Integer({ minimum: 1 }),
  }),
  wounds: WoundSlotsSchema,
  exertion: strictObject({
    current: Type.Integer({ minimum: 0, maximum: EXERTION_MAXIMUM }),
    maximum: Type.Literal(EXERTION_MAXIMUM),
  }),
  spark: strictObject({
    available: Type.Boolean(),
    complication_recovery_used: Type.Boolean(),
  }),
});

export const SceneAbilityUseSchema = strictObject({
  ability: ResolvedContentReferenceSchema,
  used: Type.Boolean(),
});

export const CharacterConditionSchema = strictObject({
  condition_id: ConditionIdSchema,
  definition: ResolvedContentReferenceSchema,
  source: Type.String({ minLength: 1, maxLength: 120 }),
  duration: Type.Union(
    CONDITION_DURATIONS.map((duration) => Type.Literal(duration)),
  ),
});

export const PlayableCharacterStateSchema = strictObject({
  schema_version: SchemaVersionSchema,
  record_kind: Type.Literal("playable_character_state"),
  character_id: CharacterIdSchema,
  foundation: CharacterFoundationSchema,
  rank: CharacterRankSchema,
  resolved_options: ResolvedCharacterOptionsSchema,
  resources: CharacterResourceStateSchema,
  significant_gear: SignificantGearSlotsSchema,
  resolved_significant_gear: ResolvedSignificantGearSlotsSchema,
  scene_ability_uses: Type.Array(SceneAbilityUseSchema, { maxItems: 32 }),
  conditions: Type.Array(CharacterConditionSchema, { maxItems: 32 }),
});

export type CharacterRank = Static<typeof CharacterRankSchema>;
export type ResolvedContentReference = Static<
  typeof ResolvedContentReferenceSchema
>;
export type PlayableCharacterState = Static<
  typeof PlayableCharacterStateSchema
>;
export type CharacterCondition = Static<typeof CharacterConditionSchema>;

function duplicateIssues(
  values: readonly string[],
  path: string,
  code: string,
): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  values.forEach((value, index) => {
    if (seen.has(value)) {
      issues.push({
        path: `${path}[${index}]`,
        code,
        message: `${value} appears more than once.`,
      });
    }
    seen.add(value);
  });
  return issues;
}

export function validatePlayableCharacterState(
  input: unknown,
): ValidationResult<PlayableCharacterState> {
  const structural = validateValue(PlayableCharacterStateSchema, input);
  if (!structural.success) return structural;
  const character = structural.value;
  const issues: ValidationIssue[] = [];

  if (character.character_id !== character.foundation.character_id) {
    issues.push({
      path: "$.foundation.character_id",
      code: "playable.foundation_identity_mismatch",
      message: "Playable and foundation character identities must match.",
    });
  }
  if (character.resources.guard.current > character.resources.guard.maximum) {
    issues.push({
      path: "$.resources.guard.current",
      code: "resource.guard_overflow",
      message: "Current Guard cannot exceed maximum Guard.",
    });
  }
  if (
    JSON.stringify(character.significant_gear) !==
    JSON.stringify(character.foundation.significant_gear)
  ) {
    issues.push({
      path: "$.significant_gear",
      code: "playable.gear_narrative_mismatch",
      message: "Playable significant-gear text must match its foundation.",
    });
  }
  character.resolved_significant_gear.forEach((gear, index) => {
    const narrative = character.significant_gear[index];
    if (
      narrative === undefined ||
      (narrative.item === null) !== (gear.status === "empty")
    ) {
      issues.push({
        path: `$.resolved_significant_gear[${index}]`,
        code: "playable.gear_binding_mismatch",
        message:
          "An occupied narrative gear slot requires mechanics and an empty slot forbids them.",
      });
    }
  });

  const options = character.resolved_options;
  const required = {
    path: character.rank >= 2,
    talent: character.rank >= 3,
    capstone: character.rank >= 4,
  } as const;
  for (const [feature, isRequired] of Object.entries(required)) {
    const value = options[feature as keyof typeof required];
    if (isRequired && value === null) {
      issues.push({
        path: `$.resolved_options.${feature}`,
        code: "rank.missing_feature",
        message: `Rank ${character.rank} requires a ${feature}.`,
      });
    }
    if (!isRequired && value !== null) {
      issues.push({
        path: `$.resolved_options.${feature}`,
        code: "rank.feature_too_early",
        message: `${feature} is unavailable at rank ${character.rank}.`,
      });
    }
  }

  issues.push(
    ...duplicateIssues(
      character.resources.wounds.flatMap((slot) =>
        slot.status === "filled" ? [slot.wound_id] : [],
      ),
      "$.resources.wounds",
      "wound.duplicate_identity",
    ),
    ...duplicateIssues(
      character.scene_ability_uses.map(
        ({ ability }) => ability.content_definition_id,
      ),
      "$.scene_ability_uses",
      "scene_use.duplicate_ability",
    ),
    ...duplicateIssues(
      character.conditions.map(({ condition_id }) => condition_id),
      "$.conditions",
      "condition.duplicate_identity",
    ),
  );

  return issues.length === 0
    ? { success: true, value: character }
    : validationFailure(issues);
}

export function validateResourceTransition(input: {
  readonly resource: "guard" | "exertion" | "supply";
  readonly current: number;
  readonly delta: number;
  readonly maximum: number;
}): ValidationResult<number> {
  const next = input.current + input.delta;
  if (!Number.isInteger(next) || next < 0) {
    return validationFailure([
      {
        path: "$.delta",
        code: "resource.underflow",
        message: `${input.resource} cannot fall below zero.`,
      },
    ]);
  }
  if (!Number.isInteger(input.maximum) || next > input.maximum) {
    return validationFailure([
      {
        path: "$.delta",
        code: "resource.overflow",
        message: `${input.resource} cannot exceed ${input.maximum}.`,
      },
    ]);
  }
  return { success: true, value: next };
}

export function validateSparkRecoveryEligibility(
  spark: PlayableCharacterState["resources"]["spark"],
): ValidationResult<true> {
  if (spark.complication_recovery_used) {
    return validationFailure([
      {
        path: "$.resources.spark.complication_recovery_used",
        code: "resource.spark_recovery_already_used",
        message:
          "Drive/Bond Spark recovery is available only once per session.",
      },
    ]);
  }
  if (spark.available) {
    return validationFailure([
      {
        path: "$.resources.spark.available",
        code: "resource.spark_already_available",
        message: "Spark cannot be recovered while it is already available.",
      },
    ]);
  }
  return { success: true, value: true };
}

export function validateRankAdvancement(input: {
  readonly current_rank: CharacterRank;
  readonly requested_rank: number;
  readonly required_content_available: boolean;
}): ValidationResult<CharacterRank> {
  if (input.requested_rank !== input.current_rank + 1) {
    return validationFailure([
      {
        path: "$.requested_rank",
        code: "rank.skipped_or_replaced",
        message: "Advancement must move exactly one rank forward.",
      },
    ]);
  }
  if (!CHARACTER_RANKS.includes(input.requested_rank as CharacterRank)) {
    return validationFailure([
      {
        path: "$.requested_rank",
        code: "rank.out_of_range",
        message: "Phase 1 structure supports ranks 1 through 4.",
      },
    ]);
  }
  if (!input.required_content_available) {
    return validationFailure([
      {
        path: "$.required_content_available",
        code: "rank.required_content_unavailable",
        message:
          "The pinned manifest does not provide the required rank feature.",
      },
    ]);
  }
  return { success: true, value: input.requested_rank as CharacterRank };
}

export const MaterializeCharacterCommandSchema = commandEnvelope(
  Type.Literal("materialize_character"),
  strictObject({
    foundation: CharacterFoundationSchema,
    significant_gear: SignificantGearSelectionSlotsSchema,
  }),
);

export const SpendResourceCommandSchema = commandEnvelope(
  Type.Literal("spend_resource"),
  strictObject({
    character_id: CharacterIdSchema,
    resource: Type.Union([Type.Literal("exertion"), Type.Literal("supply")]),
    amount: Type.Integer({ minimum: 1 }),
    reason: Type.String({ minLength: 1, maxLength: 120 }),
  }),
);

export const RecoverResourceCommandSchema = commandEnvelope(
  Type.Literal("recover_resource"),
  strictObject({
    character_id: CharacterIdSchema,
    resource: Type.Union([
      Type.Literal("guard"),
      Type.Literal("exertion"),
      Type.Literal("supply"),
    ]),
    amount: Type.Integer({ minimum: 1 }),
    source: ResolvedContentReferenceSchema,
  }),
);

export const RecoverSparkComplicationCommandSchema = commandEnvelope(
  Type.Literal("recover_spark_complication"),
  strictObject({
    character_id: CharacterIdSchema,
    basis: Type.Union([Type.Literal("drive"), Type.Literal("bond")]),
    complication: Type.String({ minLength: 1, maxLength: 240 }),
  }),
);

export const TakeCostlyRestCommandSchema = commandEnvelope(
  Type.Literal("take_costly_rest"),
  strictObject({
    character_ids: Type.Array(CharacterIdSchema, {
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
    }),
  }),
);

export const AdvanceSceneCommandSchema = commandEnvelope(
  Type.Literal("advance_scene"),
  strictObject({
    scene_id: Type.Union([Type.Null(), SceneIdSchema]),
    next_scene_id: SceneIdSchema,
    boundary: Type.Union([
      Type.Literal("scene"),
      Type.Literal("session_start"),
      Type.Literal("session_end"),
    ]),
  }),
);

export const AdvanceRankCommandSchema = commandEnvelope(
  Type.Literal("advance_rank"),
  strictObject({
    // The current-rank guard; a successful command advances exactly one rank.
    character_id: CharacterIdSchema,
    expected_rank: CharacterRankSchema,
    selected_feature: ResolvedContentReferenceSchema,
  }),
);

export const CharacterMaterializedEventSchema = eventEnvelope(
  Type.Literal("character_materialized"),
  strictObject({ character: PlayableCharacterStateSchema }),
);

export const SignificantGearSpentEventSchema = eventEnvelope(
  Type.Literal("significant_gear_spent"),
  strictObject({
    character_id: CharacterIdSchema,
    slot: Type.Union([
      Type.Literal(1),
      Type.Literal(2),
      Type.Literal(3),
      Type.Literal(4),
    ]),
    definition: ResolvedContentReferenceSchema,
    ritual_id: RitualIdSchema,
  }),
);

export const ResourceChangedEventSchema = eventEnvelope(
  Type.Literal("resource_changed"),
  strictObject({
    owner: Type.Union([
      strictObject({
        scope: Type.Literal("character"),
        character_id: CharacterIdSchema,
      }),
      strictObject({ scope: Type.Literal("party") }),
    ]),
    resource: Type.Union([
      Type.Literal("guard"),
      Type.Literal("exertion"),
      Type.Literal("supply"),
    ]),
    previous: Type.Integer({ minimum: 0 }),
    current: Type.Integer({ minimum: 0 }),
    reason: Type.String({ minLength: 1, maxLength: 120 }),
  }),
);

export const SparkRecoveredEventSchema = eventEnvelope(
  Type.Literal("spark_recovered"),
  strictObject({
    character_id: CharacterIdSchema,
    basis: Type.Union([Type.Literal("drive"), Type.Literal("bond")]),
    complication: Type.String({ minLength: 1, maxLength: 240 }),
  }),
);

export const CostlyRestCompletedEventSchema = eventEnvelope(
  Type.Literal("costly_rest_completed"),
  strictObject({
    character_ids: Type.Array(CharacterIdSchema, {
      minItems: 1,
      maxItems: 5,
      uniqueItems: true,
    }),
    supply_spent: Type.Integer({ minimum: 0 }),
  }),
);

export const SceneResourcesResetEventSchema = eventEnvelope(
  Type.Literal("scene_resources_reset"),
  strictObject({
    scene_id: Type.Union([Type.Null(), SceneIdSchema]),
    next_scene_id: SceneIdSchema,
    boundary: Type.Union([
      Type.Literal("scene"),
      Type.Literal("session_start"),
      Type.Literal("session_end"),
    ]),
    reset_character_ids: Type.Array(CharacterIdSchema, {
      maxItems: 5,
      uniqueItems: true,
    }),
  }),
);

export const RankAdvancedEventSchema = eventEnvelope(
  Type.Literal("rank_advanced"),
  strictObject({
    character_id: CharacterIdSchema,
    previous_rank: CharacterRankSchema,
    current_rank: CharacterRankSchema,
    feature: ResolvedContentReferenceSchema,
  }),
);

export const SceneAbilityUsedEventSchema = eventEnvelope(
  Type.Literal("scene_ability_used"),
  strictObject({
    character_id: CharacterIdSchema,
    ability: ResolvedContentReferenceSchema,
  }),
);

export const ConditionAppliedEventSchema = eventEnvelope(
  Type.Literal("condition_applied"),
  strictObject({
    character_id: CharacterIdSchema,
    condition: CharacterConditionSchema,
  }),
);

export const ConditionRemovedEventSchema = eventEnvelope(
  Type.Literal("condition_removed"),
  strictObject({
    character_id: CharacterIdSchema,
    condition_id: ConditionIdSchema,
    reason: Type.String({ minLength: 1, maxLength: 120 }),
  }),
);

export type MaterializeCharacterCommand = Static<
  typeof MaterializeCharacterCommandSchema
>;
