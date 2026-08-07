import { Type, type Static } from "@sinclair/typebox";
import {
  AttributeRatingSchema,
  AttributeSchema,
  DisciplineRatingSchema,
  DisciplineSchema,
  OutcomeDegreeSchema,
  StandardTargetSchema,
} from "./checks.js";
import { contentDefinitionEnvelope, strictObject } from "./envelopes.js";
import { ContentDefinitionIdSchema } from "./ids.js";
import { CONDITION_DURATIONS } from "./mechanical-constants.js";
import { ActionSlotSchema, RangeBandSchema } from "./domains/combat.js";
import {
  InformationVisibilitySchema,
  SocialStanceSchema,
} from "./domains/social.js";
import {
  RitualCostSchema,
  RitualRequirementSchema,
} from "./domains/rituals.js";
import { ResolvedContentReferenceSchema } from "./domains/playable-characters.js";

const DisplayNameSchema = Type.String({ minLength: 1, maxLength: 80 });
const RuleTextSchema = Type.String({ minLength: 1, maxLength: 320 });
const StableTagSchema = Type.String({
  minLength: 1,
  maxLength: 60,
  pattern: "^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$",
});

export const NarrativePermissionSchema = strictObject({
  scope: Type.Union([
    Type.Literal("exploration"),
    Type.Literal("social"),
    Type.Literal("ritual"),
    Type.Literal("world"),
  ]),
  permission: Type.String({ minLength: 1, maxLength: 200 }),
});

export const ContentPrerequisiteSchema = Type.Union([
  strictObject({
    kind: Type.Literal("rank"),
    minimum_rank: Type.Integer({ minimum: 1, maximum: 4 }),
  }),
  strictObject({
    kind: Type.Literal("content"),
    required: ResolvedContentReferenceSchema,
  }),
  strictObject({
    kind: Type.Literal("archetype"),
    required: ResolvedContentReferenceSchema,
  }),
]);

export const MechanicalEffectSchema = Type.Union([
  strictObject({
    kind: Type.Literal("adjust_resource"),
    resource: Type.Union([
      Type.Literal("guard"),
      Type.Literal("exertion"),
      Type.Literal("supply"),
    ]),
    amount: Type.Integer({ minimum: -20, maximum: 20 }),
    target: Type.Union([Type.Literal("self"), Type.Literal("party")]),
  }),
  strictObject({
    kind: Type.Literal("grant_edge"),
    context: Type.Union([
      Type.Literal("check"),
      Type.Literal("attack"),
      Type.Literal("death_test"),
    ]),
  }),
  strictObject({
    kind: Type.Literal("deal_impact"),
    impact: Type.Integer({ minimum: 1, maximum: 20 }),
  }),
  strictObject({
    kind: Type.Literal("reduce_impact"),
    amount: Type.Integer({ minimum: 1, maximum: 20 }),
    floor: Type.Literal(1),
  }),
  strictObject({
    kind: Type.Literal("move"),
    distance: Type.Union([Type.Literal("adjacent"), Type.Literal("distant")]),
    target: Type.Union([
      Type.Literal("self"),
      Type.Literal("ally"),
      Type.Literal("enemy"),
    ]),
  }),
  strictObject({
    kind: Type.Literal("apply_condition"),
    condition: ResolvedContentReferenceSchema,
    duration: Type.Union(
      CONDITION_DURATIONS.map((duration) => Type.Literal(duration)),
    ),
  }),
  strictObject({
    kind: Type.Literal("advance_track"),
    track: Type.Union([
      Type.Literal("progress"),
      Type.Literal("danger"),
      Type.Literal("objective"),
    ]),
    amount: Type.Integer({ minimum: 1, maximum: 10 }),
  }),
  strictObject({
    kind: Type.Literal("shift_stance"),
    steps: Type.Union([Type.Literal(-1), Type.Literal(1)]),
  }),
  strictObject({
    kind: Type.Literal("create_leverage"),
    count: Type.Integer({ minimum: 1, maximum: 3 }),
  }),
  strictObject({
    kind: Type.Literal("restore_reaction"),
    target: Type.Union([Type.Literal("self"), Type.Literal("ally")]),
  }),
  strictObject({
    kind: Type.Literal("mark_scene_use"),
    ability: ResolvedContentReferenceSchema,
  }),
]);

