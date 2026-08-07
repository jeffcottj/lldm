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
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { CommandCoordinator } from "../application/coordinator.js";
import { migrateSqliteDatabase } from "./migrations.js";
import { SqliteRuntimeStore } from "./store.js";

const campaignId = "campaign_sqlite_store_001" as CampaignId;
const seed = Uint8Array.from({ length: 32 }, (_, index) => index + 11);
const catalog = {
  content_manifest_hash: PHASE_1_CONTENT_MANIFEST_HASH,
  definitions: PHASE_1_DEFINITIONS,
};
const temporaryDirectories: string[] = [];

function temporaryDatabase(): string {
  const directory = mkdtempSync(join(tmpdir(), "lldm-sqlite-store-"));
  temporaryDirectories.push(directory);
  return join(directory, "campaign.sqlite");
}

function migrate(path: string): void {
  migrateSqliteDatabase({
    database_path: path,
    committed_at: "2026-08-07T20:00:00.000Z",
  });
}

function materializeCommand(input: {
  readonly commandId: string;
  readonly transactionId: string;
  readonly expectedRevision: number;
  readonly displayName?: string;
}): GameCommand {
  const starter = PHASE_1_STARTER_LOADOUTS[0];
  if (starter === undefined) throw new Error("Starter fixture is missing.");
  return {
    schema_version: 1,
    command_id: input.commandId as GameCommand["command_id"],
    transaction_id: input.transactionId as TransactionId,
    campaign_id: campaignId,
    expected_revision: input.expectedRevision,
    kind: "materialize_character",
    payload: {
      foundation: {
        ...starter.foundation,
        ...(input.displayName === undefined
          ? {}
          : { display_name: input.displayName }),
      },
      significant_gear: starter.significant_gear,
    },
  };
}

