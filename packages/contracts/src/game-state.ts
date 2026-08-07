import { Type, type Static } from "@sinclair/typebox";
import { CombatStateSchema, validateCombatState } from "./domains/combat.js";
import {
  ChallengeStateSchema,
  validateChallengeState,
} from "./domains/challenges.js";
import { PendingPhysicalCheckStateSchema } from "./domains/combat.js";
import {
  PlayableCharacterStateSchema,
  validatePlayableCharacterState,
} from "./domains/playable-characters.js";
import { RitualStateSchema, validateRitualState } from "./domains/rituals.js";
import { SocialStateSchema, validateSocialState } from "./domains/social.js";
import { strictObject } from "./envelopes.js";
import { ContentManifestHashSchema } from "./hashes.js";
import {
  CampaignIdSchema,
  CharacterIdSchema,
  ScarIdSchema,
  SceneIdSchema,
} from "./ids.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "./validation.js";
import { SchemaVersionSchema, StateSchemaVersionSchema } from "./versions.js";

export const PermanentScarStateSchema = strictObject({
  scar_id: ScarIdSchema,
  character_id: CharacterIdSchema,
  name: Type.String({ minLength: 1, maxLength: 80 }),
});

export const GameStateSchema = strictObject({
  schema_version: SchemaVersionSchema,
  state_schema_version: StateSchemaVersionSchema,
  record_kind: Type.Literal("game_state"),
  campaign_id: CampaignIdSchema,
  content_manifest_hash: ContentManifestHashSchema,
  session_number: Type.Integer({ minimum: 0 }),
  scene_id: Type.Union([Type.Null(), SceneIdSchema]),
  party: strictObject({
    supply: Type.Integer({ minimum: 0 }),
    supply_maximum: Type.Integer({ minimum: 2, maximum: 7 }),
    characters: Type.Array(PlayableCharacterStateSchema, {
      maxItems: 5,
    }),
  }),
  pending_physical_checks: Type.Array(PendingPhysicalCheckStateSchema, {
    maxItems: 16,
  }),
  combat: Type.Union([Type.Null(), CombatStateSchema]),
  challenges: Type.Array(ChallengeStateSchema, { maxItems: 16 }),
  social_states: Type.Array(SocialStateSchema, { maxItems: 32 }),
  rituals: Type.Array(RitualStateSchema, { maxItems: 16 }),
  permanent_scars: Type.Array(PermanentScarStateSchema, { maxItems: 32 }),
  permanent_deaths: Type.Array(CharacterIdSchema, {
    maxItems: 5,
    uniqueItems: true,
  }),
});

export type GameState = Static<typeof GameStateSchema>;

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

export function validateGameState(input: unknown): ValidationResult<GameState> {
  const structural = validateValue(GameStateSchema, input);
  if (!structural.success) return structural;
  const state = structural.value;
  const issues: ValidationIssue[] = [];

  const expectedSupplyMaximum = state.party.characters.length + 2;
  if (state.party.supply_maximum !== expectedSupplyMaximum) {
    issues.push({
      path: "$.party.supply_maximum",
      code: "party.supply_maximum_mismatch",
      message: `Supply maximum must equal party size plus 2 (${expectedSupplyMaximum}).`,
    });
  }
  if (state.party.supply > state.party.supply_maximum) {
    issues.push({
      path: "$.party.supply",
      code: "party.supply_overflow",
      message: "Supply cannot exceed its party-size maximum.",
    });
  }

  state.party.characters.forEach((character, index) => {
    const result = validatePlayableCharacterState(character);
    if (!result.success) {
      issues.push(
        ...result.issues.map((issue) => ({
          ...issue,
          path: `$.party.characters[${index}]${issue.path.slice(1)}`,
        })),
      );
    }
  });
  if (state.combat !== null) {
    const result = validateCombatState(state.combat);
    if (!result.success) issues.push(...result.issues);
  }
  state.challenges.forEach((challenge) => {
    const result = validateChallengeState(challenge);
    if (!result.success) issues.push(...result.issues);
  });
  state.social_states.forEach((social) => {
    const result = validateSocialState(social);
    if (!result.success) issues.push(...result.issues);
  });
  state.rituals.forEach((ritual) => {
    const result = validateRitualState(ritual);
    if (!result.success) issues.push(...result.issues);
  });

  issues.push(
    ...duplicateIssues(
      state.party.characters.map(({ character_id }) => character_id),
      "$.party.characters",
      "state.duplicate_character",
    ),
    ...duplicateIssues(
      state.party.characters.map(({ foundation }) => foundation.actor_id),
      "$.party.characters",
      "state.duplicate_actor",
    ),
    ...duplicateIssues(
      state.pending_physical_checks.map(
        ({ pending_check_id }) => pending_check_id,
      ),
      "$.pending_physical_checks",
      "state.duplicate_pending_check",
    ),
    ...duplicateIssues(
      state.pending_physical_checks.map(
        ({ submission_nonce }) => submission_nonce,
      ),
      "$.pending_physical_checks",
      "state.duplicate_submission_nonce",
    ),
    ...duplicateIssues(
      state.challenges.map(({ challenge_id }) => challenge_id),
      "$.challenges",
      "state.duplicate_challenge",
    ),
    ...duplicateIssues(
      state.social_states.map(({ npc_actor_id }) => npc_actor_id),
      "$.social_states",
      "state.duplicate_social_state",
    ),
    ...duplicateIssues(
      state.rituals.map(({ ritual_id }) => ritual_id),
      "$.rituals",
      "state.duplicate_ritual",
    ),
    ...duplicateIssues(
      state.permanent_scars.map(({ scar_id }) => scar_id),
      "$.permanent_scars",
      "state.duplicate_scar",
    ),
  );

  const characterIds = new Set(
    state.party.characters.map(({ character_id }) => character_id),
  );
  state.permanent_deaths.forEach((characterId, index) => {
    if (!characterIds.has(characterId)) {
      issues.push({
        path: `$.permanent_deaths[${index}]`,
        code: "state.unknown_dead_character",
        message: "Permanent death must reference a playable character.",
      });
    }
  });

  return issues.length === 0
    ? { success: true, value: state }
    : validationFailure(issues);
}
