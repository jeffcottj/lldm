import { Type, type Static } from "@sinclair/typebox";
import { ClientCommandResultSchema } from "./client-commands.js";
import { strictObject } from "./envelopes.js";
import { NormalizedMapLayoutSchema } from "./guided-presentation.js";
import {
  DeliveryIdSchema,
  CharacterIdSchema,
  ContentDefinitionIdSchema,
  ParticipantIdSchema,
  PrivateClueIdSchema,
  RoomSessionIdSchema,
  SeatIdSchema,
  StarterLoadoutIdSchema,
} from "./ids.js";
import {
  HostControlProjectionSchema,
  PublicTvProjectionSchema,
  SeatPrivateProjectionSchema,
} from "./projections.js";
import { PublicRoomHistoryEntrySchema, RoomStateSchema } from "./room-state.js";
import {
  type ValidationResult,
  validateValue,
  validationFailure,
} from "./validation.js";
import { SchemaVersionSchema } from "./versions.js";

const CombinedRevisionFields = {
  schema_version: SchemaVersionSchema,
  room_session_id: RoomSessionIdSchema,
  view_revision: Type.Integer({ minimum: 0 }),
  room_revision: Type.Integer({ minimum: 0 }),
  mechanical_revision: Type.Integer({ minimum: 0 }),
};

const PublicParticipantSummarySchema = strictObject({
  participant_id: ParticipantIdSchema,
  display_name: Type.String({ minLength: 1, maxLength: 40 }),
  approved: Type.Boolean(),
  seat_id: Type.Union([Type.Null(), SeatIdSchema]),
  starter_loadout_id: Type.Union([Type.Null(), StarterLoadoutIdSchema]),
  is_player_host: Type.Boolean(),
});

const StarterSummarySchema = strictObject({
  seat_id: SeatIdSchema,
  starter_loadout_id: StarterLoadoutIdSchema,
  character_id: CharacterIdSchema,
  display_name: Type.String({ minLength: 1, maxLength: 80 }),
  archetype_ref: ContentDefinitionIdSchema,
  signature: Type.String({ minLength: 1, maxLength: 240 }),
  drive: Type.String({ minLength: 1, maxLength: 240 }),
  available: Type.Boolean(),
});

const PublicGuidedPromptSchema = strictObject({
  beat_id: Type.String({ minLength: 3, maxLength: 128 }),
  text: Type.String({ minLength: 1, maxLength: 480 }),
  options: Type.Array(
    strictObject({
      option_id: Type.String({ minLength: 3, maxLength: 128 }),
      label: Type.String({ minLength: 1, maxLength: 100 }),
      stakes: Type.String({ minLength: 1, maxLength: 240 }),
    }),
    { maxItems: 6 },
  ),
  tv_mode: Type.Union([
    Type.Literal("scene"),
    Type.Literal("choice"),
    Type.Literal("map"),
    Type.Literal("physical_roll"),
    Type.Literal("conclusion"),
  ]),
});

export const CombinedPublicTvViewSchema = strictObject({
  ...CombinedRevisionFields,
  view_kind: Type.Literal("public_tv"),
  room_status: Type.Union([
    Type.Literal("lobby"),
    Type.Literal("active"),
    Type.Literal("suspended"),
    Type.Literal("completed"),
  ]),
  room_mode: Type.Union([Type.Literal("normal"), Type.Literal("rehearsal")]),
  current_beat_id: Type.String({ minLength: 3, maxLength: 128 }),
  participants: Type.Array(PublicParticipantSummarySchema, { maxItems: 8 }),
  starter_roster: Type.Array(StarterSummarySchema, {
    minItems: 6,
    maxItems: 6,
  }),
  presentation: PublicGuidedPromptSchema,
  recent_public_events: Type.Array(PublicRoomHistoryEntrySchema, {
    maxItems: 20,
  }),
  mechanical: PublicTvProjectionSchema,
  map_layout: Type.Union([Type.Null(), NormalizedMapLayoutSchema]),
  recovery_message: Type.Union([
    Type.Null(),
    Type.String({ minLength: 1, maxLength: 240 }),
  ]),
});

