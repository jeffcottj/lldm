import { type Static, Type } from "@sinclair/typebox";
import { strictObject } from "./envelopes.js";
import { GameStateSchema } from "./game-state.js";
import { ContentManifestHashSchema, StateHashSchema } from "./hashes.js";
import { CampaignIdSchema, SnapshotIdSchema } from "./ids.js";
import { SchemaVersionSchema, StateSchemaVersionSchema } from "./versions.js";

export const SNAPSHOT_TRIGGERS = [
  "scene_transition",
  "session_boundary",
  "event_threshold",
  "checkpoint",
] as const;

export const SnapshotTriggerSchema = Type.Union(
  SNAPSHOT_TRIGGERS.map((trigger) => Type.Literal(trigger)),
);

export const SnapshotRecordSchema = strictObject({
  schema_version: SchemaVersionSchema,
  snapshot_id: SnapshotIdSchema,
  campaign_id: CampaignIdSchema,
  revision: Type.Integer({ minimum: 0 }),
  state_schema_version: StateSchemaVersionSchema,
  content_manifest_hash: ContentManifestHashSchema,
  state_hash: StateHashSchema,
  trigger: SnapshotTriggerSchema,
  state: GameStateSchema,
  stored_at: Type.String({
    pattern:
      "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$",
  }),
});

export type SnapshotTrigger = Static<typeof SnapshotTriggerSchema>;
export type SnapshotRecord = Static<typeof SnapshotRecordSchema>;
