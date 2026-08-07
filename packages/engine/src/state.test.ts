import {
  GameCommandSchema,
  GameEventSchema,
  type CampaignId,
  type ContentManifestHash,
  type GameCommand,
  type GameEvent,
  type PlayableCharacterState,
  validatePlayableCharacterState,
  validateValue,
} from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import { applyGameEvent } from "./apply-event.js";
import { decideCommand } from "./decide-command.js";
import { validateStateInvariants } from "./invariants.js";
import { createEmptyCampaignState } from "./state.js";
import { fixtureCharacter } from "./test-helpers.js";

const campaignId = "campaign_state_001" as CampaignId;
const manifestHash =
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as ContentManifestHash;

function event(input: unknown): GameEvent {
  const result = validateValue(GameEventSchema, input);
  if (!result.success) throw new Error("State test event is invalid.");
  return result.value;
}

function command(input: unknown): GameCommand {
  const result = validateValue(GameCommandSchema, input);
  if (!result.success) throw new Error("State test command is invalid.");
  return result.value;
}

function playable(): PlayableCharacterState {
  const foundation = fixtureCharacter();
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
  if (!result.success) throw new Error("Playable fixture is invalid.");
  return result.value;
}

function eventEnvelope(
  kind: string,
  payload: unknown,
  streamRevision: number,
): Record<string, unknown> {
  return {
    schema_version: 1,
    event_id: `event_state_${streamRevision}`,
    transaction_id: `transaction_state_${streamRevision}`,
    campaign_id: campaignId,
    caused_by_command_id: `command_state_${streamRevision}`,
    transaction_index: 0,
    stream_revision: streamRevision,
    kind,
    payload,
  };
}

describe("pure campaign state kernel", () => {
  it("creates an explicit valid version-one empty state", () => {
    const state = createEmptyCampaignState(campaignId, manifestHash);
    expect(validateStateInvariants(state).success).toBe(true);
    expect(state).toMatchObject({
      state_schema_version: 1,
      campaign_id: campaignId,
      party: { supply: 0, supply_maximum: 2, characters: [] },
    });
  });

  it("applies audit events without changing mechanical state", () => {
    const state = createEmptyCampaignState(campaignId, manifestHash);
    const accepted = event(
      eventEnvelope(
        "command_accepted",
        {
          command_kind: "resolve_check",
          command_hash:
            "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        },
        1,
      ),
    );
    const result = applyGameEvent(state, accepted);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value).toEqual(state);
  });

  it("materializes a character and applies only recorded resource facts", () => {
    const empty = createEmptyCampaignState(campaignId, manifestHash);
    const materialized = event(
      eventEnvelope("character_materialized", { character: playable() }, 1),
    );
    const created = applyGameEvent(empty, materialized);
    expect(created.success).toBe(true);
    if (!created.success) return;
    expect(created.value.party.supply_maximum).toBe(3);
    expect(empty.party.characters).toHaveLength(0);

    const changed = event(
      eventEnvelope(
        "resource_changed",
        {
          owner: { scope: "character", character_id: "character_sable_001" },
          resource: "exertion",
          previous: 3,
          current: 1,
          reason: "Literal state-kernel test.",
        },
        2,
      ),
    );
    const spent = applyGameEvent(created.value, changed);
    expect(spent.success).toBe(true);
    if (spent.success) {
      expect(spent.value.party.characters[0]?.resources.exertion.current).toBe(
        1,
      );
    }
    expect(created.value.party.characters[0]?.resources.exertion.current).toBe(
      3,
    );
  });

  it("refuses an event that would violate invariants", () => {
    const empty = createEmptyCampaignState(campaignId, manifestHash);
    const materialized = event(
      eventEnvelope("character_materialized", { character: playable() }, 1),
    );
    const created = applyGameEvent(empty, materialized);
    if (!created.success) throw new Error("Materialization failed.");
    const overflow = event(
      eventEnvelope(
        "resource_changed",
        {
          owner: { scope: "character", character_id: "character_sable_001" },
          resource: "guard",
          previous: 6,
          current: 7,
          reason: "Invalid overflow fixture.",
        },
        2,
      ),
    );
    const result = applyGameEvent(created.value, overflow);
    expect(result.success).toBe(false);
    expect(created.value.party.characters[0]?.resources.guard.current).toBe(6);
  });

  it("rejects every not-yet-owned command domain explicitly", () => {
    const state = createEmptyCampaignState(campaignId, manifestHash);
    const resolve = command({
      schema_version: 1,
      command_id: "command_resolve_state_001",
      transaction_id: "transaction_resolve_state_001",
      campaign_id: campaignId,
      expected_revision: 0,
      kind: "resolve_check",
      payload: {
        request: {
          schema_version: 1,
          actor_id: "actor_sable_001",
          attribute: "Insight",
          attribute_rating: 2,
          discipline: "Lore",
          discipline_rating: 1,
          target: 13,
          modifier_state: { edge: false, hindrance: false },
          visibility: "public",
          stakes: "The sealed chamber changes before another attempt.",
          outcome_bands: [
            { degree: "Crisis", consequence: "The chamber seals." },
            { degree: "Setback", consequence: "The clue is obscured." },
            { degree: "Success", consequence: "The clue is found." },
            { degree: "Triumph", consequence: "A second clue is found." },
          ],
          action_feasibility: "possible",
          spark_eligible: false,
        },
        roll_mode: "simulated",
        invoke_spark: false,
      },
    });
    expect(decideCommand({ state, command: resolve })).toMatchObject({
      accepted: false,
      rejection_code: "engine_legality",
    });
  });
});
