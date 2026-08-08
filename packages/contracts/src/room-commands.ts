import { Type, type Static } from "@sinclair/typebox";
import { ClientCommandIntentSchema } from "./client-commands.js";
import { strictObject } from "./envelopes.js";
import { RoomCommandHashSchema } from "./hashes.js";
import {
  ClientCommandIdSchema,
  ParticipantIdSchema,
  RoomCommandIdSchema,
  RoomSessionIdSchema,
  RoomTransactionIdSchema,
  SeatIdSchema,
} from "./ids.js";
import { SchemaVersionSchema } from "./versions.js";

export const RoomCommandSchema = strictObject({
  schema_version: SchemaVersionSchema,
  room_command_id: RoomCommandIdSchema,
  room_transaction_id: RoomTransactionIdSchema,
  room_session_id: RoomSessionIdSchema,
  source: Type.Union([Type.Literal("client"), Type.Literal("system")]),
  client_command_id: Type.Optional(ClientCommandIdSchema),
  client_command_hash: Type.Optional(RoomCommandHashSchema),
  participant_id: Type.Optional(ParticipantIdSchema),
  seat_id: Type.Optional(SeatIdSchema),
  expected_room_revision: Type.Integer({ minimum: 0 }),
  expected_view_revision: Type.Integer({ minimum: 0 }),
  intent: ClientCommandIntentSchema,
});

export type RoomCommand = Static<typeof RoomCommandSchema>;
