import {
  GameCommandSchema,
  GameEventSchema,
  type CampaignId,
  type ContentManifestHash,
  type GameCommand,
  type GameEvent,
  type GameState,
  type RandomDrawRecord,
  validateGameState,
  validatePlayableCharacterState,
  validateValue,
} from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import { applyGameEvent } from "./apply-event.js";
import {
  type CommandDecision,
  type DomainEventProposal,
  decideCommand,
} from "./decide-command.js";
import { createEmptyCampaignState } from "./state.js";
import { fixtureCharacter, fixtureCheckRequest } from "./test-helpers.js";

const campaignId = "campaign_checks_001" as CampaignId;
const manifestHash =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as ContentManifestHash;

function command(input: unknown): GameCommand {
  const result = validateValue(GameCommandSchema, input);
  if (!result.success) throw new Error("Check decision command is invalid.");
  return result.value;
}

function stateWithPlayable(): GameState {
  const foundation = fixtureCharacter();
  const playable = validatePlayableCharacterState({
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
        content_definition_id: "content_technique_threadline_001",
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
    scene_ability_uses: [],
    conditions: [],
  });
  if (!playable.success) throw new Error("Playable check fixture is invalid.");
  const state = createEmptyCampaignState(campaignId, manifestHash);
  state.party.characters.push(playable.value);
  state.party.supply_maximum = 3;
  const validated = validateGameState(state);
  if (!validated.success) throw new Error("Check state fixture is invalid.");
  return validated.value;
}

function resolveCommand(input: {
  readonly commandId: string;
  readonly invokeSpark: boolean;
  readonly rollMode?: "simulated" | "physical";
}): GameCommand {
  const rollMode = input.rollMode ?? "simulated";
  return command({
    schema_version: 1,
    command_id: input.commandId,
    transaction_id: `transaction_${input.commandId}`,
    campaign_id: campaignId,
    expected_revision: 0,
    kind: "resolve_check",
    payload:
      rollMode === "simulated"
        ? {
            request: fixtureCheckRequest(),
            roll_mode: "simulated",
            invoke_spark: input.invokeSpark,
          }
        : {
            request: fixtureCheckRequest(),
            roll_mode: "physical",
            physical_reason: "pivotal_scene_conclusion",
            invoke_spark: input.invokeSpark,
          },
  });
}

function randomRecord(commandId: string, value = 10): RandomDrawRecord {
  return {
    schema_version: 1,
    algorithm_version: "hmac_sha256_v1",
    seed_fingerprint:
      "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    campaign_id: campaignId,
    command_id: commandId as RandomDrawRecord["command_id"],
    purpose: "check.d20",
    purpose_local_index: 0,
    minimum: 1,
    maximum: 20,
    realized_value: value,
    rejection_count: 0,
  };
}

function accepted(decision: CommandDecision) {
  if (!decision.accepted) {
    throw new Error(`Expected acceptance: ${decision.safe_detail}`);
  }
  return decision;
}

function envelopeProposal(
  proposal: DomainEventProposal,
  revision: number,
  transactionIndex: number,
): GameEvent {
  const result = validateValue(GameEventSchema, {
    schema_version: 1,
    event_id: `event_check_${revision}`,
    transaction_id: `transaction_check_${revision}`,
    campaign_id: campaignId,
    caused_by_command_id: `command_check_${revision}`,
    transaction_index: transactionIndex,
    stream_revision: revision,
    ...proposal,
  });
  if (!result.success) throw new Error("Proposed check event is invalid.");
  return result.value;
}

