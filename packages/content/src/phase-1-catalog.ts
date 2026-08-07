import {
  SCHEMA_VERSION,
  type ContentDefinition,
  type ContentManifest,
  type ContentManifestHash,
  type HashedContentDefinition,
  buildSortedManifestEntries,
  hashContentDefinition,
  hashContentManifestEntries,
  validateContentCatalog,
  validateContentManifest,
  validateValue,
  ContentDefinitionSchema,
} from "@lldm/contracts";
import { CORE_TERM_CATALOG } from "./core-catalog.js";

function define(input: unknown): ContentDefinition {
  const result = validateValue(ContentDefinitionSchema, input);
  if (!result.success) {
    throw new Error(
      `Invalid Phase 1 content: ${result.issues
        .map(({ path, message }) => `${path}: ${message}`)
        .join("; ")}`,
    );
  }
  return Object.freeze(result.value);
}

function reference(content_definition_id: string) {
  return { content_definition_id, definition_revision: 1 };
}

function option(input: {
  readonly id: string;
  readonly category: "heritage_gift" | "upbringing" | "archetype";
  readonly name: string;
  readonly rule: string;
  readonly abilities?: readonly string[];
  readonly effects: readonly unknown[];
  readonly permission_scope: "exploration" | "social" | "ritual" | "world";
  readonly permission: string;
}) {
  return define({
    schema_version: SCHEMA_VERSION,
    content_definition_id: input.id,
    definition_revision: 1,
    kind: "playable_option",
    payload: {
      category: input.category,
      display_name: input.name,
      rule_text: input.rule,
      rank: 1,
      availability: "production",
      prerequisites: [],
      granted_ability_ids: input.abilities ?? [],
      tactical_effects: input.effects,
      narrative_permissions: [
        {
          scope: input.permission_scope,
          permission: input.permission,
        },
      ],
    },
  });
}

function ability(input: {
  readonly id: string;
  readonly category:
    | "significant_gear"
    | "signature_technique"
    | "power"
    | "reaction";
  readonly name: string;
  readonly rule: string;
  readonly slot: "action" | "maneuver" | "reaction";
  readonly cost?: readonly unknown[];
  readonly target: "self" | "single_actor" | "zone" | "objective";
  readonly range: "self" | "same_zone" | "adjacent" | "distant";
  readonly impact?: number | null;
  readonly check?: {
    readonly attribute: "Force" | "Finesse" | "Insight" | "Presence";
    readonly discipline:
      | "Athletics"
      | "Subterfuge"
      | "Craft"
      | "Lore"
      | "Vigilance"
      | "Influence"
      | "Survival"
      | "Mysticism";
    readonly target: 10 | 13 | 16 | 19 | 22;
  } | null;
  readonly effects: readonly unknown[];
  readonly permission_scope: "exploration" | "social" | "ritual" | "world";
  readonly permission: string;
}) {
  return define({
    schema_version: SCHEMA_VERSION,
    content_definition_id: input.id,
    definition_revision: 1,
    kind: "ability",
    payload: {
      category: input.category,
      display_name: input.name,
      rule_text: input.rule,
      action_slot: input.slot,
      cost: input.cost ?? [],
      target_mode: input.target,
      range: input.range,
      fixed_impact: input.impact ?? null,
      check_profile: input.check ?? null,
      effects: input.effects,
      narrative_permissions: [
        {
          scope: input.permission_scope,
          permission: input.permission,
        },
      ],
    },
  });
}

