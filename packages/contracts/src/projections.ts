import { Type, type Static } from "@sinclair/typebox";
import {
  CheckPreviewProjectionSchema,
  PhysicalRollDisclosureSchema,
} from "./checks.js";
import {
  CombatStateSchema,
  LegalActionCandidateSchema,
  PendingPhysicalCheckStateSchema,
} from "./domains/combat.js";
import { ChallengeStateSchema } from "./domains/challenges.js";
import {
  CharacterConditionSchema,
  CharacterResourceStateSchema,
  PlayableCharacterStateSchema,
  ResolvedContentReferenceSchema,
  SceneAbilityUseSchema,
} from "./domains/playable-characters.js";
import { RitualStateSchema } from "./domains/rituals.js";
import { SocialStanceSchema } from "./domains/social.js";
import { projectionEnvelope, strictObject } from "./envelopes.js";
import { GameStateSchema } from "./game-state.js";
import { ActorIdSchema, CharacterIdSchema, SceneIdSchema } from "./ids.js";

const PublicPhysicalRollDisclosureSchema = Type.Omit(
  PhysicalRollDisclosureSchema,
  ["eligible_roller"],
);

const PublicCharacterProjectionSchema = strictObject({
  character_id: CharacterIdSchema,
  actor_id: ActorIdSchema,
  display_name: Type.String({ minLength: 1, maxLength: 80 }),
  rank: Type.Integer({ minimum: 1, maximum: 4 }),
  resources: CharacterResourceStateSchema,
  scene_ability_uses: Type.Array(SceneAbilityUseSchema, { maxItems: 32 }),
  conditions: Type.Array(CharacterConditionSchema, { maxItems: 32 }),
});

const PublicSocialProjectionSchema = strictObject({
  npc_actor_id: ActorIdSchema,
  stance: SocialStanceSchema,
  motives: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
    maxItems: 6,
  }),
  fears: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
    maxItems: 6,
  }),
  leverage: Type.Array(Type.String({ minLength: 1, maxLength: 80 }), {
    maxItems: 6,
  }),
  hard_limits: Type.Array(Type.String({ minLength: 1, maxLength: 200 }), {
    maxItems: 6,
  }),
});

const LegalCharacterActionProjectionSchema = Type.Union([
  strictObject({
    kind: Type.Literal("use_ability"),
    ability: ResolvedContentReferenceSchema,
  }),
  strictObject({
    kind: Type.Literal("spend_resource"),
    resource: Type.Union([Type.Literal("exertion"), Type.Literal("supply")]),
    maximum_amount: Type.Integer({ minimum: 1 }),
  }),
  strictObject({ kind: Type.Literal("recover_spark_complication") }),
  strictObject({ kind: Type.Literal("take_costly_rest") }),
  strictObject({
    kind: Type.Literal("advance_rank"),
    selected_feature: ResolvedContentReferenceSchema,
  }),
]);

export const PublicTvProjectionSchema = projectionEnvelope(
  Type.Literal("public_tv"),
  strictObject({
    session_number: Type.Integer({ minimum: 0 }),
    scene_id: Type.Union([Type.Null(), SceneIdSchema]),
    supply: Type.Integer({ minimum: 0 }),
    supply_maximum: Type.Integer({ minimum: 2, maximum: 7 }),
    characters: Type.Array(PublicCharacterProjectionSchema, { maxItems: 5 }),
    pending_rolls: Type.Array(PublicPhysicalRollDisclosureSchema, {
      maxItems: 16,
    }),
    combat: Type.Union([Type.Null(), CombatStateSchema]),
    challenges: Type.Array(ChallengeStateSchema, { maxItems: 16 }),
    social_states: Type.Array(PublicSocialProjectionSchema, { maxItems: 32 }),
    rituals: Type.Array(RitualStateSchema, { maxItems: 16 }),
  }),
);

export const SeatPrivateProjectionSchema = projectionEnvelope(
  Type.Literal("seat_private"),
  strictObject({
    audience_key: Type.String({ minLength: 1, maxLength: 128 }),
    character: Type.Union([Type.Null(), PlayableCharacterStateSchema]),
    pending_physical_checks: Type.Array(PendingPhysicalCheckStateSchema, {
      maxItems: 16,
    }),
    legal_character_actions: Type.Array(LegalCharacterActionProjectionSchema, {
      maxItems: 64,
    }),
    legal_combat_actions: Type.Array(LegalActionCandidateSchema, {
      maxItems: 256,
    }),
  }),
);

export const HostControlProjectionSchema = projectionEnvelope(
  Type.Literal("host_control"),
  strictObject({
    state: GameStateSchema,
    legal_combat_actions: Type.Array(LegalActionCandidateSchema, {
      maxItems: 512,
    }),
  }),
);

export const ProjectionSchema = Type.Union([
  CheckPreviewProjectionSchema,
  PublicTvProjectionSchema,
  SeatPrivateProjectionSchema,
  HostControlProjectionSchema,
]);

export type Projection = Static<typeof ProjectionSchema>;
export type PublicTvProjection = Static<typeof PublicTvProjectionSchema>;
export type SeatPrivateProjection = Static<typeof SeatPrivateProjectionSchema>;
export type HostControlProjection = Static<typeof HostControlProjectionSchema>;