const AssignedSeatPrivateViewSchema = strictObject({
  seat_id: SeatIdSchema,
  starter_loadout_id: StarterLoadoutIdSchema,
  selected: Type.Boolean(),
  activation_eligible: Type.Boolean(),
  reaction_prompt: Type.Union([
    Type.Null(),
    strictObject({
      reaction_window_id: Type.String({ minLength: 3, maxLength: 128 }),
      deadline_at: Type.Union([
        Type.Null(),
        Type.String({ format: "date-time" }),
      ]),
      paused: Type.Boolean(),
    }),
  ]),
  mechanical: SeatPrivateProjectionSchema,
  private_clues: Type.Array(
    strictObject({
      clue_id: PrivateClueIdSchema,
      text: Type.String({ minLength: 1, maxLength: 240 }),
    }),
    { maxItems: 12 },
  ),
});

export const ParticipantPrivateViewSchema = strictObject({
  ...CombinedRevisionFields,
  view_kind: Type.Literal("participant_private"),
  participant_id: ParticipantIdSchema,
  display_name: Type.String({ minLength: 1, maxLength: 40 }),
  approved: Type.Boolean(),
  is_player_host: Type.Boolean(),
  room_status: Type.Union([
    Type.Literal("lobby"),
    Type.Literal("active"),
    Type.Literal("suspended"),
    Type.Literal("completed"),
  ]),
  room_mode: Type.Union([Type.Literal("normal"), Type.Literal("rehearsal")]),
  supply: Type.Integer({ minimum: 0 }),
  supply_maximum: Type.Integer({ minimum: 2, maximum: 7 }),
  assigned_seats: Type.Array(AssignedSeatPrivateViewSchema, { maxItems: 6 }),
  available_starters: Type.Array(StarterSummarySchema, { maxItems: 6 }),
  public_prompt: PublicGuidedPromptSchema,
  recent_public_events: Type.Array(PublicRoomHistoryEntrySchema, {
    maxItems: 20,
  }),
  command_results: Type.Array(ClientCommandResultSchema, { maxItems: 16 }),
  reconnect_state: Type.Union([
    Type.Literal("ready"),
    Type.Literal("grace"),
    Type.Literal("recovery_required"),
  ]),
});

export const PlayerHostOperationalViewSchema = strictObject({
  ...CombinedRevisionFields,
  view_kind: Type.Literal("player_host_operational"),
  participant_id: ParticipantIdSchema,
  pending_joins: Type.Array(
    strictObject({
      participant_id: ParticipantIdSchema,
      display_name: Type.String({ minLength: 1, maxLength: 40 }),
    }),
    { maxItems: 8 },
  ),
  approved_participants: Type.Array(
    strictObject({
      participant_id: ParticipantIdSchema,
      display_name: Type.String({ minLength: 1, maxLength: 40 }),
      is_player_host: Type.Boolean(),
    }),
    { minItems: 1, maxItems: 8 },
  ),
  seat_controls: Type.Array(
    strictObject({
      seat_id: SeatIdSchema,
      participant_id: Type.Union([Type.Null(), ParticipantIdSchema]),
      disconnected: Type.Boolean(),
    }),
    { maxItems: 6 },
  ),
  correction_request: Type.Union([
    Type.Null(),
    strictObject({
      correction_request_id: Type.String({ minLength: 3, maxLength: 128 }),
      target_transaction_id: Type.Union([
        Type.Null(),
        Type.String({ minLength: 3, maxLength: 128 }),
      ]),
    }),
  ]),
  workflow_recovery_required: Type.Boolean(),
  relay_status: Type.Union([
    Type.Literal("connected"),
    Type.Literal("reconnecting"),
    Type.Literal("expired"),
  ]),
  health: strictObject({
    storage: Type.Literal("verified"),
    mechanics: Type.Literal("verified"),
  }),
});

