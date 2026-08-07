import { Type } from "@sinclair/typebox";

declare const opaqueIdBrand: unique symbol;

export type OpaqueId<Kind extends string> = string & {
  readonly [opaqueIdBrand]: Kind;
};

const OPAQUE_ID_PATTERN = "^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)+$";

function opaqueIdSchema<Kind extends string>(kind: Kind) {
  return Type.Transform(
    Type.String({
      $id: `lldm.id.${kind}`,
      minLength: 3,
      maxLength: 128,
      pattern: OPAQUE_ID_PATTERN,
    }),
  )
    .Decode((value): OpaqueId<Kind> => value as OpaqueId<Kind>)
    .Encode((value) => value);
}

export const CommandIdSchema = opaqueIdSchema("command");
export const EventIdSchema = opaqueIdSchema("event");
export const TransactionIdSchema = opaqueIdSchema("transaction");
export const CampaignIdSchema = opaqueIdSchema("campaign");
export const ActorIdSchema = opaqueIdSchema("actor");
export const CharacterIdSchema = opaqueIdSchema("character");
export const SeatIdSchema = opaqueIdSchema("seat");
export const ContentDefinitionIdSchema = opaqueIdSchema("content_definition");
export const ProposalIdSchema = opaqueIdSchema("proposal");
export const ProjectionIdSchema = opaqueIdSchema("projection");
export const MessageIdSchema = opaqueIdSchema("message");
export const RoomIdSchema = opaqueIdSchema("room");
export const ConnectionIdSchema = opaqueIdSchema("connection");

export type CommandId = typeof CommandIdSchema.static;
export type EventId = typeof EventIdSchema.static;
export type TransactionId = typeof TransactionIdSchema.static;
export type CampaignId = typeof CampaignIdSchema.static;
export type ActorId = typeof ActorIdSchema.static;
export type CharacterId = typeof CharacterIdSchema.static;
export type SeatId = typeof SeatIdSchema.static;
export type ContentDefinitionId = typeof ContentDefinitionIdSchema.static;
export type ProposalId = typeof ProposalIdSchema.static;
export type ProjectionId = typeof ProjectionIdSchema.static;
export type MessageId = typeof MessageIdSchema.static;
export type RoomId = typeof RoomIdSchema.static;
export type ConnectionId = typeof ConnectionIdSchema.static;
