import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import {
  GameCommandSchema,
  GameEventSchema,
  canonicalJson,
  taggedSha256,
  type CampaignId,
  type CommandId,
  type CommittedTransactionRecord,
  type GameEvent,
  type GameState,
  type StateHash,
  type TransactionId,
  validateCommittedTransactionRecord,
  validateGameState,
  validateValue,
} from "@lldm/contracts";
import type {
  AtomicCommandStore,
  AtomicCommitInput,
  AtomicStorePort,
  RuntimeCampaignHead,
  RuntimeProjectionDraft,
  StorageReadiness,
  StoredCommandRecord,
} from "../ports/index.js";
import { fingerprintCampaignSeed } from "../randomness/hmac-sha256-v1.js";
import { readMigrationStatus } from "./migrations.js";

interface SqliteSchemaMigrationsTable {
  version: number;
  name: string;
  checksum: string;
  applied_at: string;
  success: number;
}

interface SqliteDatabaseSchema {
  schema_migrations: SqliteSchemaMigrationsTable;
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} contains invalid JSON.`);
  }
}

function hashState(state: GameState): StateHash {
  return taggedSha256(canonicalJson(state)) as StateHash;
}

function parseState(value: string): GameState {
  const result = validateGameState(parseJson(value, "Stored state"));
  if (!result.success) throw new Error("Stored state failed validation.");
  return result.value;
}

function parseEvent(value: string): GameEvent {
  const result = validateValue(
    GameEventSchema,
    parseJson(value, "Stored event"),
  );
  if (!result.success) throw new Error("Stored event failed validation.");
  return result.value;
}

function storageReadiness(database: Database.Database): StorageReadiness {
  const status = readMigrationStatus(database);
  switch (status.status) {
    case "current":
      return { status: "current" };
    case "pending":
      return {
        status: "migration_required",
        safe_detail: `Database requires migration ${status.pending_versions.join(", ")}.`,
      };
    case "failed":
      return {
        status: "recovery_required",
        safe_detail: `Database migration ${status.version} is incomplete.`,
      };
    case "checksum_mismatch":
    case "future":
    case "incompatible":
      return {
        status: "incompatible",
        safe_detail:
          status.status === "incompatible"
            ? status.safe_detail
            : `Database migration status is ${status.status}.`,
      };
  }
}

export interface CreateSqliteCampaignInput {
  readonly state: GameState;
  readonly seed: Uint8Array;
  readonly created_at: string;
}

export class SqliteRuntimeStore implements AtomicStorePort {
  readonly #database: Database.Database;
  readonly #kysely: Kysely<SqliteDatabaseSchema>;
  #closed = false;

  constructor(readonly databasePath: string) {
    this.#database = new Database(databasePath);
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("synchronous = FULL");
    this.#database.pragma("busy_timeout = 5000");
    if (this.#database.pragma("foreign_keys", { simple: true }) !== 1) {
      this.#database.close();
      throw new Error("SQLite foreign-key enforcement is unavailable.");
    }
    const journalMode = this.#database.pragma("journal_mode", {
      simple: true,
    });
    if (journalMode !== "wal") {
      this.#database.close();
      throw new Error("SQLite WAL mode is unavailable for this database.");
    }
    const readiness = storageReadiness(this.#database);
    if (readiness.status !== "current") {
      this.#database.close();
      throw new Error(readiness.safe_detail);
    }
    this.#kysely = new Kysely<SqliteDatabaseSchema>({
      dialect: new SqliteDialect({ database: this.#database }),
    });
  }

  async verifyKyselyAccess(): Promise<void> {
    const result = await sql<{
      integrity_check: string;
    }>`PRAGMA integrity_check`.execute(this.#kysely);
    if (result.rows[0]?.integrity_check !== "ok") {
      throw new Error("Kysely SQLite integrity check failed.");
    }
  }

  createCampaign(input: CreateSqliteCampaignInput): void {
    const state = validateGameState(input.state);
    if (!state.success) throw new Error("Campaign state is invalid.");
    if (input.seed.length !== 32)
      throw new Error("Campaign seed must be 32 bytes.");
    const stateJson = canonicalJson(state.value);
    this.#database
      .prepare(
        `INSERT INTO campaigns(
          campaign_id, schema_version, state_schema_version, current_revision,
          seed, seed_fingerprint, content_manifest_hash, state_json, state_hash, created_at
        ) VALUES (?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        state.value.campaign_id,
        state.value.schema_version,
        state.value.state_schema_version,
        Buffer.from(input.seed),
        fingerprintCampaignSeed(input.seed),
        state.value.content_manifest_hash,
        stateJson,
        hashState(state.value),
        input.created_at,
      );
  }

  inspectCampaign(campaignId: CampaignId): RuntimeCampaignHead | null {
    return this.#loadCampaign(campaignId);
  }

  inspectEvents(campaignId: CampaignId): readonly GameEvent[] {
    return this.#database
      .prepare(
        "SELECT canonical_json FROM events WHERE campaign_id = ? ORDER BY stream_revision",
      )
      .all(campaignId)
      .map((row) =>
        parseEvent((row as { canonical_json: string }).canonical_json),
      );
  }

  inspectProjections(
    campaignId: CampaignId,
  ): readonly RuntimeProjectionDraft[] {
    return this.#database
      .prepare(
        `SELECT audience_kind, audience_key, projection_kind,
          projection_revision AS revision, canonical_json
         FROM projections WHERE campaign_id = ?
         ORDER BY audience_kind, audience_key, projection_kind`,
      )
      .all(campaignId) as RuntimeProjectionDraft[];
  }

  integrityCheck(): string {
    return String(this.#database.pragma("integrity_check", { simple: true }));
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#database.close();
  }

  transact<Result>(operation: (store: AtomicCommandStore) => Result): Result {
    if (this.#closed) throw new Error("SQLite runtime store is closed.");
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = operation({
        readiness: () => storageReadiness(this.#database),
        findCommand: (commandId) => this.#findCommand(commandId),
        transactionIdExists: (transactionId) =>
          this.#transactionIdExists(transactionId),
        loadCampaign: (campaignId) => this.#loadCampaign(campaignId),
        readCampaignSeed: (campaignId) => this.#readCampaignSeed(campaignId),
        commit: (input) => this.#commit(input),
      });
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  #loadCampaign(campaignId: CampaignId): RuntimeCampaignHead | null {
    const row = this.#database
      .prepare(
        `SELECT campaign_id, current_revision, state_json, state_hash
         FROM campaigns WHERE campaign_id = ?`,
      )
      .get(campaignId) as
      | {
          campaign_id: CampaignId;
          current_revision: number;
          state_json: string;
          state_hash: StateHash;
        }
      | undefined;
    if (row === undefined) return null;
    return {
      campaign_id: row.campaign_id,
      revision: row.current_revision,
      state: parseState(row.state_json),
      state_hash: row.state_hash,
    };
  }

  #readCampaignSeed(campaignId: CampaignId): Uint8Array | null {
    const row = this.#database
      .prepare("SELECT seed FROM campaigns WHERE campaign_id = ?")
      .get(campaignId) as { seed: Buffer } | undefined;
    return row === undefined ? null : new Uint8Array(row.seed);
  }

  #transactionIdExists(transactionId: TransactionId): boolean {
    return (
      this.#database
        .prepare("SELECT 1 FROM transactions WHERE transaction_id = ?")
        .get(transactionId) !== undefined
    );
  }

  #findCommand(commandId: CommandId): StoredCommandRecord | null {
    const row = this.#database
      .prepare(
        `SELECT command_id, transaction_id, command_hash, canonical_json, result_json
         FROM commands WHERE command_id = ?`,
      )
      .get(commandId) as
      | {
          command_id: CommandId;
          transaction_id: TransactionId;
          command_hash: StoredCommandRecord["command_hash"];
          canonical_json: string;
          result_json: string;
        }
      | undefined;
    if (row === undefined) return null;
    const result = parseJson(
      row.result_json,
      "Stored command result",
    ) as Record<string, unknown>;
    const command = validateValue(GameCommandSchema, result.command);
    const transaction = validateCommittedTransactionRecord(result.transaction);
    const postState = validateGameState(result.post_state);
    if (!command.success || !transaction.success || !postState.success) {
      throw new Error("Stored command result failed validation.");
    }
    const eventsValue = Array.isArray(result.events) ? result.events : [];
    const events = eventsValue.map((event) => {
      const parsed = validateValue(GameEventSchema, event);
      if (!parsed.success)
        throw new Error("Stored command event failed validation.");
      return parsed.value;
    });
    const projections = Array.isArray(result.projections)
      ? (result.projections as RuntimeProjectionDraft[])
      : [];
    return {
      command_id: row.command_id,
      transaction_id: row.transaction_id,
      command_hash: row.command_hash,
      command_canonical_json: row.canonical_json,
      commit: {
        command: command.value,
        command_canonical_json: row.canonical_json,
        transaction: transaction.value,
        events,
        post_state: postState.value,
        projections,
      },
    };
  }

  #commit(input: AtomicCommitInput): void {
    const stored = input.stored_command;
    const transaction = stored.commit.transaction;
    const campaign = this.#loadCampaign(transaction.campaign_id);
    if (
      campaign === null ||
      campaign.state_hash !== input.pre_state_hash ||
      transaction.first_revision !== campaign.revision + 1 ||
      input.events.at(-1)?.stream_revision !== transaction.last_revision
    ) {
      throw new Error("SQLite commit does not extend the campaign head.");
    }
    if (
      hashState(input.post_state) !== input.post_state_hash ||
      transaction.post_state_hash !== input.post_state_hash
    ) {
      throw new Error("SQLite commit post-state hash is invalid.");
    }
    const resultJson = canonicalJson(stored.commit);
    this.#database
      .prepare(
        `INSERT INTO commands(
          command_id, campaign_id, transaction_id, expected_revision, kind,
          canonical_json, command_hash, outcome, committed_transaction_id, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        stored.command_id,
        transaction.campaign_id,
        stored.transaction_id,
        stored.commit.command.expected_revision,
        stored.commit.command.kind,
        stored.command_canonical_json,
        stored.command_hash,
        transaction.outcome,
        transaction.transaction_id,
        resultJson,
      );
    this.#database
      .prepare(
        `INSERT INTO transactions(
          transaction_id, campaign_id, command_id, first_revision, last_revision,
          event_count, outcome, undo_target_transaction_id, rejection_code, safe_detail,
          pre_state_hash, post_state_hash, post_state_json, committed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        transaction.transaction_id,
        transaction.campaign_id,
        transaction.command_id,
        transaction.first_revision,
        transaction.last_revision,
        transaction.event_count,
        transaction.outcome,
        transaction.outcome === "undo"
          ? transaction.undo_target_transaction_id
          : null,
        transaction.outcome === "rejected" ? transaction.rejection_code : null,
        transaction.outcome === "rejected" ? transaction.safe_detail : null,
        transaction.pre_state_hash,
        transaction.post_state_hash,
        canonicalJson(input.post_state),
        transaction.committed_at,
      );
    const insertEvent = this.#database.prepare(
      `INSERT INTO events(
        campaign_id, stream_revision, event_id, transaction_id,
        transaction_index, caused_by_command_id, kind, canonical_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const event of input.events) {
      insertEvent.run(
        event.campaign_id,
        event.stream_revision,
        event.event_id,
        event.transaction_id,
        event.transaction_index,
        event.caused_by_command_id,
        event.kind,
        canonicalJson(event),
      );
    }
    const upsertProjection = this.#database.prepare(
      `INSERT INTO projections(
        campaign_id, audience_kind, audience_key, projection_kind,
        projection_revision, schema_version, canonical_json, stored_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(campaign_id, audience_kind, audience_key, projection_kind)
      DO UPDATE SET projection_revision = excluded.projection_revision,
        schema_version = excluded.schema_version,
        canonical_json = excluded.canonical_json,
        stored_at = excluded.stored_at`,
    );
    for (const projection of input.projections) {
      if (projection.revision !== transaction.last_revision) {
        throw new Error("Projection revision must equal the transaction head.");
      }
      upsertProjection.run(
        transaction.campaign_id,
        projection.audience_kind,
        projection.audience_key,
        projection.projection_kind,
        projection.revision,
        projection.canonical_json,
        transaction.committed_at,
      );
    }
    const update = this.#database
      .prepare(
        `UPDATE campaigns SET current_revision = ?, state_json = ?, state_hash = ?
         WHERE campaign_id = ? AND current_revision = ? AND state_hash = ?`,
      )
      .run(
        transaction.last_revision,
        canonicalJson(input.post_state),
        input.post_state_hash,
        transaction.campaign_id,
        campaign.revision,
        input.pre_state_hash,
      );
    if (update.changes !== 1) {
      throw new Error("Concurrent SQLite campaign-head update was rejected.");
    }
  }
}
