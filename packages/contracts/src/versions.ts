import { Type, type Static } from "@sinclair/typebox";

export const SCHEMA_VERSION = 1 as const;
export const PROTOCOL_VERSION = 1 as const;

export const SchemaVersionSchema = Type.Literal(SCHEMA_VERSION);
export const ProtocolVersionSchema = Type.Literal(PROTOCOL_VERSION);

export type SchemaVersion = Static<typeof SchemaVersionSchema>;
export type ProtocolVersion = Static<typeof ProtocolVersionSchema>;
