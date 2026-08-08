import type {
  ContentDefinition,
  ContentManifest,
  ContentManifestHash,
} from "@lldm/contracts";
import {
  PHASE_1_CONTENT_MANIFEST,
  PHASE_1_CONTENT_MANIFEST_HASH,
  PHASE_1_DEFINITIONS,
} from "./phase-1-catalog.js";
import {
  PHASE_2_CONTENT_MANIFEST,
  PHASE_2_CONTENT_MANIFEST_HASH,
  PHASE_2_DEFINITIONS,
} from "./phase-2/manifest.js";

export const ALL_CONTENT_MANIFESTS_BY_HASH: Readonly<
  Record<string, ContentManifest>
> = Object.freeze({
  [PHASE_1_CONTENT_MANIFEST_HASH]: PHASE_1_CONTENT_MANIFEST,
  [PHASE_2_CONTENT_MANIFEST_HASH]: PHASE_2_CONTENT_MANIFEST,
});

export function definitionsForAnyManifest(
  hash: ContentManifestHash,
): readonly ContentDefinition[] | undefined {
  if (hash === PHASE_1_CONTENT_MANIFEST_HASH) return PHASE_1_DEFINITIONS;
  if (hash === PHASE_2_CONTENT_MANIFEST_HASH) return PHASE_2_DEFINITIONS;
  return undefined;
}
