import { Type, type Static } from "@sinclair/typebox";

export const SCHEMA_VERSION = 1 as const;
export const PROTOCOL_VERSION = 1 as const;
export const STORAGE_MIGRATION_VERSION = 2 as const;
export const STATE_SCHEMA_VERSION = 1 as const;
export const ROOM_STATE_SCHEMA_VERSION = 1 as const;
export const GUIDED_PRESENTATION_VERSION = 1 as const;
export const STATE_CANONICALIZATION_VERSION = 1 as const;
export const RANDOMNESS_ALGORITHM_VERSION = "hmac_sha256_v1" as const;

export const SchemaVersionSchema = Type.Literal(SCHEMA_VERSION);
export const ProtocolVersionSchema = Type.Literal(PROTOCOL_VERSION);
export const StorageMigrationVersionSchema = Type.Integer({ minimum: 1 });
export const StateSchemaVersionSchema = Type.Literal(STATE_SCHEMA_VERSION);
export const RoomStateSchemaVersionSchema = Type.Literal(
  ROOM_STATE_SCHEMA_VERSION,
);
export const GuidedPresentationVersionSchema = Type.Literal(
  GUIDED_PRESENTATION_VERSION,
);
export const StateCanonicalizationVersionSchema = Type.Literal(
  STATE_CANONICALIZATION_VERSION,
);
export const RandomnessAlgorithmVersionSchema = Type.Literal(
  RANDOMNESS_ALGORITHM_VERSION,
);
export const ContentDefinitionRevisionSchema = Type.Integer({ minimum: 1 });

export type SchemaVersion = Static<typeof SchemaVersionSchema>;
export type ProtocolVersion = Static<typeof ProtocolVersionSchema>;
export type StorageMigrationVersion = Static<
  typeof StorageMigrationVersionSchema
>;
export type StateSchemaVersion = Static<typeof StateSchemaVersionSchema>;
export type RoomStateSchemaVersion = Static<
  typeof RoomStateSchemaVersionSchema
>;
export type GuidedPresentationVersion = Static<
  typeof GuidedPresentationVersionSchema
>;
export type StateCanonicalizationVersion = Static<
  typeof StateCanonicalizationVersionSchema
>;
export type RandomnessAlgorithmVersion = Static<
  typeof RandomnessAlgorithmVersionSchema
>;
export type ContentDefinitionRevision = Static<
  typeof ContentDefinitionRevisionSchema
>;
