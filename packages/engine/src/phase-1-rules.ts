import {
  ARCHETYPE_GUARD_MAXIMA,
  COMBAT_FIRST_SIDE,
  CONDITION_DURATIONS,
  COSTLY_REST_SUPPLY_COST,
  DEATH_TEST_ATTRIBUTE,
  DEATH_TEST_DISCIPLINE,
  DEATH_TEST_TARGET,
  EXERTION_MAXIMUM,
  VERTICAL_SLICE_CHALLENGE_TIE_RULE,
  VERTICAL_SLICE_DANGER_MAXIMUM,
  VERTICAL_SLICE_PROGRESS_MAXIMUM,
  type ActorId,
  type ArchetypeName,
  type ConditionDuration,
} from "@lldm/contracts";

export const PHASE_1_RESOURCE_RULES = Object.freeze({
  guard_by_archetype: ARCHETYPE_GUARD_MAXIMA,
  exertion_maximum: EXERTION_MAXIMUM,
  costly_rest_supply_cost: COSTLY_REST_SUPPLY_COST,
  scene_transition: Object.freeze({
    restore_guard: true,
    restore_exertion: true,
    reset_scene_abilities: true,
    heal_wounds: false,
    restore_spark: false,
  }),
  costly_rest: Object.freeze({
    restore_guard: true,
    restore_exertion: true,
    reset_scene_abilities: true,
    heal_wounds: false,
    restore_spark: false,
  }),
  session_start: Object.freeze({
    restore_spark: true,
    reset_spark_complication_recovery: true,
    restore_supply: false,
  }),
});

export const PHASE_1_DEATH_TEST_RULES = Object.freeze({
  target: DEATH_TEST_TARGET,
  attribute: DEATH_TEST_ATTRIBUTE,
  discipline: DEATH_TEST_DISCIPLINE,
  ally_aid_grants_edge: true,
  success_wounds_remaining: 2,
  triumph_grants_permanent_scar: true,
  setback_is_permanent_death: true,
  crisis_is_permanent_death: true,
});

export const PHASE_1_COMBAT_FLOW_RULES = Object.freeze({
  first_side: COMBAT_FIRST_SIDE,
  exhausted_side_yields: true,
  round_ends_when_both_sides_exhausted: true,
  reset_action_maneuver_reaction_on_new_round: true,
  reaction_first_use_closes_window: true,
});

export const PHASE_1_CHALLENGE_RULES = Object.freeze({
  definition_must_set_thresholds: true,
  definition_must_set_tie_rule: true,
  vertical_slice: Object.freeze({
    progress_maximum: VERTICAL_SLICE_PROGRESS_MAXIMUM,
    danger_maximum: VERTICAL_SLICE_DANGER_MAXIMUM,
    tie_rule: VERTICAL_SLICE_CHALLENGE_TIE_RULE,
  }),
});

export const PHASE_1_RITUAL_RULES = Object.freeze({
  interruption_status: "interrupted" as const,
  paid_costs_remain_spent: true,
  unpaid_costs_remain_unspent: true,
  restart_requires_new_ritual: true,
});

export const PHASE_1_CONDITION_RULES = Object.freeze({
  supported_durations: CONDITION_DURATIONS,
  round_expires_at: "next_round_transition" as const,
  scene_expires_at: "next_scene_transition" as const,
  until_removed_expires_at: "explicit_remove_effect" as const,
});

export interface ReactionPriorityCandidate {
  readonly actor_id: ActorId;
  readonly side: "hero" | "enemy";
  readonly directly_affected: boolean;
}

export function compareReactionPriority(
  left: ReactionPriorityCandidate,
  right: ReactionPriorityCandidate,
): number {
  if (left.directly_affected !== right.directly_affected) {
    return left.directly_affected ? -1 : 1;
  }
  if (left.side !== right.side) return left.side === "hero" ? -1 : 1;
  return left.actor_id.localeCompare(right.actor_id);
}

export function guardMaximumFor(archetype: ArchetypeName): number {
  return PHASE_1_RESOURCE_RULES.guard_by_archetype[archetype];
}

export function conditionExpiresAt(duration: ConditionDuration): string {
  switch (duration) {
    case "round":
      return PHASE_1_CONDITION_RULES.round_expires_at;
    case "scene":
      return PHASE_1_CONDITION_RULES.scene_expires_at;
    case "until_removed":
      return PHASE_1_CONDITION_RULES.until_removed_expires_at;
  }
}
