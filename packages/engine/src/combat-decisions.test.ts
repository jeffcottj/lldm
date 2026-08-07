import {
  type CampaignId,
  type ContentDefinition,
  ContentDefinitionSchema,
  type ContentManifestHash,
  type GameCommand,
  GameCommandSchema,
  type GameEvent,
  GameEventSchema,
  type GameState,
  type LegalActionId,
  type PlayableCharacterState,
  type RandomDrawRecord,
  validateGameState,
  validatePlayableCharacterState,
  validateValue,
} from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import { applyGameEvent } from "./apply-event.js";
import {
  enumerateCombatActions,
  enumerateCombatReactions,
  rangeBetweenActors,
  zoneDistance,
} from "./combat-decisions.js";
import {
  type CommandDecision,
  type DomainEventProposal,
  decideCommand,
  type EngineContentCatalog,
} from "./decide-command.js";
import { createEmptyCampaignState } from "./state.js";
import { fixtureCharacter } from "./test-helpers.js";

const campaignId = "campaign_combat_rules_001" as CampaignId;
const manifestHash =
  "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as ContentManifestHash;

function content(input: unknown): ContentDefinition {
  const result = validateValue(ContentDefinitionSchema, input);
  if (!result.success) throw new Error("Combat test content is invalid.");
  return result.value;
}

const heroStrike = content({
  schema_version: 1,
  content_definition_id: "content_ability_thread_strike_001",
  definition_revision: 1,
  kind: "ability",
  payload: {
    category: "signature_technique",
    display_name: "Thread Strike",
    rule_text: "Follow a read opening with one precise adjacent strike.",
    action_slot: "action",
    cost: [],
    target_mode: "single_actor",
    range: "adjacent",
    fixed_impact: 3,
    check_profile: {
      attribute: "Finesse",
      discipline: "Athletics",
      target: 10,
    },
    effects: [{ kind: "deal_impact", impact: 3 }],
    narrative_permissions: [
      {
        scope: "exploration",
        permission: "Identify the most direct line through nearby danger.",
      },
    ],
  },
});

const enemyStrike = content({
  schema_version: 1,
  content_definition_id: "content_ability_cinder_press_001",
  definition_revision: 1,
  kind: "ability",
  payload: {
    category: "power",
    display_name: "Cinder Press",
    rule_text: "Drive a nearby foe backward with fixed pressure.",
    action_slot: "action",
    cost: [],
    target_mode: "single_actor",
    range: "adjacent",
    fixed_impact: 2,
    check_profile: null,
    effects: [{ kind: "deal_impact", impact: 2 }],
    narrative_permissions: [
      {
        scope: "world",
        permission: "Crack brittle obstacles with concentrated heat.",
      },
    ],
  },
});

const enemySlip = content({
  schema_version: 1,
  content_definition_id: "content_reaction_cinder_slip_001",
  definition_revision: 1,
  kind: "ability",
  payload: {
    category: "reaction",
    display_name: "Cinder Slip",
    rule_text: "Slip one adjacent zone when a threat closes in.",
    action_slot: "reaction",
    cost: [],
    target_mode: "single_actor",
    range: "self",
    fixed_impact: null,
    check_profile: null,
    effects: [{ kind: "move", distance: "adjacent", target: "self" }],
    narrative_permissions: [
      {
        scope: "world",
        permission: "Pass through a narrow plume of harmless smoke.",
      },
    ],
  },
});

const archetype = content({
  schema_version: 1,
  content_definition_id: "content_archetype_wayfinder_001",
  definition_revision: 1,
  kind: "playable_option",
  payload: {
    category: "archetype",
    display_name: "Wayfinder",
    rule_text: "Read routes and act through openings.",
    rank: 1,
    availability: "production",
    prerequisites: [],
    granted_ability_ids: ["content_ability_thread_strike_001"],
    tactical_effects: [
      { kind: "adjust_resource", resource: "guard", amount: 6, target: "self" },
    ],
    narrative_permissions: [
      {
        scope: "exploration",
        permission: "Recognize stable routes through dangerous ground.",
      },
    ],
  },
});

