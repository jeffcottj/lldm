import type {
  CommandRejectionCode,
  GameEvent,
  GameState,
  TransactionId,
} from "@lldm/contracts";
import type { DomainEventProposal } from "./decide-command.js";

export type EventUndoClassification =
  | { readonly classification: "non_state_changing" }
  | { readonly classification: "undoable"; readonly inverse: string }
  | {
      readonly classification: "non_undoable";
      readonly rejection_code: CommandRejectionCode;
      readonly reason: string;
    };

function nonInvertible(reason: string): EventUndoClassification {
  return {
    classification: "non_undoable",
    rejection_code: "undo_non_invertible_dependency",
    reason,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled compensation event: ${JSON.stringify(value)}`);
}

export function classifyEventForUndo(
  event: GameEvent,
): EventUndoClassification {
  switch (event.kind) {
    case "command_accepted":
    case "command_rejected":
    case "enemy_action_selected":
    case "transaction_compensated":
      return { classification: "non_state_changing" };
    case "check_resolved":
      return "pending_check_id" in event.payload
        ? {
            classification: "non_undoable",
            rejection_code: "undo_physical_result",
            reason: "A submitted physical result cannot be compensated.",
          }
        : { classification: "non_state_changing" };
    case "resource_changed":
      return { classification: "undoable", inverse: "resource_changed" };
    case "actor_moved":
      return { classification: "undoable", inverse: "actor_moved" };
    case "social_stance_changed":
      return {
        classification: "undoable",
        inverse: "social_stance_changed",
      };
    case "leverage_created":
      return { classification: "undoable", inverse: "leverage_spent" };
    case "condition_applied":
      return { classification: "undoable", inverse: "condition_removed" };
    case "physical_roll_requested":
      return {
        classification: "undoable",
        inverse: "physical_roll_cancelled",
      };
    case "spark_spent":
      return {
        classification: "undoable",
        inverse: "spark_restored_by_compensation",
      };
    case "action_slot_spent":
      return { classification: "undoable", inverse: "action_slot_restored" };
    case "character_died":
      return {
        classification: "non_undoable",
        rejection_code: "undo_permanent_death",
        reason: "Permanent death cannot be compensated.",
      };
    case "combat_action_pending":
    case "death_test_pending":
    case "challenge_check_pending":
    case "social_check_pending":
    case "ritual_check_pending":
      return { classification: "non_state_changing" };
    case "physical_roll_cancelled":
    case "spark_restored_by_compensation":
    case "action_slot_restored":
      return nonInvertible("A compensation event cannot be compensated again.");
    case "character_materialized":
      return nonInvertible("Materialized character identity is retained.");
    case "significant_gear_spent":
      return nonInvertible("Spent significant gear cannot be reconstructed.");
    case "spark_recovered":
      return nonInvertible("Spark recovery opportunity cannot be restored.");
    case "costly_rest_completed":
      return nonInvertible("A multi-resource rest reset is not invertible.");
    case "scene_resources_reset":
      return nonInvertible("A scene boundary is not invertible.");
    case "rank_advanced":
      return nonInvertible("Structural rank advancement is not invertible.");
    case "scene_ability_used":
      return nonInvertible("Scene-use history is not invertible.");
    case "condition_removed":
      return nonInvertible("Removed condition facts are not retained.");
    case "combat_started":
      return nonInvertible("Combat creation is not invertible.");
    case "activation_started":
    case "reaction_window_opened":
    case "reaction_window_closed":
    case "reaction_restored":
    case "round_advanced":
      return nonInvertible("Combat economy history cannot be rewound safely.");
    case "impact_applied":
    case "wound_marked":
    case "hero_stabilized":
    case "permanent_scar_gained":
      return nonInvertible("Harm and recovery history is not invertible.");
    case "boss_overlay_activated":
    case "objective_advanced":
    case "combat_resolved":
      return nonInvertible(
        "Combat objective or lifecycle state is not invertible.",
      );
    case "death_test_aid_applied":
      return nonInvertible("Death-test aid cannot be reconstructed safely.");
    case "challenge_started":
    case "challenge_tracks_changed":
    case "challenge_resolved":
      return nonInvertible("Challenge lifecycle history is not invertible.");
    case "social_state_established":
    case "leverage_spent":
      return nonInvertible("Removed social facts are not retained.");
    case "ritual_started":
    case "ritual_contribution":
    case "ritual_ready":
    case "ritual_resolved":
    case "ritual_interrupted":
      return nonInvertible(
        "Ritual costs and lifecycle state are not invertible.",
      );
    default:
      return assertNever(event);
  }
}

function inverseEvent(event: GameEvent): DomainEventProposal | null {
  switch (event.kind) {
    case "resource_changed":
      return {
        kind: "resource_changed",
        payload: {
          ...event.payload,
          previous: event.payload.current,
          current: event.payload.previous,
          reason: `Compensation: ${event.payload.reason}`.slice(0, 120),
        },
      };
    case "actor_moved":
      return {
        kind: "actor_moved",
        payload: {
          ...event.payload,
          from_zone_id: event.payload.to_zone_id,
          to_zone_id: event.payload.from_zone_id,
        },
      };
    case "social_stance_changed":
      return {
        kind: "social_stance_changed",
        payload: {
          ...event.payload,
          previous: event.payload.current,
          current: event.payload.previous,
        },
      };
    case "leverage_created":
      return {
        kind: "leverage_spent",
        payload: {
          npc_actor_id: event.payload.npc_actor_id,
          leverage_id: event.payload.leverage.leverage_id,
        },
      };
    case "condition_applied":
      return {
        kind: "condition_removed",
        payload: {
          character_id: event.payload.character_id,
          condition_id: event.payload.condition.condition_id,
          reason: "Compensated latest transaction.",
        },
      };
    case "physical_roll_requested":
      return {
        kind: "physical_roll_cancelled",
        payload: {
          pending_check_id: event.payload.pending_check_id,
          reason: "transaction_compensation",
        },
      };
    case "spark_spent":
      return {
        kind: "spark_restored_by_compensation",
        payload: { actor_id: event.payload.actor_id },
      };
    case "action_slot_spent":
      return {
        kind: "action_slot_restored",
        payload: event.payload,
      };
    default:
      return null;
  }
}

export type CompensationPlan =
  | {
      readonly accepted: true;
      readonly events: readonly DomainEventProposal[];
    }
  | {
      readonly accepted: false;
      readonly rejection_code: CommandRejectionCode;
      readonly safe_detail: string;
    };

export function planTransactionCompensation(input: {
  readonly state: GameState;
  readonly target_transaction_id: TransactionId;
  readonly events: readonly GameEvent[];
}): CompensationPlan {
  const inverses: DomainEventProposal[] = [];
  for (const event of input.events.toReversed()) {
    const classification = classifyEventForUndo(event);
    if (classification.classification === "non_state_changing") continue;
    if (classification.classification === "non_undoable") {
      return {
        accepted: false,
        rejection_code: classification.rejection_code,
        safe_detail: classification.reason,
      };
    }
    const inverse = inverseEvent(event);
    if (inverse === null) {
      return {
        accepted: false,
        rejection_code: "undo_non_invertible_dependency",
        safe_detail: "The selected inverse event is unavailable.",
      };
    }
    inverses.push(inverse);
  }
  if (inverses.length === 0) {
    return {
      accepted: false,
      rejection_code: "undo_non_invertible_dependency",
      safe_detail: "The target transaction made no compensable state change.",
    };
  }
  return {
    accepted: true,
    events: [
      ...inverses,
      {
        kind: "transaction_compensated",
        payload: { target_transaction_id: input.target_transaction_id },
      },
    ],
  };
}
