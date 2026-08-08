import {
  GUIDED_PRESENTATION_VERSION,
  SCHEMA_VERSION,
  type GuidedPresentationManifest,
  type NormalizedMapLayout,
  type PresentationManifestHash,
  canonicalJson,
  taggedSha256,
  validateGuidedPresentationManifest,
} from "@lldm/contracts";
import { PHASE_2_CONTENT_MANIFEST_HASH } from "./manifest.js";
import { FLOODGATE_GUIDED_BEATS } from "./guided-slice.js";
import { PHASE_2_STARTER_SUMMARIES } from "./starter-loadouts.js";

const mapLayout: NormalizedMapLayout = {
  layout_id: "layout_floodgate_001",
  zones: [
    {
      zone_id: "zone_gate_controls_001",
      x: 6,
      y: 10,
      width: 26,
      height: 26,
      shape: "rect",
    },
    {
      zone_id: "zone_lower_causeway_001",
      x: 8,
      y: 58,
      width: 28,
      height: 25,
      shape: "rect",
    },
    {
      zone_id: "zone_pump_gallery_001",
      x: 40,
      y: 54,
      width: 25,
      height: 30,
      shape: "rect",
    },
    {
      zone_id: "zone_bell_chamber_001",
      x: 70,
      y: 34,
      width: 24,
      height: 30,
      shape: "ellipse",
    },
    {
      zone_id: "zone_spillway_walk_001",
      x: 42,
      y: 8,
      width: 26,
      height: 24,
      shape: "rect",
    },
  ],
  connections: [
    { from: "zone_gate_controls_001", to: "zone_lower_causeway_001" },
    { from: "zone_gate_controls_001", to: "zone_spillway_walk_001" },
    { from: "zone_lower_causeway_001", to: "zone_pump_gallery_001" },
    { from: "zone_pump_gallery_001", to: "zone_bell_chamber_001" },
    { from: "zone_bell_chamber_001", to: "zone_spillway_walk_001" },
  ],
};

const narrationTemplates = FLOODGATE_GUIDED_BEATS.map((beat) => ({
  template_id: `template_${beat.beat_id}`,
  text: beat.public_text,
}));

const identity = {
  schema_version: SCHEMA_VERSION,
  guided_presentation_version: GUIDED_PRESENTATION_VERSION,
  presentation_manifest_id: "presentation_manifest_floodgate_001",
  mechanical_manifest_hash: PHASE_2_CONTENT_MANIFEST_HASH,
  start_beat_id: "guided_beat_opening_001",
  beats: [...FLOODGATE_GUIDED_BEATS],
  map_layout: mapLayout,
  narration_templates: narrationTemplates,
  starter_summaries: [...PHASE_2_STARTER_SUMMARIES],
};

export const PHASE_2_PRESENTATION_MANIFEST_HASH = taggedSha256(
  canonicalJson(identity),
) as PresentationManifestHash;

export const PHASE_2_PRESENTATION_MANIFEST: GuidedPresentationManifest =
  Object.freeze({
    ...identity,
    presentation_manifest_hash: PHASE_2_PRESENTATION_MANIFEST_HASH,
  });

const validation = validateGuidedPresentationManifest(
  PHASE_2_PRESENTATION_MANIFEST,
);
if (!validation.success)
  throw new Error(
    `Phase 2 presentation manifest is invalid: ${validation.issues.map(({ code }) => code).join(",")}`,
  );