const enemy = content({
  schema_version: 1,
  content_definition_id: "content_enemy_cinder_warden_001",
  definition_revision: 1,
  kind: "enemy",
  payload: {
    display_name: "Cinder Warden",
    rule_text: "A mobile boss that contests the glassway beacon.",
    role: "boss",
    guard: 6,
    armor: 1,
    attribute_ratings: { Force: 2, Finesse: 1, Insight: 1, Presence: 0 },
    discipline_ratings: {
      Athletics: 2,
      Subterfuge: 0,
      Craft: 0,
      Lore: 0,
      Vigilance: 1,
      Influence: 0,
      Survival: 1,
      Mysticism: 0,
    },
    actions: [
      {
        action: {
          content_definition_id: "content_ability_cinder_press_001",
          definition_revision: 1,
        },
        preference_tags: ["pressure"],
      },
      {
        action: {
          content_definition_id: "content_reaction_cinder_slip_001",
          definition_revision: 1,
        },
        preference_tags: ["mobile"],
      },
    ],
    goal_tags: ["pressure"],
    temperament_tags: ["mobile"],
  },
});

const objectiveDefinition = content({
  schema_version: 1,
  content_definition_id: "content_objective_glass_beacon_001",
  definition_revision: 1,
  kind: "objective",
  payload: {
    display_name: "Glass Beacon",
    rule_text: "Complete three advances to stabilize the beacon.",
    threshold: 3,
    completion_effects: [
      { kind: "advance_track", track: "objective", amount: 1 },
    ],
  },
});

const overlayDefinition = content({
  schema_version: 1,
  content_definition_id: "content_overlay_cinder_return_001",
  definition_revision: 1,
  kind: "boss_overlay",
  payload: {
    display_name: "Cinder Return",
    rule_text: "On first depletion, the warden reforms with four Guard.",
    objective: {
      content_definition_id: "content_objective_glass_beacon_001",
      definition_revision: 1,
    },
    trigger: "guard_depleted",
    effects: [
      { kind: "adjust_resource", resource: "guard", amount: 4, target: "self" },
    ],
  },
});

const catalog: EngineContentCatalog = {
  content_manifest_hash: manifestHash,
  definitions: [
    heroStrike,
    enemyStrike,
    enemySlip,
    archetype,
    enemy,
    objectiveDefinition,
    overlayDefinition,
  ],
};

function playable(index: 1 | 2): PlayableCharacterState {
  const foundation = structuredClone(fixtureCharacter());
  if (index === 2) {
    foundation.character_id =
      "character_rowan_001" as typeof foundation.character_id;
    foundation.actor_id = "actor_rowan_001" as typeof foundation.actor_id;
    foundation.display_name = "Rowan Vale";
  }
  const result = validatePlayableCharacterState({
    schema_version: 1,
    record_kind: "playable_character_state",
    character_id: foundation.character_id,
    foundation,
    rank: 1,
    resolved_options: {
      heritage_gift: {
        content_definition_id: foundation.heritage_gift_ref,
        definition_revision: 1,
      },
      upbringing: {
        content_definition_id: foundation.upbringing_ref,
        definition_revision: 1,
      },
      archetype: {
        content_definition_id: foundation.archetype_ref,
        definition_revision: 1,
      },
      path: null,
      talent: null,
      capstone: null,
      signature_technique: {
        content_definition_id: "content_ability_thread_strike_001",
        definition_revision: 1,
      },
    },
    resources: {
      guard: { current: 6, maximum: 6 },
      wounds: [
        { slot: 1, status: "empty" },
        { slot: 2, status: "empty" },
        { slot: 3, status: "empty" },
      ],
      exertion: { current: 3, maximum: 3 },
      spark: { available: true, complication_recovery_used: false },
    },
    significant_gear: foundation.significant_gear,
    resolved_significant_gear: [
      {
        slot: 1,
        definition: {
          content_definition_id: "content_gear_slate_compass_001",
          definition_revision: 1,
        },
        status: "ready",
      },
      { slot: 2, definition: null, status: "empty" },
      { slot: 3, definition: null, status: "empty" },
      { slot: 4, definition: null, status: "empty" },
    ],
    scene_ability_uses: [
      {
        ability: {
          content_definition_id: "content_ability_thread_strike_001",
          definition_revision: 1,
        },
        used: false,
      },
    ],
    conditions: [],
  });
  if (!result.success) throw new Error("Combat test hero is invalid.");
  return result.value;
}

