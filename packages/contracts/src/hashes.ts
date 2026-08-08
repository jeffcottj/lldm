import { Type, type Static } from "@sinclair/typebox";

const SHA256_PATTERN = "^sha256:[0-9a-f]{64}$";

function sha256Schema(identifier: string) {
  return Type.String({
    $id: `lldm.hash.${identifier}`,
    pattern: SHA256_PATTERN,
  });
}

export const StateHashSchema = sha256Schema("state");
export const CommandHashSchema = sha256Schema("command");
export const ContentDefinitionHashSchema = sha256Schema("content_definition");
export const ContentManifestHashSchema = sha256Schema("content_manifest");
export const SeedFingerprintSchema = sha256Schema("seed_fingerprint");
export const NonceFingerprintSchema = sha256Schema("nonce_fingerprint");
export const RoomStateHashSchema = sha256Schema("room_state");
export const RoomCommandHashSchema = sha256Schema("room_command");
export const PresentationManifestHashSchema = sha256Schema(
  "presentation_manifest",
);

export type StateHash = Static<typeof StateHashSchema>;
export type CommandHash = Static<typeof CommandHashSchema>;
export type ContentDefinitionHash = Static<typeof ContentDefinitionHashSchema>;
export type ContentManifestHash = Static<typeof ContentManifestHashSchema>;
export type SeedFingerprint = Static<typeof SeedFingerprintSchema>;
export type NonceFingerprint = Static<typeof NonceFingerprintSchema>;
export type RoomStateHash = Static<typeof RoomStateHashSchema>;
export type RoomCommandHash = Static<typeof RoomCommandHashSchema>;
export type PresentationManifestHash = Static<
  typeof PresentationManifestHashSchema
>;