function coordinator(store: SqliteRuntimeStore): CommandCoordinator {
  return new CommandCoordinator({
    store,
    content: {
      resolve: (hash) =>
        hash === PHASE_1_CONTENT_MANIFEST_HASH ? catalog : null,
    },
    clock: { now: () => "2026-08-07T20:01:00.000Z" },
  });
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite runtime store", () => {
  it("commits, closes, reopens, and returns the exact idempotent result", async () => {
    const path = temporaryDatabase();
    migrate(path);
    const command = materializeCommand({
      commandId: "command_sqlite_retry_001",
      transactionId: "transaction_sqlite_retry_001",
      expectedRevision: 0,
    });
    const firstStore = new SqliteRuntimeStore(path);
    await firstStore.verifyKyselyAccess();
    expect(firstStore.integrityCheck()).toBe("ok");
    firstStore.createCampaign({
      state: createEmptyCampaignState(
        campaignId,
        PHASE_1_CONTENT_MANIFEST_HASH,
      ),
      seed,
      created_at: "2026-08-07T20:00:01.000Z",
    });
    const first = coordinator(firstStore).submit(command);
    expect(first.result_kind).toBe("committed_acceptance");
    firstStore.close();

    const reopened = new SqliteRuntimeStore(path);
    const retry = coordinator(reopened).submit(structuredClone(command));
    expect(retry.result_kind).toBe("idempotent_replay");
    if (
      first.result_kind === "committed_acceptance" &&
      retry.result_kind === "idempotent_replay"
    ) {
      expect(canonicalJson(retry.commit)).toBe(canonicalJson(first.commit));
    }
    expect(reopened.inspectCampaign(campaignId)?.revision).toBe(2);
    expect(reopened.inspectEvents(campaignId)).toHaveLength(2);
    reopened.close();

    const raw = new Database(path);
    expect(raw.pragma("journal_mode", { simple: true })).toBe("wal");
    raw.pragma("foreign_keys = ON");
    expect(raw.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(raw.pragma("foreign_key_check")).toEqual([]);
    raw.close();
  });

  it("rolls back a real immediate transaction when projection fails", () => {
    const path = temporaryDatabase();
    migrate(path);
    const store = new SqliteRuntimeStore(path);
    store.createCampaign({
      state: createEmptyCampaignState(
        campaignId,
        PHASE_1_CONTENT_MANIFEST_HASH,
      ),
      seed,
      created_at: "2026-08-07T20:02:00.000Z",
    });
    const failing = new CommandCoordinator({
      store,
      content: { resolve: () => catalog },
      clock: { now: () => "2026-08-07T20:02:01.000Z" },
      projector: {
        project: () => {
          throw new Error("injected projector failure");
        },
      },
    });
    expect(
      failing.submit(
        materializeCommand({
          commandId: "command_sqlite_rollback_001",
          transactionId: "transaction_sqlite_rollback_001",
          expectedRevision: 0,
        }),
      ).result_kind,
    ).toBe("recovery_required");
    expect(store.inspectCampaign(campaignId)?.revision).toBe(0);
    store.close();
    const raw = new Database(path);
    expect(raw.prepare("SELECT count(*) AS count FROM commands").get()).toEqual(
      { count: 0 },
    );
    expect(
      raw.prepare("SELECT count(*) AS count FROM transactions").get(),
    ).toEqual({ count: 0 });
    expect(raw.prepare("SELECT count(*) AS count FROM events").get()).toEqual({
      count: 0,
    });
    raw.close();
  });

  it("enforces duplicate, causation, transaction-index, and dangling-row constraints", () => {
    const path = temporaryDatabase();
    migrate(path);
    const store = new SqliteRuntimeStore(path);
    store.createCampaign({
      state: createEmptyCampaignState(
        campaignId,
        PHASE_1_CONTENT_MANIFEST_HASH,
      ),
      seed,
      created_at: "2026-08-07T20:03:00.000Z",
    });
    const runtime = coordinator(store);
    expect(
      runtime.submit(
        materializeCommand({
          commandId: "command_sqlite_constraints_001",
          transactionId: "transaction_sqlite_constraints_001",
          expectedRevision: 0,
        }),
      ).result_kind,
    ).toBe("committed_acceptance");
    expect(
      runtime.submit(
        materializeCommand({
          commandId: "command_sqlite_constraints_002",
          transactionId: "transaction_sqlite_constraints_002",
          expectedRevision: 0,
          displayName: "Stale Mara",
        }),
      ).result_kind,
    ).toBe("committed_rejection");
    store.close();

    const raw = new Database(path);
    raw.pragma("foreign_keys = ON");
    expect(() =>
      raw.exec(
        "INSERT INTO commands SELECT * FROM commands WHERE command_id = 'command_sqlite_constraints_001'",
      ),
    ).toThrow();
    expect(() =>
      raw.exec(
        `INSERT INTO events
         SELECT campaign_id, 99, 'event_constraint_duplicate_index', transaction_id,
           transaction_index, caused_by_command_id, kind, canonical_json
         FROM events WHERE stream_revision = 1`,
      ),
    ).toThrow();
    expect(() =>
      raw.exec(
        `INSERT INTO events
         SELECT campaign_id, 99, 'event_constraint_broken_cause',
           'transaction_sqlite_constraints_001', 99,
           'command_sqlite_constraints_002', kind, canonical_json
         FROM events WHERE stream_revision = 1`,
      ),
    ).toThrow();
    expect(() =>
      raw
        .prepare(
          `INSERT INTO snapshots(snapshot_id, campaign_id, revision,
          state_schema_version, content_manifest_hash, state_hash, trigger,
          state_json, stored_at) VALUES (?, ?, 0, 1, ?, ?, ?, ?, ?)`,
        )
        .run(
          "snapshot_dangling_001",
          "campaign_missing_001",
          PHASE_1_CONTENT_MANIFEST_HASH,
          `sha256:${"0".repeat(64)}`,
          "checkpoint",
          "{}",
          "2026-08-07T20:03:01.000Z",
        ),
    ).toThrow();
    expect(raw.pragma("foreign_key_check")).toEqual([]);
    raw.close();
  });

  it("revalidates canonical command, event, result, and state data on read", () => {
    const path = temporaryDatabase();
    migrate(path);
    const store = new SqliteRuntimeStore(path);
    store.createCampaign({
      state: createEmptyCampaignState(
        campaignId,
        PHASE_1_CONTENT_MANIFEST_HASH,
      ),
      seed,
      created_at: "2026-08-07T20:04:00.000Z",
    });
    const command = materializeCommand({
      commandId: "command_sqlite_validation_001",
      transactionId: "transaction_sqlite_validation_001",
      expectedRevision: 0,
    });
    expect(coordinator(store).submit(command).result_kind).toBe(
      "committed_acceptance",
    );
    store.close();
    const raw = new Database(path);
    raw
      .prepare("UPDATE campaigns SET state_hash = ? WHERE campaign_id = ?")
      .run(`sha256:${"f".repeat(64)}`, campaignId);
    raw.close();
    const corrupt = new SqliteRuntimeStore(path);
    expect(() => corrupt.inspectCampaign(campaignId)).toThrow(
      "failed hash or identity validation",
    );
    corrupt.close();
  });
});