function zone(
  id: string,
  connections: readonly string[],
  objectiveIds: readonly string[] = [],
) {
  return {
    zone_id: id,
    name: id.replaceAll("_", " "),
    capacity: 5,
    cover: "none" as const,
    hazard_tags: [],
    objective_ids: [...objectiveIds],
    elevation: "level" as const,
    visibility: "open" as const,
    connections: [...connections],
  };
}

function combat(twoHeroes = false): NonNullable<GameState["combat"]> {
  return {
    schema_version: 1,
    record_kind: "combat_state",
    combat_id: "combat_glassway_001" as never,
    status: "active",
    round: 1,
    active_side: "hero",
    active_actor_id: null,
    battlefield: {
      zones: [
        zone("zone_arch_001", ["zone_bridge_001", "zone_vault_001"]),
        zone("zone_bridge_001", ["zone_arch_001", "zone_beacon_001"]),
        zone(
          "zone_beacon_001",
          ["zone_bridge_001", "zone_gallery_001"],
          ["objective_glass_beacon_001"],
        ),
        zone("zone_gallery_001", ["zone_beacon_001", "zone_vault_001"]),
        zone("zone_vault_001", ["zone_gallery_001", "zone_arch_001"]),
      ],
    },
    participants: [
      {
        actor_id: "actor_sable_001" as never,
        side: "hero",
        kind: "hero",
        zone_id: "zone_arch_001" as never,
        action_available: true,
        maneuver_available: true,
        reaction_available: true,
        activation_spent: false,
        eligible_roller: "seat_sable_001" as never,
      },
      ...(twoHeroes
        ? [
            {
              actor_id: "actor_rowan_001" as never,
              side: "hero" as const,
              kind: "hero" as const,
              zone_id: "zone_arch_001" as never,
              action_available: true,
              maneuver_available: true,
              reaction_available: true,
              activation_spent: false,
              eligible_roller: "seat_rowan_001" as never,
            },
          ]
        : []),
      {
        actor_id: "actor_cinder_001" as never,
        side: "enemy",
        kind: "boss",
        zone_id: "zone_bridge_001" as never,
        action_available: true,
        maneuver_available: true,
        reaction_available: true,
        activation_spent: false,
        definition: {
          content_definition_id: "content_enemy_cinder_warden_001" as never,
          definition_revision: 1,
        },
        guard: { current: 6, maximum: 6 },
        armor: 1,
      },
    ],
    objectives: [
      {
        objective_id: "objective_glass_beacon_001" as never,
        definition: {
          content_definition_id: "content_objective_glass_beacon_001" as never,
          definition_revision: 1,
        },
        progress: 0,
        threshold: 3,
        status: "active",
      },
    ],
    boss_overlays: [
      {
        actor_id: "actor_cinder_001" as never,
        definition: {
          content_definition_id: "content_overlay_cinder_return_001" as never,
          definition_revision: 1,
        },
        active: false,
        objective_id: "objective_glass_beacon_001" as never,
      },
    ],
    reaction_window: null,
    pending_death_check_id: null,
    pending_action_check_id: null,
  };
}

function state(twoHeroes = false): GameState {
  const result = createEmptyCampaignState(campaignId, manifestHash);
  result.party.characters = twoHeroes
    ? [playable(1), playable(2)]
    : [playable(1)];
  result.party.supply_maximum = result.party.characters.length + 2;
  const validated = validateGameState(result);
  if (!validated.success) throw new Error("Combat test state is invalid.");
  return validated.value;
}

function stateInCombat(twoHeroes = false): GameState {
  const result = structuredClone(state(twoHeroes));
  result.combat = combat(twoHeroes);
  const validated = validateGameState(result);
  if (!validated.success) throw new Error("Active combat state is invalid.");
  return validated.value;
}

