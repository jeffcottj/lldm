import { Type, type Static } from "@sinclair/typebox";
import { strictObject } from "./envelopes.js";
import {
  ConnectionIdSchema,
  ParticipantIdSchema,
  RoomIdSchema,
} from "./ids.js";
import { ProtocolVersionSchema, SchemaVersionSchema } from "./versions.js";

export const RELAY_MAX_FRAME_BYTES = 262_144 as const;
export const RELAY_MAX_CONNECTIONS = 10 as const;
export const RELAY_MAX_PENDING_JOINS = 8 as const;
export const RELAY_COMMANDS_PER_MINUTE = 120 as const;
export const RELAY_APPLIANCE_FRAMES_PER_MINUTE = 1_200 as const;
export const RELAY_RETAINED_ACKS = 128 as const;
export const RELAY_MAX_ROOM_LIFETIME_SECONDS = 86_400 as const;

export const RelayRoleSchema = Type.Union([
  Type.Literal("appliance"),
  Type.Literal("pending_player"),
  Type.Literal("approved_player"),
]);

export const RelayErrorCodeSchema = Type.Union([
  Type.Literal("unauthorized"),
  Type.Literal("origin_rejected"),
  Type.Literal("room_not_found"),
  Type.Literal("room_expired"),
  Type.Literal("token_expired"),
  Type.Literal("token_wrong_room"),
  Type.Literal("proof_already_used"),
  Type.Literal("connection_limit"),
  Type.Literal("rate_limit"),
  Type.Literal("frame_too_large"),
  Type.Literal("sequence_gap"),
  Type.Literal("protocol_incompatible"),
  Type.Literal("not_ready"),
]);

export const RelayTokenClaimsSchema = strictObject({
  schema_version: SchemaVersionSchema,
  protocol_version: ProtocolVersionSchema,
  room_id: RoomIdSchema,
  connection_id: ConnectionIdSchema,
  role: RelayRoleSchema,
  participant_id: Type.Optional(ParticipantIdSchema),
  audience: Type.Union([
    Type.Literal("appliance"),
    Type.Literal("pending"),
    Type.Literal("participant"),
  ]),
  expires_at_epoch_seconds: Type.Integer({ minimum: 0 }),
  token_id: Type.String({
    minLength: 16,
    maxLength: 128,
    pattern: "^[A-Za-z0-9_-]+$",
  }),
});

const SecretSchema = Type.String({
  minLength: 22,
  maxLength: 256,
  pattern: "^[A-Za-z0-9._~-]+$",
});

const SignedRelayTokenSchema = Type.String({
  minLength: 64,
  maxLength: 1024,
  pattern: "^[A-Za-z0-9._~-]+$",
});

export const RelayCreateRoomRequestSchema = strictObject({
  schema_version: SchemaVersionSchema,
  protocol_version: ProtocolVersionSchema,
  requested_lifetime_seconds: Type.Integer({
    minimum: 60,
    maximum: RELAY_MAX_ROOM_LIFETIME_SECONDS,
  }),
});

export const RelayCreateRoomResultSchema = strictObject({
  schema_version: SchemaVersionSchema,
  protocol_version: ProtocolVersionSchema,
  room_id: RoomIdSchema,
  appliance_token: SignedRelayTokenSchema,
  invite_secret: SecretSchema,
  host_bootstrap_proof: SecretSchema,
  expires_at: Type.String({ format: "date-time" }),
  join_url: Type.String({ format: "uri", maxLength: 512 }),
  fallback_code: Type.String({
    minLength: 6,
    maxLength: 8,
    pattern: "^[A-Z0-9]+$",
  }),
});

export const RelayRedeemInviteRequestSchema = strictObject({
  schema_version: SchemaVersionSchema,
  protocol_version: ProtocolVersionSchema,
  room_id: RoomIdSchema,
  invite_secret: Type.Optional(SecretSchema),
  fallback_code: Type.Optional(
    Type.String({ minLength: 6, maxLength: 8, pattern: "^[A-Z0-9]+$" }),
  ),
  display_name: Type.String({ minLength: 1, maxLength: 40 }),
  host_bootstrap_proof: Type.Optional(SecretSchema),
});

export const RelayPendingJoinResultSchema = strictObject({
  schema_version: SchemaVersionSchema,
  protocol_version: ProtocolVersionSchema,
  room_id: RoomIdSchema,
  connection_id: ConnectionIdSchema,
  pending_token: SignedRelayTokenSchema,
  status: Type.Literal("pending_approval"),
});

export const RelayApprovalResultSchema = strictObject({
  schema_version: SchemaVersionSchema,
  protocol_version: ProtocolVersionSchema,
  room_id: RoomIdSchema,
  participant_id: ParticipantIdSchema,
  connection_id: ConnectionIdSchema,
  reconnect_token: SignedRelayTokenSchema,
  expires_at: Type.String({ format: "date-time" }),
});

export const RelayTokenRefreshRequestSchema = strictObject({
  schema_version: SchemaVersionSchema,
  room_id: RoomIdSchema,
  reconnect_token: SignedRelayTokenSchema,
});

export const RelayTokenRevokeRequestSchema = strictObject({
  schema_version: SchemaVersionSchema,
  room_id: RoomIdSchema,
  participant_id: ParticipantIdSchema,
});

export const RelaySafeErrorSchema = strictObject({
  schema_version: SchemaVersionSchema,
  code: RelayErrorCodeSchema,
  safe_detail: Type.String({ minLength: 1, maxLength: 180 }),
});

export type RelayTokenClaims = Static<typeof RelayTokenClaimsSchema>;
export type RelayCreateRoomRequest = Static<
  typeof RelayCreateRoomRequestSchema
>;
export type RelayCreateRoomResult = Static<typeof RelayCreateRoomResultSchema>;
export type RelayRedeemInviteRequest = Static<
  typeof RelayRedeemInviteRequestSchema
>;
export type RelayPendingJoinResult = Static<
  typeof RelayPendingJoinResultSchema
>;
export type RelayApprovalResult = Static<typeof RelayApprovalResultSchema>;
export type RelayTokenRefreshRequest = Static<
  typeof RelayTokenRefreshRequestSchema
>;
export type RelaySafeError = Static<typeof RelaySafeErrorSchema>;
