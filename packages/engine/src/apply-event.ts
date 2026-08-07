import {
  COSTLY_REST_SUPPLY_COST,
  type GameEvent,
  type GameState,
  SCHEMA_VERSION,
  type ValidationIssue,
  type ValidationResult,
  validateChallengeState,
  validateRitualState,
  validateSocialState,
  validationFailure,
} from "@lldm/contracts";
import { validateStateInvariants } from "./invariants.js";

function eventFailure(
  event: GameEvent,
  message: string,
): ValidationResult<GameState> {
  return validationFailure([
    {
      path: `$.events[${event.stream_revision}]`,
      code: "event.application_failed",
      message,
    },
  ]);
}

function characterById(state: GameState, characterId: string) {
  return state.party.characters.find(
    (character) => character.character_id === characterId,
  );
}

function characterByActorId(state: GameState, actorId: string) {
  return state.party.characters.find(
    (character) => character.foundation.actor_id === actorId,
  );
}

function combatParticipantAlive(
  state: GameState,
  participant: NonNullable<GameState["combat"]>["participants"][number],
): boolean {
  if (participant.side === "enemy") return participant.guard.current > 0;
  const character = characterByActorId(state, participant.actor_id);
  return (
    character !== undefined &&
    !state.permanent_deaths.includes(character.character_id)
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled event variant: ${JSON.stringify(value)}`);
}

export function applyGameEvent(
  state: GameState,
  event: GameEvent,
): ValidationResult<GameState> {
  if (state.campaign_id !== event.campaign_id) {
    return eventFailure(event, "Event campaign does not match state campaign.");
  }

  const next = structuredClone(state);
  try {
    switch (event.kind) {
      case "command_accepted":
      case "command_rejected":
      case "enemy_action_selected":
        break;
      case "check_resolved":
        if ("pending_check_id" in event.payload) {
          const pendingCheckId = event.payload.pending_check_id;
          const pending = next.pending_physical_checks.find(
            ({ pending_check_id }) => pending_check_id === pendingCheckId,
          );
          if (pending === undefined) {
            return eventFailure(
              event,
              "Resolved physical check was not pending.",
            );
          }
          next.pending_physical_checks = next.pending_physical_checks.filter(
            ({ pending_check_id }) => pending_check_id !== pendingCheckId,
          );
          const combat = next.combat;
          if (
            combat !== null &&
            combat.pending_death_check_id === pendingCheckId
          ) {
            combat.pending_death_check_id = null;
            combat.status = "active";
          } else if (
            combat !== null &&
            combat.pending_action_check_id === pendingCheckId &&
            pending?.continuation?.kind === "combat_action"
          ) {
            combat.pending_action_check_id = null;
            combat.status = "active";
          }
        }
        break;
      case "physical_roll_requested":
        if (
          next.pending_physical_checks.some(
            ({ pending_check_id, submission_nonce }) =>
              pending_check_id === event.payload.pending_check_id ||
              submission_nonce === event.payload.submission_nonce,
          )
        ) {
          return eventFailure(
            event,
            "Physical check identity is already pending.",
          );
        }
        next.pending_physical_checks.push({
          schema_version: SCHEMA_VERSION,
          record_kind: "pending_physical_check_state",
          pending_check_id: event.payload.pending_check_id,
          submission_nonce: event.payload.submission_nonce,
          disclosure: event.payload.disclosure,
          status: "awaiting_submission",
          continuation: null,
        });
        if (
          event.payload.disclosure.reason === "permanent_death" &&
          next.combat !== null
        ) {
          next.combat.status = "awaiting_death_test";
          next.combat.pending_death_check_id = event.payload.pending_check_id;
        }
        break;
      case "spark_spent": {
        const character = characterByActorId(next, event.payload.actor_id);
        if (character === undefined) {
          return eventFailure(event, "Spark owner is not playable.");
        }
        if (!character.resources.spark.available) {
          return eventFailure(event, "Spark is already unavailable.");
        }
        character.resources.spark.available = false;
        break;
      }
      case "character_materialized":
        if (
          next.party.characters.some(
            ({ character_id, foundation }) =>
              character_id === event.payload.character.character_id ||
              foundation.actor_id ===
                event.payload.character.foundation.actor_id,
          )
        ) {
          return eventFailure(
            event,
            "Character identity is already materialized.",
          );
        }
        next.party.characters.push(event.payload.character);
        next.party.supply_maximum = next.party.characters.length + 2;
        break;
      case "significant_gear_spent": {
        const character = characterById(next, event.payload.character_id);
        const gear = character?.resolved_significant_gear.find(
          ({ slot }) => slot === event.payload.slot,
        );
        const ritual = next.rituals.find(
          ({ ritual_id }) => ritual_id === event.payload.ritual_id,
        );
        const cost = ritual?.costs[ritual.paid_cost_count];
        if (
          gear === undefined ||
          gear.status !== "ready" ||
          ritual?.status !== "preparing" ||
          cost?.kind !== "significant_gear" ||
          gear.definition.content_definition_id !==
            event.payload.definition.content_definition_id ||
          gear.definition.definition_revision !==
            event.payload.definition.definition_revision ||
          cost.definition.content_definition_id !==
            event.payload.definition.content_definition_id ||
          cost.definition.definition_revision !==
            event.payload.definition.definition_revision
        ) {
          return eventFailure(
            event,
            "Significant gear is unavailable or mismatched.",
          );
        }
        gear.status = "spent";
        break;
      }
      case "resource_changed":
        if (event.payload.owner.scope === "party") {
          if (event.payload.resource !== "supply") {
            return eventFailure(
              event,
              "Only Supply can use a party-scoped resource event.",
            );
          }
          if (next.party.supply !== event.payload.previous) {
            return eventFailure(
              event,
              "Recorded previous Supply does not match state.",
            );
          }
          next.party.supply = event.payload.current;
        } else {
          const character = characterById(
            next,
            event.payload.owner.character_id,
          );
          if (character === undefined) {
            return eventFailure(event, "Resource owner is not playable.");
          }
          if (event.payload.resource === "guard") {
            if (character.resources.guard.current !== event.payload.previous) {
              return eventFailure(
                event,
                "Recorded previous Guard does not match state.",
              );
            }
            character.resources.guard.current = event.payload.current;
          } else if (event.payload.resource === "exertion") {
            if (
              character.resources.exertion.current !== event.payload.previous
            ) {
              return eventFailure(
                event,
                "Recorded previous Exertion does not match state.",
              );
            }
            character.resources.exertion.current = event.payload.current;
          } else {
            return eventFailure(
              event,
              "Supply cannot use a character-scoped resource event.",
            );
          }
        }
        break;
      case "spark_recovered": {
        const character = characterById(next, event.payload.character_id);
        if (character === undefined) {
          return eventFailure(event, "Spark owner is not playable.");
        }
        if (
          character.resources.spark.available ||
          character.resources.spark.complication_recovery_used
        ) {
          return eventFailure(
            event,
            "Spark recovery is not currently eligible.",
          );
        }
        character.resources.spark.available = true;
        character.resources.spark.complication_recovery_used = true;
        break;
      }
      case "costly_rest_completed":
        if (event.payload.supply_spent !== COSTLY_REST_SUPPLY_COST) {
          return eventFailure(event, "Costly rest has the wrong Supply cost.");
        }
        if (next.party.supply < event.payload.supply_spent) {
          return eventFailure(event, "Costly rest would underflow Supply.");
        }
        for (const characterId of event.payload.character_ids) {
          const character = characterById(next, characterId);
          if (character === undefined) {
            return eventFailure(event, "Resting character is not playable.");
          }
          character.resources.guard.current = character.resources.guard.maximum;
          character.resources.exertion.current =
            character.resources.exertion.maximum;
          character.scene_ability_uses = character.scene_ability_uses.map(
            (use) => ({ ...use, used: false }),
          );
        }
        next.party.supply -= event.payload.supply_spent;
        break;
      case "scene_resources_reset":
        if (next.scene_id !== event.payload.scene_id) {
          return eventFailure(
            event,
            "Scene boundary does not match current state.",
          );
        }
        if (
          event.payload.reset_character_ids.length !==
            next.party.characters.length ||
          next.party.characters.some(
            ({ character_id }) =>
              !event.payload.reset_character_ids.includes(character_id),
          )
        ) {
          return eventFailure(
            event,
            "Scene reset must include every playable hero.",
          );
        }
        next.scene_id = event.payload.next_scene_id;
        for (const characterId of event.payload.reset_character_ids) {
          const character = characterById(next, characterId);
          if (character === undefined) {
            return eventFailure(
              event,
              "Scene reset character is not playable.",
            );
          }
          character.resources.guard.current = character.resources.guard.maximum;
          character.resources.exertion.current =
            character.resources.exertion.maximum;
          character.scene_ability_uses = character.scene_ability_uses.map(
            (use) => ({ ...use, used: false }),
          );
          character.conditions = character.conditions.filter(
            ({ duration }) => duration !== "scene",
          );
          if (event.payload.boundary === "session_start") {
            character.resources.spark.available = true;
            character.resources.spark.complication_recovery_used = false;
          }
        }
        if (event.payload.boundary === "session_start") {
          next.session_number += 1;
        }
        break;
      case "rank_advanced": {
        const character = characterById(next, event.payload.character_id);
        if (character === undefined) {
          return eventFailure(event, "Rank owner is not playable.");
        }
        if (
          character.rank !== event.payload.previous_rank ||
          event.payload.current_rank !== event.payload.previous_rank + 1
        ) {
          return eventFailure(
            event,
            "Rank event is not the next ordered rank.",
          );
        }
        const occupied =
          event.payload.current_rank === 2
            ? character.resolved_options.path
            : event.payload.current_rank === 3
              ? character.resolved_options.talent
              : character.resolved_options.capstone;
        if (occupied !== null) {
          return eventFailure(event, "Rank feature slot is already occupied.");
        }
        character.rank = event.payload.current_rank;
        if (event.payload.current_rank === 2) {
          character.resolved_options.path = event.payload.feature;
        } else if (event.payload.current_rank === 3) {
          character.resolved_options.talent = event.payload.feature;
        } else if (event.payload.current_rank === 4) {
          character.resolved_options.capstone = event.payload.feature;
        }
        break;
      }
      case "scene_ability_used": {
        const character = characterById(next, event.payload.character_id);
        const use = character?.scene_ability_uses.find(
          ({ ability }) =>
            ability.content_definition_id ===
              event.payload.ability.content_definition_id &&
            ability.definition_revision ===
              event.payload.ability.definition_revision,
        );
        if (use === undefined || use.used) {
          return eventFailure(
            event,
            "Scene ability is unavailable or already used.",
          );
        }
        use.used = true;
        break;
      }
      case "condition_applied": {
        const character = characterById(next, event.payload.character_id);
        if (character === undefined) {
          return eventFailure(event, "Condition target is not playable.");
        }
        if (
          character.conditions.some(
            ({ condition_id }) =>
              condition_id === event.payload.condition.condition_id,
          )
        ) {
          return eventFailure(event, "Condition identity is already present.");
        }
        character.conditions.push(event.payload.condition);
        break;
      }
      case "condition_removed": {
        const character = characterById(next, event.payload.character_id);
        const index = character?.conditions.findIndex(
          ({ condition_id }) => condition_id === event.payload.condition_id,
        );
        if (character === undefined || index === undefined || index < 0) {
          return eventFailure(event, "Condition to remove was not found.");
        }
        character.conditions.splice(index, 1);
        break;
      }
      case "combat_started":
        if (next.combat !== null) {
          return eventFailure(event, "A combat is already present.");
        }
        next.combat = event.payload.combat;
        break;
      case "activation_started": {
        if (
          next.combat === null ||
          next.combat.combat_id !== event.payload.combat_id
        ) {
          return eventFailure(event, "No combat is active.");
        }
        if (next.combat.active_actor_id !== null) {
          return eventFailure(event, "Another actor is already active.");
        }
        const participant = next.combat.participants.find(
          ({ actor_id }) => actor_id === event.payload.actor_id,
        );
        if (
          participant === undefined ||
          participant.side !== event.payload.side ||
          participant.activation_spent
        ) {
          return eventFailure(event, "Activation actor is unavailable.");
        }
        next.combat.active_side = event.payload.side;
        next.combat.active_actor_id = event.payload.actor_id;
        break;
      }
      case "action_slot_spent": {
        if (
          next.combat === null ||
          next.combat.combat_id !== event.payload.combat_id
        ) {
          return eventFailure(event, "Combat slot event names another combat.");
        }
        const participant = next.combat.participants.find(
          ({ actor_id }) => actor_id === event.payload.actor_id,
        );
        if (participant === undefined) {
          return eventFailure(event, "Combat participant was not found.");
        }
        const available =
          event.payload.slot === "action"
            ? participant.action_available
            : event.payload.slot === "maneuver"
              ? participant.maneuver_available
              : participant.reaction_available;
        if (!available) {
          return eventFailure(event, "Combat slot is already spent.");
        }
        if (
          event.payload.slot !== "reaction" &&
          next.combat.active_actor_id !== participant.actor_id
        ) {
          return eventFailure(
            event,
            "Only the active actor may spend activation slots.",
          );
        }
        const wasActivationSpent = participant.activation_spent;
        if (event.payload.slot === "action")
          participant.action_available = false;
        else if (event.payload.slot === "maneuver") {
          participant.maneuver_available = false;
        } else participant.reaction_available = false;
        participant.activation_spent =
          !participant.action_available && !participant.maneuver_available;
        if (
          event.payload.slot !== "reaction" &&
          !wasActivationSpent &&
          participant.activation_spent &&
          next.combat !== null
        ) {
          next.combat.active_actor_id = null;
          next.combat.active_side =
            participant.side === "hero" ? "enemy" : "hero";
        }
        break;
      }
      case "actor_moved": {
        if (
          next.combat === null ||
          next.combat.combat_id !== event.payload.combat_id
        ) {
          return eventFailure(event, "Movement event names another combat.");
        }
        const participant = next.combat.participants.find(
          ({ actor_id }) => actor_id === event.payload.actor_id,
        );
        if (participant === undefined) {
          return eventFailure(event, "Moving participant was not found.");
        }
        const destination = next.combat.battlefield.zones.find(
          ({ zone_id }) => zone_id === event.payload.to_zone_id,
        );
        const occupancy = next.combat.participants.filter(
          ({ zone_id }) => zone_id === event.payload.to_zone_id,
        ).length;
        if (
          participant.zone_id !== event.payload.from_zone_id ||
          destination === undefined ||
          occupancy >= destination.capacity
        ) {
          return eventFailure(event, "Recorded movement facts are invalid.");
        }
        participant.zone_id = event.payload.to_zone_id;
        break;
      }
      case "combat_action_pending": {
        const pending = next.pending_physical_checks.find(
          ({ pending_check_id }) =>
            pending_check_id === event.payload.pending_check_id,
        );
        if (pending === undefined || pending.continuation !== null) {
          return eventFailure(event, "Combat pending check is unavailable.");
        }
        pending.continuation = {
          kind: "combat_action",
          candidate: event.payload.candidate,
          base_impact: event.payload.base_impact,
        };
        if (next.combat === null) {
          return eventFailure(event, "No combat is active.");
        }
        next.combat.status = "awaiting_physical_action";
        next.combat.pending_action_check_id = pending.pending_check_id;
        break;
      }
      case "death_test_pending": {
        const pending = next.pending_physical_checks.find(
          ({ pending_check_id }) =>
            pending_check_id === event.payload.pending_check_id,
        );
        if (pending === undefined || pending.continuation !== null) {
          return eventFailure(
            event,
            "Death-test pending check is unavailable.",
          );
        }
        pending.continuation = {
          kind: "death_test",
          combat_id: event.payload.combat_id,
          character_id: event.payload.character_id,
        };
        break;
      }
      case "impact_applied": {
        if (
          next.combat === null ||
          next.combat.combat_id !== event.payload.combat_id ||
          event.payload.applied_impact !==
            Math.max(
              1,
              event.payload.base_impact +
                event.payload.triumph_bonus -
                event.payload.armor_reduction,
            ) ||
          event.payload.guard_after !==
            Math.max(
              0,
              event.payload.guard_before - event.payload.applied_impact,
            )
        ) {
          return eventFailure(event, "Recorded Impact arithmetic is invalid.");
        }
        const character = characterByActorId(
          next,
          event.payload.target_actor_id,
        );
        if (character !== undefined) {
          if (
            character.resources.guard.current !== event.payload.guard_before
          ) {
            return eventFailure(
              event,
              "Recorded hero Guard does not match state.",
            );
          }
          character.resources.guard.current = event.payload.guard_after;
        } else {
          const participant = next.combat?.participants.find(
            ({ actor_id }) => actor_id === event.payload.target_actor_id,
          );
          if (participant?.side !== "enemy") {
            return eventFailure(event, "Impact target was not found.");
          }
          if (participant.armor !== event.payload.armor_reduction) {
            return eventFailure(event, "Recorded armor does not match state.");
          }
          if (participant.guard.current !== event.payload.guard_before) {
            return eventFailure(
              event,
              "Recorded enemy Guard does not match state.",
            );
          }
          participant.guard.current = event.payload.guard_after;
        }
        break;
      }
      case "wound_marked": {
        const character = characterById(next, event.payload.character_id);
        if (character === undefined) {
          return eventFailure(event, "Wounded character is not playable.");
        }
        const differences = character.resources.wounds.filter(
          (wound, index) =>
            JSON.stringify(wound) !==
            JSON.stringify(event.payload.wounds[index]),
        );
        if (differences.length !== 1 || differences[0]?.status !== "empty") {
          return eventFailure(
            event,
            "Wound event must fill exactly one empty slot.",
          );
        }
        character.resources.wounds = event.payload.wounds;
        break;
      }
      case "reaction_window_opened":
        if (next.combat === null)
          return eventFailure(event, "No combat is active.");
        if (
          next.combat.reaction_window !== null &&
          next.combat.reaction_window.reaction_window_id !==
            event.payload.window.reaction_window_id
        ) {
          return eventFailure(
            event,
            "A different reaction window is already open.",
          );
        }
        next.combat.reaction_window = event.payload.window;
        break;
      case "reaction_window_closed":
        if (next.combat === null)
          return eventFailure(event, "No combat is active.");
        next.combat.reaction_window = null;
        break;
      case "reaction_restored": {
        const participant = next.combat?.participants.find(
          ({ actor_id }) => actor_id === event.payload.actor_id,
        );
        if (participant === undefined || participant.reaction_available) {
          return eventFailure(event, "Reaction cannot be restored.");
        }
        participant.reaction_available = true;
        break;
      }
      case "round_advanced":
        if (next.combat === null)
          return eventFailure(event, "No combat is active.");
        if (
          next.combat.round !== event.payload.previous_round ||
          event.payload.current_round !== event.payload.previous_round + 1 ||
          next.combat.participants.some(
            (participant) =>
              combatParticipantAlive(next, participant) &&
              !participant.activation_spent,
          )
        ) {
          return eventFailure(
            event,
            "Round cannot advance before all actors are spent.",
          );
        }
        next.combat.round = event.payload.current_round;
        next.combat.active_side = "hero";
        next.combat.active_actor_id = null;
        next.combat.participants = next.combat.participants.map(
          (participant) => ({
            ...participant,
            action_available: true,
            maneuver_available: true,
            reaction_available: true,
            activation_spent: false,
          }),
        );
        next.combat.reaction_window = null;
        for (const character of next.party.characters) {
          character.conditions = character.conditions.filter(
            ({ duration }) => duration !== "round",
          );
        }
        break;
      case "boss_overlay_activated":
        if (next.combat === null)
          return eventFailure(event, "No combat is active.");
        {
          const boss = next.combat.participants.find(
            ({ actor_id }) => actor_id === event.payload.overlay.actor_id,
          );
          if (
            boss?.side !== "enemy" ||
            boss.kind !== "boss" ||
            boss.guard.current !== event.payload.guard_before ||
            event.payload.guard_after > boss.guard.maximum
          ) {
            return eventFailure(event, "Boss overlay Guard facts are invalid.");
          }
          boss.guard.current = event.payload.guard_after;
        }
        next.combat.boss_overlays = next.combat.boss_overlays.map((overlay) =>
          overlay.actor_id === event.payload.overlay.actor_id
            ? event.payload.overlay
            : overlay,
        );
        break;
      case "objective_advanced": {
        const objective = next.combat?.objectives.find(
          ({ objective_id }) => objective_id === event.payload.objective_id,
        );
        if (objective === undefined) {
          return eventFailure(event, "Combat objective was not found.");
        }
        if (
          objective.progress !== event.payload.previous ||
          event.payload.current < event.payload.previous ||
          event.payload.current > objective.threshold ||
          (event.payload.status === "completed") !==
            (event.payload.current === objective.threshold)
        ) {
          return eventFailure(
            event,
            "Objective advancement facts are invalid.",
          );
        }
        objective.progress = event.payload.current;
        objective.status = event.payload.status;
        break;
      }
      case "death_test_aid_applied": {
        const pending = next.pending_physical_checks.find(
          ({ pending_check_id }) =>
            pending_check_id === event.payload.pending_check_id,
        );
        if (pending === undefined) {
          return eventFailure(event, "Pending death test was not found.");
        }
        pending.disclosure = event.payload.updated_disclosure;
        break;
      }
      case "hero_stabilized": {
        const character = characterById(next, event.payload.character_id);
        if (character === undefined) {
          return eventFailure(event, "Stabilized character is not playable.");
        }
        character.resources.wounds = event.payload.wounds;
        break;
      }
      case "permanent_scar_gained":
        next.permanent_scars.push({
          scar_id: event.payload.scar_id,
          character_id: event.payload.character_id,
          name: event.payload.name,
        });
        break;
      case "character_died":
        next.permanent_deaths.push(event.payload.character_id);
        break;
      case "combat_resolved":
        if (next.combat === null)
          return eventFailure(event, "No combat is active.");
        next.combat.status = "resolved";
        break;
      case "challenge_started":
        if (
          next.challenges.some(
            ({ challenge_id }) =>
              challenge_id === event.payload.challenge.challenge_id,
          ) ||
          !validateChallengeState(event.payload.challenge).success
        ) {
          return eventFailure(
            event,
            "Challenge start state is invalid or duplicated.",
          );
        }
        next.challenges.push(event.payload.challenge);
        break;
      case "challenge_check_pending": {
        const pending = next.pending_physical_checks.find(
          ({ pending_check_id }) =>
            pending_check_id === event.payload.pending_check_id,
        );
        if (pending === undefined || pending.continuation !== null) {
          return eventFailure(event, "Challenge pending check is unavailable.");
        }
        const challenge = next.challenges.find(
          ({ challenge_id }) => challenge_id === event.payload.challenge_id,
        );
        if (challenge === undefined || challenge.status !== "active") {
          return eventFailure(event, "Challenge is not active.");
        }
        pending.continuation = {
          kind: "challenge",
          challenge_id: event.payload.challenge_id,
        };
        break;
      }
      case "challenge_tracks_changed": {
        const challenge = next.challenges.find(
          ({ challenge_id }) => challenge_id === event.payload.challenge_id,
        );
        if (challenge === undefined) {
          return eventFailure(event, "Challenge was not found.");
        }
        if (
          challenge.status !== "active" ||
          challenge.progress.current !== event.payload.progress_before ||
          challenge.danger.current !== event.payload.danger_before ||
          event.payload.progress_after < event.payload.progress_before ||
          event.payload.danger_after < event.payload.danger_before
        ) {
          return eventFailure(
            event,
            "Recorded challenge transition is invalid.",
          );
        }
        const candidate = structuredClone(challenge);
        candidate.progress.current = event.payload.progress_after;
        candidate.danger.current = event.payload.danger_after;
        candidate.status = event.payload.status;
        if (!validateChallengeState(candidate).success) {
          return eventFailure(
            event,
            "Challenge outcome does not match its tracks.",
          );
        }
        challenge.progress.current = event.payload.progress_after;
        challenge.danger.current = event.payload.danger_after;
        challenge.status = event.payload.status;
        break;
      }
      case "challenge_resolved": {
        const challenge = next.challenges.find(
          ({ challenge_id }) => challenge_id === event.payload.challenge_id,
        );
        if (challenge === undefined) {
          return eventFailure(event, "Challenge was not found.");
        }
        if (challenge.status !== event.payload.outcome) {
          return eventFailure(
            event,
            "Challenge resolution contradicts its tracks.",
          );
        }
        challenge.status = event.payload.outcome;
        break;
      }
      case "social_state_established":
        if (
          next.social_states.some(
            ({ npc_actor_id }) =>
              npc_actor_id === event.payload.social_state.npc_actor_id,
          ) ||
          !validateSocialState(event.payload.social_state).success
        ) {
          return eventFailure(event, "Social state is invalid or duplicated.");
        }
        next.social_states.push(event.payload.social_state);
        break;
      case "social_check_pending": {
        const pending = next.pending_physical_checks.find(
          ({ pending_check_id }) =>
            pending_check_id === event.payload.pending_check_id,
        );
        if (pending === undefined || pending.continuation !== null) {
          return eventFailure(event, "Social pending check is unavailable.");
        }
        if (
          !next.social_states.some(
            ({ npc_actor_id }) => npc_actor_id === event.payload.npc_actor_id,
          )
        ) {
          return eventFailure(event, "Social state was not found.");
        }
        pending.continuation = {
          kind: "social",
          npc_actor_id: event.payload.npc_actor_id,
          requested_stance: event.payload.requested_stance,
          challenged_limit_id: event.payload.challenged_limit_id,
        };
        break;
      }
      case "social_stance_changed": {
        const social = next.social_states.find(
          ({ npc_actor_id }) => npc_actor_id === event.payload.npc_actor_id,
        );
        if (social === undefined)
          return eventFailure(event, "Social state was not found.");
        const stances = ["closed", "guarded", "receptive", "aligned"] as const;
        const distance = Math.abs(
          stances.indexOf(event.payload.current) -
            stances.indexOf(event.payload.previous),
        );
        const maximumDistance =
          event.payload.result.final_degree === "Triumph"
            ? 2
            : event.payload.result.final_degree === "Success"
              ? 1
              : 0;
        if (
          social.stance !== event.payload.previous ||
          distance < 1 ||
          distance > maximumDistance
        ) {
          return eventFailure(
            event,
            "Recorded social stance shift is invalid.",
          );
        }
        social.stance = event.payload.current;
        break;
      }
      case "leverage_created": {
        const social = next.social_states.find(
          ({ npc_actor_id }) => npc_actor_id === event.payload.npc_actor_id,
        );
        if (social === undefined)
          return eventFailure(event, "Social state was not found.");
        if (
          social.leverage.length >= social.leverage_capacity ||
          social.leverage.some(
            ({ leverage_id }) =>
              leverage_id === event.payload.leverage.leverage_id,
          )
        ) {
          return eventFailure(
            event,
            "Leverage capacity or identity is invalid.",
          );
        }
        social.leverage.push(event.payload.leverage);
        break;
      }
      case "leverage_spent": {
        const social = next.social_states.find(
          ({ npc_actor_id }) => npc_actor_id === event.payload.npc_actor_id,
        );
        if (social === undefined)
          return eventFailure(event, "Social state was not found.");
        if (
          !social.leverage.some(
            ({ leverage_id }) => leverage_id === event.payload.leverage_id,
          )
        ) {
          return eventFailure(event, "Spent leverage was not present.");
        }
        social.leverage = social.leverage.filter(
          ({ leverage_id }) => leverage_id !== event.payload.leverage_id,
        );
        break;
      }
      case "ritual_started":
        if (
          next.rituals.some(
            ({ ritual_id }) => ritual_id === event.payload.ritual.ritual_id,
          ) ||
          !validateRitualState(event.payload.ritual).success
        ) {
          return eventFailure(
            event,
            "Ritual start state is invalid or duplicated.",
          );
        }
        next.rituals.push(event.payload.ritual);
        break;
      case "ritual_check_pending": {
        const pending = next.pending_physical_checks.find(
          ({ pending_check_id }) =>
            pending_check_id === event.payload.pending_check_id,
        );
        if (pending === undefined || pending.continuation !== null) {
          return eventFailure(event, "Ritual pending check is unavailable.");
        }
        pending.continuation = {
          kind: "ritual",
          ritual_id: event.payload.ritual_id,
        };
        const ritual = next.rituals.find(
          ({ ritual_id }) => ritual_id === event.payload.ritual_id,
        );
        if (ritual === undefined || ritual.status !== "ready") {
          return eventFailure(event, "Ritual is not ready for resolution.");
        }
        ritual.status = "awaiting_resolution";
        break;
      }
      case "ritual_contribution": {
        const ritual = next.rituals.find(
          ({ ritual_id }) => ritual_id === event.payload.ritual_id,
        );
        if (ritual === undefined)
          return eventFailure(event, "Ritual was not found.");
        if (
          ritual.status !== "preparing" ||
          event.payload.paid_cost_index !== ritual.paid_cost_count ||
          ritual.costs[event.payload.paid_cost_index] === undefined ||
          characterById(next, event.payload.character_id) === undefined
        ) {
          return eventFailure(
            event,
            "Recorded ritual contribution is invalid.",
          );
        }
        if (!ritual.contributor_ids.includes(event.payload.character_id)) {
          ritual.contributor_ids.push(event.payload.character_id);
        }
        ritual.paid_cost_count = event.payload.paid_cost_index + 1;
        break;
      }
      case "ritual_ready": {
        const ritual = next.rituals.find(
          ({ ritual_id }) => ritual_id === event.payload.ritual_id,
        );
        if (ritual === undefined)
          return eventFailure(event, "Ritual was not found.");
        if (
          ritual.status !== "preparing" ||
          ritual.paid_cost_count !== ritual.costs.length
        ) {
          return eventFailure(event, "Ritual is not fully paid and preparing.");
        }
        ritual.status = "ready";
        break;
      }
      case "ritual_resolved": {
        const ritual = next.rituals.find(
          ({ ritual_id }) => ritual_id === event.payload.ritual_id,
        );
        if (ritual === undefined)
          return eventFailure(event, "Ritual was not found.");
        const expectedOutcome =
          event.payload.result.final_degree === "Success" ||
          event.payload.result.final_degree === "Triumph"
            ? "completed"
            : "failed";
        if (
          (ritual.status !== "ready" &&
            ritual.status !== "awaiting_resolution") ||
          event.payload.outcome !== expectedOutcome
        ) {
          return eventFailure(event, "Recorded ritual resolution is invalid.");
        }
        ritual.status = event.payload.outcome;
        break;
      }
      case "ritual_interrupted": {
        const ritual = next.rituals.find(
          ({ ritual_id }) => ritual_id === event.payload.ritual_id,
        );
        if (ritual === undefined)
          return eventFailure(event, "Ritual was not found.");
        if (
          ritual.status === "completed" ||
          ritual.status === "failed" ||
          ritual.status === "interrupted"
        ) {
          return eventFailure(event, "Ritual is already closed.");
        }
        ritual.status = "interrupted";
        break;
      }
      default:
        assertNever(event);
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown application failure.";
    return eventFailure(event, message);
  }

  const validated = validateStateInvariants(next);
  if (!validated.success) {
    const issues: ValidationIssue[] = validated.issues.map((issue) => ({
      ...issue,
      message: `Event ${event.kind} produced invalid state: ${issue.message}`,
    }));
    return validationFailure(issues);
  }
  return validated;
}
