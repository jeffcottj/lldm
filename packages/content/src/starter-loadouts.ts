import {
  SCHEMA_VERSION,
  StarterLoadoutSchema,
  type StarterLoadout,
  validateValue,
} from "@lldm/contracts";

function loadout(input: unknown): StarterLoadout {
  const result = validateValue(StarterLoadoutSchema, input);
  if (!result.success) {
    throw new Error(
      `Invalid starter loadout: ${result.issues
        .map(({ path, message }) => `${path}: ${message}`)
        .join("; ")}`,
    );
  }
  return Object.freeze(result.value);
}

const standardDisciplines = {
  vanguard: [
    { discipline: "Athletics", rating: 2 },
    { discipline: "Subterfuge", rating: 0 },
    { discipline: "Craft", rating: 1 },
    { discipline: "Lore", rating: 0 },
    { discipline: "Vigilance", rating: 1 },
    { discipline: "Influence", rating: 1 },
    { discipline: "Survival", rating: 0 },
    { discipline: "Mysticism", rating: 0 },
  ],
  wayfinder: [
    { discipline: "Athletics", rating: 0 },
    { discipline: "Subterfuge", rating: 1 },
    { discipline: "Craft", rating: 0 },
    { discipline: "Lore", rating: 1 },
    { discipline: "Vigilance", rating: 1 },
    { discipline: "Influence", rating: 0 },
    { discipline: "Survival", rating: 2 },
    { discipline: "Mysticism", rating: 0 },
  ],
  envoy: [
    { discipline: "Athletics", rating: 0 },
    { discipline: "Subterfuge", rating: 1 },
    { discipline: "Craft", rating: 0 },
    { discipline: "Lore", rating: 1 },
    { discipline: "Vigilance", rating: 1 },
    { discipline: "Influence", rating: 2 },
    { discipline: "Survival", rating: 0 },
    { discipline: "Mysticism", rating: 0 },
  ],
  weaver: [
    { discipline: "Athletics", rating: 0 },
    { discipline: "Subterfuge", rating: 0 },
    { discipline: "Craft", rating: 1 },
    { discipline: "Lore", rating: 1 },
    { discipline: "Vigilance", rating: 0 },
    { discipline: "Influence", rating: 0 },
    { discipline: "Survival", rating: 1 },
    { discipline: "Mysticism", rating: 2 },
  ],
} as const;

