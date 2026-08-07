import {
  PHASE_1_CONTENT_MANIFEST_HASH,
  PHASE_1_DEFINITIONS,
  PHASE_1_STARTER_LOADOUTS,
} from "@lldm/content";
import {
  type CampaignId,
  type GameCommand,
  type Phase1ScenarioFixture,
  Phase1ScenarioFixtureSchema,
  type PhysicalSubmissionId,
  validateValue,
} from "@lldm/contracts";
import { enumerateCombatActions } from "@lldm/engine";
import type { SqliteRuntimeStore } from "../sqlite/store.js";
import {
  deterministicIdentityPort,
  legalActionIdForCampaign,
} from "./defaults.js";
import { CommandCoordinator } from "./coordinator.js";

const catalog = {
  content_manifest_hash: PHASE_1_CONTENT_MANIFEST_HASH,
  definitions: PHASE_1_DEFINITIONS,
};

export interface Phase1ScenarioRunResult {
  readonly scenario_id: string;
  readonly campaign_id: CampaignId;
  readonly command_count: number;
  readonly transaction_count: number;
  readonly event_count: number;
  readonly final_revision: number;
  readonly final_state_hash: string;
  readonly combat_status: string | null;
  readonly challenge_status: string | null;
  readonly social_stance: string | null;
  readonly ritual_status: string | null;
}