describe("simulated check decisions", () => {
  it("consumes one explicit draw and records it with the resolved result", () => {
    const state = stateWithPlayable();
    const check = resolveCommand({
      commandId: "command_simulated_001",
      invokeSpark: false,
    });
    let calls = 0;
    const draw = randomRecord(check.command_id, 10);
    const decision = accepted(
      decideCommand({
        state,
        command: check,
        random: {
          draw: () => {
            calls += 1;
            return draw;
          },
        },
      }),
    );
    expect(calls).toBe(1);
    expect(decision.events).toHaveLength(1);
    expect(decision.events[0]).toMatchObject({
      kind: "check_resolved",
      payload: {
        random_draw: draw,
        result: { die_face: 10, roll_mode: "simulated" },
      },
    });
  });

  it("rejects mismatched random evidence", () => {
    const state = stateWithPlayable();
    const check = resolveCommand({
      commandId: "command_simulated_002",
      invokeSpark: false,
    });
    const decision = decideCommand({
      state,
      command: check,
      random: {
        draw: () => randomRecord("command_wrong_001", 10),
      },
    });
    expect(decision).toMatchObject({ accepted: false });
  });
});

describe("two-transaction physical continuation", () => {
  it("spends Spark, persists disclosure, resolves once, and never draws", () => {
    let state = stateWithPlayable();
    const check = resolveCommand({
      commandId: "command_spark_001",
      invokeSpark: true,
    });
    let randomCalls = 0;
    const initiated = accepted(
      decideCommand({
        state,
        command: check,
        pending_check_id: "pending_check_spark_001",
        submission_nonce: "physical_nonce_spark_001",
        random: {
          draw: () => {
            randomCalls += 1;
            return randomRecord(check.command_id);
          },
        },
      }),
    );
    expect(randomCalls).toBe(0);
    expect(initiated.events.map(({ kind }) => kind)).toEqual([
      "spark_spent",
      "physical_roll_requested",
    ]);
    expect(initiated.events[1]).toMatchObject({
      payload: {
        disclosure: {
          reason: "spark_invocation",
          modifier_breakdown: { edge: { active: true } },
        },
      },
    });

    initiated.events.forEach((proposal, index) => {
      const applied = applyGameEvent(
        state,
        envelopeProposal(proposal, index + 1, index + 1),
      );
      if (!applied.success) throw new Error("Physical initiation failed.");
      state = applied.value;
    });
    expect(state.party.characters[0]?.resources.spark.available).toBe(false);
    expect(state.pending_physical_checks).toHaveLength(1);

    const submit = command({
      schema_version: 1,
      command_id: "command_submit_spark_001",
      transaction_id: "transaction_submit_spark_001",
      campaign_id: campaignId,
      expected_revision: 2,
      kind: "submit_die_result",
      payload: {
        pending_check_id: "pending_check_spark_001",
        physical_submission_id: "physical_submission_spark_001",
        submission_nonce: "physical_nonce_spark_001",
        die_face: 14,
      },
    });
    const resolved = accepted(decideCommand({ state, command: submit }));
    expect(resolved.events).toHaveLength(1);
    const applied = applyGameEvent(
      state,
      envelopeProposal(resolved.events[0]!, 3, 1),
    );
    if (!applied.success)
      throw new Error("Physical result application failed.");
    state = applied.value;
    expect(state.pending_physical_checks).toHaveLength(0);
    expect(decideCommand({ state, command: submit })).toMatchObject({
      accepted: false,
    });
  });

  it("rejects a nonce for another pending check", () => {
    let state = stateWithPlayable();
    const initiated = accepted(
      decideCommand({
        state,
        command: resolveCommand({
          commandId: "command_physical_001",
          invokeSpark: false,
          rollMode: "physical",
        }),
        pending_check_id: "pending_check_direct_001",
        submission_nonce: "physical_nonce_direct_001",
      }),
    );
    const request = initiated.events[0]!;
    const applied = applyGameEvent(state, envelopeProposal(request, 1, 1));
    if (!applied.success) throw new Error("Direct request application failed.");
    state = applied.value;
    const wrongNonce = command({
      schema_version: 1,
      command_id: "command_submit_wrong_001",
      transaction_id: "transaction_submit_wrong_001",
      campaign_id: campaignId,
      expected_revision: 1,
      kind: "submit_die_result",
      payload: {
        pending_check_id: "pending_check_direct_001",
        physical_submission_id: "physical_submission_direct_001",
        submission_nonce: "physical_nonce_wrong_001",
        die_face: 12,
      },
    });
    expect(decideCommand({ state, command: wrongNonce })).toMatchObject({
      accepted: false,
    });
  });
});
