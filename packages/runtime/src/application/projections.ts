import {
  type CampaignId,
  canonicalJson,
  type LegalActionId,
  ProjectionSchema,
  SCHEMA_VERSION,
  sha256Hex,
  validateValue,
} from "@lldm/contracts";
import {
  enumerateCombatActions,
  enumerateCombatReactions,
  enumerateLegalCharacterActions,
} from "@lldm/engine";
import type { ProjectionPort, RuntimeProjectionDraft } from "../ports/index.js";
import type { SqliteRuntimeStore } from "../sqlite/store.js";
import { replaySqliteCampaign } from "./replay.js";

function projectionId(
  campaignId: CampaignId,
  kind: string,
  audienceKey: string,
): `projection_${string}` {
  return `projection_${sha256Hex(
    `projection\u0000${campaignId}\u0000${kind}\u0000${audienceKey}`,
  ).slice(0, 32)}`;
}

function draft(input: {
  readonly audience_kind: RuntimeProjectionDraft["audience_kind"];
  readonly audience_key: string;
  readonly projection: unknown;
}): RuntimeProjectionDraft {
  const validated = validateValue(ProjectionSchema, input.projection);
  if (!validated.success) {
    throw new Error("Runtime projector produced an invalid projection.");
  }
  return {
    audience_kind: input.audience_kind,
    audience_key: input.audience_key,
    projection_kind: validated.value.kind,
    revision: validated.value.revision,
    canonical_json: canonicalJson(validated.value),
  };
}

export const phase1ProjectionPort: ProjectionPort = {
  project({ state, revision, catalog, legal_action_id_for }) {
    const publicCombat =
      state.combat === null
        ? null
        : {
            ...state.combat,
            participants: state.combat.participants.filter(
              (participant) =>
                participant.side === "hero" ||
                participant.reinforcement_trigger === undefined ||
                (participant.reinforcement_trigger === "round_2" &&
                  state.combat !== null &&
                  state.combat.round >= 2) ||
                (participant.reinforcement_trigger === "objective_progress_2" &&
                  state.combat !== null &&
                  state.combat.objectives.some(
                    ({ progress }) => progress >= 2,
                  )),
            ),
          };
    const publicProjection = draft({
      audience_kind: "public",
      audience_key: "public",
      projection: {
        schema_version: SCHEMA_VERSION,
        projection_id: projectionId(state.campaign_id, "public_tv", "public"),
        campaign_id: state.campaign_id,
        revision,
        kind: "public_tv",
        payload: {
          session_number: state.session_number,
          scene_id: state.scene_id,
          supply: state.party.supply,
          supply_maximum: state.party.supply_maximum,
          characters: state.party.characters.map((character) => ({
            character_id: character.character_id,
            actor_id: character.foundation.actor_id,
            display_name: character.foundation.display_name,
            rank: character.rank,
            resources: character.resources,
            scene_ability_uses: character.scene_ability_uses,
            conditions: character.conditions,
          })),
          pending_rolls: state.pending_physical_checks.map(({ disclosure }) => {
            const { eligible_roller: _privateSeat, ...publicDisclosure } =
              disclosure;
            return publicDisclosure;
          }),
          combat: publicCombat,
          challenges: state.challenges,
          social_states: state.social_states.map((social) => ({
            npc_actor_id: social.npc_actor_id,
            stance: social.stance,
            motives: social.motives
              .filter(({ visibility }) => visibility === "public")
              .map(({ text }) => text),
            fears: social.fears
              .filter(({ visibility }) => visibility === "public")
              .map(({ text }) => text),
            leverage: social.leverage
              .filter(({ visibility }) => visibility === "public")
              .map(({ label }) => label),
            hard_limits: social.hard_limits
              .filter(({ statement }) => statement.visibility === "public")
              .map(({ statement }) => statement.text),
          })),
          rituals: state.rituals,
        },
      },
    });

    const audienceKeys = new Set<string>([
      ...state.party.characters.map(({ character_id }) => character_id),
      ...state.pending_physical_checks.map(
        ({ disclosure }) => disclosure.eligible_roller,
      ),
    ]);
    const privateProjections = [...audienceKeys].sort().map((audienceKey) => {
      const character = state.party.characters.find(
        ({ character_id }) => character_id === audienceKey,
      );
      const legalCharacterActions =
        character === undefined
          ? []
          : enumerateLegalCharacterActions({
              state,
              catalog,
              character_id: character.character_id,
            });
      const legalCombatActions =
        character === undefined
          ? []
          : state.combat?.reaction_window?.eligible_actor_ids[0] ===
              character.foundation.actor_id
            ? enumerateCombatReactions({
                state,
                catalog,
                actor_id: character.foundation.actor_id,
                legal_action_id_for,
              })
            : state.combat?.active_actor_id === character.foundation.actor_id
              ? enumerateCombatActions({
                  state,
                  catalog,
                  actor_id: character.foundation.actor_id,
                  legal_action_id_for,
                })
              : [];
      return draft({
        audience_kind: "seat_private",
        audience_key: audienceKey,
        projection: {
          schema_version: SCHEMA_VERSION,
          projection_id: projectionId(
            state.campaign_id,
            "seat_private",
            audienceKey,
          ),
          campaign_id: state.campaign_id,
          revision,
          kind: "seat_private",
          payload: {
            audience_key: audienceKey,
            character: character ?? null,
            pending_physical_checks: state.pending_physical_checks.filter(
              ({ disclosure }) => disclosure.eligible_roller === audienceKey,
            ),
            legal_character_actions: legalCharacterActions,
            legal_combat_actions: legalCombatActions,
          },
        },
      });
    });
    const allCombatActions = (state.combat?.participants ?? []).flatMap(
      (participant) =>
        enumerateCombatActions({
          state,
          catalog,
          actor_id: participant.actor_id,
          legal_action_id_for,
        }),
    );
    const hostProjection = draft({
      audience_kind: "host_control",
      audience_key: "host",
      projection: {
        schema_version: SCHEMA_VERSION,
        projection_id: projectionId(state.campaign_id, "host_control", "host"),
        campaign_id: state.campaign_id,
        revision,
        kind: "host_control",
        payload: { state, legal_combat_actions: allCombatActions },
      },
    });
    return [publicProjection, ...privateProjections, hostProjection];
  },
};

export function rebuildSqliteProjections(input: {
  readonly store: SqliteRuntimeStore;
  readonly campaign_id: CampaignId;
  readonly catalog: Parameters<ProjectionPort["project"]>[0]["catalog"];
  readonly stored_at: string;
}) {
  const replay = replaySqliteCampaign(input.store, input.campaign_id);
  if (!replay.success) return replay;
  const projections = phase1ProjectionPort.project({
    state: replay.state,
    revision: replay.revision,
    catalog: input.catalog,
    legal_action_id_for: (stableKey) =>
      `legal_action_${sha256Hex(
        `legal_action\u0000transaction_legal_actions_${sha256Hex(
          input.campaign_id,
        ).slice(0, 24)}\u00000\u0000${stableKey}`,
      ).slice(0, 32)}` as LegalActionId,
  });
  return {
    success: true as const,
    campaign_id: input.campaign_id,
    revision: replay.revision,
    ...input.store.replaceProjections(
      input.campaign_id,
      projections,
      input.stored_at,
    ),
  };
}
