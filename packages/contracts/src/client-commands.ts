import { Type, type Static } from "@sinclair/typebox";
import { strictObject } from "./envelopes.js";
import {
  ActorIdSchema,
  ClientCommandIdSchema,
  ConnectionIdSchema,
  CorrectionRequestIdSchema,
  GuidedOptionIdSchema,
  LegalActionIdSchema,
  ParticipantIdSchema,
  PendingCheckIdSchema,
  PhysicalRollNonceSchema,
  ReactionWindowIdSchema,
  RoomIdSchema,
  SeatIdSchema,
  StarterLoadoutIdSchema,
  TransactionIdSchema,
} from "./ids.js";
import { DieFaceSchema } from "./checks.js";
import { ProtocolVersionSchema, SchemaVersionSchema } from "./versions.js";

export const DISPLAY_NAME_MAX_LENGTH = 40 as const;
export const PLAYER_FLAVOR_MAX_LENGTH = 160 as const;

export const ClientCommandFailureCodeSchema = Type.Union([
  Type.Literal("malformed_command"),
  Type.Literal("not_authenticated"),
  Type.Literal("participant_not_approved"),
  Type.Literal("not_player_host"),
  Type.Literal("seat_not_owned"),
  Type.Literal("seat_already_owned"),
  Type.Literal("normal_mode_seat_limit"),
  Type.Literal("hero_just_taken"),
  Type.Literal("stale_view"),
  Type.Literal("stale_spotlight"),
  Type.Literal("stale_legal_candidate"),
  Type.Literal("room_busy_recovering"),
  Type.Literal("run_not_ready"),
  Type.Literal("reaction_expired"),
  Type.Literal("physical_nonce_invalid"),
  Type.Literal("correction_not_eligible"),
  Type.Literal("host_recovery_proof_invalid"),
  Type.Literal("room_expired"),
  Type.Literal("protocol_incompatible"),
  Type.Literal("storage_recovery_required"),
  Type.Literal("internal_recovery_required"),
]);

const DisplayNameSchema = Type.String({
  minLength: 1,
  maxLength: DISPLAY_NAME_MAX_LENGTH,
  pattern: "^[^\\u0000-\\u001f\\u007f]+$",
});

const FlavorSchema = Type.String({
  minLength: 1,
  maxLength: PLAYER_FLAVOR_MAX_LENGTH,
  pattern: "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]+$",
});

function intent<
  Kind extends string,
  Payload extends ReturnType<typeof Type.Object>,
>(kind: Kind, payload: Payload) {
  return strictObject({ kind: Type.Literal(kind), payload });
}

