import {
  SCHEMA_VERSION,
  StarterLoadoutSchema,
  type StarterLoadout,
  validateValue,
} from "@lldm/contracts";
import { PHASE_1_STARTER_LOADOUTS } from "../starter-loadouts.js";

function loadout(input: unknown): StarterLoadout {
  const result = validateValue(StarterLoadoutSchema, input);
  if (!result.success)
    throw new Error(
      `Invalid Phase 2 starter: ${result.issues.map(({ path, code }) => `${path}:${code}`).join(",")}`,
    );
  return Object.freeze(result.value);
}

const disciplines = {
  maverick: [
    { discipline: "Athletics", rating: 1 },
    { discipline: "Subterfuge", rating: 2 },
    { discipline: "Craft", rating: 0 },
    { discipline: "Lore", rating: 0 },
    { discipline: "Vigilance", rating: 1 },
    { discipline: "Influence", rating: 1 },
    { discipline: "Survival", rating: 0 },
    { discipline: "Mysticism", rating: 0 },
  ],
  beacon: [
    { discipline: "Athletics", rating: 0 },
    { discipline: "Subterfuge", rating: 0 },
    { discipline: "Craft", rating: 1 },
    { discipline: "Lore", rating: 1 },
    { discipline: "Vigilance", rating: 1 },
    { discipline: "Influence", rating: 2 },
    { discipline: "Survival", rating: 0 },
    { discipline: "Mysticism", rating: 0 },
  ],
} as const;

export const PHASE_2_ADDED_STARTER_LOADOUTS = Object.freeze([
  loadout({
    schema_version: SCHEMA_VERSION,
    record_kind: "starter_loadout",
    starter_loadout_id: "starter_loadout_kest_rel_001",
    foundation: {
      schema_version: SCHEMA_VERSION,
      record_kind: "character_foundation",
      character_id: "character_kest_rel_001",
      actor_id: "actor_kest_rel_001",
      display_name: "Kest Rel",
      rank: 1,
      attributes: [
        { attribute: "Force", rating: 1 },
        { attribute: "Finesse", rating: 2 },
        { attribute: "Insight", rating: 1 },
        { attribute: "Presence", rating: 0 },
      ],
      disciplines: disciplines.maverick,
      drive: "Break the pattern that keeps the low wards trapped.",
      bond: "Mara is the one person I warn before I leap.",
      significant_gear: [
        {
          slot: 1,
          item: {
            label: "Slate compass",
            note: "Its needle marks the opening Kest means to cross.",
          },
        },
        { slot: 2, item: null },
        { slot: 3, item: null },
        { slot: 4, item: null },
      ],
      signature_technique_concept:
        "Cross a narrow opening before opposition can close it.",
      heritage_gift_ref: "content_heritage_tidekin_001",
      upbringing_ref: "content_upbringing_river_caravan_001",
      archetype_ref: "content_archetype_maverick_001",
    },
    significant_gear: [
      {
        slot: 1,
        definition: {
          content_definition_id: "content_gear_slate_compass_001",
          definition_revision: 1,
        },
      },
      { slot: 2, definition: null },
      { slot: 3, definition: null },
      { slot: 4, definition: null },
    ],
  }),
  loadout({
    schema_version: SCHEMA_VERSION,
    record_kind: "starter_loadout",
    starter_loadout_id: "starter_loadout_nima_vale_001",
    foundation: {
      schema_version: SCHEMA_VERSION,
      record_kind: "character_foundation",
      character_id: "character_nima_vale_001",
      actor_id: "actor_nima_vale_001",
      display_name: "Nima Vale",
      rank: 1,
      attributes: [
        { attribute: "Force", rating: 0 },
        { attribute: "Finesse", rating: 1 },
        { attribute: "Insight", rating: 1 },
        { attribute: "Presence", rating: 2 },
      ],
      disciplines: disciplines.beacon,
      drive: "Make every warning arrive with a way through.",
      bond: "Oren taught me that old machines can still answer kindness.",
      significant_gear: [
        {
          slot: 1,
          item: {
            label: "Accord chime",
            note: "A clear tone keeps workers together through the flood roar.",
          },
        },
        { slot: 2, item: null },
        { slot: 3, item: null },
        { slot: 4, item: null },
      ],
      signature_technique_concept:
        "Set a cadence that turns scattered effort toward one objective.",
      heritage_gift_ref: "content_heritage_stonewake_001",
      upbringing_ref: "content_upbringing_bellward_raised_001",
      archetype_ref: "content_archetype_beacon_001",
    },
    significant_gear: [
      {
        slot: 1,
        definition: {
          content_definition_id: "content_gear_accord_chime_001",
          definition_revision: 1,
        },
      },
      { slot: 2, definition: null },
      { slot: 3, definition: null },
      { slot: 4, definition: null },
    ],
  }),
]);

export const PHASE_2_STARTER_LOADOUTS: readonly StarterLoadout[] =
  Object.freeze([
    ...PHASE_1_STARTER_LOADOUTS,
    ...PHASE_2_ADDED_STARTER_LOADOUTS,
  ]);

export const PHASE_2_STARTER_SUMMARIES = Object.freeze(
  PHASE_2_STARTER_LOADOUTS.map(({ starter_loadout_id, foundation }) => ({
    starter_loadout_id,
    character_id: foundation.character_id,
    display_name: foundation.display_name,
    archetype_ref: foundation.archetype_ref,
    signature: foundation.signature_technique_concept,
    drive: foundation.drive,
  })),
);
