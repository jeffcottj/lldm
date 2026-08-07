import { describe, expect, it } from "vitest";
import {
  CombatStateSchema,
  SubmitDieResultCommandSchema,
  validateActionSlotSpend,
  validateCombatState,
  validateZoneGraph,
} from "./index.js";
import { validateValue } from "./validation.js";

function zone(
  suffix: string,
  connections: readonly string[],
  capacity = 4,
): Record<string, unknown> {
  return {
    zone_id: `zone_${suffix}_001`,
    name: `Zone ${suffix.toUpperCase()}`,
    capacity,
    cover: "none",
    hazard_tags: [],
    objective_ids: [],
    elevation: "level",
    visibility: "open",
    connections,
  };
}

function battlefield(): { zones: Record<string, unknown>[] } {
  return {
    zones: [
      zone("a", ["zone_b_001", "zone_e_001"]),
      zone("b", ["zone_a_001", "zone_c_001"]),
      zone("c", ["zone_b_001", "zone_d_001"]),
      zone("d", ["zone_c_001", "zone_e_001"]),
      zone("e", ["zone_d_001", "zone_a_001"]),
    ],
  };
}

function combatState(): Record<string, unknown> {
  return {
    schema_version: 1,
    record_kind: "combat_state",
    combat_id: "combat_glassway_001",
    status: "active",
    round: 1,
    active_side: "hero",
    active_actor_id: null,
    battlefield: battlefield(),
    participants: [
      {
        actor_id: "actor_sable_001",
        side: "hero",
        kind: "hero",
        zone_id: "zone_a_001",
        action_available: true,
        maneuver_available: true,
        reaction_available: true,
        activation_spent: false,
        eligible_roller: "seat_sable_001",
      },
      {
        actor_id: "actor_cinder_001",
        side: "enemy",
        kind: "boss",
        zone_id: "zone_c_001",
        action_available: true,
        maneuver_available: true,
        reaction_available: true,
        activation_spent: false,
        definition: {
          content_definition_id: "content_enemy_cinder_001",
          definition_revision: 1,
        },
        guard: { current: 10, maximum: 10 },
        armor: 1,
      },
    ],
    objectives: [
      {
        objective_id: "objective_beacon_001",
        definition: {
          content_definition_id: "content_objective_beacon_001",
          definition_revision: 1,
        },
        progress: 0,
        threshold: 3,
        status: "active",
      },
    ],
    boss_overlays: [
      {
        actor_id: "actor_cinder_001",
        definition: {
          content_definition_id: "content_overlay_cinder_001",
          definition_revision: 1,
        },
        active: false,
        objective_id: "objective_beacon_001",
      },
    ],
    reaction_window: null,
    pending_death_check_id: null,
    pending_action_check_id: null,
  };
}

describe("zone and combat contracts", () => {
  it("accepts a connected symmetric five-zone battlefield", () => {
    expect(validateZoneGraph(battlefield()).success).toBe(true);
    expect(validateCombatState(combatState()).success).toBe(true);
  });

  it("rejects asymmetric and disconnected zone graphs precisely", () => {
    const asymmetric = battlefield();
    (asymmetric.zones[1] as Record<string, unknown>).connections = [
      "zone_c_001",
    ];
    const asymmetricResult = validateZoneGraph(asymmetric);
    expect(asymmetricResult.success).toBe(false);
    if (!asymmetricResult.success) {
      expect(
        asymmetricResult.issues.some(
          ({ code }) => code === "zone.asymmetric_connection",
        ),
      ).toBe(true);
    }

    const disconnected = {
      zones: [
        zone("a", ["zone_b_001"]),
        zone("b", ["zone_a_001"]),
        zone("c", ["zone_d_001"]),
        zone("d", ["zone_c_001", "zone_e_001"]),
        zone("e", ["zone_d_001"]),
      ],
    };
    const disconnectedResult = validateZoneGraph(disconnected);
    expect(disconnectedResult.success).toBe(false);
    if (!disconnectedResult.success) {
      expect(
        disconnectedResult.issues.some(
          ({ code }) => code === "zone.disconnected_graph",
        ),
      ).toBe(true);
    }
  });

  it("rejects over-capacity positions and boss overlays without objectives", () => {
    const overCapacity = combatState();
    const overCapacityBattlefield = overCapacity.battlefield as {
      zones: Record<string, unknown>[];
    };
    overCapacityBattlefield.zones[0] = zone(
      "a",
      ["zone_b_001", "zone_e_001"],
      1,
    );
    const participants = overCapacity.participants as Record<string, unknown>[];
    participants[1] = {
      ...participants[1],
      zone_id: "zone_a_001",
    };
    const capacityResult = validateCombatState(overCapacity);
    expect(capacityResult.success).toBe(false);
    if (!capacityResult.success) {
      expect(
        capacityResult.issues.some(
          ({ code }) => code === "combat.zone_over_capacity",
        ),
      ).toBe(true);
    }

    const missingObjective = combatState();
    const overlays = missingObjective.boss_overlays as Record<
      string,
      unknown
    >[];
    overlays[0] = {
      ...overlays[0],
      objective_id: "objective_missing_001",
    };
    const overlayResult = validateCombatState(missingObjective);
    expect(overlayResult.success).toBe(false);
    if (!overlayResult.success) {
      expect(
        overlayResult.issues.some(
          ({ code }) => code === "boss.missing_objective",
        ),
      ).toBe(true);
    }
  });

  it("limits die submission to pending identity, nonce, submission identity, and face", () => {
    const command = {
      schema_version: 1,
      command_id: "command_submit_001",
      transaction_id: "transaction_submit_001",
      campaign_id: "campaign_ember_001",
      expected_revision: 6,
      kind: "submit_die_result",
      payload: {
        pending_check_id: "pending_check_sable_002",
        physical_submission_id: "physical_submission_sable_002",
        submission_nonce: "physical_nonce_sable_002",
        die_face: 17,
      },
    };
    expect(validateValue(SubmitDieResultCommandSchema, command).success).toBe(
      true,
    );
    expect(Object.keys(command.payload).sort()).toEqual([
      "die_face",
      "pending_check_id",
      "physical_submission_id",
      "submission_nonce",
    ]);
    expect(
      validateValue(SubmitDieResultCommandSchema, {
        ...command,
        payload: { ...command.payload, target: 10 },
      }).success,
    ).toBe(false);
  });

  it("keeps combat state independently versioned", () => {
    expect(validateValue(CombatStateSchema, combatState()).success).toBe(true);
  });

  it("rejects a duplicate activation-slot spend", () => {
    const participant = {
      actor_id: "actor_sable_001",
      side: "hero" as const,
      kind: "hero" as const,
      zone_id: "zone_a_001",
      action_available: false,
      maneuver_available: true,
      reaction_available: true,
      activation_spent: false,
      eligible_roller: "seat_sable_001",
    };
    const result = validateActionSlotSpend(participant, "action");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(
          ({ code }) => code === "combat.action_slot_already_spent",
        ),
      ).toBe(true);
    }
  });
});