export const PHASE_1_HERITAGE_GIFTS = Object.freeze([
  option({
    id: "content_heritage_emberveined_001",
    category: "heritage_gift",
    name: "Emberveined",
    rule: "Once committed to danger, carry a steady inner heat through the attempt.",
    effects: [{ kind: "grant_edge", context: "death_test" }],
    permission_scope: "world",
    permission:
      "Endure ordinary heat and recognize traces left by unnatural flame.",
  }),
  option({
    id: "content_heritage_galecrest_001",
    category: "heritage_gift",
    name: "Galecrest",
    rule: "Read a sudden change in air before committing to motion.",
    effects: [{ kind: "grant_edge", context: "check" }],
    permission_scope: "exploration",
    permission:
      "Sense open airways, pressure changes, and an approaching hard wind.",
  }),
  option({
    id: "content_heritage_stonewake_001",
    category: "heritage_gift",
    name: "Stonewake",
    rule: "Set your footing against an incoming force.",
    effects: [{ kind: "reduce_impact", amount: 1, floor: 1 }],
    permission_scope: "exploration",
    permission:
      "Recognize whether worked stone is stable, strained, or recently moved.",
  }),
  option({
    id: "content_heritage_tidekin_001",
    category: "heritage_gift",
    name: "Tidekin",
    rule: "Keep momentum while circumstances turn around you.",
    effects: [{ kind: "grant_edge", context: "attack" }],
    permission_scope: "world",
    permission:
      "Read currents and move confidently through ordinary deep water.",
  }),
]);

export const PHASE_1_UPBRINGINGS = Object.freeze([
  option({
    id: "content_upbringing_archive_lantern_001",
    category: "upbringing",
    name: "Archive Lantern",
    rule: "Cross-check a remembered detail before acting on it.",
    effects: [{ kind: "grant_edge", context: "check" }],
    permission_scope: "exploration",
    permission:
      "Know how public records, catalog marks, and civic archives are organized.",
  }),
  option({
    id: "content_upbringing_bellward_raised_001",
    category: "upbringing",
    name: "Bellward Raised",
    rule: "Hold formation when an alarm scatters everyone else.",
    effects: [{ kind: "restore_reaction", target: "ally" }],
    permission_scope: "social",
    permission:
      "Invoke the practical customs shared by watch crews and flood wardens.",
  }),
  option({
    id: "content_upbringing_river_caravan_001",
    category: "upbringing",
    name: "River Caravan",
    rule: "Find the next useful route when the obvious one closes.",
    effects: [{ kind: "move", distance: "adjacent", target: "self" }],
    permission_scope: "exploration",
    permission:
      "Locate a plausible trade path, ferry custom, or traveling contact.",
  }),
  option({
    id: "content_upbringing_rooftop_garden_001",
    category: "upbringing",
    name: "Rooftop Garden",
    rule: "Turn a small reserve into timely practical help.",
    effects: [
      {
        kind: "adjust_resource",
        resource: "supply",
        amount: 1,
        target: "party",
      },
    ],
    permission_scope: "world",
    permission:
      "Identify useful cultivated plants and the communities that tend them.",
  }),
]);

export const PHASE_1_SIGNATURE_TECHNIQUES = Object.freeze([
  ability({
    id: "content_signature_brace_breach_001",
    category: "signature_technique",
    name: "Brace the Breach",
    rule: "Spend 1 Exertion and strike a same-zone foe for 4 Impact on Success.",
    slot: "action",
    cost: [
      {
        kind: "adjust_resource",
        resource: "exertion",
        amount: -1,
        target: "self",
      },
    ],
    target: "single_actor",
    range: "same_zone",
    impact: 4,
    check: { attribute: "Force", discipline: "Athletics", target: 13 },
    effects: [{ kind: "deal_impact", impact: 4 }],
    permission_scope: "exploration",
    permission:
      "Create a momentary brace point in a failing mundane structure.",
  }),
  ability({
    id: "content_signature_flashcut_001",
    category: "signature_technique",
    name: "Flashcut",
    rule: "Cross an opening and deal 3 Impact to a nearby foe on Success.",
    slot: "action",
    target: "single_actor",
    range: "adjacent",
    impact: 3,
    check: { attribute: "Finesse", discipline: "Subterfuge", target: 13 },
    effects: [{ kind: "deal_impact", impact: 3 }],
    permission_scope: "social",
    permission: "Recognize when posture or attention exposes a brief opening.",
  }),
  ability({
    id: "content_signature_threadline_001",
    category: "signature_technique",
    name: "Threadline",
    rule: "Move yourself or one ally to an adjacent zone without a check.",
    slot: "maneuver",
    target: "single_actor",
    range: "adjacent",
    effects: [{ kind: "move", distance: "adjacent", target: "ally" }],
    permission_scope: "exploration",
    permission: "Identify a traversable line through unstable nearby terrain.",
  }),
  ability({
    id: "content_signature_answering_call_001",
    category: "signature_technique",
    name: "Answering Call",
    rule: "Use a reaction to restore one nearby ally's reaction.",
    slot: "reaction",
    target: "single_actor",
    range: "adjacent",
    effects: [{ kind: "restore_reaction", target: "ally" }],
    permission_scope: "social",
    permission:
      "Establish a concise signal that willing allies can recognize in confusion.",
  }),
  ability({
    id: "content_signature_current_fold_001",
    category: "signature_technique",
    name: "Current Fold",
    rule: "On Success, move one foe into a zone adjacent to its current position.",
    slot: "action",
    target: "single_actor",
    range: "distant",
    check: { attribute: "Insight", discipline: "Mysticism", target: 13 },
    effects: [{ kind: "move", distance: "adjacent", target: "enemy" }],
    permission_scope: "ritual",
    permission: "Sense the direction of a nearby active magical current.",
  }),
  ability({
    id: "content_signature_guiding_cadence_001",
    category: "signature_technique",
    name: "Guiding Cadence",
    rule: "Advance an objective in your zone by 2 without a check.",
    slot: "action",
    target: "objective",
    range: "same_zone",
    effects: [{ kind: "advance_track", track: "objective", amount: 2 }],
    permission_scope: "social",
    permission: "Coordinate willing people through a dangerous shared task.",
  }),
]);