function command(input: unknown): GameCommand {
  const result = validateValue(GameCommandSchema, input);
  if (!result.success) throw new Error("Combat test command is invalid.");
  return result.value;
}

function accepted(decision: CommandDecision) {
  if (!decision.accepted) throw new Error(decision.safe_detail);
  return decision;
}

function allocator() {
  const ids = new Map<string, LegalActionId>();
  return (key: string): LegalActionId => {
    let id = ids.get(key);
    if (id === undefined) {
      id =
        `legal_action_test_${String(ids.size + 1).padStart(3, "0")}` as LegalActionId;
      ids.set(key, id);
    }
    return id;
  };
}

function randomRecord(commandId: string, value: number): RandomDrawRecord {
  return {
    schema_version: 1,
    algorithm_version: "hmac_sha256_v1",
    seed_fingerprint:
      "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    campaign_id: campaignId,
    command_id: commandId as never,
    purpose: "check.d20",
    purpose_local_index: 0,
    minimum: 1,
    maximum: 20,
    realized_value: value,
    rejection_count: 0,
  };
}

let envelopeSequence = 1;
function envelope(proposal: DomainEventProposal): GameEvent {
  const sequence = envelopeSequence++;
  const result = validateValue(GameEventSchema, {
    schema_version: 1,
    event_id: `event_combat_rules_${sequence}`,
    transaction_id: `transaction_combat_rules_${sequence}`,
    campaign_id: campaignId,
    caused_by_command_id: `command_combat_rules_${sequence}`,
    transaction_index: 0,
    stream_revision: sequence,
    ...proposal,
  });
  if (!result.success) throw new Error("Combat proposal is invalid.");
  return result.value;
}

function applyAll(
  current: GameState,
  proposals: readonly DomainEventProposal[],
): GameState {
  let state = current;
  for (const proposal of proposals) {
    const applied = applyGameEvent(state, envelope(proposal));
    if (!applied.success) {
      throw new Error(applied.issues.map(({ message }) => message).join("; "));
    }
    state = applied.value;
  }
  return state;
}

function basicCommand(
  kind: string,
  payload: unknown,
  suffix: string,
): GameCommand {
  return command({
    schema_version: 1,
    command_id: `command_${suffix}_001`,
    transaction_id: `transaction_${suffix}_001`,
    campaign_id: campaignId,
    expected_revision: 0,
    kind,
    payload,
  });
}