export const ClientDeliverableViewSchema = Type.Union([
  CombinedPublicTvViewSchema,
  ParticipantPrivateViewSchema,
  PlayerHostOperationalViewSchema,
]);

export const ServerInternalCombinedViewSchema = strictObject({
  ...CombinedRevisionFields,
  view_kind: Type.Literal("server_internal"),
  room: RoomStateSchema,
  mechanical: HostControlProjectionSchema,
  relay_metadata_present: Type.Boolean(),
});

export const CombinedProjectionSnapshotSchema = strictObject({
  schema_version: SchemaVersionSchema,
  delivery_id: DeliveryIdSchema,
  delivery_kind: Type.Literal("snapshot"),
  audience_key: Type.String({ minLength: 1, maxLength: 128 }),
  view: ClientDeliverableViewSchema,
});

export const CombinedProjectionDeltaSchema = strictObject({
  schema_version: SchemaVersionSchema,
  delivery_id: DeliveryIdSchema,
  delivery_kind: Type.Literal("delta"),
  audience_key: Type.String({ minLength: 1, maxLength: 128 }),
  base_view_revision: Type.Integer({ minimum: 0 }),
  target_view_revision: Type.Integer({ minimum: 1 }),
  operations: Type.Tuple([
    strictObject({
      operation: Type.Literal("replace_view"),
      value: ClientDeliverableViewSchema,
    }),
  ]),
});

export const CombinedProjectionDeliverySchema = Type.Union([
  CombinedProjectionSnapshotSchema,
  CombinedProjectionDeltaSchema,
]);

export type CombinedPublicTvView = Static<typeof CombinedPublicTvViewSchema>;
export type ParticipantPrivateView = Static<
  typeof ParticipantPrivateViewSchema
>;
export type PlayerHostOperationalView = Static<
  typeof PlayerHostOperationalViewSchema
>;
export type ClientDeliverableView = Static<typeof ClientDeliverableViewSchema>;
export type ServerInternalCombinedView = Static<
  typeof ServerInternalCombinedViewSchema
>;
export type CombinedProjectionSnapshot = Static<
  typeof CombinedProjectionSnapshotSchema
>;
export type CombinedProjectionDelta = Static<
  typeof CombinedProjectionDeltaSchema
>;
export type CombinedProjectionDelivery = Static<
  typeof CombinedProjectionDeliverySchema
>;

export function validateCombinedProjectionDelivery(
  input: unknown,
): ValidationResult<CombinedProjectionDelivery> {
  const structural = validateValue(CombinedProjectionDeliverySchema, input);
  if (!structural.success) return structural;
  const delivery = structural.value;
  const deliveredView =
    delivery.delivery_kind === "snapshot"
      ? delivery.view
      : delivery.operations[0].value;
  const expectedAudience =
    deliveredView.view_kind === "public_tv"
      ? "public"
      : deliveredView.view_kind === "participant_private"
        ? deliveredView.participant_id
        : `player_host:${deliveredView.participant_id}`;
  if (delivery.audience_key !== expectedAudience)
    return validationFailure([
      {
        path: "$.audience_key",
        code: "projection.audience_mismatch",
        message: "Delivery audience does not match its filtered view.",
      },
    ]);
  if (delivery.delivery_kind === "delta") {
    if (delivery.target_view_revision !== delivery.base_view_revision + 1)
      return validationFailure([
        {
          path: "$.target_view_revision",
          code: "projection.revision_gap",
          message: "A retained delta must advance exactly one view revision.",
        },
      ]);
    if (
      delivery.operations[0].value.view_revision !==
      delivery.target_view_revision
    )
      return validationFailure([
        {
          path: "$.operations[0].value.view_revision",
          code: "projection.target_revision_mismatch",
          message: "Replacement view revision must match the delta target.",
        },
      ]);
  }
  return { success: true, value: delivery };
}