export type MechanicalEffect = Static<typeof MechanicalEffectSchema>;
export type NarrativePermission = Static<typeof NarrativePermissionSchema>;

export const PlayableOptionContentDefinitionSchema = contentDefinitionEnvelope(
  Type.Literal("playable_option"),
  strictObject({
    category: Type.Union([
      Type.Literal("heritage_gift"),
      Type.Literal("upbringing"),
      Type.Literal("archetype"),
      Type.Literal("path"),
      Type.Literal("talent"),
      Type.Literal("capstone"),
    ]),
    display_name: DisplayNameSchema,
    rule_text: RuleTextSchema,
    rank: Type.Integer({ minimum: 1, maximum: 4 }),
    availability: Type.Union([
      Type.Literal("production"),
      Type.Literal("test_only"),
    ]),
    prerequisites: Type.Array(ContentPrerequisiteSchema, { maxItems: 8 }),
    granted_ability_ids: Type.Array(ContentDefinitionIdSchema, {
      maxItems: 8,
      uniqueItems: true,
    }),
    tactical_effects: Type.Array(MechanicalEffectSchema, {
      minItems: 1,
      maxItems: 8,
    }),
    narrative_permissions: Type.Array(NarrativePermissionSchema, {
      minItems: 1,
      maxItems: 6,
    }),
  }),
);

export const AbilityContentDefinitionSchema = contentDefinitionEnvelope(
  Type.Literal("ability"),
  strictObject({
    category: Type.Union([
      Type.Literal("significant_gear"),
      Type.Literal("signature_technique"),
      Type.Literal("power"),
      Type.Literal("reaction"),
    ]),
    display_name: DisplayNameSchema,
    rule_text: RuleTextSchema,
    action_slot: ActionSlotSchema,
    cost: Type.Array(MechanicalEffectSchema, { maxItems: 4 }),
    target_mode: Type.Union([
      Type.Literal("self"),
      Type.Literal("single_actor"),
      Type.Literal("zone"),
      Type.Literal("objective"),
    ]),
    range: RangeBandSchema,
    fixed_impact: Type.Union([
      Type.Null(),
      Type.Integer({ minimum: 1, maximum: 20 }),
    ]),
    check_profile: Type.Union([
      Type.Null(),
      strictObject({
        attribute: AttributeSchema,
        discipline: DisciplineSchema,
        target: StandardTargetSchema,
      }),
    ]),
    effects: Type.Array(MechanicalEffectSchema, { minItems: 1, maxItems: 8 }),
    narrative_permissions: Type.Array(NarrativePermissionSchema, {
      minItems: 1,
      maxItems: 6,
    }),
  }),
);

export const ConditionContentDefinitionSchema = contentDefinitionEnvelope(
  Type.Literal("condition"),
  strictObject({
    display_name: DisplayNameSchema,
    rule_text: RuleTextSchema,
    effects: Type.Array(MechanicalEffectSchema, { minItems: 1, maxItems: 6 }),
  }),
);

const EnemyActionReferenceSchema = strictObject({
  action: ResolvedContentReferenceSchema,
  preference_tags: Type.Array(StableTagSchema, {
    maxItems: 8,
    uniqueItems: true,
  }),
});
export const EnemyContentDefinitionSchema = contentDefinitionEnvelope(
  Type.Literal("enemy"),
  strictObject({
    display_name: DisplayNameSchema,
    rule_text: RuleTextSchema,
    role: Type.Union([Type.Literal("squad"), Type.Literal("boss")]),
    guard: Type.Integer({ minimum: 1, maximum: 100 }),
    armor: Type.Integer({ minimum: 0, maximum: 20 }),
    attribute_ratings: strictObject({
      Force: AttributeRatingSchema,
      Finesse: AttributeRatingSchema,
      Insight: AttributeRatingSchema,
      Presence: AttributeRatingSchema,
    }),
    discipline_ratings: strictObject({
      Athletics: DisciplineRatingSchema,
      Subterfuge: DisciplineRatingSchema,
      Craft: DisciplineRatingSchema,
      Lore: DisciplineRatingSchema,
      Vigilance: DisciplineRatingSchema,
      Influence: DisciplineRatingSchema,
      Survival: DisciplineRatingSchema,
      Mysticism: DisciplineRatingSchema,
    }),
    actions: Type.Array(EnemyActionReferenceSchema, {
      minItems: 1,
      maxItems: 8,
    }),
    goal_tags: Type.Array(StableTagSchema, {
      minItems: 1,
      maxItems: 8,
      uniqueItems: true,
    }),
    temperament_tags: Type.Array(StableTagSchema, {
      minItems: 1,
      maxItems: 8,
      uniqueItems: true,
    }),
  }),
);

