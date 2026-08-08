import { Type, type Static } from "@sinclair/typebox";
import { strictObject } from "./envelopes.js";
import {
  ContentManifestHashSchema,
  PresentationManifestHashSchema,
} from "./hashes.js";
import {
  ClientCommandIdSchema,
  CampaignIdSchema,
  CharacterIdSchema,
  CorrectionRequestIdSchema,
  GuidedBeatIdSchema,
  GuidedOptionIdSchema,
  MechanicalWorkflowIdSchema,
  ParticipantIdSchema,
  PendingCheckIdSchema,
  PrivateClueIdSchema,
  RoomCommandIdSchema,
  RoomEventIdSchema,
  RoomIdSchema,
  RoomSessionIdSchema,
  RoomTransactionIdSchema,
  SeatIdSchema,
  StarterLoadoutIdSchema,
  TransactionIdSchema,
} from "./ids.js";
import { SchemaVersionSchema } from "./versions.js";
import {
  type ValidationResult,
  validateValue,
  validationFailure,
} from "./validation.js";

const SafeTextSchema = Type.String({ minLength: 1, maxLength: 240 });
const DisplayNameSchema = Type.String({ minLength: 1, maxLength: 40 });

export const RoomEventVisibilitySchema = Type.Union([
  Type.Literal("public"),
  Type.Literal("participant_private"),
  Type.Literal("player_host_operational"),
  Type.Literal("server_internal"),
]);

function payloadEvent<
  Kind extends string,
  Payload extends ReturnType<typeof Type.Object>,
>(kind: Kind, payload: Payload) {
  return strictObject({ kind: Type.Literal(kind), payload });
}

export const RoomEventBodySchema = Type.Union([
  payloadEvent(
    "room_created",
    strictObject({
      relay_room_id: Type.Union([Type.Null(), RoomIdSchema]),
      mode: Type.Union([Type.Literal("normal"), Type.Literal("rehearsal")]),
      start_beat_id: GuidedBeatIdSchema,
      campaign_id: CampaignIdSchema,
      mechanical_manifest_hash: ContentManifestHashSchema,
      presentation_manifest_hash: PresentationManifestHashSchema,
      seats: Type.Array(
        strictObject({
          seat_id: SeatIdSchema,
          character_id: CharacterIdSchema,
          starter_loadout_id: StarterLoadoutIdSchema,
        }),
        { minItems: 6, maxItems: 6 },
      ),
    }),
  ),
  payloadEvent(
    "room_command_rejected",
    strictObject({
      code: Type.String({ minLength: 1, maxLength: 80 }),
      safe_detail: SafeTextSchema,
    }),
  ),
  payloadEvent(
    "participant_join_requested",
    strictObject({
      participant_id: ParticipantIdSchema,
      display_name: DisplayNameSchema,
    }),
  ),
  payloadEvent(
    "participant_approved",
    strictObject({ participant_id: ParticipantIdSchema }),
  ),
  payloadEvent(
    "participant_rejected",
    strictObject({ participant_id: ParticipantIdSchema }),
  ),
  payloadEvent(
    "player_host_assigned",
    strictObject({
      participant_id: ParticipantIdSchema,
      reason: Type.Union([
        Type.Literal("bootstrap"),
        Type.Literal("transfer"),
        Type.Literal("recovery"),
      ]),
    }),
  ),
  payloadEvent(
    "seat_assigned",
    strictObject({
      seat_id: SeatIdSchema,
      participant_id: ParticipantIdSchema,
      starter_loadout_id: StarterLoadoutIdSchema,
    }),
  ),
  payloadEvent("seat_released", strictObject({ seat_id: SeatIdSchema })),
  payloadEvent(
    "selected_seat_changed",
    strictObject({
      participant_id: ParticipantIdSchema,
      seat_id: SeatIdSchema,
    }),
  ),
  payloadEvent(
    "run_status_changed",
    strictObject({
      status: Type.Union([
        Type.Literal("lobby"),
        Type.Literal("active"),
        Type.Literal("suspended"),
        Type.Literal("completed"),
      ]),
    }),
  ),
  payloadEvent(
    "guided_beat_changed",
    strictObject({
      beat_id: GuidedBeatIdSchema,
      selected_option_id: Type.Optional(GuidedOptionIdSchema),
    }),
  ),
  payloadEvent(
    "mechanical_workflow_started",
    strictObject({
      workflow_id: MechanicalWorkflowIdSchema,
      client_command_id: ClientCommandIdSchema,
      game_transaction_id: TransactionIdSchema,
      expected_mechanical_revision: Type.Integer({ minimum: 0 }),
    }),
  ),
  payloadEvent(
    "mechanical_workflow_completed",
    strictObject({
      workflow_id: MechanicalWorkflowIdSchema,
      game_transaction_id: TransactionIdSchema,
      final_mechanical_revision: Type.Integer({ minimum: 0 }),
      outcome: Type.Union([
        Type.Literal("accepted"),
        Type.Literal("rejected"),
        Type.Literal("undo"),
      ]),
    }),
  ),
  payloadEvent(
    "mechanical_workflow_failed",
    strictObject({
      workflow_id: MechanicalWorkflowIdSchema,
      safe_code: Type.String({ minLength: 1, maxLength: 80 }),
    }),
  ),
  payloadEvent(
    "private_clue_presented",
    strictObject({
      clue_id: PrivateClueIdSchema,
      seat_id: SeatIdSchema,
      text: SafeTextSchema,
    }),
  ),
  payloadEvent(
    "public_narration_recorded",
    strictObject({
      template_id: Type.String({ minLength: 3, maxLength: 128 }),
      text: SafeTextSchema,
    }),
  ),
  payloadEvent(
    "player_flavor_recorded",
    strictObject({
      participant_id: ParticipantIdSchema,
      seat_id: SeatIdSchema,
      text: Type.String({ minLength: 1, maxLength: 160 }),
    }),
  ),
  payloadEvent(
    "reaction_deadline_started",
    strictObject({
      seat_id: SeatIdSchema,
      reaction_window_id: Type.String({ minLength: 3, maxLength: 128 }),
      deadline_at: Type.String({ format: "date-time" }),
    }),
  ),
  payloadEvent(
    "reaction_deadline_paused",
    strictObject({
      seat_id: SeatIdSchema,
      reason: Type.Literal("disconnect"),
      remaining_ms: Type.Integer({ minimum: 0, maximum: 120_000 }),
    }),
  ),
  payloadEvent(
    "reaction_deadline_cleared",
    strictObject({
      reaction_window_id: Type.String({ minLength: 3, maxLength: 128 }),
      result: Type.Union([
        Type.Literal("use"),
        Type.Literal("pass"),
        Type.Literal("timeout"),
      ]),
    }),
  ),
  payloadEvent(
    "recovery_status_changed",
    strictObject({
      seat_id: SeatIdSchema,
      status: Type.Union([
        Type.Literal("grace"),
        Type.Literal("recovery_required"),
        Type.Literal("connected"),
      ]),
      grace_expires_at: Type.Optional(Type.String({ format: "date-time" })),
    }),
  ),
  payloadEvent(
    "correction_requested",
    strictObject({
      correction_request_id: CorrectionRequestIdSchema,
      participant_id: ParticipantIdSchema,
      target_transaction_id: Type.Union([Type.Null(), TransactionIdSchema]),
    }),
  ),
  payloadEvent(
    "correction_resolved",
    strictObject({
      correction_request_id: CorrectionRequestIdSchema,
      result: Type.Union([
        Type.Literal("cancelled"),
        Type.Literal("accepted"),
        Type.Literal("blocked"),
      ]),
      safe_detail: SafeTextSchema,
    }),
  ),
  payloadEvent(
    "relay_room_replaced",
    strictObject({
      old_room_id: Type.Union([Type.Null(), RoomIdSchema]),
      new_room_id: RoomIdSchema,
    }),
  ),
  payloadEvent(
    "physical_roll_waiting",
    strictObject({
      seat_id: SeatIdSchema,
      pending_check_id: PendingCheckIdSchema,
    }),
  ),
  payloadEvent(
    "room_conclusion_recorded",
    strictObject({
      conclusion: Type.Union([
        Type.Literal("clean_success"),
        Type.Literal("success_with_cost"),
        Type.Literal("withdrawal"),
        Type.Literal("defeat"),
      ]),
      summary: SafeTextSchema,
    }),
  ),
]);

