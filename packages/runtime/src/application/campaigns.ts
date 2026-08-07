import { randomBytes } from "node:crypto";
import { PHASE_1_CONTENT_MANIFEST_HASH } from "@lldm/content";
import type { CampaignId } from "@lldm/contracts";
import { createEmptyCampaignState } from "@lldm/engine";
import type { SqliteRuntimeStore } from "../sqlite/store.js";
import { fingerprintCampaignSeed } from "../randomness/hmac-sha256-v1.js";

export function createPhase1Campaign(input: {
  readonly store: SqliteRuntimeStore;
  readonly campaign_id: CampaignId;
  readonly created_at: string;
  readonly fixture_seed_hex?: string;
}) {
  let seed: Uint8Array;
  if (input.fixture_seed_hex === undefined) {
    seed = randomBytes(32);
  } else {
    if (!/^[0-9a-f]{64}$/.test(input.fixture_seed_hex)) {
      throw new Error("Fixture seed must be exactly 64 lowercase hex digits.");
    }
    seed = Uint8Array.from(Buffer.from(input.fixture_seed_hex, "hex"));
  }
  input.store.createCampaign({
    state: createEmptyCampaignState(
      input.campaign_id,
      PHASE_1_CONTENT_MANIFEST_HASH,
    ),
    seed,
    created_at: input.created_at,
  });
  return {
    campaign_id: input.campaign_id,
    content_manifest_hash: PHASE_1_CONTENT_MANIFEST_HASH,
    seed_fingerprint: fingerprintCampaignSeed(seed),
    revision: 0,
    fixture_seed: input.fixture_seed_hex !== undefined,
  };
}