describe("combat start, zones, and action resolution", () => {
  it("starts only content-matched hero-first combat", () => {
    const initial = state();
    const start = basicCommand(
      "start_combat",
      { combat: combat() },
      "start_combat",
    );
    const decision = accepted(
      decideCommand({ state: initial, command: start, catalog }),
    );
    expect(decision.events).toEqual([
      { kind: "combat_started", payload: { combat: combat() } },
    ]);
    const invalid = structuredClone(combat());
    const boss = invalid.participants.find(({ side }) => side === "enemy")!;
    if (boss.side === "enemy") boss.armor = 2;
    expect(
      decideCommand({
        state: initial,
        catalog,
        command: basicCommand(
          "start_combat",
          { combat: invalid },
          "start_combat_invalid",
        ),
      }),
    ).toMatchObject({ accepted: false });
  });

  it("derives graph distances, ranges, and every legal target", () => {
    const current = stateInCombat();
    expect(
      zoneDistance(current.combat!, "zone_arch_001", "zone_bridge_001"),
    ).toBe(1);
    expect(
      zoneDistance(current.combat!, "zone_arch_001", "zone_beacon_001"),
    ).toBe(2);
    expect(
      rangeBetweenActors(
        current.combat!,
        "actor_sable_001",
        "actor_cinder_001",
      ),
    ).toBe("adjacent");
    const ids = allocator();
    const actions = enumerateCombatActions({
      state: current,
      catalog,
      actor_id: "actor_sable_001" as never,
      legal_action_id_for: ids,
    });
    expect(actions.some(({ action_kind }) => action_kind === "attack")).toBe(
      true,
    );
    expect(
      actions.some(
        ({ target }) =>
          target.kind === "actor" && target.actor_id === "actor_cinder_001",
      ),
    ).toBe(true);
    expect(
      actions.some(
        ({ target }) =>
          target.kind === "actor" && target.actor_id === "actor_sable_001",
      ),
    ).toBe(false);
  });

  it("resolves a simulated attack with recorded draw, armor, and fixed Impact", () => {
    let current = stateInCombat();
    const ids = allocator();
    const activate = accepted(
      decideCommand({
        state: current,
        command: basicCommand(
          "choose_hero_activation",
          { combat_id: "combat_glassway_001", actor_id: "actor_sable_001" },
          "activate_sable",
        ),
      }),
    );
    current = applyAll(current, activate.events);
    const attack = enumerateCombatActions({
      state: current,
      catalog,
      actor_id: "actor_sable_001" as never,
      legal_action_id_for: ids,
    }).find(({ action_kind }) => action_kind === "attack")!;
    const execute = basicCommand(
      "execute_combat_action",
      {
        combat_id: "combat_glassway_001",
        legal_action_id: attack.legal_action_id,
        invoke_spark: false,
      },
      "execute_sable_attack",
    );
    const decision = accepted(
      decideCommand({
        state: current,
        command: execute,
        catalog,
        legal_action_id_for: ids,
        random: { draw: () => randomRecord(execute.command_id, 10) },
      }),
    );
    expect(decision.events.map(({ kind }) => kind)).toEqual([
      "scene_ability_used",
      "action_slot_spent",
      "check_resolved",
      "impact_applied",
    ]);
    expect(decision.events.at(-1)).toMatchObject({
      payload: {
        base_impact: 3,
        armor_reduction: 1,
        applied_impact: 2,
        guard_before: 6,
        guard_after: 4,
      },
    });
    current = applyAll(current, decision.events);
    const boss = current.combat?.participants.find(
      ({ side }) => side === "enemy",
    );
    expect(boss?.side === "enemy" ? boss.guard.current : null).toBe(4);
  });

  it("pauses for a named boss transition and applies the stored continuation", () => {
    const changed = structuredClone(stateInCombat());
    const boss = changed.combat!.participants.find(
      ({ side }) => side === "enemy",
    )!;
    if (boss.side === "enemy") boss.guard.current = 4;
    const validated = validateGameState(changed);
    if (!validated.success)
      throw new Error("Boss transition state is invalid.");
    let current = validated.value;
    const ids = allocator();
    const activate = accepted(
      decideCommand({
        state: current,
        command: basicCommand(
          "choose_hero_activation",
          { combat_id: "combat_glassway_001", actor_id: "actor_sable_001" },
          "activate_boss_transition",
        ),
      }),
    );
    current = applyAll(current, activate.events);
    const attack = enumerateCombatActions({
      state: current,
      catalog,
      actor_id: "actor_sable_001" as never,
      legal_action_id_for: ids,
    }).find(({ action_kind }) => action_kind === "attack")!;
    const initiated = accepted(
      decideCommand({
        state: current,
        catalog,
        legal_action_id_for: ids,
        pending_check_id: "pending_check_boss_001" as never,
        submission_nonce: "physical_nonce_boss_001" as never,
        command: basicCommand(
          "execute_combat_action",
          {
            combat_id: "combat_glassway_001",
            legal_action_id: attack.legal_action_id,
            invoke_spark: false,
          },
          "initiate_boss_transition",
        ),
      }),
    );
    expect(initiated.events.map(({ kind }) => kind)).toEqual([
      "scene_ability_used",
      "action_slot_spent",
      "physical_roll_requested",
      "combat_action_pending",
    ]);
    expect(initiated.events[2]).toMatchObject({
      payload: { disclosure: { reason: "named_boss_transition" } },
    });
    current = applyAll(current, initiated.events);
    expect(current.combat?.status).toBe("awaiting_physical_action");
    expect(
      decideCommand({
        state: current,
        command: basicCommand(
          "choose_hero_activation",
          { combat_id: "combat_glassway_001", actor_id: "actor_sable_001" },
          "blocked_during_physical",
        ),
      }),
    ).toMatchObject({ accepted: false });

    const resolved = accepted(
      decideCommand({
        state: current,
        catalog,
        command: basicCommand(
          "submit_die_result",
          {
            pending_check_id: "pending_check_boss_001",
            physical_submission_id: "physical_submission_boss_001",
            submission_nonce: "physical_nonce_boss_001",
            die_face: 20,
          },
          "resolve_boss_transition",
        ),
      }),
    );
    expect(resolved.events.map(({ kind }) => kind)).toEqual([
      "check_resolved",
      "impact_applied",
      "boss_overlay_activated",
    ]);
    current = applyAll(current, resolved.events);
    const restored = current.combat?.participants.find(
      ({ actor_id }) => actor_id === "actor_cinder_001",
    );
    expect(restored?.side === "enemy" ? restored.guard.current : null).toBe(4);
    expect(current.combat?.boss_overlays[0]?.active).toBe(true);
  });
});

