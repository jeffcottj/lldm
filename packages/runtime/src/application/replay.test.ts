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
  type SceneId,
  type TransactionId,
} from "@lldm/contracts";
import { createEmptyCampaignState } from "@lldm/engine";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { migrateSqliteDatabase } from "../sqlite/migrations.js";
import { SqliteRuntimeStore } from "../sqlite/store.js";
import { CommandCoordinator } from "./coordinator.js";
import {
  auditSqliteCampaignCommands,
  replaySqliteCampaign,
  verifyFullAndSnapshotReplay,
} from "./replay.js";

const campaignId = "campaign_replay_001" as CampaignId;
const temporaryDirectories: string[] = [];
const catalog = {
  content_manifest_hash: PHASE_1_CONTENT_MANIFEST_HASH,
  definitions: PHASE_1_DEFINITIONS,
};

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "lldm-replay-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "campaign.sqlite");
  migrateSqliteDatabase({
    database_path: path,
    committed_at: "2026-08-07T21:00:00.000Z",
  });
  const store = new SqliteRuntimeStore(path);
  store.createCampaign({
    state: createEmptyCampaignState(campaignId, PHASE_1_CONTENT_MANIFEST_HASH),
    seed: Uint8Array.from({ length: 32 }, (_, index) => index + 21),
    created_at: "2026-08-07T21:00:01.000Z",
  });
  let clockCall = 0;
  const coordinator = new CommandCoordinator({
    store,
    content: { resolve: () => catalog },
    clock: {
      now: () =>
        `2026-08-07T21:01:${String(++clockCall).padStart(2, "0")}.000Z`,
    },
  });
  return { coordinator, path, store };
}

function sessionStart(): GameCommand {
  return {
    schema_version: 1,
    command_id: "command_replay_session_001",
    transaction_id: "transaction_replay_session_001",
    campaign_id: campaignId,
    expected_revision: 0,
    kind: "advance_scene",
    payload: {
      scene_id: null,
      next_scene_id: "scene_replay_floodgate_001" as SceneId,
      boundary: "session_start",
    },
  };
}