const archetypeInputs = [
  {
    id: "content_archetype_vanguard_001",
    name: "Vanguard",
    guard: 8,
    signature: "content_signature_brace_breach_001",
    rule: "Stand at the point of greatest pressure and make space for allies.",
    permission: "Assess where a physical defense will hold or fail first.",
  },
  {
    id: "content_archetype_maverick_001",
    name: "Maverick",
    guard: 7,
    signature: "content_signature_flashcut_001",
    rule: "Exploit a narrow opening before the opposition can close it.",
    permission:
      "Recognize habits that create an exploitable moment of distraction.",
  },
  {
    id: "content_archetype_wayfinder_001",
    name: "Wayfinder",
    guard: 6,
    signature: "content_signature_threadline_001",
    rule: "Control position by seeing routes that others miss.",
    permission: "Determine the safest practical route through visible terrain.",
  },
  {
    id: "content_archetype_envoy_001",
    name: "Envoy",
    guard: 6,
    signature: "content_signature_answering_call_001",
    rule: "Keep allies responsive through timing, signals, and trust.",
    permission:
      "Recognize the protocol and status signals of an organized group.",
  },
  {
    id: "content_archetype_weaver_001",
    name: "Weaver",
    guard: 5,
    signature: "content_signature_current_fold_001",
    rule: "Reshape a confrontation by redirecting active magical forces.",
    permission: "Identify the visible anchor of a bounded magical effect.",
  },
  {
    id: "content_archetype_beacon_001",
    name: "Beacon",
    guard: 6,
    signature: "content_signature_guiding_cadence_001",
    rule: "Focus a group on the task that will change the whole field.",
    permission: "Recognize who is ready to accept practical aid or direction.",
  },
] as const;

export const PHASE_1_ARCHETYPES = Object.freeze(
  archetypeInputs.map((entry) =>
    option({
      id: entry.id,
      category: "archetype",
      name: entry.name,
      rule: entry.rule,
      abilities: [entry.signature],
      effects: [
        {
          kind: "adjust_resource",
          resource: "guard",
          amount: entry.guard,
          target: "self",
        },
        { kind: "grant_edge", context: "check" },
      ],
      permission_scope: "exploration",
      permission: entry.permission,
    }),
  ),
);

