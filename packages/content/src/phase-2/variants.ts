import {
  CombatStateSchema,
  SCHEMA_VERSION,
  type CombatState,
  type EncounterCompositionVariant,
  type SeatId,
  validatePhase2EncounterVariants,
  validateValue,
} from "@lldm/contracts";
import { PHASE_1_DEFINITIONS } from "../phase-1-catalog.js";
import { PHASE_2_STARTER_LOADOUTS } from "./starter-loadouts.js";

const crew = {
  content_definition_id: "content_enemy_floodworn_crew_001",
  definition_revision: 1,
} as const;
const boss = {
  content_definition_id: "content_enemy_bellmaw_custodian_001",
  definition_revision: 1,
} as const;

export const PHASE_2_ENCOUNTER_VARIANTS: readonly EncounterCompositionVariant[] =
  Object.freeze([
    {
      schema_version: SCHEMA_VERSION,
      record_kind: "encounter_composition_variant",
      variant_key: "party_3",
      party_size: 3,
      hero_starting_zones: [
        "zone_gate_controls_001",
        "zone_lower_causeway_001",
        "zone_spillway_walk_001",
      ],
      enemies: [
        {
          actor_id: "actor_floodworn_alpha_001",
          definition: crew,
          starting_zone_id: "zone_pump_gallery_001",
          reinforcement: false,
        },
        {
          actor_id: "actor_bellmaw_001",
          definition: boss,
          starting_zone_id: "zone_bell_chamber_001",
          reinforcement: false,
        },
      ],
      reinforcement_trigger: "none",
      primary_objective_id: "objective_open_spillway_001",
      objective_definition: {
        content_definition_id: "content_objective_open_spillway_001",
        definition_revision: 1,
      },
      boss_overlay_definition: {
        content_definition_id: "content_overlay_last_resonance_001",
        definition_revision: 1,
      },
      objective_pressure: 1,
    },
    {
      schema_version: SCHEMA_VERSION,
      record_kind: "encounter_composition_variant",
      variant_key: "party_4",
      party_size: 4,
      hero_starting_zones: [
        "zone_gate_controls_001",
        "zone_lower_causeway_001",
        "zone_spillway_walk_001",
        "zone_gate_controls_001",
      ],
      enemies: [
        {
          actor_id: "actor_floodworn_alpha_001",
          definition: crew,
          starting_zone_id: "zone_pump_gallery_001",
          reinforcement: false,
        },
        {
          actor_id: "actor_bellmaw_001",
          definition: boss,
          starting_zone_id: "zone_bell_chamber_001",
          reinforcement: false,
        },
        {
          actor_id: "actor_floodworn_beta_001",
          definition: crew,
          starting_zone_id: "zone_spillway_walk_001",
          reinforcement: true,
        },
      ],
      reinforcement_trigger: "round_2",
      primary_objective_id: "objective_open_spillway_001",
      objective_definition: {
        content_definition_id: "content_objective_open_spillway_party4_001",
        definition_revision: 1,
      },
      boss_overlay_definition: {
        content_definition_id: "content_overlay_last_resonance_party4_001",
        definition_revision: 1,
      },
      objective_pressure: 2,
    },
    {
      schema_version: SCHEMA_VERSION,
      record_kind: "encounter_composition_variant",
      variant_key: "party_5",
      party_size: 5,
      hero_starting_zones: [
        "zone_gate_controls_001",
        "zone_lower_causeway_001",
        "zone_spillway_walk_001",
        "zone_gate_controls_001",
        "zone_lower_causeway_001",
      ],
      enemies: [
        {
          actor_id: "actor_floodworn_alpha_001",
          definition: crew,
          starting_zone_id: "zone_pump_gallery_001",
          reinforcement: false,
        },
        {
          actor_id: "actor_bellmaw_001",
          definition: boss,
          starting_zone_id: "zone_bell_chamber_001",
          reinforcement: false,
        },
        {
          actor_id: "actor_floodworn_beta_001",
          definition: crew,
          starting_zone_id: "zone_spillway_walk_001",
          reinforcement: true,
        },
        {
          actor_id: "actor_floodworn_gamma_001",
          definition: crew,
          starting_zone_id: "zone_lower_causeway_001",
          reinforcement: true,
        },
      ],
      reinforcement_trigger: "objective_progress_2",
      primary_objective_id: "objective_open_spillway_001",
      objective_definition: {
        content_definition_id: "content_objective_open_spillway_party5_001",
        definition_revision: 1,
      },
      boss_overlay_definition: {
        content_definition_id: "content_overlay_last_resonance_party5_001",
        definition_revision: 1,
      },
      objective_pressure: 3,
    },
  ]);

const validation = validatePhase2EncounterVariants(PHASE_2_ENCOUNTER_VARIANTS);
if (!validation.success)
  throw new Error("Phase 2 encounter variants are invalid.");

export interface ClaimedPhase2Hero {
  readonly starter_loadout_id: (typeof PHASE_2_STARTER_LOADOUTS)[number]["starter_loadout_id"];
  readonly seat_id: SeatId;
}

