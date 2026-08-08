import { Type, type Static } from "@sinclair/typebox";
import { strictObject } from "./envelopes.js";
import { RoomCommandHashSchema, RoomStateHashSchema } from "./hashes.js";
import {
  ClientCommandIdSchema,
  RoomCommandIdSchema,
  RoomSessionIdSchema,
  RoomTransactionIdSchema,
  TransactionIdSchema,
} from "./ids.js";
import { SchemaVersionSchema } from "./versions.js";

export const RoomTransactionRecordSchema = strictObject({
  schema_version: SchemaVersionSchema,
  room_session_id: RoomSessionIdSchema,
  room_command_id: RoomCommandIdSchema,
  client_command_id: Type.Optional(ClientCommandIdSchema),
  command_hash: RoomCommandHashSchema,
  room_transaction_id: RoomTransactionIdSchema,
  first_room_revision: Type.Integer({ minimum: 1 }),
  last_room_revision: Type.Integer({ minimum: 1 }),
  event_count: Type.Integer({ minimum: 1 }),
  pre_room_state_hash: RoomStateHashSchema,
  post_room_state_hash: RoomStateHashSchema,
  outcome: Type.Union([Type.Literal("accepted"), Type.Literal("rejected")]),
  linked_game_transaction_id: Type.Optional(TransactionIdSchema),
  committed_at: Type.String({ format: "date-time" }),
});

export type RoomTransactionRecord = Static<typeof RoomTransactionRecordSchema>;
