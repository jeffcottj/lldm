import { Type, type Static } from "@sinclair/typebox";
import { strictObject } from "./envelopes.js";
import {
  ContentManifestHashSchema,
  PresentationManifestHashSchema,
} from "./hashes.js";
import {
  CampaignIdSchema,
  CharacterIdSchema,
  CorrectionRequestIdSchema,
  GuidedBeatIdSchema,
  MechanicalWorkflowIdSchema,
  ParticipantIdSchema,
  PendingCheckIdSchema,
  PrivateClueIdSchema,
  RoomIdSchema,
  RoomSessionIdSchema,
  SeatIdSchema,
  StarterLoadoutIdSchema,
  TransactionIdSchema,
} from "./ids.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "./validation.js";
import {
  RoomStateSchemaVersionSchema,
  SchemaVersionSchema,
} from "./versions.js";

export const RoomModeSchema = Type.Union([
  Type.Literal("normal"),
  Type.Literal("rehearsal"),
]);

export const RoomParticipantSchema = strictObject({
  participant_id: ParticipantIdSchema,
  display_name: Type.String({ minLength: 1, maxLength: 40 }),
  status: Type.Union([
    Type.Literal("pending"),
    Type.Literal("approved"),
    Type.Literal("rejected"),
  ]),
  selected_seat_id: Type.Union([Type.Null(), SeatIdSchema]),
});

export const CharacterSeatSchema = strictObject({
  seat_id: SeatIdSchema,
  character_id: CharacterIdSchema,
  starter_loadout_id: StarterLoadoutIdSchema,
  participant_id: Type.Union([Type.Null(), ParticipantIdSchema]),
});

export const PublicRoomHistoryEntrySchema = strictObject({
  room_revision: Type.Integer({ minimum: 1 }),
  kind: Type.Union([
    Type.Literal("narration"),
    Type.Literal("choice"),
    Type.Literal("roll"),
    Type.Literal("state_change"),
    Type.Literal("player_flavor"),
    Type.Literal("recovery"),
  ]),
  text: Type.String({ minLength: 1, maxLength: 240 }),
  participant_id: Type.Optional(ParticipantIdSchema),
  seat_id: Type.Optional(SeatIdSchema),
});

export const RoomStateSchema = strictObject({
  schema_version: SchemaVersionSchema,
  room_state_schema_version: RoomStateSchemaVersionSchema,
  record_kind: Type.Literal("room_state"),
  room_session_id: RoomSessionIdSchema,
  current_relay_room_id: Type.Union([Type.Null(), RoomIdSchema]),
  campaign_id: CampaignIdSchema,
  mechanical_manifest_hash: ContentManifestHashSchema,
  presentation_manifest_hash: PresentationManifestHashSchema,
  mode: RoomModeSchema,
  room_revision: Type.Integer({ minimum: 0 }),
  view_revision: Type.Integer({ minimum: 0 }),
  mechanical_revision: Type.Integer({ minimum: 0 }),
  status: Type.Union([
    Type.Literal("lobby"),
    Type.Literal("active"),
    Type.Literal("suspended"),
    Type.Literal("completed"),
  ]),
  participants: Type.Array(RoomParticipantSchema, { maxItems: 8 }),
  seats: Type.Array(CharacterSeatSchema, { minItems: 6, maxItems: 6 }),
  player_host_participant_id: Type.Union([Type.Null(), ParticipantIdSchema]),
  current_beat_id: GuidedBeatIdSchema,
  pending_workflow: Type.Union([
    Type.Null(),
    strictObject({
      workflow_id: MechanicalWorkflowIdSchema,
      game_transaction_id: TransactionIdSchema,
      expected_mechanical_revision: Type.Integer({ minimum: 0 }),
      status: Type.Union([Type.Literal("pending"), Type.Literal("failed")]),
    }),
  ]),
  pending_physical: Type.Union([
    Type.Null(),
    strictObject({
      seat_id: SeatIdSchema,
      pending_check_id: PendingCheckIdSchema,
    }),
  ]),
  reaction_deadline: Type.Union([
    Type.Null(),
    strictObject({
      seat_id: SeatIdSchema,
      reaction_window_id: Type.String({ minLength: 3, maxLength: 128 }),
      deadline_at: Type.String({ format: "date-time" }),
      paused: Type.Boolean(),
      remaining_ms: Type.Union([
        Type.Null(),
        Type.Integer({ minimum: 0, maximum: 120_000 }),
      ]),
    }),
  ]),
  recoveries: Type.Array(
    strictObject({
      seat_id: SeatIdSchema,
      status: Type.Union([
        Type.Literal("grace"),
        Type.Literal("recovery_required"),
      ]),
      grace_expires_at: Type.Optional(Type.String({ format: "date-time" })),
    }),
    { maxItems: 6 },
  ),
  correction_request: Type.Union([
    Type.Null(),
    strictObject({
      correction_request_id: CorrectionRequestIdSchema,
      participant_id: ParticipantIdSchema,
      target_transaction_id: Type.Union([Type.Null(), TransactionIdSchema]),
    }),
  ]),
  private_clues: Type.Array(
    strictObject({
      clue_id: PrivateClueIdSchema,
      seat_id: SeatIdSchema,
      text: Type.String({ minLength: 1, maxLength: 240 }),
    }),
    { maxItems: 24 },
  ),
  recent_public_history: Type.Array(PublicRoomHistoryEntrySchema, {
    maxItems: 40,
  }),
  conclusion: Type.Union([
    Type.Null(),
    Type.Union([
      Type.Literal("clean_success"),
      Type.Literal("success_with_cost"),
      Type.Literal("withdrawal"),
      Type.Literal("defeat"),
    ]),
  ]),
});

