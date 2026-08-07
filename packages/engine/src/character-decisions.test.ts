import {
  ContentDefinitionSchema,
  GameCommandSchema,
  GameEventSchema,
  type CampaignId,
  type ContentDefinition,
  type ContentManifestHash,
  type GameCommand,
  type GameEvent,
  type GameState,
  validateGameState,
  validateValue,
} from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import { applyGameEvent } from "./apply-event.js";
import {
  type CommandDecision,
  type DomainEventProposal,
  type EngineContentCatalog,
  decideCommand,
  enumerateLegalCharacterActions,
} from "./decide-command.js";
import { createEmptyCampaignState } from "./state.js";
import { fixtureCharacter } from "./test-helpers.js";

const campaignId = "campaign_character_rules_001" as CampaignId;
const manifestHash =
  "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc" as ContentManifestHash;

function definition(input: unknown): ContentDefinition {
  const result = validateValue(ContentDefinitionSchema, input);
  if (!result.success) throw new Error("Character test content is invalid.");
  return result.value;
}

function option(input: {
  id: string;
  category:
    | "heritage_gift"
    | "upbringing"
    | "archetype"
    | "path"
    | "talent"
    | "capstone";
  name: string;
  rank: 1 | 2 | 3 | 4;
  availability: "production" | "test_only";
  prerequisites?: readonly unknown[];
  abilities?: readonly string[];
  effects?: readonly unknown[];
}): ContentDefinition {
  return definition({
    schema_version: 1,
    content_definition_id: input.id,
    definition_revision: 1,
    kind: "playable_option",
    payload: {
      category: input.category,
      display_name: input.name,
      rule_text: `${input.name} supplies a bounded test mechanic.`,
      rank: input.rank,
      availability: input.availability,
      prerequisites: input.prerequisites ?? [],
      granted_ability_ids: input.abilities ?? [],
      tactical_effects: input.effects ?? [
        { kind: "grant_edge", context: "check" },
      ],
      narrative_permissions: [
        {
          scope: "exploration",
          permission: `${input.name} recognizes one relevant fictional opening.`,
        },
      ],
    },
  });
}

const signature = definition({
  schema_version: 1,
  content_definition_id: "content_technique_threadline_001",
  definition_revision: 1,
  kind: "ability",
  payload: {
    category: "signature_technique",
    display_name: "Threadline",
    rule_text: "Mark a route and reposition one nearby ally.",
    action_slot: "maneuver",
    cost: [],
    target_mode: "single_actor",
    range: "adjacent",
    fixed_impact: null,
    check_profile: null,
    effects: [{ kind: "move", distance: "adjacent", target: "ally" }],
    narrative_permissions: [
      {
        scope: "exploration",
        permission: "Identify a route through unstable nearby terrain.",
      },
    ],
  },
});

const recovery = definition({
  schema_version: 1,
  content_definition_id: "content_ability_second_wind_001",
  definition_revision: 1,
  kind: "ability",
  payload: {
    category: "power",
    display_name: "Second Wind",
    rule_text: "Recover two Guard after finding secure footing.",
    action_slot: "action",
    cost: [],
    target_mode: "self",
    range: "self",
    fixed_impact: null,
    check_profile: null,
    effects: [
      { kind: "adjust_resource", resource: "guard", amount: 2, target: "self" },
    ],
    narrative_permissions: [
      {
        scope: "exploration",
        permission: "Recognize a brief place of safety.",
      },
    ],
  },
});

const slateCompass = definition({
  schema_version: 1,
  content_definition_id: "content_gear_slate_compass_001",
  definition_revision: 1,
  kind: "ability",
  payload: {
    category: "significant_gear",
    display_name: "Slate Compass",
    rule_text: "Use its route marks to move one adjacent ally.",
    action_slot: "maneuver",
    cost: [],
    target_mode: "single_actor",
    range: "adjacent",
    fixed_impact: null,
    check_profile: null,
    effects: [{ kind: "move", distance: "adjacent", target: "ally" }],
    narrative_permissions: [
      {
        scope: "exploration",
        permission: "Recognize an old marked route through unstable ground.",
      },
    ],
  },
});