export const PHASE_1_SIGNIFICANT_GEAR = Object.freeze([
  ability({
    id: "content_gear_ironroot_hook_001",
    category: "significant_gear",
    name: "Ironroot Hook",
    rule: "Strike a same-zone foe for 3 Impact on Success.",
    slot: "action",
    target: "single_actor",
    range: "same_zone",
    impact: 3,
    check: { attribute: "Force", discipline: "Athletics", target: 13 },
    effects: [{ kind: "deal_impact", impact: 3 }],
    permission_scope: "exploration",
    permission:
      "Secure a line to ordinary wood, stone, or worked metal within reach.",
  }),
  ability({
    id: "content_gear_slate_compass_001",
    category: "significant_gear",
    name: "Slate Compass",
    rule: "Move yourself or one ally to an adjacent zone without a check.",
    slot: "maneuver",
    target: "single_actor",
    range: "adjacent",
    effects: [{ kind: "move", distance: "adjacent", target: "ally" }],
    permission_scope: "exploration",
    permission:
      "Recall the last safe route deliberately marked on its slate face.",
  }),
  ability({
    id: "content_gear_accord_chime_001",
    category: "significant_gear",
    name: "Accord Chime",
    rule: "Advance an objective in your zone by 1 without a check.",
    slot: "action",
    target: "objective",
    range: "same_zone",
    effects: [{ kind: "advance_track", track: "objective", amount: 1 }],
    permission_scope: "social",
    permission:
      "Call the attention of willing people who know civic alarm tones.",
  }),
  ability({
    id: "content_gear_resonant_wick_case_001",
    category: "significant_gear",
    name: "Resonant Wick Case",
    rule: "Release a charged wick for 2 Impact against a distant foe on Success.",
    slot: "action",
    target: "single_actor",
    range: "distant",
    impact: 2,
    check: { attribute: "Insight", discipline: "Mysticism", target: 13 },
    effects: [{ kind: "deal_impact", impact: 2 }],
    permission_scope: "ritual",
    permission: "Safely carry one prepared resonant wick between ritual sites.",
  }),
]);

const floodPike = ability({
  id: "content_enemy_action_flood_pike_001",
  category: "power",
  name: "Flood Pike",
  rule: "Drive a hooked pike into a same-zone foe for 3 Impact on Success.",
  slot: "action",
  target: "single_actor",
  range: "same_zone",
  impact: 3,
  check: { attribute: "Force", discipline: "Athletics", target: 13 },
  effects: [{ kind: "deal_impact", impact: 3 }],
  permission_scope: "world",
  permission: "Control a narrow flooded passage with a hooked polearm.",
});

const crushingToll = ability({
  id: "content_enemy_action_crushing_toll_001",
  category: "power",
  name: "Crushing Toll",
  rule: "Sound a close shock wave for 4 Impact on Success.",
  slot: "action",
  target: "single_actor",
  range: "adjacent",
  impact: 4,
  check: { attribute: "Force", discipline: "Vigilance", target: 13 },
  effects: [{ kind: "deal_impact", impact: 4 }],
  permission_scope: "world",
  permission: "Shake unsecured objects with the custodian bell's focused tone.",
});

function enemy(input: {
  readonly id: string;
  readonly name: string;
  readonly role: "squad" | "boss";
  readonly guard: number;
  readonly armor: number;
  readonly action: string;
  readonly preference_tags: readonly string[];
  readonly goals: readonly string[];
  readonly temperament: readonly string[];
}) {
  return define({
    schema_version: SCHEMA_VERSION,
    content_definition_id: input.id,
    definition_revision: 1,
    kind: "enemy",
    payload: {
      display_name: input.name,
      rule_text: `${input.name} follows explicit Guard, armor, ratings, and action definitions.`,
      role: input.role,
      guard: input.guard,
      armor: input.armor,
      attribute_ratings: {
        Force: input.role === "boss" ? 2 : 1,
        Finesse: 1,
        Insight: 0,
        Presence: input.role === "boss" ? 1 : 0,
      },
      discipline_ratings: {
        Athletics: input.role === "boss" ? 2 : 1,
        Subterfuge: 0,
        Craft: 1,
        Lore: 0,
        Vigilance: input.role === "boss" ? 2 : 1,
        Influence: 0,
        Survival: 1,
        Mysticism: 0,
      },
      actions: [
        {
          action: reference(input.action),
          preference_tags: input.preference_tags,
        },
      ],
      goal_tags: input.goals,
      temperament_tags: input.temperament,
    },
  });
}

