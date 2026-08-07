import { Type, type Static } from "@sinclair/typebox";
import { commandEnvelope, eventEnvelope, strictObject } from "./envelopes.js";
import { TransactionIdSchema } from "./ids.js";

export const UndoTransactionCommandSchema = commandEnvelope(
  Type.Literal("undo_transaction"),
  strictObject({
    target_transaction_id: Type.Union([Type.Null(), TransactionIdSchema]),
  }),
);

export const TransactionCompensatedEventSchema = eventEnvelope(
  Type.Literal("transaction_compensated"),
  strictObject({ target_transaction_id: TransactionIdSchema }),
);

export type UndoTransactionCommand = Static<
  typeof UndoTransactionCommandSchema
>;
export type TransactionCompensatedEvent = Static<
  typeof TransactionCompensatedEventSchema
>;