function materialize(expectedRevision: number): GameCommand {
  const starter = PHASE_1_STARTER_LOADOUTS[0];
  if (starter === undefined) throw new Error("Starter fixture is missing.");
  return {
    schema_version: 1,
    command_id: "command_replay_materialize_001",
    transaction_id: "transaction_replay_materialize_001" as TransactionId,
    campaign_id: campaignId,
    expected_revision: expectedRevision,
    kind: "materialize_character",
    payload: {
      foundation: starter.foundation,
      significant_gear: starter.significant_gear,
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("verified replay and snapshots", () => {
  it("produces byte-identical full and snapshot-plus-tail replay", () => {
    const { coordinator, store } = fixture();
    expect(coordinator.submit(sessionStart()).result_kind).toBe(
      "committed_acceptance",
    );
    expect(store.inspectSnapshots(campaignId)).toMatchObject([
      { revision: 2, trigger: "session_boundary" },
    ]);
    expect(coordinator.submit(materialize(2)).result_kind).toBe(
      "committed_acceptance",
    );
    const full = replaySqliteCampaign(store, campaignId, {
      prefer_snapshot: false,
    });
    const accelerated = verifyFullAndSnapshotReplay(store, campaignId);
    expect(full.success).toBe(true);
    expect(accelerated.success).toBe(true);
    if (full.success && accelerated.success) {
      expect(accelerated.source).toBe("snapshot");
      expect(accelerated.fallback).toBeNull();
      expect(accelerated.state_hash).toBe(full.state_hash);
      expect(canonicalJson(accelerated.state)).toBe(canonicalJson(full.state));
      expect(accelerated.revision).toBe(4);
      expect(accelerated.transaction_count).toBe(2);
      expect(accelerated.event_count).toBe(4);
    }
    store.close();
  });

  it("re-executes stored commands without appending canonical history", () => {
    const { coordinator, store } = fixture();
    expect(coordinator.submit(sessionStart()).result_kind).toBe(
      "committed_acceptance",
    );
    expect(coordinator.submit(materialize(2)).result_kind).toBe(
      "committed_acceptance",
    );
    const revision = store.inspectCampaignStorage(campaignId)?.current_revision;
    expect(
      auditSqliteCampaignCommands({
        store,
        campaign_id: campaignId,
        content: { resolve: () => catalog },
      }),
    ).toEqual({
      compatible: true,
      campaign_id: campaignId,
      transaction_count: 2,
      event_count: 4,
    });
    expect(store.inspectCampaignStorage(campaignId)?.current_revision).toBe(
      revision,
    );
    store.close();
  });

  it("reports a corrupt snapshot and explicitly falls back to full replay", () => {
    const { coordinator, path, store } = fixture();
    expect(coordinator.submit(sessionStart()).result_kind).toBe(
      "committed_acceptance",
    );
    expect(coordinator.submit(materialize(2)).result_kind).toBe(
      "committed_acceptance",
    );
    const before = store.inspectEvents(campaignId);
    store.close();
    const raw = new Database(path);
    raw
      .prepare("UPDATE snapshots SET state_hash = ?")
      .run(`sha256:${"f".repeat(64)}`);
    raw.close();
    const reopened = new SqliteRuntimeStore(path);
    const replay = replaySqliteCampaign(reopened, campaignId);
    expect(replay.success).toBe(true);
    if (replay.success) {
      expect(replay.source).toBe("full");
      expect(replay.fallback?.code).toBe("snapshot.state_hash_mismatch");
    }
    expect(reopened.inspectEvents(campaignId)).toEqual(before);
    reopened.close();
  });

  it("fails at the first changed event and transaction hash boundary", () => {
    for (const corruption of ["event", "transaction"] as const) {
      const { coordinator, path, store } = fixture();
      expect(coordinator.submit(sessionStart()).result_kind).toBe(
        "committed_acceptance",
      );
      store.close();
      const raw = new Database(path);
      if (corruption === "event") {
        const row = raw
          .prepare(
            "SELECT canonical_json FROM events WHERE stream_revision = 1",
          )
          .get() as { canonical_json: string };
        const event = JSON.parse(row.canonical_json) as Record<string, unknown>;
        event.event_id = "event_replay_corrupt_001";
        raw
          .prepare(
            "UPDATE events SET canonical_json = ? WHERE stream_revision = 1",
          )
          .run(canonicalJson(event));
      } else {
        raw
          .prepare(
            "UPDATE transactions SET post_state_hash = ? WHERE first_revision = 1",
          )
          .run(`sha256:${"e".repeat(64)}`);
      }
      raw.close();
      const reopened = new SqliteRuntimeStore(path);
      const replay = replaySqliteCampaign(reopened, campaignId, {
        prefer_snapshot: false,
      });
      expect(replay.success).toBe(false);
      if (!replay.success) {
        expect(replay.diagnostic.code).toBe(
          corruption === "event"
            ? "replay.event_identity_mismatch"
            : "replay.post_state_hash_mismatch",
        );
        expect(replay.diagnostic.revision).toBe(corruption === "event" ? 1 : 2);
      }
      reopened.close();
    }
  });

  it("fails closed for corrupt cached campaign state JSON", () => {
    const { coordinator, path, store } = fixture();
    expect(coordinator.submit(sessionStart()).result_kind).toBe(
      "committed_acceptance",
    );
    store.close();
    const raw = new Database(path);
    raw.prepare("UPDATE campaigns SET state_json = '{}' ").run();
    raw.close();
    const reopened = new SqliteRuntimeStore(path);
    const replay = replaySqliteCampaign(reopened, campaignId, {
      prefer_snapshot: false,
    });
    expect(replay).toMatchObject({
      success: false,
      diagnostic: { code: "replay.campaign_head_mismatch" },
    });
    reopened.close();
  });
});
