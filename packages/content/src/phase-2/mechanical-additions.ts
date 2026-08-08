import {
  ContentDefinitionSchema,
  SCHEMA_VERSION,
  type ContentDefinition,
  validateValue,
} from "@lldm/contracts";

const floodgateReliefRitual = {
  schema_version: SCHEMA_VERSION,
  content_definition_id: "content_ritual_floodgate_relief_001",
  definition_revision: 1,
  kind: "ritual",
  payload: {
    display_name: "Turn the Floodgate Relief",
    rule_text:
      "Gather three operators at the reversed current, commit one Supply, then resolve the relief cadence.",
    scope: "The Floodgate relief circuit and the gathered party.",
    time: "One focused scene.",
    requirements: [
      { kind: "participant_count", minimum: 3 },
      { kind: "fictional_position", tag: "floodgate_current_reversed" },
    ],
    costs: [{ kind: "supply", amount: 1 }],
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
        text: "The circuit snaps back, but the custodian wakes along the opened route.",
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
        text: "The relief turns unevenly and wakes the custodian.",
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
        text: "The relief turns and leaves the party positioned for the custodian.",
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
        text: "The relief turns cleanly and reveals a reserve cache.",
      },
    ],
  },
} as const;

function reference(content_definition_id: string) {
  return { content_definition_id, definition_revision: 1 } as const;
}

function floodgateObjective(
  partySize: 4 | 5,
  threshold: 4 | 5,
): ContentDefinition {
  return {
    schema_version: SCHEMA_VERSION,
    content_definition_id: `content_objective_open_spillway_party${partySize}_001`,
    definition_revision: 1,
    kind: "objective",
    payload: {
      display_name: `Open the Pressured Spillway (${partySize})`,
      rule_text: `Reach ${threshold} progress at the gate controls while the larger hostile roster presses the crossing.`,
      threshold,
      completion_effects: [
        {
          kind: "adjust_resource",
          resource: "supply",
          amount: 1,
          target: "party",
        },
      ],
    },
  };
}

function lastResonanceOverlay(partySize: 4 | 5): ContentDefinition {
  return {
    schema_version: SCHEMA_VERSION,
    content_definition_id: `content_overlay_last_resonance_party${partySize}_001`,
    definition_revision: 1,
    kind: "boss_overlay",
    payload: {
      display_name: `Last Resonance (${partySize})`,
      rule_text:
        "When first depleted, the Custodian restores 5 Guard and rings with exposed force.",
      objective: reference(
        `content_objective_open_spillway_party${partySize}_001`,
      ),
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
  };
}

const additions = [
  floodgateReliefRitual,
  floodgateObjective(4, 4),
  lastResonanceOverlay(4),
  floodgateObjective(5, 5),
  lastResonanceOverlay(5),
];
const parsed = additions.map((definition) =>
  validateValue(ContentDefinitionSchema, definition),
);
if (parsed.some((result) => !result.success))
  throw new Error("Phase 2 mechanical additions are invalid.");

export const PHASE_2_ADDED_DEFINITIONS: readonly ContentDefinition[] =
  Object.freeze(
    parsed.map((result) => {
      if (!result.success)
        throw new Error("Phase 2 mechanical additions are invalid.");
      return result.value;
    }),
  );
