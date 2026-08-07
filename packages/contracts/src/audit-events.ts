import { Type, type Static } from "@sinclair/typebox";
import { eventEnvelope, strictObject } from "./envelopes.js";
import { CommandHashSchema } from "./hashes.js";
import { CommandRejectionCodeSchema } from "./transactions.js";

const CommandKindSchema = Type.String({
  minLength: 1,
  maxLength: 96,
  pattern: "^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$",
});

export const CommandAcceptedEventSchema = eventEnvelope(
  Type.Literal("command_accepted"),
  strictObject({
    command_kind: CommandKindSchema,
    command_hash: CommandHashSchema,
  }),
);

export const CommandRejectedEventSchema = eventEnvelope(
  Type.Literal("command_rejected"),
  strictObject({
    command_kind: CommandKindSchema,
    command_hash: CommandHashSchema,
    rejection_code: CommandRejectionCodeSchema,
    safe_detail: Type.String({ minLength: 1, maxLength: 240 }),
  }),
);

export type CommandAcceptedEvent = Static<typeof CommandAcceptedEventSchema>;
export type CommandRejectedEvent = Static<typeof CommandRejectedEventSchema>;
