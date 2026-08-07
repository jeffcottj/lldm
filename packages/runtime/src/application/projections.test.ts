import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PHASE_1_CONTENT_MANIFEST_HASH,
  PHASE_1_DEFINITIONS,
  PHASE_1_STARTER_LOADOUTS,
} from "@lldm/content";
import {
  canonicalJson,
  type CampaignId,
  type GameCommand,
  type TransactionId,
} from "@lldm/contracts";
import { createEmptyCampaignState } from "@lldm/engine";
import { afterEach, describe, expect, it } from "vitest";
import { migrateSqliteDatabase } from "../sqlite/migrations.js";
import { SqliteRuntimeStore } from "../sqlite/store.js";
import { CommandCoordinator } from "./coordinator.js";
import { rebuildSqliteProjections } from "./projections.js";

const campaignId = "campaign_projection_001" as CampaignId;
const temporaryDirectories: string[] = [];
const catalog = {
  content_manifest_hash: PHASE_1_CONTENT_MANIFEST_HASH,
  definitions: PHASE_1_DEFINITIONS,
};

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "lldm-projection-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "campaign.sqlite");
  migrateSqliteDatabase({
    database_path: path,
    committed_at: "2026-08-07T22:00:00.000Z",
  });
  const store = new SqliteRuntimeStore(path);
  store.createCampaign({
    state: createEmptyCampaignState(campaignId, PHASE_1_CONTENT_MANIFEST_HASH),
    seed: Uint8Array.from({ length: 32 }, (_, index) => index + 31),
    created_at: "2026-08-07T22:00:01.000Z",
  });
  let call = 0;
  const coordinator = new CommandCoordinator({
    store,
    content: { resolve: () => catalog },
    clock: {
      now: () => `2026-08-07T22:01:${String(++call).padStart(2, "0")}.000Z`,
    },
  });
  return { coordinator, store };
}

function materialize(): GameCommand {
  const starter = PHASE_1_STARTER_LOADOUTS[0];
  if (starter === undefined) throw new Error("Starter fixture is missing.");
  return {
    schema_version: 1,
    command_id: "command_projection_materialize_001",
    transaction_id: "transaction_projection_materialize_001" as TransactionId,
    campaign_id: campaignId,
    expected_revision: 0,
    kind: "materialize_character",
    payload: {
      foundation: starter.foundation,
      significant_gear: starter.significant_gear,
    },
  };
}

function establishSocialState(expectedRevision: number): GameCommand {
  return {
    schema_version: 1,
    command_id: "command_projection_social_001",
    transaction_id: "transaction_projection_social_001",
    campaign_id: campaignId,
    expected_revision: expectedRevision,
    kind: "establish_social_state",
    payload: {
      social_state: {
        schema_version: 1,
        record_kind: "social_state",
        npc_actor_id: "actor_projection_npc_001",
        definition: {
          content_definition_id: "content_social_gatewarden_nera_001",
          definition_revision: 1,
        },
        motives: [
          { text: "Keep the lower ward safe.", visibility: "public" },
          {
            text: "Restore trust in the gate crew.",
            visibility: "seat_private",
          },
        ],
        fears: [
          {
            text: "The old flood will repeat on her watch.",
            visibility: "host_control",
          },
        ],
        stance: "guarded",
        leverage: [],
        leverage_capacity: 2,
        hard_limits: [
          {
            social_limit_id: "social_limit_projection_public_001",
            statement: {
              text: "Never abandon the gate while its alarm sounds.",
              visibility: "public",
            },
          },
        ],
      },
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("transactional projections and visibility", () => {
  it("advances every view on acceptance and rejection without public leakage", () => {
    const { coordinator, store } = fixture();
    expect(coordinator.submit(materialize()).result_kind).toBe(
      "committed_acceptance",
    );
    expect(coordinator.submit(establishSocialState(2)).result_kind).toBe(
      "committed_acceptance",
    );
    const projections = store.inspectProjections(campaignId);
    expect(projections.every(({ revision }) => revision === 4)).toBe(true);
    const publicView = projections.find(
      ({ audience_kind }) => audience_kind === "public",
    );
    const hostView = projections.find(
      ({ audience_kind }) => audience_kind === "host_control",
    );
    expect(publicView?.canonical_json).toContain("Keep the lower ward safe.");
    expect(publicView?.canonical_json).not.toContain(
      "Restore trust in the gate crew.",
    );
    expect(publicView?.canonical_json).not.toContain(
      "The old flood will repeat on her watch.",
    );
    expect(hostView?.canonical_json).toContain(
      "Restore trust in the gate crew.",
    );
    expect(hostView?.canonical_json).toContain(
      "The old flood will repeat on her watch.",
    );

    const stale = coordinator.submit({
      ...materialize(),
      command_id: "command_projection_stale_001",
      transaction_id: "transaction_projection_stale_001",
      expected_revision: 0,
    });
    expect(stale.result_kind).toBe("committed_rejection");
    expect(
      store
        .inspectProjections(campaignId)
        .every(({ revision }) => revision === 5),
    ).toBe(true);
    store.close();
  });

  it("rebuilds byte-identically without changing canonical rows or hashes", () => {
    const { coordinator, store } = fixture();
    expect(coordinator.submit(materialize()).result_kind).toBe(
      "committed_acceptance",
    );
    const before = {
      events: canonicalJson(store.inspectEvents(campaignId)),
      transactions: canonicalJson(store.inspectTransactions(campaignId)),
      snapshots: canonicalJson(store.inspectSnapshots(campaignId)),
      campaign: canonicalJson(store.inspectCampaignStorage(campaignId)),
      projections: canonicalJson(store.inspectProjections(campaignId)),
    };
    const rebuilt = rebuildSqliteProjections({
      store,
      campaign_id: campaignId,
      catalog,
      stored_at: "2026-08-07T22:05:00.000Z",
    });
    expect(rebuilt).toMatchObject({
      success: true,
      revision: 2,
      byte_identical: true,
    });
    expect(canonicalJson(store.inspectProjections(campaignId))).toBe(
      before.projections,
    );
    expect(canonicalJson(store.inspectEvents(campaignId))).toBe(before.events);
    expect(canonicalJson(store.inspectTransactions(campaignId))).toBe(
      before.transactions,
    );
    expect(canonicalJson(store.inspectSnapshots(campaignId))).toBe(
      before.snapshots,
    );
    expect(canonicalJson(store.inspectCampaignStorage(campaignId))).toBe(
      before.campaign,
    );
    store.close();
  });
});