export function buildPhase2Encounter(
  claimed: readonly ClaimedPhase2Hero[],
): CombatState {
  if (
    claimed.length < 3 ||
    claimed.length > 5 ||
    new Set(claimed.map(({ starter_loadout_id }) => starter_loadout_id))
      .size !== claimed.length ||
    new Set(claimed.map(({ seat_id }) => seat_id)).size !== claimed.length
  )
    throw new Error(
      "Encounter composition requires three to five unique claimed heroes and seats.",
    );
  const loadouts = claimed.map((claim) => {
    const loadout = PHASE_2_STARTER_LOADOUTS.find(
      ({ starter_loadout_id }) =>
        starter_loadout_id === claim.starter_loadout_id,
    );
    if (loadout === undefined)
      throw new Error(
        "Encounter composition references an unclaimed or unknown starter.",
      );
    return { claim, loadout };
  });
  const variant = PHASE_2_ENCOUNTER_VARIANTS.find(
    ({ party_size }) => party_size === claimed.length,
  );
  if (variant === undefined)
    throw new Error("Encounter party-size variant is unavailable.");
  const zones = [
    {
      zone_id: "zone_gate_controls_001",
      name: "Gate Controls",
      capacity: 5,
      cover: "partial",
      hazard_tags: ["rising_water"],
      objective_ids: ["objective_open_spillway_001"],
      elevation: "high",
      visibility: "open",
      connections: ["zone_lower_causeway_001", "zone_spillway_walk_001"],
    },
    {
      zone_id: "zone_lower_causeway_001",
      name: "Lower Causeway",
      capacity: 5,
      cover: "partial",
      hazard_tags: ["slick_stone"],
      objective_ids: [],
      elevation: "level",
      visibility: "open",
      connections: ["zone_gate_controls_001", "zone_pump_gallery_001"],
    },
    {
      zone_id: "zone_pump_gallery_001",
      name: "Pump Gallery",
      capacity: 5,
      cover: "fortified",
      hazard_tags: ["turning_gears"],
      objective_ids: [],
      elevation: "level",
      visibility: "open",
      connections: ["zone_lower_causeway_001", "zone_bell_chamber_001"],
    },
    {
      zone_id: "zone_bell_chamber_001",
      name: "Bell Chamber",
      capacity: 5,
      cover: "none",
      hazard_tags: ["resonant_shock"],
      objective_ids: [],
      elevation: "high",
      visibility: "open",
      connections: ["zone_pump_gallery_001", "zone_spillway_walk_001"],
    },
    {
      zone_id: "zone_spillway_walk_001",
      name: "Spillway Walk",
      capacity: 5,
      cover: "partial",
      hazard_tags: ["water_drop"],
      objective_ids: [],
      elevation: "low",
      visibility: "open",
      connections: ["zone_gate_controls_001", "zone_bell_chamber_001"],
    },
  ];
  const enemies = variant.enemies.map((enemy) => {
    const definition = PHASE_1_DEFINITIONS.find(
      ({ content_definition_id, definition_revision }) =>
        content_definition_id === enemy.definition.content_definition_id &&
        definition_revision === enemy.definition.definition_revision,
    );
    if (definition?.kind !== "enemy")
      throw new Error("Encounter enemy definition is unavailable.");
    return {
      actor_id: enemy.actor_id,
      side: "enemy" as const,
      kind: definition.payload.role,
      zone_id: enemy.starting_zone_id,
      action_available: true,
      maneuver_available: true,
      reaction_available: true,
      activation_spent: enemy.reinforcement,
      ...(enemy.reinforcement
        ? { reinforcement_trigger: variant.reinforcement_trigger }
        : {}),
      definition: enemy.definition,
      guard: {
        current: definition.payload.guard,
        maximum: definition.payload.guard,
      },
      armor: definition.payload.armor,
    };
  });
  const bossActor = enemies.find(({ kind }) => kind === "boss");
  const candidate = {
    schema_version: SCHEMA_VERSION,
    record_kind: "combat_state",
    combat_id: `combat_floodgate_party_${claimed.length}_001`,
    status: "active",
    round: 1,
    active_side: "hero",
    active_actor_id: null,
    battlefield: { zones },
    participants: [
      ...loadouts.map(({ claim, loadout }, index) => ({
        actor_id: loadout.foundation.actor_id,
        side: "hero" as const,
        kind: "hero" as const,
        zone_id: variant.hero_starting_zones[index],
        action_available: true,
        maneuver_available: true,
        reaction_available: true,
        activation_spent: false,
        eligible_roller: claim.seat_id,
      })),
      ...enemies,
    ],
    objectives: [
      {
        objective_id: variant.primary_objective_id,
        definition: variant.objective_definition,
        progress: 0,
        threshold: 3 + variant.objective_pressure - 1,
        status: "active",
      },
    ],
    boss_overlays:
      bossActor === undefined
        ? []
        : [
            {
              actor_id: bossActor.actor_id,
              definition: variant.boss_overlay_definition,
              active: false,
              objective_id: variant.primary_objective_id,
            },
          ],
    reaction_window: null,
    pending_death_check_id: null,
    pending_action_check_id: null,
  };
  const parsed = validateValue(CombatStateSchema, candidate);
  if (!parsed.success)
    throw new Error(
      `Authored encounter composition is invalid: ${parsed.issues.map(({ path, code }) => `${path}:${code}`).join(",")}`,
    );
  return parsed.value;
}