export function runPhase1ScenarioFixture(input: {
  readonly store: SqliteRuntimeStore;
  readonly fixture: unknown;
  readonly committed_at?: string;
}): Phase1ScenarioRunResult {
  const parsed = validateValue(Phase1ScenarioFixtureSchema, input.fixture);
  if (!parsed.success) throw new Error("Phase 1 scenario fixture is invalid.");
  const scenario = parsed.value;
  if (scenario.content_manifest_hash !== PHASE_1_CONTENT_MANIFEST_HASH) {
    throw new Error("Scenario does not use the installed Phase 1 manifest.");
  }
  const initial = input.store.inspectCampaignStorage(scenario.campaign_id);
  if (initial === null || initial.current_revision !== 0) {
    throw new Error("Scenario requires its empty revision-zero campaign.");
  }
  let sequence = 0;
  const runtime = new CommandCoordinator({
    store: input.store,
    content: {
      resolve: (hash) =>
        hash === PHASE_1_CONTENT_MANIFEST_HASH ? catalog : null,
    },
    ...(input.committed_at === undefined
      ? {}
      : { clock: { now: () => input.committed_at! } }),
  });
  const state = () => {
    const campaign = input.store.inspectCampaign(scenario.campaign_id);
    if (campaign === null) throw new Error("Scenario campaign disappeared.");
    return campaign.state;
  };
  const submit = (
    label: string,
    kind: GameCommand["kind"],
    payload: unknown,
  ) => {
    sequence += 1;
    const revision = input.store.inspectCampaignStorage(
      scenario.campaign_id,
    )?.current_revision;
    if (revision === undefined)
      throw new Error("Scenario campaign is missing.");
    const command = {
      schema_version: 1,
      command_id: `command_e2e_${String(sequence).padStart(3, "0")}_${label}`,
      transaction_id: `transaction_e2e_${String(sequence).padStart(3, "0")}_${label}`,
      campaign_id: scenario.campaign_id,
      expected_revision: revision,
      kind,
      payload,
    };
    const result = runtime.submit(command);
    if (result.result_kind !== "committed_acceptance") {
      throw new Error(`Scenario ${kind} returned ${result.result_kind}.`);
    }
    return result.commit;
  };

  for (const starter of PHASE_1_STARTER_LOADOUTS) {
    submit("materialize", "materialize_character", {
      foundation: starter.foundation,
      significant_gear: starter.significant_gear,
    });
  }
  submit("start_combat", "start_combat", { combat: scenario.combat });

  let combatSteps = 0;
  while (state().combat?.status !== "resolved" && combatSteps < 240) {
    combatSteps += 1;
    const current = state();
    const combat = current.combat;
    if (combat === null) throw new Error("Scenario combat disappeared.");
    if (
      combat.status === "awaiting_physical_action" ||
      combat.status === "awaiting_death_test"
    ) {
      const pending = current.pending_physical_checks[0];
      if (pending === undefined) {
        throw new Error("Combat awaits a missing physical check.");
      }
      submit("physical_result", "submit_die_result", {
        pending_check_id: pending.pending_check_id,
        physical_submission_id:
          `physical_submission_e2e_${combatSteps}` as PhysicalSubmissionId,
        submission_nonce: pending.submission_nonce,
        die_face: 14,
      });
      continue;
    }
    if (combat.active_actor_id === null) {
      let actor = combat.participants.find(
        (participant) =>
          participant.side === combat.active_side &&
          !participant.activation_spent &&
          (participant.side === "hero"
            ? !current.permanent_deaths.some((characterId) =>
                current.party.characters.some(
                  (character) =>
                    character.character_id === characterId &&
                    character.foundation.actor_id === participant.actor_id,
                ),
              )
            : participant.guard.current > 0),
      );
      if (actor === undefined) {
        const otherSide = combat.active_side === "hero" ? "enemy" : "hero";
        actor = combat.participants.find(
          (participant) =>
            participant.side === otherSide &&
            !participant.activation_spent &&
            (participant.side === "hero" || participant.guard.current > 0),
        );
        if (actor === undefined) {
          actor = combat.participants.find(
            (participant) =>
              participant.side === "hero" &&
              !current.permanent_deaths.some((characterId) =>
                current.party.characters.some(
                  (character) =>
                    character.character_id === characterId &&
                    character.foundation.actor_id === participant.actor_id,
                ),
              ),
          );
          if (actor === undefined) {
            throw new Error(
              "Combat has no legal activation at an unresolved head.",
            );
          }
        }
      }
      if (actor.side === "hero") {
        submit("hero_activation", "choose_hero_activation", {
          combat_id: combat.combat_id,
          actor_id: actor.actor_id,
        });
      } else {
        const selection = submit("enemy_selection", "select_enemy_fallback", {
          combat_id: combat.combat_id,
          actor_id: actor.actor_id,
        });
        const selected = selection.events.find(
          (event) => event.kind === "enemy_action_selected",
        );
        if (selected?.kind !== "enemy_action_selected") {
          throw new Error("Enemy fallback omitted its selected action.");
        }
        submit("enemy_action", "execute_combat_action", {
          combat_id: combat.combat_id,
          legal_action_id: selected.payload.candidate.legal_action_id,
          invoke_spark: false,
        });
      }
      continue;
    }

    const actor = combat.participants.find(
      ({ actor_id }) => actor_id === combat.active_actor_id,
    );
    if (actor === undefined) throw new Error("Active combat actor is missing.");
    const actions = enumerateCombatActions({
      state: current,
      catalog,
      actor_id: actor.actor_id,
      legal_action_id_for: (stableKey) =>
        legalActionIdForCampaign(
          deterministicIdentityPort,
          scenario.campaign_id,
          stableKey,
        ),
    });
    const availableSlot = actor.action_available
      ? "action"
      : actor.maneuver_available
        ? "maneuver"
        : actor.reaction_available
          ? "reaction"
          : null;
    const slotActions = actions.filter(({ slot }) => slot === availableSlot);
    const selected =
      actor.side === "enemy"
        ? slotActions.toSorted(
            (left, right) => right.fallback_score - left.fallback_score,
          )[0]
        : (slotActions.find(
            ({ action_kind }) => action_kind === "advance_objective",
          ) ??
          slotActions.find(({ target }) => {
            if (target.kind !== "actor") return false;
            return (
              combat.participants.find(
                ({ actor_id }) => actor_id === target.actor_id,
              )?.side === "enemy"
            );
          }) ??
          slotActions.find(({ action_kind }) => action_kind === "pass") ??
          slotActions[0]);
    if (selected === undefined) {
      throw new Error("Active actor has no legal action for its open slot.");
    }
    submit("combat_action", "execute_combat_action", {
      combat_id: combat.combat_id,
      legal_action_id: selected.legal_action_id,
      invoke_spark: false,
    });
  }
  if (state().combat?.status !== "resolved") {
    throw new Error("Scenario combat did not resolve within its bounded loop.");
  }

  const check = (
    actorId: string,
    attribute: "Insight" | "Presence",
    discipline: "Mysticism" | "Influence",
    stakes: string,
  ) => {
    const character = state().party.characters.find(
      ({ foundation }) => foundation.actor_id === actorId,
    );
    const attributeRating = character?.foundation.attributes.find(
      (entry) => entry.attribute === attribute,
    )?.rating;
    const disciplineRating = character?.foundation.disciplines.find(
      (entry) => entry.discipline === discipline,
    )?.rating;
    if (attributeRating === undefined || disciplineRating === undefined) {
      throw new Error("Scenario check actor ratings are missing.");
    }
    return {
      request: {
        schema_version: 1,
        actor_id: actorId,
        attribute,
        attribute_rating: attributeRating,
        discipline,
        discipline_rating: disciplineRating,
        target: 13,
        modifier_state: { edge: false, hindrance: false },
        visibility: "public",
        stakes,
        outcome_bands: [
          { degree: "Crisis", consequence: "Danger escalates sharply." },
          { degree: "Setback", consequence: "The situation changes." },
          { degree: "Success", consequence: "The opening is made." },
          { degree: "Triumph", consequence: "An added benefit is secured." },
        ],
        action_feasibility: "possible",
        spark_eligible: true,
      },
      roll_mode: "simulated",
      invoke_spark: false,
    };
  };

  submit("challenge_start", "start_challenge", {
    challenge: scenario.challenge,
  });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const challenge = state().challenges.find(
      ({ challenge_id }) => challenge_id === scenario.challenge.challenge_id,
    );
    if (challenge?.status !== "active") break;
    submit("challenge_advance", "advance_challenge", {
      challenge_id: challenge.challenge_id,
      check: check(
        "actor_oren_ash_001",
        "Insight",
        "Mysticism",
        "The control seal either holds or raises Danger.",
      ),
    });
  }

  submit("social_start", "establish_social_state", {
    social_state: scenario.social_state,
  });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const social = state().social_states.find(
      ({ npc_actor_id }) => npc_actor_id === scenario.social_state.npc_actor_id,
    );
    if (social?.stance === "aligned") break;
    submit("social_shift", "attempt_social_shift", {
      npc_actor_id: scenario.social_state.npc_actor_id,
      requested_stance: "aligned",
      challenged_limit_id: null,
      check: check(
        "actor_ilyra_quill_001",
        "Presence",
        "Influence",
        "Nera either supports the repair plan or remains cautious.",
      ),
    });
  }

  submit("recover_supply", "recover_resource", {
    character_id: "character_oren_ash_001",
    resource: "supply",
    amount: 1,
    source: {
      content_definition_id: "content_upbringing_rooftop_garden_001",
      definition_revision: 1,
    },
  });
  submit("ritual_start", "start_ritual", {
    ritual: scenario.ritual,
    established_fictional_position_tags:
      scenario.established_fictional_position_tags,
  });
  for (const paidCostIndex of [0, 1]) {
    submit("ritual_cost", "contribute_ritual", {
      ritual_id: scenario.ritual.ritual_id,
      character_id: "character_oren_ash_001",
      paid_cost_index: paidCostIndex,
    });
  }
  submit("ritual_resolve", "resolve_ritual", {
    ritual_id: scenario.ritual.ritual_id,
    check: check(
      "actor_oren_ash_001",
      "Insight",
      "Mysticism",
      "The remembered passage either opens or consumes the offering.",
    ),
  });

  const finalCampaign = input.store.inspectCampaignStorage(
    scenario.campaign_id,
  );
  const finalState = state();
  if (finalCampaign === null)
    throw new Error("Scenario final state is missing.");
  return {
    scenario_id: scenario.scenario_id,
    campaign_id: scenario.campaign_id,
    command_count: sequence,
    transaction_count: input.store.inspectTransactions(scenario.campaign_id)
      .length,
    event_count: input.store.inspectEvents(scenario.campaign_id).length,
    final_revision: finalCampaign.current_revision,
    final_state_hash: finalCampaign.state_hash,
    combat_status: finalState.combat?.status ?? null,
    challenge_status:
      finalState.challenges.find(
        ({ challenge_id }) => challenge_id === scenario.challenge.challenge_id,
      )?.status ?? null,
    social_stance:
      finalState.social_states.find(
        ({ npc_actor_id }) =>
          npc_actor_id === scenario.social_state.npc_actor_id,
      )?.stance ?? null,
    ritual_status:
      finalState.rituals.find(
        ({ ritual_id }) => ritual_id === scenario.ritual.ritual_id,
      )?.status ?? null,
  };
}
