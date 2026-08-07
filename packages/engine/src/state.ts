import {
  SCHEMA_VERSION,
  STATE_SCHEMA_VERSION,
  type CampaignId,
  type ContentManifestHash,
  type GameState,
} from "@lldm/contracts";

export function createEmptyCampaignState(
  campaignId: CampaignId,
  contentManifestHash: ContentManifestHash,
): GameState {
  return {
    schema_version: SCHEMA_VERSION,
    state_schema_version: STATE_SCHEMA_VERSION,
    record_kind: "game_state",
    campaign_id: campaignId,
    content_manifest_hash: contentManifestHash,
    session_number: 0,
    scene_id: null,
    party: {
      supply: 0,
      supply_maximum: 2,
      characters: [],
    },
    pending_physical_checks: [],
    combat: null,
    challenges: [],
    social_states: [],
    rituals: [],
    permanent_scars: [],
    permanent_deaths: [],
  };
}