export const PHASE_1_ENCOUNTER_DEFINITIONS = Object.freeze([
  floodPike,
  crushingToll,
  enemy({
    id: "content_enemy_floodworn_crew_001",
    name: "Floodworn Crew",
    role: "squad",
    guard: 6,
    armor: 0,
    action: floodPike.content_definition_id,
    preference_tags: ["hold.channel", "press.near"],
    goals: ["hold.channel"],
    temperament: ["press.near"],
  }),
  enemy({
    id: "content_enemy_bellmaw_custodian_001",
    name: "Bell-Maw Custodian",
    role: "boss",
    guard: 10,
    armor: 1,
    action: crushingToll.content_definition_id,
    preference_tags: ["guard.spillway", "press.near"],
    goals: ["guard.spillway"],
    temperament: ["press.near"],
  }),
  define({
    schema_version: SCHEMA_VERSION,
    content_definition_id: "content_objective_open_spillway_001",
    definition_revision: 1,
    kind: "objective",
    payload: {
      display_name: "Open the Spillway",
      rule_text:
        "Reach 3 progress at the gate controls to divert the rising water.",
      threshold: 3,
      completion_effects: [
        {
          kind: "adjust_resource",
          resource: "supply",
          amount: 1,
          target: "party",
        },
      ],
    },
  }),
  define({
    schema_version: SCHEMA_VERSION,
    content_definition_id: "content_overlay_last_resonance_001",
    definition_revision: 1,
    kind: "boss_overlay",
    payload: {
      display_name: "Last Resonance",
      rule_text:
        "When first depleted, the Custodian restores 5 Guard and rings with exposed force.",
      objective: reference("content_objective_open_spillway_001"),
      trigger: "guard_depleted",
      effects: [
        {
          kind: "adjust_resource",
          resource: "guard",
          amount: 5,
          target: "self",
        },
      ],
    },
  }),
]);

export const PHASE_1_NONCOMBAT_DEFINITIONS = Object.freeze([
  define({
    schema_version: SCHEMA_VERSION,
    content_definition_id: "content_challenge_floodgate_sequence_001",
    definition_revision: 1,
    kind: "challenge",
    payload: {
      display_name: "The Floodgate Sequence",
      rule_text: "Restore four control seals before Danger reaches three.",
      progress_maximum: 4,
      danger_maximum: 3,
      tie_rule: "resolved_with_cost",
      outcome_effects: [
        { degree: "Crisis", progress: 0, danger: 2 },
        { degree: "Setback", progress: 0, danger: 1 },
        { degree: "Success", progress: 1, danger: 0 },
        { degree: "Triumph", progress: 2, danger: 0 },
      ],
    },
  }),
  define({
    schema_version: SCHEMA_VERSION,
    content_definition_id: "content_social_gatewarden_nera_001",
    definition_revision: 1,
    kind: "social_profile",
    payload: {
      display_name: "Gatewarden Nera",
      motives: [
        { text: "Keep the lower ward safe.", visibility: "public" },
        { text: "Restore trust in the gate crew.", visibility: "seat_private" },
      ],
      fears: [
        {
          text: "The old flood will repeat on her watch.",
          visibility: "host_control",
        },
      ],
      initial_stance: "guarded",
      leverage_capacity: 2,
      hard_limits: [
        {
          text: "Never abandon the gate while its alarm sounds.",
          visibility: "public",
        },
      ],
    },
  }),
  define({
    schema_version: SCHEMA_VERSION,
    content_definition_id: "content_ritual_echo_lantern_001",
    definition_revision: 1,
    kind: "ritual",
    payload: {
      display_name: "Kindle the Echo Lantern",
      rule_text:
        "Bind a safe memory into a prepared lantern and open a remembered passage.",
      scope: "One prepared lantern and the gathered participants.",
      time: "One focused scene.",
      requirements: [
        { kind: "participant_count", minimum: 2 },
        { kind: "fictional_position", tag: "echo_lantern_prepared" },
      ],
      costs: [
        {
          kind: "significant_gear",
          definition: reference("content_gear_resonant_wick_case_001"),
        },
        { kind: "supply", amount: 1 },
      ],
      target_mode: "place",
      consequences: [
        {
          degree: "Crisis",
          effects: [
            {
              kind: "adjust_resource",
              resource: "guard",
              amount: -2,
              target: "self",
            },
          ],
          text: "The memory lashes back and the passage remains closed.",
        },
        {
          degree: "Setback",
          effects: [
            {
              kind: "adjust_resource",
              resource: "exertion",
              amount: -1,
              target: "self",
            },
          ],
          text: "The passage remains closed and the effort lingers.",
        },
        {
          degree: "Success",
          effects: [
            {
              kind: "adjust_resource",
              resource: "supply",
              amount: 1,
              target: "party",
            },
          ],
          text: "The lantern opens a stable remembered passage.",
        },
        {
          degree: "Triumph",
          effects: [
            {
              kind: "adjust_resource",
              resource: "supply",
              amount: 2,
              target: "party",
            },
          ],
          text: "The passage opens and reveals a useful cache along the remembered route.",
        },
      ],
    },
  }),
]);