const heritage = option({
  id: "content_heritage_echo_001",
  category: "heritage_gift",
  name: "Echo Kin",
  rank: 1,
  availability: "production",
});
const upbringing = option({
  id: "content_upbringing_roads_001",
  category: "upbringing",
  name: "Road Raised",
  rank: 1,
  availability: "production",
});
const archetype = option({
  id: "content_archetype_wayfinder_001",
  category: "archetype",
  name: "Wayfinder",
  rank: 1,
  availability: "production",
  abilities: ["content_technique_threadline_001"],
  effects: [
    { kind: "adjust_resource", resource: "guard", amount: 6, target: "self" },
    { kind: "grant_edge", context: "check" },
  ],
});
const path = option({
  id: "content_path_test_hunter_001",
  category: "path",
  name: "Test Hunter",
  rank: 2,
  availability: "test_only",
  prerequisites: [
    { kind: "rank", minimum_rank: 2 },
    {
      kind: "archetype",
      required: {
        content_definition_id: "content_archetype_wayfinder_001",
        definition_revision: 1,
      },
    },
  ],
});
const talent = option({
  id: "content_talent_test_bridge_001",
  category: "talent",
  name: "Test Bridge",
  rank: 3,
  availability: "test_only",
  prerequisites: [
    { kind: "rank", minimum_rank: 3 },
    {
      kind: "content",
      required: {
        content_definition_id: "content_path_test_hunter_001",
        definition_revision: 1,
      },
    },
  ],
});
const capstone = option({
  id: "content_capstone_test_horizon_001",
  category: "capstone",
  name: "Test Horizon",
  rank: 4,
  availability: "test_only",
  prerequisites: [
    { kind: "rank", minimum_rank: 4 },
    {
      kind: "content",
      required: {
        content_definition_id: "content_talent_test_bridge_001",
        definition_revision: 1,
      },
    },
  ],
});

const catalog: EngineContentCatalog = {
  content_manifest_hash: manifestHash,
  definitions: [
    heritage,
    upbringing,
    archetype,
    signature,
    recovery,
    slateCompass,
    path,
    talent,
    capstone,
  ],
};

function command(input: unknown): GameCommand {
  const result = validateValue(GameCommandSchema, input);
  if (!result.success) throw new Error("Character test command is invalid.");
  return result.value;
}

function accepted(decision: CommandDecision) {
  if (!decision.accepted) throw new Error(decision.safe_detail);
  return decision;
}

function envelope(
  proposal: DomainEventProposal,
  revision: number,
  transactionIndex = 0,
): GameEvent {
  const result = validateValue(GameEventSchema, {
    schema_version: 1,
    event_id: `event_character_rules_${revision}_${transactionIndex}`,
    transaction_id: `transaction_character_rules_${revision}`,
    campaign_id: campaignId,
    caused_by_command_id: `command_character_rules_${revision}`,
    transaction_index: transactionIndex,
    stream_revision: revision,
    ...proposal,
  });
  if (!result.success) throw new Error("Character proposal is invalid.");
  return result.value;
}

function materializeCommand(): GameCommand {
  return command({
    schema_version: 1,
    command_id: "command_materialize_character_001",
    transaction_id: "transaction_materialize_character_001",
    campaign_id: campaignId,
    expected_revision: 0,
    kind: "materialize_character",
    payload: {
      foundation: fixtureCharacter(),
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
    },
  });
}

function materializedState(): GameState {
  const initial = createEmptyCampaignState(campaignId, manifestHash);
  const decision = accepted(
    decideCommand({ state: initial, command: materializeCommand(), catalog }),
  );
  const applied = applyGameEvent(initial, envelope(decision.events[0]!, 1));
  if (!applied.success) throw new Error("Could not materialize test hero.");
  return applied.value;
}

function validState(input: GameState): GameState {
  const result = validateGameState(input);
  if (!result.success)
    throw new Error("Mutated character test state is invalid.");
  return result.value;
}