describe("alternation, enemy fallback, and reactions", () => {
  it("advances after every living actor is spent even when a defeated enemy is unspent", () => {
    const current = structuredClone(stateInCombat());
    const hero = current.combat?.participants.find(
      ({ side }) => side === "hero",
    );
    const enemyActor = current.combat?.participants.find(
      ({ side }) => side === "enemy",
    );
    if (
      current.combat === null ||
      hero === undefined ||
      enemyActor === undefined ||
      enemyActor.side !== "enemy"
    ) {
      throw new Error("Round regression state is incomplete.");
    }
    hero.action_available = false;
    hero.maneuver_available = false;
    hero.activation_spent = true;
    enemyActor.guard.current = 0;
    current.combat.active_actor_id = null;
    current.combat.active_side = "hero";

    const advanced = applyAll(current, [
      {
        kind: "round_advanced",
        payload: {
          combat_id: current.combat.combat_id,
          previous_round: 1,
          current_round: 2,
        },
      },
    ]);

    expect(advanced.combat?.round).toBe(2);
  });

  it("alternates sides, yields exhausted sides, and begins a new hero-first round", () => {
    let current = stateInCombat();
    const ids = allocator();
    current = applyAll(
      current,
      accepted(
        decideCommand({
          state: current,
          command: basicCommand(
            "choose_hero_activation",
            { combat_id: "combat_glassway_001", actor_id: "actor_sable_001" },
            "round_activate_hero",
          ),
        }),
      ).events,
    );
    for (const slot of ["action", "maneuver"] as const) {
      const pass = enumerateCombatActions({
        state: current,
        catalog,
        actor_id: "actor_sable_001" as never,
        legal_action_id_for: ids,
      }).find(
        (candidate) =>
          candidate.action_kind === "pass" && candidate.slot === slot,
      )!;
      current = applyAll(
        current,
        accepted(
          decideCommand({
            state: current,
            catalog,
            legal_action_id_for: ids,
            command: basicCommand(
              "execute_combat_action",
              {
                combat_id: "combat_glassway_001",
                legal_action_id: pass.legal_action_id,
                invoke_spark: false,
              },
              `round_hero_pass_${slot}`,
            ),
          }),
        ).events,
      );
    }
    expect(current.combat?.active_side).toBe("enemy");
    const selected = accepted(
      decideCommand({
        state: current,
        catalog,
        legal_action_id_for: ids,
        command: basicCommand(
          "select_enemy_fallback",
          { combat_id: "combat_glassway_001", actor_id: "actor_cinder_001" },
          "round_select_enemy",
        ),
      }),
    );
    const candidate = selected.events.find(
      ({ kind }) => kind === "enemy_action_selected",
    );
    if (candidate?.kind !== "enemy_action_selected") {
      throw new Error("Enemy selection event is missing.");
    }
    current = applyAll(current, selected.events);
    current = applyAll(
      current,
      accepted(
        decideCommand({
          state: current,
          catalog,
          legal_action_id_for: ids,
          command: basicCommand(
            "execute_combat_action",
            {
              combat_id: "combat_glassway_001",
              legal_action_id: candidate.payload.candidate.legal_action_id,
              invoke_spark: false,
            },
            "round_execute_enemy",
          ),
        }),
      ).events,
    );
    const enemyPass = enumerateCombatActions({
      state: current,
      catalog,
      actor_id: "actor_cinder_001" as never,
      legal_action_id_for: ids,
    }).find(
      ({ action_kind, slot }) => action_kind === "pass" && slot === "maneuver",
    )!;
    current = applyAll(
      current,
      accepted(
        decideCommand({
          state: current,
          catalog,
          legal_action_id_for: ids,
          command: basicCommand(
            "execute_combat_action",
            {
              combat_id: "combat_glassway_001",
              legal_action_id: enemyPass.legal_action_id,
              invoke_spark: false,
            },
            "round_enemy_pass_maneuver",
          ),
        }),
      ).events,
    );
    const nextRound = accepted(
      decideCommand({
        state: current,
        command: basicCommand(
          "choose_hero_activation",
          { combat_id: "combat_glassway_001", actor_id: "actor_sable_001" },
          "round_two_activate_hero",
        ),
      }),
    );
    expect(nextRound.events.map(({ kind }) => kind)).toEqual([
      "round_advanced",
      "activation_started",
    ]);
    current = applyAll(current, nextRound.events);
    expect(current.combat).toMatchObject({
      round: 2,
      active_side: "hero",
      active_actor_id: "actor_sable_001",
    });
  });

  it("uses a recorded tie break only for equal best enemy candidates", () => {
    const changed = structuredClone(stateInCombat());
    changed.combat!.active_side = "enemy";
    const boss = changed.combat!.participants.find(
      ({ side }) => side === "enemy",
    )!;
    boss.action_available = false;
    const current = validateGameState(changed);
    if (!current.success) throw new Error("Tie state is invalid.");
    const ids = allocator();
    const select = basicCommand(
      "select_enemy_fallback",
      { combat_id: "combat_glassway_001", actor_id: "actor_cinder_001" },
      "enemy_tie",
    );
    const draw = {
      ...randomRecord(select.command_id, 1),
      purpose: "enemy.tie_break",
      minimum: 0,
      maximum: 1,
      realized_value: 1,
    } as RandomDrawRecord;
    const decision = accepted(
      decideCommand({
        state: current.value,
        command: select,
        catalog,
        legal_action_id_for: ids,
        random: { draw: () => draw },
      }),
    );
    expect(decision.events.at(-1)).toMatchObject({
      kind: "enemy_action_selected",
      payload: { tie_break: draw, candidate: { fallback_score: 25 } },
    });
  });

  it("orders the affected actor first, then heroes before enemies, and closes on use", () => {
    let current = stateInCombat(true);
    const open = accepted(
      decideCommand({
        state: current,
        command: basicCommand(
          "open_reaction_window",
          {
            combat_id: "combat_glassway_001",
            reaction_window_id: "reaction_window_test_001",
            triggering_actor_id: "actor_cinder_001",
          },
          "open_reaction",
        ),
      }),
    );
    expect(open.events[0]).toMatchObject({
      payload: {
        window: {
          eligible_actor_ids: [
            "actor_cinder_001",
            "actor_rowan_001",
            "actor_sable_001",
          ],
        },
      },
    });
    current = applyAll(current, open.events);
    const ids = allocator();
    const candidates = enumerateCombatReactions({
      state: current,
      catalog,
      actor_id: "actor_cinder_001" as never,
      legal_action_id_for: ids,
    });
    const use = accepted(
      decideCommand({
        state: current,
        catalog,
        legal_action_id_for: ids,
        command: basicCommand(
          "resolve_reaction",
          {
            combat_id: "combat_glassway_001",
            reaction_window_id: "reaction_window_test_001",
            actor_id: "actor_cinder_001",
            legal_action_id: candidates[0]!.legal_action_id,
          },
          "use_reaction",
        ),
      }),
    );
    expect(use.events.map(({ kind }) => kind)).toEqual([
      "action_slot_spent",
      "actor_moved",
      "reaction_window_closed",
    ]);
    current = applyAll(current, use.events);
    expect(current.combat?.reaction_window).toBeNull();
  });
});

