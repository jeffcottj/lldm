import { Type, type Static } from "@sinclair/typebox";
import { CheckPreviewTransportMessageSchema } from "./checks.js";
import {
  ClientCommandResultSchema,
  ClientCommandSchema,
} from "./client-commands.js";
import { CombinedProjectionDeliverySchema } from "./combined-projections.js";
import { strictObject, transportEnvelope } from "./envelopes.js";
import {
  ConnectionIdSchema,
  LegalActionIdSchema,
  MessageIdSchema,
  ParticipantIdSchema,
} from "./ids.js";
import {
  RelayApprovalResultSchema,
  RelayErrorCodeSchema,
  RelayRoleSchema,
} from "./relay.js";

const HelloMessageSchema = transportEnvelope(
  Type.Literal("hello"),
  strictObject({
    role: RelayRoleSchema,
    participant_id: Type.Optional(ParticipantIdSchema),
  }),
);
const ConnectionStatusMessageSchema = transportEnvelope(
  Type.Literal("connection_status"),
  strictObject({
    participant_id: ParticipantIdSchema,
    status: Type.Union([
      Type.Literal("connected"),
      Type.Literal("disconnected"),
    ]),
  }),
);
const AcknowledgementMessageSchema = transportEnvelope(
  Type.Literal("acknowledgement"),
  strictObject({ acknowledged_message_id: MessageIdSchema }),
);
const DeliveryFailureMessageSchema = transportEnvelope(
  Type.Literal("delivery_failure"),
  strictObject({
    code: RelayErrorCodeSchema,
    safe_detail: Type.String({ minLength: 1, maxLength: 180 }),
  }),
);
const JoinStatusMessageSchema = transportEnvelope(
  Type.Literal("join_status"),
  strictObject({
    status: Type.Union([
      Type.Literal("pending"),
      Type.Literal("approved"),
      Type.Literal("rejected"),
    ]),
    participant_id: Type.Optional(ParticipantIdSchema),
  }),
);
const ApprovalResultMessageSchema = transportEnvelope(
  Type.Literal("approval_result"),
  RelayApprovalResultSchema,
);
const ClientCommandMessageSchema = transportEnvelope(
  Type.Literal("client_command"),
  ClientCommandSchema,
);
const CommandResultMessageSchema = transportEnvelope(
  Type.Literal("command_result"),
  ClientCommandResultSchema,
);
const ActionPreviewMessageSchema = transportEnvelope(
  Type.Literal("action_preview"),
  strictObject({
    legal_action_id: LegalActionIdSchema,
    expires_at: Type.String({ format: "date-time" }),
  }),
);
const ProjectionDeliveryMessageSchema = transportEnvelope(
  Type.Literal("projection_delivery"),
  CombinedProjectionDeliverySchema,
);
const ResyncRequestMessageSchema = transportEnvelope(
  Type.Literal("resync_request"),
  strictObject({
    last_view_revision: Type.Integer({ minimum: 0 }),
    reason: Type.Union([
      Type.Literal("sequence_gap"),
      Type.Literal("delta_invalid"),
      Type.Literal("audience_changed"),
      Type.Literal("cursor_missing"),
    ]),
  }),
);
const ResyncResultMessageSchema = transportEnvelope(
  Type.Literal("resync_result"),
  CombinedProjectionDeliverySchema,
);
const PingMessageSchema = transportEnvelope(
  Type.Literal("ping"),
  strictObject({ sent_at_epoch_ms: Type.Integer({ minimum: 0 }) }),
);
const PongMessageSchema = transportEnvelope(
  Type.Literal("pong"),
  strictObject({ sent_at_epoch_ms: Type.Integer({ minimum: 0 }) }),
);
const RoomClosingMessageSchema = transportEnvelope(
  Type.Literal("room_closing"),
  strictObject({
    reason: Type.Union([
      Type.Literal("expired"),
      Type.Literal("replaced"),
      Type.Literal("closed"),
    ]),
  }),
);
const ProtocolUpdateRequiredMessageSchema = transportEnvelope(
  Type.Literal("protocol_update_required"),
  strictObject({
    required_protocol_version: Type.Integer({ minimum: 1 }),
    safe_detail: Type.String({ minLength: 1, maxLength: 180 }),
  }),
);

export const TransportMessageSchema = Type.Union([
  CheckPreviewTransportMessageSchema,
  HelloMessageSchema,
  ConnectionStatusMessageSchema,
  AcknowledgementMessageSchema,
  DeliveryFailureMessageSchema,
  JoinStatusMessageSchema,
  ApprovalResultMessageSchema,
  ClientCommandMessageSchema,
  CommandResultMessageSchema,
  ActionPreviewMessageSchema,
  ProjectionDeliveryMessageSchema,
  ResyncRequestMessageSchema,
  ResyncResultMessageSchema,
  PingMessageSchema,
  PongMessageSchema,
  RoomClosingMessageSchema,
  ProtocolUpdateRequiredMessageSchema,
]);

export const RelayRoutedFrameSchema = strictObject({
  schema_version: Type.Literal(1),
  recipient_connection_id: Type.Optional(ConnectionIdSchema),
  sender_participant_id: Type.Optional(ParticipantIdSchema),
  sender_role: Type.Optional(RelayRoleSchema),
  message: TransportMessageSchema,
});

export type TransportMessage = Static<typeof TransportMessageSchema>;
export type RelayRoutedFrame = Static<typeof RelayRoutedFrameSchema>;