export const RoomEventSchema = strictObject({
  schema_version: SchemaVersionSchema,
  room_event_id: RoomEventIdSchema,
  room_session_id: RoomSessionIdSchema,
  room_transaction_id: RoomTransactionIdSchema,
  caused_by_room_command_id: RoomCommandIdSchema,
  transaction_index: Type.Integer({ minimum: 0 }),
  room_revision: Type.Integer({ minimum: 1 }),
  visibility: RoomEventVisibilitySchema,
  addressed_participant_id: Type.Optional(ParticipantIdSchema),
  addressed_seat_id: Type.Optional(SeatIdSchema),
  body: RoomEventBodySchema,
});

export type RoomEvent = Static<typeof RoomEventSchema>;
export type RoomEventBody = Static<typeof RoomEventBodySchema>;

export function validateRoomEvent(input: unknown): ValidationResult<RoomEvent> {
  const structural = validateValue(RoomEventSchema, input);
  if (!structural.success) return structural;
  const event = structural.value;
  if (
    event.visibility === "participant_private" &&
    event.addressed_participant_id === undefined &&
    event.addressed_seat_id === undefined
  )
    return validationFailure([
      {
        path: "$.visibility",
        code: "room_event.private_address_required",
        message:
          "Participant-private events require an addressed participant or seat.",
      },
    ]);
  if (
    event.body.kind === "private_clue_presented" &&
    (event.visibility !== "participant_private" ||
      event.addressed_seat_id !== event.body.payload.seat_id)
  )
    return validationFailure([
      {
        path: "$.body",
        code: "room_event.private_clue_visibility",
        message: "A private clue must be delivered only to its addressed seat.",
      },
    ]);
  if (
    [
      "mechanical_workflow_started",
      "mechanical_workflow_failed",
      "room_command_rejected",
      "room_created",
    ].includes(event.body.kind) &&
    event.visibility !== "server_internal"
  )
    return validationFailure([
      {
        path: "$.visibility",
        code: "room_event.internal_visibility",
        message: "Internal workflow records must remain server-internal.",
      },
    ]);
  if (
    event.body.kind === "participant_join_requested" &&
    event.visibility !== "player_host_operational"
  )
    return validationFailure([
      {
        path: "$.visibility",
        code: "room_event.join_visibility",
        message: "Pending joins are visible only to the player-host.",
      },
    ]);
  return { success: true, value: event };
}