export const BossOverlayContentDefinitionSchema = contentDefinitionEnvelope(
  Type.Literal("boss_overlay"),
  strictObject({
    display_name: DisplayNameSchema,
    rule_text: RuleTextSchema,
    objective: ResolvedContentReferenceSchema,
    trigger: Type.Union([
      Type.Literal("guard_depleted"),
      Type.Literal("objective_changed"),
      Type.Literal("round_started"),
    ]),
    effects: Type.Array(MechanicalEffectSchema, { minItems: 1, maxItems: 8 }),
  }),
);

export const ObjectiveContentDefinitionSchema = contentDefinitionEnvelope(
  Type.Literal("objective"),
  strictObject({
    display_name: DisplayNameSchema,
    rule_text: RuleTextSchema,
    threshold: Type.Integer({ minimum: 1, maximum: 20 }),
    completion_effects: Type.Array(MechanicalEffectSchema, {
      minItems: 1,
      maxItems: 8,
    }),
  }),
);

const OutcomeTrackEffectSchema = strictObject({
  degree: OutcomeDegreeSchema,
  progress: Type.Integer({ minimum: 0, maximum: 10 }),
  danger: Type.Integer({ minimum: 0, maximum: 10 }),
});
export const ChallengeContentDefinitionSchema = contentDefinitionEnvelope(
  Type.Literal("challenge"),
  strictObject({
    display_name: DisplayNameSchema,
    rule_text: RuleTextSchema,
    progress_maximum: Type.Integer({ minimum: 1, maximum: 20 }),
    danger_maximum: Type.Integer({ minimum: 1, maximum: 20 }),
    tie_rule: Type.Union([
      Type.Literal("progress_wins"),
      Type.Literal("danger_wins"),
      Type.Literal("resolved_with_cost"),
    ]),
    outcome_effects: Type.Array(OutcomeTrackEffectSchema, {
      minItems: 4,
      maxItems: 4,
    }),
  }),
);

const VisibleContentStatementSchema = strictObject({
  text: Type.String({ minLength: 1, maxLength: 200 }),
  visibility: InformationVisibilitySchema,
});
export const SocialProfileContentDefinitionSchema = contentDefinitionEnvelope(
  Type.Literal("social_profile"),
  strictObject({
    display_name: DisplayNameSchema,
    motives: Type.Array(VisibleContentStatementSchema, {
      minItems: 1,
      maxItems: 6,
    }),
    fears: Type.Array(VisibleContentStatementSchema, { maxItems: 6 }),
    initial_stance: SocialStanceSchema,
    leverage_capacity: Type.Integer({ minimum: 0, maximum: 6 }),
    hard_limits: Type.Array(VisibleContentStatementSchema, {
      minItems: 1,
      maxItems: 6,
    }),
  }),
);

const RitualConsequenceSchema = strictObject({
  degree: OutcomeDegreeSchema,
  effects: Type.Array(MechanicalEffectSchema, { minItems: 1, maxItems: 8 }),
  text: Type.String({ minLength: 1, maxLength: 240 }),
});
export const RitualContentDefinitionSchema = contentDefinitionEnvelope(
  Type.Literal("ritual"),
  strictObject({
    display_name: DisplayNameSchema,
    rule_text: RuleTextSchema,
    scope: Type.String({ minLength: 1, maxLength: 120 }),
    time: Type.String({ minLength: 1, maxLength: 120 }),
    requirements: Type.Array(RitualRequirementSchema, {
      minItems: 1,
      maxItems: 8,
    }),
    costs: Type.Array(RitualCostSchema, { minItems: 1, maxItems: 8 }),
    target_mode: Type.Union([
      Type.Literal("actor"),
      Type.Literal("place"),
      Type.Literal("phenomenon"),
    ]),
    consequences: Type.Array(RitualConsequenceSchema, {
      minItems: 4,
      maxItems: 4,
    }),
  }),
);
