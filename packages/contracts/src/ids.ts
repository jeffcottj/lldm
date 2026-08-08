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
export const PendingCheckIdSchema = opaqueIdSchema("pending_check");
export const PhysicalSubmissionIdSchema = opaqueIdSchema("physical_submission");
export const PhysicalRollNonceSchema = opaqueIdSchema("physical_roll_nonce");
export const SnapshotIdSchema = opaqueIdSchema("snapshot");
export const ContentManifestIdSchema = opaqueIdSchema("content_manifest");
export const ChallengeIdSchema = opaqueIdSchema("challenge");
export const CombatIdSchema = opaqueIdSchema("combat");
export const ZoneIdSchema = opaqueIdSchema("zone");
export const ObjectiveIdSchema = opaqueIdSchema("objective");
export const WoundIdSchema = opaqueIdSchema("wound");
export const RitualIdSchema = opaqueIdSchema("ritual");
export const ConditionIdSchema = opaqueIdSchema("condition");
export const SceneIdSchema = opaqueIdSchema("scene");
export const AbilityIdSchema = opaqueIdSchema("ability");
export const LegalActionIdSchema = opaqueIdSchema("legal_action");
export const ReactionWindowIdSchema = opaqueIdSchema("reaction_window");
export const ScarIdSchema = opaqueIdSchema("scar");
export const LeverageIdSchema = opaqueIdSchema("leverage");
export const SocialLimitIdSchema = opaqueIdSchema("social_limit");
export const StarterLoadoutIdSchema = opaqueIdSchema("starter_loadout");
export const ScenarioIdSchema = opaqueIdSchema("scenario");
export const RoomSessionIdSchema = opaqueIdSchema("room_session");
export const ParticipantIdSchema = opaqueIdSchema("participant");
export const ClientCommandIdSchema = opaqueIdSchema("client_command");
export const RoomCommandIdSchema = opaqueIdSchema("room_command");
export const RoomTransactionIdSchema = opaqueIdSchema("room_transaction");
export const RoomEventIdSchema = opaqueIdSchema("room_event");
export const MechanicalWorkflowIdSchema = opaqueIdSchema("mechanical_workflow");
export const DeliveryIdSchema = opaqueIdSchema("delivery");
export const GuidedBeatIdSchema = opaqueIdSchema("guided_beat");
export const GuidedOptionIdSchema = opaqueIdSchema("guided_option");
export const PresentationManifestIdSchema = opaqueIdSchema(
  "presentation_manifest",
);
export const PrivateClueIdSchema = opaqueIdSchema("private_clue");
export const CorrectionRequestIdSchema = opaqueIdSchema("correction_request");

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
export type PendingCheckId = typeof PendingCheckIdSchema.static;
export type PhysicalSubmissionId = typeof PhysicalSubmissionIdSchema.static;
export type PhysicalRollNonce = typeof PhysicalRollNonceSchema.static;
export type SnapshotId = typeof SnapshotIdSchema.static;
export type ContentManifestId = typeof ContentManifestIdSchema.static;
export type ChallengeId = typeof ChallengeIdSchema.static;
export type CombatId = typeof CombatIdSchema.static;
export type ZoneId = typeof ZoneIdSchema.static;
export type ObjectiveId = typeof ObjectiveIdSchema.static;
export type WoundId = typeof WoundIdSchema.static;
export type RitualId = typeof RitualIdSchema.static;
export type ConditionId = typeof ConditionIdSchema.static;
export type SceneId = typeof SceneIdSchema.static;
export type AbilityId = typeof AbilityIdSchema.static;
export type LegalActionId = typeof LegalActionIdSchema.static;
export type ReactionWindowId = typeof ReactionWindowIdSchema.static;
export type ScarId = typeof ScarIdSchema.static;
export type LeverageId = typeof LeverageIdSchema.static;
export type SocialLimitId = typeof SocialLimitIdSchema.static;
export type StarterLoadoutId = typeof StarterLoadoutIdSchema.static;
export type ScenarioId = typeof ScenarioIdSchema.static;
export type RoomSessionId = typeof RoomSessionIdSchema.static;
export type ParticipantId = typeof ParticipantIdSchema.static;
export type ClientCommandId = typeof ClientCommandIdSchema.static;
export type RoomCommandId = typeof RoomCommandIdSchema.static;
export type RoomTransactionId = typeof RoomTransactionIdSchema.static;
export type RoomEventId = typeof RoomEventIdSchema.static;
export type MechanicalWorkflowId = typeof MechanicalWorkflowIdSchema.static;
export type DeliveryId = typeof DeliveryIdSchema.static;
export type GuidedBeatId = typeof GuidedBeatIdSchema.static;
export type GuidedOptionId = typeof GuidedOptionIdSchema.static;
export type PresentationManifestId = typeof PresentationManifestIdSchema.static;
export type PrivateClueId = typeof PrivateClueIdSchema.static;
export type CorrectionRequestId = typeof CorrectionRequestIdSchema.static;