describe("Wounds and physical death continuation", () => {
  it("matches all twenty disclosed faces before and after either one-point aid", () => {
    const unaided = pendingDeathState();
    for (const resource of [null, "exertion", "supply"] as const) {
      for (let face = 1; face <= 20; face += 1) {
        let current = structuredClone(unaided);
        if (resource !== null) {
          const aided = accepted(
            decideCommand({
              state: current,
              command: basicCommand(
                "aid_death_test",
                {
                  combat_id: "combat_glassway_001",
                  pending_check_id: "pending_check_death_001",
                  aiding_character_id: "character_rowan_001",
                  resource,
                },
                `aid_death_${resource}_${face}`,
              ),
            }),
          );
          expect(aided.events[0]).toMatchObject({
            kind: "resource_changed",
            payload: {
              previous: resource === "supply" ? 1 : 3,
              current: resource === "supply" ? 0 : 2,
            },
          });
          current = applyAll(current, aided.events);
        }
        const pending = current.pending_physical_checks[0]!;
        const disclosed = pending.disclosure.face_to_outcome[face - 1]!;
        const submit = basicCommand(
          "submit_die_result",
          {
            pending_check_id: pending.pending_check_id,
            physical_submission_id: `physical_submission_death_${resource ?? "none"}_${face}`,
            submission_nonce: pending.submission_nonce,
            die_face: face,
          },
          `submit_death_${resource ?? "none"}_${face}`,
        );
        const resolved = accepted(
          decideCommand({
            state: current,
            command: submit,
            catalog,
            scar_id: `scar_death_${resource ?? "none"}_${face}` as never,
          }),
        );
        expect(resolved.events[0]).toMatchObject({
          kind: "check_resolved",
          payload: { result: { final_degree: disclosed.degree } },
        });
        const kinds = resolved.events.map(({ kind }) => kind);
        if (disclosed.degree === "Success") {
          expect(kinds).toContain("hero_stabilized");
          expect(kinds).not.toContain("permanent_scar_gained");
        } else if (disclosed.degree === "Triumph") {
          expect(kinds).toEqual([
            "check_resolved",
            "hero_stabilized",
            "permanent_scar_gained",
          ]);
        } else {
          expect(kinds).toContain("character_died");
        }
      }
    }
  });
});

