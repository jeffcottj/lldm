import { Type, type Static } from "@sinclair/typebox";
import { strictObject } from "./envelopes.js";
import {
  ContentManifestHashSchema,
  PresentationManifestHashSchema,
} from "./hashes.js";
import {
  GuidedBeatIdSchema,
  GuidedOptionIdSchema,
  PresentationManifestIdSchema,
  SeatIdSchema,
  StarterLoadoutIdSchema,
  CharacterIdSchema,
  ContentDefinitionIdSchema,
  ZoneIdSchema,
} from "./ids.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "./validation.js";
import {
  GuidedPresentationVersionSchema,
  SchemaVersionSchema,
} from "./versions.js";

export const GuidedOutcomeSchema = Type.Union([
  Type.Literal("selected_option"),
  Type.Literal("Crisis"),
  Type.Literal("Setback"),
  Type.Literal("Success"),
  Type.Literal("Triumph"),
  Type.Literal("combat_victory"),
  Type.Literal("withdrawal"),
  Type.Literal("defeat"),
  Type.Literal("cost"),
  Type.Literal("continue"),
]);

export const GuidedBeatKindSchema = Type.Union([
  Type.Literal("opening"),
  Type.Literal("private_clue"),
  Type.Literal("challenge"),
  Type.Literal("social"),
  Type.Literal("ritual"),
  Type.Literal("combat"),
  Type.Literal("mandatory_physical"),
  Type.Literal("optional_spark"),
  Type.Literal("merge"),
  Type.Literal("conclusion"),
]);

export const GuidedOperationTemplateSchema = Type.Union([
  strictObject({ kind: Type.Literal("room_choice") }),
  strictObject({ kind: Type.Literal("deliver_private_clue") }),
  strictObject({
    kind: Type.Literal("start_challenge"),
    definition_id: Type.String({ minLength: 3, maxLength: 128 }),
  }),
  strictObject({ kind: Type.Literal("advance_challenge") }),
  strictObject({
    kind: Type.Literal("establish_social"),
    definition_id: Type.String({ minLength: 3, maxLength: 128 }),
  }),
  strictObject({ kind: Type.Literal("attempt_social_shift") }),
  strictObject({
    kind: Type.Literal("start_ritual"),
    definition_id: Type.String({ minLength: 3, maxLength: 128 }),
  }),
  strictObject({ kind: Type.Literal("resolve_ritual") }),
  strictObject({
    kind: Type.Literal("start_combat"),
    variant_key: Type.Union([
      Type.Literal("party_3"),
      Type.Literal("party_4"),
      Type.Literal("party_5"),
    ]),
  }),
  strictObject({ kind: Type.Literal("combat_action") }),
  strictObject({
    kind: Type.Literal("resolve_check"),
    physical: Type.Boolean(),
    spark_eligible: Type.Boolean(),
  }),
  strictObject({ kind: Type.Literal("scene_transition") }),
  strictObject({ kind: Type.Literal("conclude") }),
]);

export const GuidedBeatSchema = strictObject({
  beat_id: GuidedBeatIdSchema,
  revision: Type.Integer({ minimum: 1 }),
  kind: GuidedBeatKindSchema,
  visibility: Type.Union([
    Type.Literal("public"),
    Type.Literal("seat_private"),
  ]),
  addressed_seat_id: Type.Optional(SeatIdSchema),
  public_text: Type.String({ minLength: 1, maxLength: 480 }),
  private_text: Type.Optional(Type.String({ minLength: 1, maxLength: 320 })),
  options: Type.Array(
    strictObject({
      option_id: GuidedOptionIdSchema,
      label: Type.String({ minLength: 1, maxLength: 100 }),
      stakes: Type.String({ minLength: 1, maxLength: 240 }),
    }),
    { maxItems: 6 },
  ),
  operation: GuidedOperationTemplateSchema,
  transitions: Type.Array(
    strictObject({
      on: GuidedOutcomeSchema,
      option_id: Type.Optional(GuidedOptionIdSchema),
      to: GuidedBeatIdSchema,
    }),
    { maxItems: 12 },
  ),
  checkpoint: Type.Boolean(),
  declared_merge: Type.Boolean(),
  terminal_conclusion: Type.Union([
    Type.Null(),
    Type.Union([
      Type.Literal("clean_success"),
      Type.Literal("success_with_cost"),
      Type.Literal("withdrawal"),
      Type.Literal("defeat"),
    ]),
  ]),
  recent_summary: Type.String({ minLength: 1, maxLength: 180 }),
  tv_mode: Type.Union([
    Type.Literal("scene"),
    Type.Literal("choice"),
    Type.Literal("map"),
    Type.Literal("physical_roll"),
    Type.Literal("conclusion"),
  ]),
});

