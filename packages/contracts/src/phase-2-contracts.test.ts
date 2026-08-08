import { describe, expect, it } from "vitest";
import { ClientCommandSchema } from "./client-commands.js";
import { GameCommandSchema } from "./commands.js";
import { RelayTokenClaimsSchema } from "./relay.js";
import { validateRoomEvent } from "./room-events.js";
import { RoomStateSchema, validateRoomState } from "./room-state.js";
import { validateValue } from "./validation.js";

const client = {
  schema_version: 1,
  protocol_version: 1,
  client_command_id: "client_command_contract_phase2_001",
  room_id: "room_contract_phase2_001",
  connection_id: "connection_contract_phase2_001",
  participant_id: "participant_contract_phase2_001",
  expected_view_revision: 3,
  intent: {
    kind: "claim_hero",
    payload: {
      seat_id: "seat_contract_phase2_001",
      starter_loadout_id: "starter_loadout_contract_phase2_001",
    },
  },
} as const;

function room(mode: "normal" | "rehearsal") {
  return {
    schema_version: 1,
    room_state_schema_version: 1,
    record_kind: "room_state",
    room_session_id: "room_session_contract_phase2_001",
    current_relay_room_id: "room_contract_phase2_001",
    campaign_id: "campaign_contract_phase2_001",
    mechanical_manifest_hash: `sha256:${"1".repeat(64)}`,
    presentation_manifest_hash: `sha256:${"2".repeat(64)}`,
    mode,
    room_revision: 4,
    view_revision: 4,
    mechanical_revision: 0,
    status: "lobby",
    participants: [
      {
        participant_id: "participant_contract_phase2_001",
        display_name: "Ash",
        status: "approved",
        selected_seat_id: "seat_contract_phase2_001",
      },
    ],
    seats: Array.from({ length: 6 }, (_, index) => ({
      seat_id: `seat_contract_phase2_00${index + 1}`,
      character_id: `character_contract_phase2_00${index + 1}`,
      starter_loadout_id: `starter_loadout_contract_phase2_00${index + 1}`,
      participant_id: index < 2 ? "participant_contract_phase2_001" : null,
    })),
    player_host_participant_id: "participant_contract_phase2_001",
    current_beat_id: "guided_beat_contract_phase2_001",
    pending_workflow: null,
    pending_physical: null,
    reaction_deadline: null,
    recoveries: [],
    correction_request: null,
    private_clues: [],
    recent_public_history: [],
    conclusion: null,
  };
}

describe("Phase 2 command and room contracts", () => {
  it("keeps client intent distinct from engine commands and rejects extras", () => {
    expect(validateValue(ClientCommandSchema, client).success).toBe(true);
    expect(validateValue(GameCommandSchema, client).success).toBe(false);
    const game = {
      schema_version: 1,
      command_id: "command_contract_phase2_001",
      transaction_id: "transaction_contract_phase2_001",
      campaign_id: "campaign_contract_phase2_001",
      expected_revision: 0,
      kind: "advance_scene",
      payload: {
        scene_id: null,
        next_scene_id: "scene_contract_phase2_001",
        boundary: "scene",
      },
    };
    expect(validateValue(GameCommandSchema, game).success).toBe(true);
    expect(validateValue(ClientCommandSchema, game).success).toBe(false);
    expect(
      validateValue(ClientCommandSchema, { ...client, raw_game_command: game })
        .success,
    ).toBe(false);
  });

  it("enforces normal ownership while allowing explicit rehearsal ownership", () => {
    expect(validateValue(RoomStateSchema, room("normal")).success).toBe(true);
    const normal = validateRoomState(room("normal"));
    expect(normal.success).toBe(false);
    if (!normal.success)
      expect(normal.issues.map(({ code }) => code)).toContain(
        "room.normal_mode_seat_limit",
      );
    expect(validateRoomState(room("rehearsal")).success).toBe(true);
  });

  it("rejects private clues with a public or wrong-seat audience", () => {
    const event = {
      schema_version: 1,
      room_event_id: "room_event_contract_phase2_001",
      room_session_id: "room_session_contract_phase2_001",
      room_transaction_id: "room_transaction_contract_phase2_001",
      caused_by_room_command_id: "room_command_contract_phase2_001",
      transaction_index: 0,
      room_revision: 2,
      visibility: "public",
      addressed_seat_id: "seat_contract_phase2_002",
      body: {
        kind: "private_clue_presented",
        payload: {
          clue_id: "private_clue_contract_phase2_001",
          seat_id: "seat_contract_phase2_001",
          text: "Only the addressed hero sees this clue.",
        },
      },
    };
    const invalid = validateRoomEvent(event);
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(invalid.issues[0]?.code).toBe(
        "room_event.private_clue_visibility",
      );
  });

  it("keeps relay claims routing-only and strictly bounded", () => {
    const claims = {
      schema_version: 1,
      protocol_version: 1,
      room_id: "room_contract_phase2_001",
      connection_id: "connection_contract_phase2_001",
      role: "approved_player",
      participant_id: "participant_contract_phase2_001",
      audience: "participant",
      expires_at_epoch_seconds: 2_000_000_000,
      token_id: "token_contract_phase2_001",
    };
    expect(validateValue(RelayTokenClaimsSchema, claims).success).toBe(true);
    expect(
      validateValue(RelayTokenClaimsSchema, {
        ...claims,
        private_clue: "forbidden",
      }).success,
    ).toBe(false);
  });
});
