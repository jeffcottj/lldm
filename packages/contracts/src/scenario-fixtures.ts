import { type Static, Type } from "@sinclair/typebox";
import { ChallengeStateSchema } from "./domains/challenges.js";
import { CombatStateSchema } from "./domains/combat.js";
import { RitualStateSchema } from "./domains/rituals.js";
import { SocialStateSchema } from "./domains/social.js";
import { strictObject } from "./envelopes.js";
import { ContentManifestHashSchema, StateHashSchema } from "./hashes.js";
import {
  CampaignIdSchema,
  PendingCheckIdSchema,
  ScenarioIdSchema,
} from "./ids.js";
import { RandomDrawRecordSchema } from "./randomness.js";
import { SchemaVersionSchema } from "./versions.js";

export const Phase1ScenarioFixtureSchema = strictObject({
  schema_version: SchemaVersionSchema,
  record_kind: Type.Literal("phase_1_scenario_fixture"),
  scenario_id: ScenarioIdSchema,
  campaign_id: CampaignIdSchema,
  content_manifest_hash: ContentManifestHashSchema,
  combat: CombatStateSchema,
  challenge: ChallengeStateSchema,
  social_state: SocialStateSchema,
  ritual: RitualStateSchema,
  established_fictional_position_tags: Type.Array(
    Type.String({ minLength: 1, maxLength: 60 }),
    { maxItems: 16, uniqueItems: true },
  ),
  random_draws: Type.Array(RandomDrawRecordSchema, { maxItems: 64 }),
  expected: strictObject({
    key_event_kinds: Type.Array(Type.String({ minLength: 1, maxLength: 60 }), {
      minItems: 1,
      maxItems: 128,
    }),
    pending_physical_check_id: PendingCheckIdSchema,
    pending_state_hash: StateHashSchema,
    final_state_hash: StateHashSchema,
    combat_outcome: Type.Literal("heroes_prevailed"),
    challenge_outcome: Type.Union([
      Type.Literal("completed"),
      Type.Literal("failed"),
      Type.Literal("resolved_with_cost"),
    ]),
    social_stance: Type.Union([
      Type.Literal("closed"),
      Type.Literal("guarded"),
      Type.Literal("receptive"),
      Type.Literal("aligned"),
    ]),
    ritual_outcome: Type.Union([
      Type.Literal("completed"),
      Type.Literal("failed"),
    ]),
  }),
});

export type Phase1ScenarioFixture = Static<typeof Phase1ScenarioFixtureSchema>;