export const NormalizedMapLayoutSchema = strictObject({
  layout_id: Type.String({ minLength: 3, maxLength: 128 }),
  zones: Type.Array(
    strictObject({
      zone_id: ZoneIdSchema,
      x: Type.Number({ minimum: 0, maximum: 100 }),
      y: Type.Number({ minimum: 0, maximum: 100 }),
      width: Type.Number({ exclusiveMinimum: 0, maximum: 100 }),
      height: Type.Number({ exclusiveMinimum: 0, maximum: 100 }),
      shape: Type.Union([Type.Literal("rect"), Type.Literal("ellipse")]),
    }),
    { minItems: 5, maxItems: 9 },
  ),
  connections: Type.Array(
    strictObject({ from: ZoneIdSchema, to: ZoneIdSchema }),
    { minItems: 4, maxItems: 24 },
  ),
});

export const GuidedPresentationManifestSchema = strictObject({
  schema_version: SchemaVersionSchema,
  guided_presentation_version: GuidedPresentationVersionSchema,
  presentation_manifest_id: PresentationManifestIdSchema,
  presentation_manifest_hash: PresentationManifestHashSchema,
  mechanical_manifest_hash: ContentManifestHashSchema,
  start_beat_id: GuidedBeatIdSchema,
  beats: Type.Array(GuidedBeatSchema, { minItems: 10, maxItems: 64 }),
  map_layout: NormalizedMapLayoutSchema,
  narration_templates: Type.Array(
    strictObject({
      template_id: Type.String({ minLength: 3, maxLength: 128 }),
      text: Type.String({ minLength: 1, maxLength: 480 }),
    }),
    { minItems: 1, maxItems: 128 },
  ),
  starter_summaries: Type.Array(
    strictObject({
      starter_loadout_id: StarterLoadoutIdSchema,
      character_id: CharacterIdSchema,
      display_name: Type.String({ minLength: 1, maxLength: 80 }),
      archetype_ref: ContentDefinitionIdSchema,
      signature: Type.String({ minLength: 1, maxLength: 240 }),
      drive: Type.String({ minLength: 1, maxLength: 240 }),
    }),
    { minItems: 6, maxItems: 6 },
  ),
});

export const NarrationBriefSchema = strictObject({
  schema_version: SchemaVersionSchema,
  committed_fact_codes: Type.Array(
    Type.String({ minLength: 1, maxLength: 80 }),
    { maxItems: 16 },
  ),
  allowed_template_ids: Type.Array(
    Type.String({ minLength: 3, maxLength: 128 }),
    { minItems: 1, maxItems: 8 },
  ),
  fallback_text: Type.String({ minLength: 1, maxLength: 240 }),
});

export const NarrationSelectionSchema = strictObject({
  schema_version: SchemaVersionSchema,
  template_id: Type.String({ minLength: 3, maxLength: 128 }),
});

export type GuidedBeat = Static<typeof GuidedBeatSchema>;
export type GuidedOutcome = Static<typeof GuidedOutcomeSchema>;
export type GuidedPresentationManifest = Static<
  typeof GuidedPresentationManifestSchema
>;
export type NarrationBrief = Static<typeof NarrationBriefSchema>;
export type NarrationSelection = Static<typeof NarrationSelectionSchema>;
export type NormalizedMapLayout = Static<typeof NormalizedMapLayoutSchema>;