const sourceDefinitions = [
  ...CORE_TERM_CATALOG,
  ...PHASE_1_HERITAGE_GIFTS,
  ...PHASE_1_UPBRINGINGS,
  ...PHASE_1_ARCHETYPES,
  ...PHASE_1_SIGNATURE_TECHNIQUES,
  ...PHASE_1_SIGNIFICANT_GEAR,
  ...PHASE_1_ENCOUNTER_DEFINITIONS,
  ...PHASE_1_NONCOMBAT_DEFINITIONS,
];

export const PHASE_1_DEFINITIONS: readonly ContentDefinition[] = Object.freeze(
  [...sourceDefinitions].sort((left, right) =>
    left.content_definition_id.localeCompare(right.content_definition_id),
  ),
);

export const PHASE_1_HASHED_DEFINITIONS: readonly HashedContentDefinition[] =
  Object.freeze(
    PHASE_1_DEFINITIONS.map((definition) => ({
      definition,
      definition_hash: hashContentDefinition(definition),
    })),
  );

const catalogValidation = validateContentCatalog(PHASE_1_HASHED_DEFINITIONS);
if (!catalogValidation.success) {
  throw new Error(
    `Invalid Phase 1 catalog: ${catalogValidation.issues
      .map(({ path, message }) => `${path}: ${message}`)
      .join("; ")}`,
  );
}

const manifestEntries = buildSortedManifestEntries(PHASE_1_HASHED_DEFINITIONS);
const manifestIdentity = {
  schema_version: SCHEMA_VERSION,
  content_manifest_id: "content_manifest_phase1_001",
  entries: [...manifestEntries],
};
export const PHASE_1_CONTENT_MANIFEST_HASH = hashContentManifestEntries({
  canonicalization_version: 1,
  manifest: manifestIdentity,
});
export const PHASE_1_CONTENT_MANIFEST: ContentManifest = Object.freeze({
  ...manifestIdentity,
  manifest_hash: PHASE_1_CONTENT_MANIFEST_HASH,
});

const manifestValidation = validateContentManifest(PHASE_1_CONTENT_MANIFEST);
if (!manifestValidation.success) {
  throw new Error("Generated Phase 1 content manifest is invalid.");
}

export const CONTENT_MANIFESTS_BY_HASH: Readonly<
  Record<ContentManifestHash, ContentManifest>
> = Object.freeze({
  [PHASE_1_CONTENT_MANIFEST_HASH]: PHASE_1_CONTENT_MANIFEST,
});

export function definitionsForManifest(
  manifestHash: ContentManifestHash,
): readonly ContentDefinition[] | undefined {
  return CONTENT_MANIFESTS_BY_HASH[manifestHash] === undefined
    ? undefined
    : PHASE_1_DEFINITIONS;
}

export const DEFERRED_CONTENT_REGISTRIES = Object.freeze({
  paths: Object.freeze({
    availability: "unavailable_in_phase_1" as const,
    definitions: Object.freeze([]),
  }),
  talents: Object.freeze({
    availability: "unavailable_in_phase_1" as const,
    definitions: Object.freeze([]),
  }),
  capstones: Object.freeze({
    availability: "unavailable_in_phase_1" as const,
    definitions: Object.freeze([]),
  }),
});
