import { describe, expect, it } from "vitest";
import {
  PHASE_1_CHALLENGE_RULES,
  PHASE_1_COMBAT_FLOW_RULES,
  PHASE_1_DEATH_TEST_RULES,
  PHASE_1_RESOURCE_RULES,
  PHASE_1_RITUAL_RULES,
  compareReactionPriority,
  conditionExpiresAt,
  guardMaximumFor,
} from "./phase-1-rules.js";

describe("Phase 1 locked rules", () => {
  it("publishes literal rank-one Guard maxima", () => {
    expect(
      ["Vanguard", "Maverick", "Wayfinder", "Envoy", "Weaver", "Beacon"].map(
        (archetype) =>
          guardMaximumFor(archetype as Parameters<typeof guardMaximumFor>[0]),
      ),
    ).toEqual([8, 7, 6, 6, 5, 6]);
  });

  it("locks scene, costly-rest, and session recovery", () => {
    expect(PHASE_1_RESOURCE_RULES.costly_rest_supply_cost).toBe(1);
    expect(PHASE_1_RESOURCE_RULES.scene_transition).toEqual({
      restore_guard: true,
      restore_exertion: true,
      reset_scene_abilities: true,
      heal_wounds: false,
      restore_spark: false,
    });
    expect(PHASE_1_RESOURCE_RULES.session_start.restore_supply).toBe(false);
  });

  it("locks the physical death-test inputs and outcomes", () => {
    expect(PHASE_1_DEATH_TEST_RULES).toMatchObject({
      target: 13,
      attribute: "Force",
      discipline: "Athletics",
      ally_aid_grants_edge: true,
      success_wounds_remaining: 2,
      triumph_grants_permanent_scar: true,
      setback_is_permanent_death: true,
      crisis_is_permanent_death: true,
    });
  });

  it("orders reactions by affected actor, hero side, then stable identity", () => {
    const candidates = [
      {
        actor_id: "actor_enemy_b_001",
        side: "enemy" as const,
        directly_affected: false,
      },
      {
        actor_id: "actor_hero_b_001",
        side: "hero" as const,
        directly_affected: false,
      },
      {
        actor_id: "actor_enemy_a_001",
        side: "enemy" as const,
        directly_affected: true,
      },
      {
        actor_id: "actor_hero_a_001",
        side: "hero" as const,
        directly_affected: false,
      },
    ];
    expect(
      candidates.sort(compareReactionPriority).map(({ actor_id }) => actor_id),
    ).toEqual([
      "actor_enemy_a_001",
      "actor_hero_a_001",
      "actor_hero_b_001",
      "actor_enemy_b_001",
    ]);
    expect(PHASE_1_COMBAT_FLOW_RULES.first_side).toBe("hero");
  });

  it("locks challenge, ritual, and condition edge cases", () => {
    expect(PHASE_1_CHALLENGE_RULES.vertical_slice).toEqual({
      progress_maximum: 4,
      danger_maximum: 3,
      tie_rule: "resolved_with_cost",
    });
    expect(PHASE_1_RITUAL_RULES).toMatchObject({
      interruption_status: "interrupted",
      paid_costs_remain_spent: true,
      unpaid_costs_remain_unspent: true,
      restart_requires_new_ritual: true,
    });
    expect(conditionExpiresAt("round")).toBe("next_round_transition");
    expect(conditionExpiresAt("scene")).toBe("next_scene_transition");
    expect(conditionExpiresAt("until_removed")).toBe("explicit_remove_effect");
  });
});