export const PHASE_1_STARTER_LOADOUTS = Object.freeze([
  loadout({
    schema_version: SCHEMA_VERSION,
    record_kind: "starter_loadout",
    starter_loadout_id: "starter_loadout_mara_venn_001",
    foundation: {
      schema_version: SCHEMA_VERSION,
      record_kind: "character_foundation",
      character_id: "character_mara_venn_001",
      actor_id: "actor_mara_venn_001",
      display_name: "Mara Venn",
      rank: 1,
      attributes: [
        { attribute: "Force", rating: 2 },
        { attribute: "Finesse", rating: 1 },
        { attribute: "Insight", rating: 0 },
        { attribute: "Presence", rating: 1 },
      ],
      disciplines: standardDisciplines.vanguard,
      drive: "Leave every ward stronger than I found it.",
      bond: "I trust Sable to find the route I can defend.",
      significant_gear: [
        {
          slot: 1,
          item: {
            label: "Ironroot hook",
            note: "Forged from a retired floodgate hinge.",
          },
        },
        { slot: 2, item: null },
        { slot: 3, item: null },
        { slot: 4, item: null },
      ],
      signature_technique_concept:
        "Set my stance at the breach and turn pressure back on its source.",
      heritage_gift_ref: "content_heritage_stonewake_001",
      upbringing_ref: "content_upbringing_bellward_raised_001",
      archetype_ref: "content_archetype_vanguard_001",
    },
    significant_gear: [
      {
        slot: 1,
        definition: {
          content_definition_id: "content_gear_ironroot_hook_001",
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
    starter_loadout_id: "starter_loadout_sable_reed_001",
    foundation: {
      schema_version: SCHEMA_VERSION,
      record_kind: "character_foundation",
      character_id: "character_sable_reed_001",
      actor_id: "actor_sable_reed_001",
      display_name: "Sable Reed",
      rank: 1,
      attributes: [
        { attribute: "Force", rating: 0 },
        { attribute: "Finesse", rating: 2 },
        { attribute: "Insight", rating: 1 },
        { attribute: "Presence", rating: 1 },
      ],
      disciplines: standardDisciplines.wayfinder,
      drive: "Map the roads erased by the old flood.",
      bond: "Mara gives my discoveries somewhere safe to return to.",
      significant_gear: [
        {
          slot: 1,
          item: {
            label: "Slate compass",
            note: "Its face keeps the last route marked by hand.",
          },
        },
        { slot: 2, item: null },
        { slot: 3, item: null },
        { slot: 4, item: null },
      ],
      signature_technique_concept:
        "Trace a forgotten route through ground that seems impassable.",
      heritage_gift_ref: "content_heritage_galecrest_001",
      upbringing_ref: "content_upbringing_river_caravan_001",
      archetype_ref: "content_archetype_wayfinder_001",
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
    starter_loadout_id: "starter_loadout_ilyra_quill_001",
    foundation: {
      schema_version: SCHEMA_VERSION,
      record_kind: "character_foundation",
      character_id: "character_ilyra_quill_001",
      actor_id: "actor_ilyra_quill_001",
      display_name: "Ilyra Quill",
      rank: 1,
      attributes: [
        { attribute: "Force", rating: 0 },
        { attribute: "Finesse", rating: 1 },
        { attribute: "Insight", rating: 1 },
        { attribute: "Presence", rating: 2 },
      ],
      disciplines: standardDisciplines.envoy,
      drive: "Make public truth stronger than private fear.",
      bond: "Oren hears meanings in old workings that I cannot.",
      significant_gear: [
        {
          slot: 1,
          item: {
            label: "Accord chime",
            note: "Its civic tone carries through machinery and crowds.",
          },
        },
        { slot: 2, item: null },
        { slot: 3, item: null },
        { slot: 4, item: null },
      ],
      signature_technique_concept:
        "Call an ally back into the moment with one unmistakable signal.",
      heritage_gift_ref: "content_heritage_tidekin_001",
      upbringing_ref: "content_upbringing_archive_lantern_001",
      archetype_ref: "content_archetype_envoy_001",
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
  loadout({
    schema_version: SCHEMA_VERSION,
    record_kind: "starter_loadout",
    starter_loadout_id: "starter_loadout_oren_ash_001",
    foundation: {
      schema_version: SCHEMA_VERSION,
      record_kind: "character_foundation",
      character_id: "character_oren_ash_001",
      actor_id: "actor_oren_ash_001",
      display_name: "Oren Ash",
      rank: 1,
      attributes: [
        { attribute: "Force", rating: 0 },
        { attribute: "Finesse", rating: 1 },
        { attribute: "Insight", rating: 2 },
        { attribute: "Presence", rating: 1 },
      ],
      disciplines: standardDisciplines.weaver,
      drive: "Return dangerous wonders to careful common use.",
      bond: "Ilyra keeps my curiosity answerable to real people.",
      significant_gear: [
        {
          slot: 1,
          item: {
            label: "Resonant wick case",
            note: "Four padded channels protect one prepared wick.",
          },
        },
        { slot: 2, item: null },
        { slot: 3, item: null },
        { slot: 4, item: null },
      ],
      signature_technique_concept:
        "Fold a visible current until it carries danger away from an ally.",
      heritage_gift_ref: "content_heritage_emberveined_001",
      upbringing_ref: "content_upbringing_rooftop_garden_001",
      archetype_ref: "content_archetype_weaver_001",
    },
    significant_gear: [
      {
        slot: 1,
        definition: {
          content_definition_id: "content_gear_resonant_wick_case_001",
          definition_revision: 1,
        },
      },
      { slot: 2, definition: null },
      { slot: 3, definition: null },
      { slot: 4, definition: null },
    ],
  }),
]);
