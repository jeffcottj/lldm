import {
  SCHEMA_VERSION,
  type ContentManifest,
  type ContentManifestHash,
  buildSortedManifestEntries,
  hashContentDefinition,
  hashContentManifestEntries,
  validateContentManifest,
} from "@lldm/contracts";
import {
  PHASE_1_DEFINITIONS,
  PHASE_1_HASHED_DEFINITIONS,
} from "../phase-1-catalog.js";
import { PHASE_2_ADDED_DEFINITIONS } from "./mechanical-additions.js";

export const PHASE_2_DEFINITIONS = Object.freeze([
  ...PHASE_1_DEFINITIONS,
  ...PHASE_2_ADDED_DEFINITIONS,
]);
const phase2HashedDefinitions = Object.freeze([
  ...PHASE_1_HASHED_DEFINITIONS,
  ...PHASE_2_ADDED_DEFINITIONS.map((definition) => ({
    definition,
    definition_hash: hashContentDefinition(definition),
  })),
]);

const identity = {
  schema_version: SCHEMA_VERSION,
  content_manifest_id: "content_manifest_phase2_001",
  entries: [...buildSortedManifestEntries(phase2HashedDefinitions)],
};

export const PHASE_2_CONTENT_MANIFEST_HASH = hashContentManifestEntries({
  canonicalization_version: 1,
  manifest: identity,
});

export const PHASE_2_CONTENT_MANIFEST: ContentManifest = Object.freeze({
  ...identity,
  manifest_hash: PHASE_2_CONTENT_MANIFEST_HASH,
});

const validation = validateContentManifest(PHASE_2_CONTENT_MANIFEST);
if (!validation.success)
  throw new Error("Phase 2 content manifest is invalid.");

export function definitionsForPhase2Manifest(hash: ContentManifestHash) {
  return hash === PHASE_2_CONTENT_MANIFEST_HASH
    ? PHASE_2_DEFINITIONS
    : undefined;
}
