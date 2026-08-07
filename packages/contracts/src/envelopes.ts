import {
  Type,
  type TLiteral,
  type TObject,
  type TProperties,
  type TSchema,
} from "@sinclair/typebox";
import {
  CampaignIdSchema,
  CommandIdSchema,
  ConnectionIdSchema,
  ContentDefinitionIdSchema,
  EventIdSchema,
  MessageIdSchema,
  ProjectionIdSchema,
  ProposalIdSchema,
  RoomIdSchema,
  SeatIdSchema,
  TransactionIdSchema,
} from "./ids.js";
import {
  ContentDefinitionRevisionSchema,
  ProtocolVersionSchema,
  SchemaVersionSchema,
} from "./versions.js";

export function strictObject<Properties extends TProperties>(
  properties: Properties,
): TObject<Properties> {
  return Type.Object(properties, { additionalProperties: false });
}

export function commandEnvelope<Kind extends TLiteral, Payload extends TSchema>(
  kind: Kind,
  payload: Payload,
) {
  return strictObject({
    schema_version: SchemaVersionSchema,
    command_id: CommandIdSchema,
    transaction_id: TransactionIdSchema,
    campaign_id: CampaignIdSchema,
    expected_revision: Type.Integer({ minimum: 0 }),
    kind,
    payload,
  });
}

export function eventEnvelope<Kind extends TLiteral, Payload extends TSchema>(
  kind: Kind,
  payload: Payload,
) {
  return strictObject({
    schema_version: SchemaVersionSchema,
    event_id: EventIdSchema,
    transaction_id: TransactionIdSchema,
    campaign_id: CampaignIdSchema,
    caused_by_command_id: CommandIdSchema,
    transaction_index: Type.Integer({ minimum: 0 }),
    stream_revision: Type.Integer({ minimum: 1 }),
    kind,
    payload,
  });
}

export function contentDefinitionEnvelope<
  Kind extends TLiteral,
  Payload extends TSchema,
>(kind: Kind, payload: Payload) {
  return strictObject({
    schema_version: SchemaVersionSchema,
    content_definition_id: ContentDefinitionIdSchema,
    definition_revision: ContentDefinitionRevisionSchema,
    kind,
    payload,
  });
}

export function proposalEnvelope<
  Kind extends TLiteral,
  Payload extends TSchema,
>(kind: Kind, payload: Payload) {
  return strictObject({
    schema_version: SchemaVersionSchema,
    proposal_id: ProposalIdSchema,
    campaign_id: CampaignIdSchema,
    kind,
    payload,
  });
}

export function projectionEnvelope<
  Kind extends TLiteral,
  Payload extends TSchema,
>(kind: Kind, payload: Payload) {
  return strictObject({
    schema_version: SchemaVersionSchema,
    projection_id: ProjectionIdSchema,
    campaign_id: CampaignIdSchema,
    revision: Type.Integer({ minimum: 0 }),
    kind,
    payload,
  });
}

export function transportEnvelope<
  Kind extends TLiteral,
  Payload extends TSchema,
>(kind: Kind, payload: Payload) {
  return strictObject({
    schema_version: SchemaVersionSchema,
    protocol_version: ProtocolVersionSchema,
    message_id: MessageIdSchema,
    room_id: RoomIdSchema,
    connection_id: ConnectionIdSchema,
    seat_id: Type.Optional(SeatIdSchema),
    seq: Type.Integer({ minimum: 0 }),
    reply_to: Type.Optional(MessageIdSchema),
    kind,
    payload,
  });
}
