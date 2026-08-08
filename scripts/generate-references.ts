import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  ARCHETYPE_GUARD_MAXIMA,
  CharacterFoundationSchema,
  OUTCOME_DEGREES,
  PlayableCharacterStateSchema,
  PROTOCOL_VERSION,
  RANDOMNESS_ALGORITHM_VERSION,
  RELAY_APPLIANCE_FRAMES_PER_MINUTE,
  RELAY_COMMANDS_PER_MINUTE,
  RELAY_MAX_CONNECTIONS,
  RELAY_MAX_FRAME_BYTES,
  RELAY_MAX_ROOM_LIFETIME_SECONDS,
  ROOM_STATE_SCHEMA_VERSION,
  SCHEMA_VERSION,
  STANDARD_TARGETS,
  STATE_CANONICALIZATION_VERSION,
  STATE_SCHEMA_VERSION,
  STORAGE_MIGRATION_VERSION,
} from "@lldm/contracts";
import {
  ATTRIBUTE_METADATA,
  DEFERRED_CONTENT_REGISTRIES,
  DISCIPLINE_METADATA,
  OUTCOME_METADATA,
  PHASE_1_ARCHETYPES,
  PHASE_1_CONTENT_MANIFEST,
  PHASE_1_DEFINITIONS,
  PHASE_1_ENCOUNTER_DEFINITIONS,
  PHASE_1_HERITAGE_GIFTS,
  PHASE_1_NONCOMBAT_DEFINITIONS,
  PHASE_1_SIGNIFICANT_GEAR,
  PHASE_1_SIGNATURE_TECHNIQUES,
  PHASE_1_STARTER_LOADOUTS,
  PHASE_1_UPBRINGINGS,
  PHASE_2_CONTENT_MANIFEST,
  PHASE_2_DEFINITIONS,
  PHASE_2_ENCOUNTER_VARIANTS,
  PHASE_2_PRESENTATION_MANIFEST,
  PHASE_2_STARTER_LOADOUTS,
  TARGET_METADATA,
} from "@lldm/content";
import {
  CORE_RULES,
  LEGAL_TOTAL_MODIFIERS,
  PHYSICAL_ROLL_REASON_PRECEDENCE,
  STARTING_ATTRIBUTE_ALLOCATION,
  STARTING_DISCIPLINE_ALLOCATION,
  enumerateOutcomeCounts,
  formatOutcomePercentage,
} from "@lldm/engine";
import { SNAPSHOT_EVENT_THRESHOLD, SQLITE_MIGRATIONS } from "@lldm/runtime";

const GENERATED_WARNING =
  "> Generated from executable LLDM definitions. Do not edit by hand. Run `pnpm docs:generate` to regenerate.";

function markdownTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
) {
  const header = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  return [
    header,
    separator,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function physicalReasonLabel(reason: string): string {
  return reason
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function renderMechanicalReference(): string {
  const currentMigration = SQLITE_MIGRATIONS.at(-1);
  if (currentMigration?.version !== STORAGE_MIGRATION_VERSION) {
    throw new Error(
      "The public storage migration version and SQLite registry disagree.",
    );
  }
  const attributes = Object.entries(ATTRIBUTE_METADATA).map(
    ([identifier, metadata]) => [identifier, metadata.description],
  );
  const disciplines = Object.entries(DISCIPLINE_METADATA).map(
    ([identifier, metadata]) => [identifier, metadata.description],
  );
  const targets = STANDARD_TARGETS.map((target) => [
    String(target),
    TARGET_METADATA[target].description,
  ]);
  const outcomes = OUTCOME_DEGREES.map((degree) => [
    degree,
    OUTCOME_METADATA[degree].description,
  ]);
  const characterFields = Object.keys(CharacterFoundationSchema.properties)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((field) => `- \`${field}\``)
    .join("\n");
  const reasonPrecedence = PHYSICAL_ROLL_REASON_PRECEDENCE.map(
    (reason) => `- ${physicalReasonLabel(reason)}`,
  ).join("\n");
  const playableFields = Object.keys(PlayableCharacterStateSchema.properties)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((field) => `- \`${field}\``)
    .join("\n");
  const guardRows = Object.entries(ARCHETYPE_GUARD_MAXIMA).map(
    ([archetype, maximum]) => [archetype, String(maximum)],
  );

  return `${GENERATED_WARNING}

# LLDM Phase 1 Mechanical Reference

## Core terms

### Attributes

${markdownTable(["Identifier", "Display meaning"], attributes)}

Starting ratings: \`${STARTING_ATTRIBUTE_ALLOCATION.join(", ")}\`.

### Disciplines

${markdownTable(["Identifier", "Display meaning"], disciplines)}

Starting ratings: \`${STARTING_DISCIPLINE_ALLOCATION.join(", ")}\`.

### Standard targets

${markdownTable(["Target", "Display guidance"], targets)}

## Resolution

### ${CORE_RULES.resolution_formula.title}

${CORE_RULES.resolution_formula.text}

### ${CORE_RULES.edge_and_hindrance.title}

${CORE_RULES.edge_and_hindrance.text}

### ${CORE_RULES.outcome_degrees.title}

${CORE_RULES.outcome_degrees.text}

${markdownTable(["Degree", "Display meaning"], outcomes)}

### ${CORE_RULES.natural_faces.title}

${CORE_RULES.natural_faces.text}

## Physical rolls

${CORE_RULES.physical_rolls.text}

Primary-reason precedence:

${reasonPrecedence}

${CORE_RULES.spark.text}

### ${CORE_RULES.physical_disclosure.title}

${CORE_RULES.physical_disclosure.text}

## Simulated randomness

### ${CORE_RULES.simulated_randomness.title}

${CORE_RULES.simulated_randomness.text}

The version-1 algorithm identifier is \`hmac_sha256_v1\`. Its length-prefixed, big-endian framing begins with the UTF-8 domain tag \`LLDM random v1\`; bounded integers use 256-bit rejection sampling.

## Character foundation

${CORE_RULES.starting_allocations.text}

The version-1 \`character_foundation\` record contains these canonical fields:

${characterFields}

The record is creation input, not playable state. Narrative text fields do not grant mechanical bonuses.

## Playable characters and resources

${CORE_RULES.playable_resources.text}

${markdownTable(["Archetype", "Rank-one Guard maximum"], guardRows)}

The independently versioned \`playable_character_state\` record contains these canonical fields:

${playableFields}

### ${CORE_RULES.significant_gear.title}

${CORE_RULES.significant_gear.text}

### ${CORE_RULES.recovery.title}

${CORE_RULES.recovery.text}

### ${CORE_RULES.rank_advancement.title}

${CORE_RULES.rank_advancement.text}

## Combat

### ${CORE_RULES.combat_flow.title}

${CORE_RULES.combat_flow.text}

### ${CORE_RULES.reaction_priority.title}

${CORE_RULES.reaction_priority.text}

### ${CORE_RULES.death_test.title}

${CORE_RULES.death_test.text}

## Progress, social state, rituals, and conditions

### ${CORE_RULES.challenges.title}

${CORE_RULES.challenges.text}

### ${CORE_RULES.social_shifts.title}

${CORE_RULES.social_shifts.text}

### ${CORE_RULES.ritual_resolution.title}

${CORE_RULES.ritual_resolution.text}

### ${CORE_RULES.ritual_interruption.title}

${CORE_RULES.ritual_interruption.text}

### ${CORE_RULES.condition_duration.title}

${CORE_RULES.condition_duration.text}

## Deterministic transactions and local persistence

| Versioned boundary | Current value |
| --- | --- |
| Serialized schema | ${SCHEMA_VERSION} |
| Transport protocol | ${PROTOCOL_VERSION} |
| Mechanical state schema | ${STATE_SCHEMA_VERSION} |
| Canonical JSON | ${STATE_CANONICALIZATION_VERSION} |
| Simulated randomness | \`${RANDOMNESS_ALGORITHM_VERSION}\` |
| SQLite migration | ${currentMigration.version} (\`${currentMigration.name}\`, checksum \`${currentMigration.checksum}\`) |

A command ID permanently binds its validated canonical JSON and hash. An exact retry returns the already stored transaction without consulting the clock, content catalog, engine, random source, projector, snapshot policy, entropy, or ID allocator. Reusing either a command ID or transaction ID for different canonical command bytes is an identity collision and appends nothing. A structurally valid stale or illegal command instead commits one typed rejection event with identical pre-state and post-state hashes.

Each accepted, rejected, or compensating-undo command commits one contiguous event range atomically with its command row, transaction record, state head, audience projections, and any triggered snapshot. Events contain resolved mechanical facts; replay applies those events without rerunning command decisions, content lookup, randomness, or physical dice.

Snapshots are validated, disposable replay accelerators written at scene and session boundaries or after ${SNAPSHOT_EVENT_THRESHOLD} events since the latest snapshot. Invalid snapshots produce an explicit diagnostic and full event-replay fallback. Public-TV, eligible-seat-private, and host-control projections are derived at every stream revision and can be rebuilt byte-for-byte without changing canonical history.

Undo never edits or deletes history. It appends typed compensating events only for the latest eligible mechanical transaction; submitted physical dice, permanent death, prior undo, stale targets, and non-invertible dependencies remain non-undoable.

Production paths, rank-three talents, rank-four capstones, broad catalogs, room applications, and generated-fiction systems remain unavailable in Phase 1.
`;
}

export function renderProbabilityReport(): string {
  const rows = STANDARD_TARGETS.flatMap((target) =>
    LEGAL_TOTAL_MODIFIERS.map((modifier) => {
      const counts = enumerateOutcomeCounts(target, modifier);
      return [
        String(target),
        modifier >= 0 ? `+${modifier}` : String(modifier),
        ...OUTCOME_DEGREES.map(
          (degree) =>
            `${counts[degree]} (${formatOutcomePercentage(counts[degree])})`,
        ),
      ];
    }),
  );

  return `${GENERATED_WARNING}

# LLDM Phase 1 Probability Report

Each row directly enumerates all twenty d20 faces through the authoritative resolution function. Counts are exact integers out of 20; percentages use five percentage points per face.

${markdownTable(["Target", "Modifier", ...OUTCOME_DEGREES], rows)}

Natural 1 downgrades and natural 20 upgrades, including end-degree clamping, are already included in every row.
`;
}

function contentName(id: string): string {
  const definition = PHASE_1_DEFINITIONS.find(
    ({ content_definition_id }) => content_definition_id === id,
  );
  if (definition === undefined) return id;
  return definition.kind === "core_term"
    ? definition.payload.display_name
    : definition.payload.display_name;
}

export function renderPlayableContentReference(): string {
  const archetypeRows = PHASE_1_ARCHETYPES.map((definition) => {
    if (definition.kind !== "playable_option") {
      throw new Error("Generated archetype reference received the wrong kind.");
    }
    const guard = definition.payload.tactical_effects.find(
      (effect) =>
        effect.kind === "adjust_resource" && effect.resource === "guard",
    );
    const signature = definition.payload.granted_ability_ids[0];
    return [
      definition.payload.display_name,
      guard?.kind === "adjust_resource" ? String(guard.amount) : "—",
      signature === undefined ? "—" : contentName(signature),
      definition.payload.narrative_permissions[0]?.permission ?? "—",
    ];
  });
  const optionRows = [...PHASE_1_HERITAGE_GIFTS, ...PHASE_1_UPBRINGINGS].map(
    (definition) => {
      if (definition.kind !== "playable_option") {
        throw new Error("Generated option reference received the wrong kind.");
      }
      return [
        definition.payload.category === "heritage_gift"
          ? "Heritage Gift"
          : "Upbringing",
        definition.payload.display_name,
        definition.payload.rule_text,
        definition.payload.narrative_permissions[0]?.permission ?? "—",
      ];
    },
  );
  const abilityRows = [
    ...PHASE_1_SIGNATURE_TECHNIQUES,
    ...PHASE_1_SIGNIFICANT_GEAR,
  ].map((definition) => {
    if (definition.kind !== "ability") {
      throw new Error("Generated ability reference received the wrong kind.");
    }
    return [
      definition.payload.category === "signature_technique"
        ? "Signature"
        : "Significant gear",
      definition.payload.display_name,
      definition.payload.action_slot,
      definition.payload.rule_text,
    ];
  });
  const starterRows = PHASE_1_STARTER_LOADOUTS.map((starter) => {
    const gear = starter.significant_gear.find(
      ({ definition }) => definition !== null,
    )?.definition;
    return [
      starter.foundation.display_name,
      contentName(starter.foundation.archetype_ref),
      contentName(starter.foundation.heritage_gift_ref),
      contentName(starter.foundation.upbringing_ref),
      gear === undefined || gear === null
        ? "—"
        : contentName(gear.content_definition_id),
    ];
  });
  const encounterRows = PHASE_1_ENCOUNTER_DEFINITIONS.map((definition) => [
    definition.kind,
    definition.payload.display_name,
    definition.content_definition_id,
  ]);
  const noncombatRows = PHASE_1_NONCOMBAT_DEFINITIONS.map((definition) => [
    definition.kind,
    definition.payload.display_name,
    definition.content_definition_id,
  ]);
  const deferred = Object.entries(DEFERRED_CONTENT_REGISTRIES)
    .map(([name]) => `- ${name}`)
    .join("\n");

  return `${GENERATED_WARNING}

# LLDM Phase 1 Playable Content Reference

## Pinned manifest

- Manifest ID: \`${PHASE_1_CONTENT_MANIFEST.content_manifest_id}\`
- Manifest hash: \`${PHASE_1_CONTENT_MANIFEST.manifest_hash}\`
- Canonically sorted definitions: ${PHASE_1_CONTENT_MANIFEST.entries.length}
- Definition revision: every shipped Phase 1 definition is revision 1

## Rank-one archetypes

${markdownTable(["Archetype", "Guard", "Signature", "Narrative permission"], archetypeRows)}

## Heritage Gifts and Upbringings

${markdownTable(["Category", "Name", "Tactical rule", "Narrative permission"], optionRows)}

## Signature techniques and significant gear

${markdownTable(["Category", "Name", "Slot", "Rule"], abilityRows)}

An occupied narrative gear slot is bound to a pinned significant-gear definition during materialization. A paid ritual gear cost changes that exact mechanical slot from ready to spent; the original foundation text remains canonical history.

## Committed starter loadouts

${markdownTable(["Hero", "Archetype", "Heritage Gift", "Upbringing", "Significant gear"], starterRows)}

## Floodgate encounter definitions

${markdownTable(["Kind", "Name", "Definition ID"], encounterRows)}

## Non-combat vertical slice

${markdownTable(["Kind", "Name", "Definition ID"], noncombatRows)}

The Floodgate Sequence uses Progress 4, Danger 3, and \`resolved_with_cost\` for a simultaneous fill. Gatewarden Nera's declared hard limit cannot be crossed by a roll. Kindle the Echo Lantern requires established fictional position, two participants, the ready Resonant Wick Case, and 1 Supply before resolution.

## Explicitly unavailable production ranks

The following production registries are empty in Phase 1:

${deferred}
`;
}

export function renderPhase2RoomReference(): string {
  const migration = SQLITE_MIGRATIONS.find(({ version }) => version === 2);
  if (migration === undefined)
    throw new Error("Phase 2 room reference requires migration 2.");
  const starterRows = PHASE_2_STARTER_LOADOUTS.map(
    ({ starter_loadout_id, foundation }) => [
      foundation.display_name,
      starter_loadout_id,
      foundation.archetype_ref,
      foundation.signature_technique_concept,
    ],
  );
  const variantRows = PHASE_2_ENCOUNTER_VARIANTS.map((variant) => {
    const objective = PHASE_2_DEFINITIONS.find(
      ({ content_definition_id, definition_revision }) =>
        content_definition_id ===
          variant.objective_definition.content_definition_id &&
        definition_revision ===
          variant.objective_definition.definition_revision,
    );
    if (objective?.kind !== "objective")
      throw new Error("Phase 2 variant objective definition is missing.");
    return [
      String(variant.party_size),
      variant.variant_key,
      String(variant.enemies.length),
      variant.reinforcement_trigger,
      `${objective.content_definition_id} (threshold ${objective.payload.threshold})`,
    ];
  });
  const beatRows = PHASE_2_PRESENTATION_MANIFEST.beats.map((beat) => [
    beat.beat_id,
    beat.kind,
    beat.operation.kind,
    beat.visibility,
    beat.terminal_conclusion ?? "—",
  ]);

  return `${GENERATED_WARNING}

# LLDM Phase 2 Room and Guided Slice Reference

## Versioned boundaries

| Boundary | Current value |
| --- | --- |
| Serialized schema | ${SCHEMA_VERSION} |
| Transport protocol | ${PROTOCOL_VERSION} |
| Mechanical state | ${STATE_SCHEMA_VERSION} |
| Room state | ${ROOM_STATE_SCHEMA_VERSION} |
| SQLite migration | ${migration.version} (\`${migration.name}\`, checksum \`${migration.checksum}\`) |
| Mechanical manifest | \`${PHASE_2_CONTENT_MANIFEST.manifest_hash}\` |
| Presentation manifest | \`${PHASE_2_PRESENTATION_MANIFEST.presentation_manifest_hash}\` |

Untrusted \`ClientCommand\`, durable \`RoomCommand\`, and internal \`GameCommand\` are distinct serialized unions. The room stream owns people, seats, guided presentation, recovery, and workflow linkage; the campaign stream remains the sole mechanical authority. Both streams use command identity binding, canonical hashes, atomic transaction rows, and deterministic replay.

Client delivery is limited to \`public_tv\`, \`participant_private\`, and \`player_host_operational\`. The Phase 1 \`host_control\` projection and Phase 2 \`server_internal\` combined view are never members of the client delivery union. A missing cursor, revision gap, seat change, or authority change requires a filtered snapshot; otherwise retained deltas advance exactly one view revision.

## Relay and transport limits

| Limit | Value |
| --- | --- |
| Maximum frame | ${RELAY_MAX_FRAME_BYTES} bytes |
| Connections per room | ${RELAY_MAX_CONNECTIONS} |
| Player frames per minute | ${RELAY_COMMANDS_PER_MINUTE} |
| Appliance fanout frames per minute | ${RELAY_APPLIANCE_FRAMES_PER_MINUTE} |
| Room lifetime | ${RELAY_MAX_ROOM_LIFETIME_SECONDS} seconds |

The relay stores expiring authentication, routing, sequence, acknowledgement, rate, and alarm metadata only. It does not persist application-frame payloads. Reconnect rotates \`ConnectionId\` while preserving approved \`ParticipantId\`; reconnect credentials are browser-local IndexedDB data.

## Six fixed starter heroes

${markdownTable(["Hero", "Starter ID", "Archetype", "Signature permission"], starterRows)}

## Authored encounter variants

${markdownTable(["Party", "Variant", "Enemies", "Reinforcement", "Objective definition"], variantRows)}

Enemy definitions and actor statistics remain pinned across party sizes. Variants change authored roster, placement, reinforcement, and objective pressure only.

## Guided Floodgate graph

${markdownTable(["Beat", "Kind", "Operation", "Visibility", "Conclusion"], beatRows)}

The presentation manifest contains deterministic text and layout metadata only and is never supplied to the rules engine. Mechanical beat operations are derived as bounded, validated game commands and advance presentation only from committed outcome bands or combat outcomes. The final Floodgate lock is a mandatory disclosed physical d20; optional Spark can convert the earlier eligible check to a disclosed physical roll.
`;
}

const outputs = [
  {
    path: "docs/generated/mechanical-reference.md",
    contents: renderMechanicalReference(),
  },
  {
    path: "docs/generated/probability-report.md",
    contents: renderProbabilityReport(),
  },
  {
    path: "docs/generated/playable-content-reference.md",
    contents: renderPlayableContentReference(),
  },
  {
    path: "docs/generated/phase-2-room-reference.md",
    contents: renderPhase2RoomReference(),
  },
] as const;

async function checkOutput(path: string, expected: string): Promise<boolean> {
  let actual: string;
  try {
    actual = await readFile(path, "utf8");
  } catch {
    console.error(`${path} is missing; run pnpm docs:generate.`);
    return false;
  }
  if (actual === expected) return true;

  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const difference = expectedLines.findIndex(
    (line, index) => line !== actualLines[index],
  );
  console.error(
    `${path} is stale at line ${difference + 1}.\n- committed: ${actualLines[difference] ?? "<missing>"}\n+ generated: ${expectedLines[difference] ?? "<missing>"}`,
  );
  return false;
}

if (process.argv.includes("--check")) {
  const checks = await Promise.all(
    outputs.map(({ path, contents }) => checkOutput(path, contents)),
  );
  if (checks.some((matches) => !matches)) process.exitCode = 1;
} else {
  await mkdir("docs/generated", { recursive: true });
  await Promise.all(
    outputs.map(({ path, contents }) => writeFile(path, contents, "utf8")),
  );
}