describe("playable-character decisions", () => {
  it("materializes complete rank-one state only from its pinned catalog", () => {
    const state = createEmptyCampaignState(campaignId, manifestHash);
    const decision = accepted(
      decideCommand({ state, command: materializeCommand(), catalog }),
    );
    expect(decision.events).toHaveLength(1);
    expect(decision.events[0]).toMatchObject({
      kind: "character_materialized",
      payload: {
        character: {
          rank: 1,
          resources: {
            guard: { current: 6, maximum: 6 },
            exertion: { current: 3, maximum: 3 },
            spark: { available: true, complication_recovery_used: false },
          },
          resolved_options: {
            signature_technique: {
              content_definition_id: "content_technique_threadline_001",
              definition_revision: 1,
            },
          },
        },
      },
    });
    expect(
      decideCommand({
        state,
        command: materializeCommand(),
        catalog: {
          ...catalog,
          content_manifest_hash:
            "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd" as ContentManifestHash,
        },
      }),
    ).toMatchObject({ accepted: false });
  });

  it("rejects duplicate identity and semantically invalid foundation input", () => {
    const state = materializedState();
    expect(
      decideCommand({ state, command: materializeCommand(), catalog }),
    ).toMatchObject({ accepted: false });

    const invalidFoundation = structuredClone(fixtureCharacter());
    invalidFoundation.attributes[0]!.rating = 2;
    const invalid = command({
      ...materializeCommand(),
      command_id: "command_materialize_invalid_001",
      transaction_id: "transaction_materialize_invalid_001",
      payload: {
        ...materializeCommand().payload,
        foundation: invalidFoundation,
      },
    });
    expect(
      decideCommand({
        state: createEmptyCampaignState(campaignId, manifestHash),
        command: invalid,
        catalog,
      }),
    ).toMatchObject({ accepted: false });
  });

  it("spends and recovers only bounded, content-authorized resources", () => {
    let state = materializedState();
    const spent = accepted(
      decideCommand({
        state,
        command: command({
          schema_version: 1,
          command_id: "command_spend_exertion_001",
          transaction_id: "transaction_spend_exertion_001",
          campaign_id: campaignId,
          expected_revision: 1,
          kind: "spend_resource",
          payload: {
            character_id: "character_sable_001",
            resource: "exertion",
            amount: 2,
            reason: "Fuel Threadline.",
          },
        }),
      }),
    );
    const appliedSpend = applyGameEvent(state, envelope(spent.events[0]!, 2));
    if (!appliedSpend.success) throw new Error("Could not spend Exertion.");
    state = appliedSpend.value;
    expect(state.party.characters[0]?.resources.exertion.current).toBe(1);

    const underflow = command({
      schema_version: 1,
      command_id: "command_spend_exertion_002",
      transaction_id: "transaction_spend_exertion_002",
      campaign_id: campaignId,
      expected_revision: 2,
      kind: "spend_resource",
      payload: {
        character_id: "character_sable_001",
        resource: "exertion",
        amount: 2,
        reason: "Cannot afford this cost.",
      },
    });
    expect(decideCommand({ state, command: underflow })).toMatchObject({
      accepted: false,
    });

    const hurt = structuredClone(state);
    hurt.party.characters[0]!.resources.guard.current = 3;
    state = validState(hurt);
    const recovered = accepted(
      decideCommand({
        state,
        catalog,
        command: command({
          schema_version: 1,
          command_id: "command_recover_guard_001",
          transaction_id: "transaction_recover_guard_001",
          campaign_id: campaignId,
          expected_revision: 2,
          kind: "recover_resource",
          payload: {
            character_id: "character_sable_001",
            resource: "guard",
            amount: 2,
            source: {
              content_definition_id: "content_ability_second_wind_001",
              definition_revision: 1,
            },
          },
        }),
      }),
    );
    expect(recovered.events[0]).toMatchObject({
      kind: "resource_changed",
      payload: { previous: 3, current: 5 },
    });
  });

  it("makes a costly rest atomic and leaves Wounds and Spark unchanged", () => {
    const changed = structuredClone(materializedState());
    changed.party.supply = 1;
    const hero = changed.party.characters[0]!;
    hero.resources.guard.current = 1;
    hero.resources.exertion.current = 0;
    hero.resources.spark.available = false;
    hero.resources.wounds[0] = {
      slot: 1,
      status: "filled",
      wound_id: "wound_rest_test_001",
      name: "Shaken shoulder",
    };
    hero.scene_ability_uses[0]!.used = true;
    let state = validState(changed);
    const rest = accepted(
      decideCommand({
        state,
        command: command({
          schema_version: 1,
          command_id: "command_costly_rest_001",
          transaction_id: "transaction_costly_rest_001",
          campaign_id: campaignId,
          expected_revision: 1,
          kind: "take_costly_rest",
          payload: { character_ids: ["character_sable_001"] },
        }),
      }),
    );
    const applied = applyGameEvent(state, envelope(rest.events[0]!, 2));
    if (!applied.success) throw new Error("Could not apply costly rest.");
    state = applied.value;
    expect(state.party.supply).toBe(0);
    expect(state.party.characters[0]?.resources).toMatchObject({
      guard: { current: 6 },
      exertion: { current: 3 },
      spark: { available: false },
      wounds: [{ status: "filled" }, { status: "empty" }, { status: "empty" }],
    });
    expect(state.party.characters[0]?.scene_ability_uses[0]?.used).toBe(false);

    expect(
      decideCommand({
        state,
        command: command({
          schema_version: 1,
          command_id: "command_costly_rest_002",
          transaction_id: "transaction_costly_rest_002",
          campaign_id: campaignId,
          expected_revision: 2,
          kind: "take_costly_rest",
          payload: { character_ids: ["character_sable_001"] },
        }),
      }),
    ).toMatchObject({ accepted: false });
  });

  it("applies scene and session boundaries without healing Wounds", () => {
    const changed = structuredClone(materializedState());
    const hero = changed.party.characters[0]!;
    hero.resources.guard.current = 0;
    hero.resources.exertion.current = 0;
    hero.resources.spark.available = false;
    hero.resources.spark.complication_recovery_used = true;
    hero.resources.wounds[0] = {
      slot: 1,
      status: "filled",
      wound_id: "wound_scene_test_001",
      name: "Deep bruise",
    };
    const state = validState(changed);
    const started = accepted(
      decideCommand({
        state,
        command: command({
          schema_version: 1,
          command_id: "command_session_start_001",
          transaction_id: "transaction_session_start_001",
          campaign_id: campaignId,
          expected_revision: 1,
          kind: "advance_scene",
          payload: {
            scene_id: null,
            next_scene_id: "scene_first_001",
            boundary: "session_start",
          },
        }),
      }),
    );
    const applied = applyGameEvent(state, envelope(started.events[0]!, 2));
    if (!applied.success) throw new Error("Could not apply session start.");
    expect(applied.value).toMatchObject({
      session_number: 1,
      scene_id: "scene_first_001",
      party: {
        characters: [
          {
            resources: {
              guard: { current: 6 },
              exertion: { current: 3 },
              spark: { available: true, complication_recovery_used: false },
              wounds: [
                { status: "filled" },
                { status: "empty" },
                { status: "empty" },
              ],
            },
          },
        ],
      },
    });
  });

  it("recovers Spark once for a Drive or Bond complication", () => {
    const changed = structuredClone(materializedState());
    changed.party.characters[0]!.resources.spark.available = false;
    let state = validState(changed);
    const recover = accepted(
      decideCommand({
        state,
        command: command({
          schema_version: 1,
          command_id: "command_recover_spark_001",
          transaction_id: "transaction_recover_spark_001",
          campaign_id: campaignId,
          expected_revision: 1,
          kind: "recover_spark_complication",
          payload: {
            character_id: "character_sable_001",
            basis: "drive",
            complication:
              "Sable loses the safer route to preserve an old song.",
          },
        }),
      }),
    );
    const applied = applyGameEvent(state, envelope(recover.events[0]!, 2));
    if (!applied.success) throw new Error("Could not recover Spark.");
    state = applied.value;
    expect(state.party.characters[0]?.resources.spark).toEqual({
      available: true,
      complication_recovery_used: true,
    });
    expect(
      decideCommand({ state, command: recoverSparkAgain() }),
    ).toMatchObject({
      accepted: false,
    });
  });

  it("uses expected_rank as the current-rank guard and advances 1 through 4", () => {
    let state = materializedState();
    const selections = [path, talent, capstone] as const;
    selections.forEach((selected, index) => {
      const currentRank = (index + 1) as 1 | 2 | 3;
      const advance = accepted(
        decideCommand({
          state,
          catalog,
          command: command({
            schema_version: 1,
            command_id: `command_advance_rank_${currentRank}`,
            transaction_id: `transaction_advance_rank_${currentRank}`,
            campaign_id: campaignId,
            expected_revision: index + 1,
            kind: "advance_rank",
            payload: {
              character_id: "character_sable_001",
              expected_rank: currentRank,
              selected_feature: {
                content_definition_id: selected.content_definition_id,
                definition_revision: selected.definition_revision,
              },
            },
          }),
        }),
      );
      const applied = applyGameEvent(
        state,
        envelope(advance.events[0]!, index + 2),
      );
      if (!applied.success)
        throw new Error("Could not apply rank advancement.");
      state = applied.value;
    });
    expect(state.party.characters[0]).toMatchObject({
      rank: 4,
      resolved_options: {
        path: { content_definition_id: "content_path_test_hunter_001" },
        talent: { content_definition_id: "content_talent_test_bridge_001" },
        capstone: {
          content_definition_id: "content_capstone_test_horizon_001",
        },
      },
    });
  });

  it("rejects stale ranks and unavailable production advancement before effects", () => {
    const state = materializedState();
    const advance = command({
      schema_version: 1,
      command_id: "command_advance_rank_stale_001",
      transaction_id: "transaction_advance_rank_stale_001",
      campaign_id: campaignId,
      expected_revision: 1,
      kind: "advance_rank",
      payload: {
        character_id: "character_sable_001",
        expected_rank: 2,
        selected_feature: {
          content_definition_id: "content_path_test_hunter_001",
          definition_revision: 1,
        },
      },
    });
    expect(decideCommand({ state, catalog, command: advance })).toMatchObject({
      accepted: false,
    });
    expect(
      decideCommand({
        state,
        command: command({
          ...advance,
          command_id: "command_advance_rank_missing_001",
          transaction_id: "transaction_advance_rank_missing_001",
          payload: { ...advance.payload, expected_rank: 1 },
        }),
        catalog: { ...catalog, definitions: catalog.definitions.slice(0, 5) },
      }),
    ).toMatchObject({ accepted: false });
  });

  it("enumerates stable legal abilities, resources, and compatible advancement", () => {
    const changed = structuredClone(materializedState());
    changed.party.supply = 1;
    const actions = enumerateLegalCharacterActions({
      state: validState(changed),
      catalog,
      character_id: "character_sable_001",
    });
    expect(actions).toContainEqual({
      kind: "use_ability",
      ability: {
        content_definition_id: "content_technique_threadline_001",
        definition_revision: 1,
      },
    });
    expect(actions).toContainEqual({
      kind: "advance_rank",
      selected_feature: {
        content_definition_id: "content_path_test_hunter_001",
        definition_revision: 1,
      },
    });
    expect(actions).toContainEqual({ kind: "take_costly_rest" });
  });
});

function recoverSparkAgain(): GameCommand {
  return command({
    schema_version: 1,
    command_id: "command_recover_spark_002",
    transaction_id: "transaction_recover_spark_002",
    campaign_id: campaignId,
    expected_revision: 2,
    kind: "recover_spark_complication",
    payload: {
      character_id: "character_sable_001",
      basis: "bond",
      complication: "A second complication cannot restore Spark this session.",
    },
  });
}