export const ClientCommandIntentSchema = Type.Union([
  intent("request_join", strictObject({ display_name: DisplayNameSchema })),
  intent(
    "approve_participant",
    strictObject({ participant_id: ParticipantIdSchema }),
  ),
  intent(
    "reject_participant",
    strictObject({ participant_id: ParticipantIdSchema }),
  ),
  intent(
    "claim_hero",
    strictObject({
      seat_id: SeatIdSchema,
      starter_loadout_id: StarterLoadoutIdSchema,
    }),
  ),
  intent("release_seat", strictObject({ seat_id: SeatIdSchema })),
  intent("select_seat", strictObject({ seat_id: SeatIdSchema })),
  intent("claim_activation", strictObject({ seat_id: SeatIdSchema })),
  intent(
    "commit_legal_action",
    strictObject({
      seat_id: SeatIdSchema,
      legal_action_id: LegalActionIdSchema,
      target_actor_id: Type.Optional(ActorIdSchema),
      target_zone_id: Type.Optional(
        Type.String({ minLength: 3, maxLength: 128 }),
      ),
      player_flavor: Type.Optional(FlavorSchema),
    }),
  ),
  intent(
    "choose_spark",
    strictObject({ seat_id: SeatIdSchema, invoke_spark: Type.Boolean() }),
  ),
  intent(
    "submit_die",
    strictObject({
      seat_id: SeatIdSchema,
      pending_check_id: PendingCheckIdSchema,
      submission_nonce: PhysicalRollNonceSchema,
      die_face: DieFaceSchema,
    }),
  ),
  intent(
    "resolve_reaction",
    strictObject({
      seat_id: SeatIdSchema,
      reaction_window_id: ReactionWindowIdSchema,
      response: Type.Union([Type.Literal("use"), Type.Literal("pass")]),
      legal_action_id: Type.Optional(LegalActionIdSchema),
    }),
  ),
  intent(
    "reaction_timeout",
    strictObject({ reaction_window_id: ReactionWindowIdSchema }),
  ),
  intent(
    "choose_guided_option",
    strictObject({
      seat_id: Type.Optional(SeatIdSchema),
      option_id: GuidedOptionIdSchema,
    }),
  ),
  intent(
    "record_party_choice",
    strictObject({ option_id: GuidedOptionIdSchema }),
  ),
  intent(
    "request_correction",
    strictObject({
      target_transaction_id: Type.Union([Type.Null(), TransactionIdSchema]),
    }),
  ),
  intent(
    "confirm_correction",
    strictObject({ correction_request_id: CorrectionRequestIdSchema }),
  ),
  intent(
    "cancel_correction",
    strictObject({ correction_request_id: CorrectionRequestIdSchema }),
  ),
  intent(
    "transfer_player_host",
    strictObject({ participant_id: ParticipantIdSchema }),
  ),
  intent(
    "recover_player_host",
    strictObject({
      proof: Type.String({
        minLength: 6,
        maxLength: 256,
        pattern: "^[A-Za-z0-9._~-]+$",
      }),
    }),
  ),
  intent(
    "reassign_seat",
    strictObject({
      seat_id: SeatIdSchema,
      participant_id: ParticipantIdSchema,
    }),
  ),
  intent(
    "release_disconnected_activation",
    strictObject({ seat_id: SeatIdSchema }),
  ),
  intent("withdraw_combat", strictObject({})),
  intent("start_run", strictObject({})),
  intent("suspend_run", strictObject({})),
  intent("resume_run", strictObject({})),
  intent("replace_relay_room", strictObject({})),
]);

export const ClientCommandSchema = strictObject({
  schema_version: SchemaVersionSchema,
  protocol_version: ProtocolVersionSchema,
  client_command_id: ClientCommandIdSchema,
  room_id: RoomIdSchema,
  connection_id: ConnectionIdSchema,
  participant_id: Type.Optional(ParticipantIdSchema),
  seat_id: Type.Optional(SeatIdSchema),
  expected_view_revision: Type.Integer({ minimum: 0 }),
  intent: ClientCommandIntentSchema,
});

export const ClientCommandResultSchema = Type.Union([
  strictObject({
    schema_version: SchemaVersionSchema,
    client_command_id: ClientCommandIdSchema,
    status: Type.Literal("accepted"),
    room_revision: Type.Integer({ minimum: 0 }),
    view_revision: Type.Integer({ minimum: 0 }),
    safe_detail: Type.String({ minLength: 1, maxLength: 240 }),
  }),
  strictObject({
    schema_version: SchemaVersionSchema,
    client_command_id: ClientCommandIdSchema,
    status: Type.Literal("rejected"),
    code: ClientCommandFailureCodeSchema,
    room_revision: Type.Integer({ minimum: 0 }),
    view_revision: Type.Integer({ minimum: 0 }),
    safe_detail: Type.String({ minLength: 1, maxLength: 240 }),
  }),
]);

export type ClientCommand = Static<typeof ClientCommandSchema>;
export type ClientCommandIntent = Static<typeof ClientCommandIntentSchema>;
export type ClientCommandResult = Static<typeof ClientCommandResultSchema>;
export type ClientCommandFailureCode = Static<
  typeof ClientCommandFailureCodeSchema
>;