export type RoomState = Static<typeof RoomStateSchema>;
export type RoomParticipant = Static<typeof RoomParticipantSchema>;
export type CharacterSeat = Static<typeof CharacterSeatSchema>;
export type RoomMode = Static<typeof RoomModeSchema>;
export type PublicRoomHistoryEntry = Static<
  typeof PublicRoomHistoryEntrySchema
>;

export function validateRoomState(input: unknown): ValidationResult<RoomState> {
  const structural = validateValue(RoomStateSchema, input);
  if (!structural.success) return structural;
  const state = structural.value;
  const issues: ValidationIssue[] = [];
  const participantIds = new Set<string>();
  for (const [index, participant] of state.participants.entries()) {
    if (participantIds.has(participant.participant_id)) {
      issues.push({
        path: `$.participants[${index}].participant_id`,
        code: "room.duplicate_participant",
        message: "Participant IDs must be unique.",
      });
    }
    participantIds.add(participant.participant_id);
  }
  const seatIds = new Set<string>();
  const characterIds = new Set<string>();
  const ownership = new Map<string, number>();
  for (const [index, seat] of state.seats.entries()) {
    if (seatIds.has(seat.seat_id))
      issues.push({
        path: `$.seats[${index}].seat_id`,
        code: "room.duplicate_seat",
        message: "Seat IDs must be unique.",
      });
    if (characterIds.has(seat.character_id))
      issues.push({
        path: `$.seats[${index}].character_id`,
        code: "room.duplicate_character",
        message: "A character maps to one seat.",
      });
    seatIds.add(seat.seat_id);
    characterIds.add(seat.character_id);
    if (seat.participant_id !== null) {
      if (!participantIds.has(seat.participant_id))
        issues.push({
          path: `$.seats[${index}].participant_id`,
          code: "room.unknown_participant",
          message: "Seat owner must be a room participant.",
        });
      ownership.set(
        seat.participant_id,
        (ownership.get(seat.participant_id) ?? 0) + 1,
      );
    }
  }
  if (state.mode === "normal") {
    for (const [participantId, count] of ownership) {
      if (count > 1)
        issues.push({
          path: "$.seats",
          code: "room.normal_mode_seat_limit",
          message: `Participant ${participantId} owns more than one seat in normal mode.`,
        });
    }
  }
  for (const [index, participant] of state.participants.entries()) {
    if (participant.selected_seat_id !== null) {
      const seat = state.seats.find(
        ({ seat_id }) => seat_id === participant.selected_seat_id,
      );
      if (seat?.participant_id !== participant.participant_id)
        issues.push({
          path: `$.participants[${index}].selected_seat_id`,
          code: "room.selected_seat_not_owned",
          message: "Selected private seat must be owned by the participant.",
        });
    }
  }
  if (state.player_host_participant_id !== null) {
    const playerHost = state.participants.find(
      ({ participant_id }) =>
        participant_id === state.player_host_participant_id,
    );
    if (playerHost?.status !== "approved")
      issues.push({
        path: "$.player_host_participant_id",
        code: "room.player_host_not_approved",
        message: "Player-host must be approved.",
      });
  }
  return issues.length === 0
    ? { success: true, value: state }
    : validationFailure(issues);
}