function pendingDeathState(): GameState {
  const changed = structuredClone(stateInCombat(true));
  changed.party.supply = 1;
  const hero = changed.party.characters[0]!;
  hero.resources.guard.current = 0;
  hero.resources.wounds = [
    {
      slot: 1,
      status: "filled",
      wound_id: "wound_existing_001" as never,
      name: "First wound",
    },
    {
      slot: 2,
      status: "filled",
      wound_id: "wound_existing_002" as never,
      name: "Second wound",
    },
    { slot: 3, status: "empty" },
  ];
  changed.combat!.active_side = "enemy";
  changed.combat!.active_actor_id = "actor_cinder_001" as never;
  const validated = validateGameState(changed);
  if (!validated.success) throw new Error("Pre-death state is invalid.");
  const ids = allocator();
  const attack = enumerateCombatActions({
    state: validated.value,
    catalog,
    actor_id: "actor_cinder_001" as never,
    legal_action_id_for: ids,
  }).find(
    ({ action_kind, target }) =>
      action_kind === "attack" &&
      target.kind === "actor" &&
      target.actor_id === "actor_sable_001",
  )!;
  const decision = accepted(
    decideCommand({
      state: validated.value,
      catalog,
      legal_action_id_for: ids,
      wound_id: "wound_third_001" as never,
      death_pending_check_id: "pending_check_death_001" as never,
      death_submission_nonce: "physical_nonce_death_001" as never,
      command: basicCommand(
        "execute_combat_action",
        {
          combat_id: "combat_glassway_001",
          legal_action_id: attack.legal_action_id,
          invoke_spark: false,
        },
        "enemy_death_attack",
      ),
    }),
  );
  expect(decision.events.map(({ kind }) => kind)).toEqual([
    "action_slot_spent",
    "impact_applied",
    "wound_marked",
    "physical_roll_requested",
    "death_test_pending",
  ]);
  const result = applyAll(validated.value, decision.events);
  expect(result.combat?.status).toBe("awaiting_death_test");
  return result;
}