export function validateGuidedPresentationManifest(
  input: unknown,
): ValidationResult<GuidedPresentationManifest> {
  const structural = validateValue(GuidedPresentationManifestSchema, input);
  if (!structural.success) return structural;
  const manifest = structural.value;
  const issues: ValidationIssue[] = [];
  const byId = new Map<string, GuidedBeat>();
  for (const [index, beat] of manifest.beats.entries()) {
    if (byId.has(beat.beat_id))
      issues.push({
        path: `$.beats[${index}].beat_id`,
        code: "guided.duplicate_beat",
        message: "Beat IDs must be unique.",
      });
    byId.set(beat.beat_id, beat);
    if (
      beat.visibility === "seat_private" &&
      (beat.addressed_seat_id === undefined || beat.private_text === undefined)
    )
      issues.push({
        path: `$.beats[${index}].visibility`,
        code: "guided.private_address_required",
        message: "Private beats require a seat and private text.",
      });
    if (beat.terminal_conclusion !== null && beat.transitions.length !== 0)
      issues.push({
        path: `$.beats[${index}].transitions`,
        code: "guided.terminal_has_transition",
        message: "Terminal beats cannot transition.",
      });
    const optionIds = new Set(beat.options.map(({ option_id }) => option_id));
    for (const [transitionIndex, transition] of beat.transitions.entries()) {
      if (
        transition.on === "selected_option" &&
        (transition.option_id === undefined ||
          !optionIds.has(transition.option_id))
      )
        issues.push({
          path: `$.beats[${index}].transitions[${transitionIndex}]`,
          code: "guided.unknown_option_transition",
          message: "Choice transition must name a declared option.",
        });
    }
  }
  if (!byId.has(manifest.start_beat_id))
    issues.push({
      path: "$.start_beat_id",
      code: "guided.missing_start",
      message: "Start beat must exist.",
    });
  for (const [index, beat] of manifest.beats.entries())
    for (const transition of beat.transitions)
      if (!byId.has(transition.to))
        issues.push({
          path: `$.beats[${index}].transitions`,
          code: "guided.dangling_transition",
          message: `Transition target ${transition.to} does not exist.`,
        });

  const visited = new Set<string>();
  const active = new Set<string>();
  const walk = (id: string): void => {
    if (active.has(id)) {
      const beat = byId.get(id);
      if (beat?.declared_merge !== true)
        issues.push({
          path: "$.beats",
          code: "guided.unintended_cycle",
          message: `Cycle reaches ${id} without a declared merge.`,
        });
      return;
    }
    if (visited.has(id)) return;
    visited.add(id);
    active.add(id);
    for (const transition of byId.get(id)?.transitions ?? [])
      walk(transition.to);
    active.delete(id);
  };
  walk(manifest.start_beat_id);
  if (visited.size !== manifest.beats.length)
    issues.push({
      path: "$.beats",
      code: "guided.unreachable_beat",
      message: "Every guided beat must be reachable from the start.",
    });
  const kinds = new Set(manifest.beats.map(({ kind }) => kind));
  for (const required of [
    "private_clue",
    "challenge",
    "social",
    "ritual",
    "combat",
    "mandatory_physical",
    "optional_spark",
  ] as const)
    if (!kinds.has(required))
      issues.push({
        path: "$.beats",
        code: `guided.missing_${required}`,
        message: `Graph requires a ${required} beat.`,
      });
  const conclusions = new Set(
    manifest.beats
      .map(({ terminal_conclusion }) => terminal_conclusion)
      .filter((value) => value !== null),
  );
  for (const required of [
    "clean_success",
    "success_with_cost",
    "withdrawal",
    "defeat",
  ] as const)
    if (!conclusions.has(required))
      issues.push({
        path: "$.beats",
        code: `guided.missing_${required}`,
        message: `Graph requires a ${required} conclusion.`,
      });
  const layoutZoneIds = new Set(
    manifest.map_layout.zones.map(({ zone_id }) => zone_id),
  );
  for (const [index, connection] of manifest.map_layout.connections.entries())
    if (
      !layoutZoneIds.has(connection.from) ||
      !layoutZoneIds.has(connection.to)
    )
      issues.push({
        path: `$.map_layout.connections[${index}]`,
        code: "guided.layout_unknown_zone",
        message: "Layout connection must reference declared layout zones.",
      });
  return issues.length === 0
    ? { success: true, value: manifest }
    : validationFailure(issues);
}
