import Database from "better-sqlite3";
import { Kysely, SqliteDialect, sql } from "kysely";
import {
  GameCommandSchema,
  GameEventSchema,
  canonicalJson,
  type CampaignId,
  type CommandId,
  type CommittedTransactionRecord,
  type GameEvent,
  type GameState,
  ProjectionSchema,
  SCHEMA_VERSION,
  sha256Hex,
  type SnapshotRecord,
  SnapshotRecordSchema,
  type StateHash,
  taggedSha256,
  type TransactionId,
  validateCommittedTransactionRecord,
  validateGameState,
  validateValue,
} from "@lldm/contracts";
import { canonicalStateJson, hashGameState } from "../hashing/state-hash.js";
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

export const SNAPSHOT_EVENT_THRESHOLD = 100 as const;

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

function parseCommand(value: string) {
  const result = validateValue(
    GameCommandSchema,
    parseJson(value, "Stored command"),
  );
  if (!result.success) throw new Error("Stored command failed validation.");
  return result.value;
}

function validateProjectionDraft(value: unknown): RuntimeProjectionDraft {
  if (typeof value !== "object" || value === null) {
    throw new Error("Stored projection failed validation.");
  }
  const draft = value as Partial<RuntimeProjectionDraft>;
  if (
    !["public", "seat_private", "host_control"].includes(
      String(draft.audience_kind),
    ) ||
    typeof draft.audience_key !== "string" ||
    typeof draft.projection_kind !== "string" ||
    !Number.isInteger(draft.revision) ||
    Number(draft.revision) < 0 ||
    typeof draft.canonical_json !== "string"
  ) {
    throw new Error("Stored projection failed validation.");
  }
  const projection = validateValue(
    ProjectionSchema,
    parseJson(draft.canonical_json, "Stored projection payload"),
  );
  if (
    !projection.success ||
    projection.value.kind !== draft.projection_kind ||
    projection.value.revision !== draft.revision ||
    canonicalJson(projection.value) !== draft.canonical_json
  ) {
    throw new Error("Stored projection payload failed validation.");
  }
  return draft as RuntimeProjectionDraft;
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

export interface SqliteCampaignStorageRecord {
  readonly campaign_id: CampaignId;
  readonly current_revision: number;
  readonly content_manifest_hash: GameState["content_manifest_hash"];
  readonly state_json: string;
  readonly state_hash: StateHash;
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
        hashGameState(state.value),
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

  inspectTransactions(
    campaignId: CampaignId,
  ): readonly CommittedTransactionRecord[] {
    return this.#database
      .prepare(
        `SELECT t.*, c.command_hash
         FROM transactions t JOIN commands c ON c.command_id = t.command_id
         WHERE t.campaign_id = ? ORDER BY t.first_revision`,
      )
      .all(campaignId)
      .map((unknownRow) => {
        const row = unknownRow as Record<string, unknown>;
        const candidate = {
          schema_version: SCHEMA_VERSION,
          campaign_id: row.campaign_id,
          command_id: row.command_id,
          command_hash: row.command_hash,
          transaction_id: row.transaction_id,
          first_revision: row.first_revision,
          last_revision: row.last_revision,
          event_count: row.event_count,
          pre_state_hash: row.pre_state_hash,
          post_state_hash: row.post_state_hash,
          committed_at: row.committed_at,
          ...(row.outcome === "rejected"
            ? {
                outcome: "rejected",
                rejection_code: row.rejection_code,
                safe_detail: row.safe_detail,
              }
            : row.outcome === "undo"
              ? {
                  outcome: "undo",
                  undo_target_transaction_id: row.undo_target_transaction_id,
                }
              : { outcome: "accepted" }),
        };
        const validated = validateCommittedTransactionRecord(candidate);
        if (!validated.success) {
          throw new Error("Stored transaction failed validation.");
        }
        return validated.value;
      });
  }

  inspectCommands(
    campaignId: CampaignId,
  ): readonly ReturnType<typeof parseCommand>[] {
    return this.#database
      .prepare(
        `SELECT c.canonical_json FROM commands c
         JOIN transactions t ON t.command_id = c.command_id
         WHERE c.campaign_id = ? ORDER BY t.first_revision`,
      )
      .all(campaignId)
      .map((row) =>
        parseCommand((row as { canonical_json: string }).canonical_json),
      );
  }

  readCampaignSeedForAudit(campaignId: CampaignId): Uint8Array | null {
    return this.#readCampaignSeed(campaignId);
  }

  inspectSnapshots(campaignId: CampaignId): readonly SnapshotRecord[] {
    return this.#database
      .prepare(
        `SELECT snapshot_id, campaign_id, revision, state_schema_version,
          content_manifest_hash, state_hash, trigger, state_json, stored_at
         FROM snapshots WHERE campaign_id = ? ORDER BY revision DESC`,
      )
      .all(campaignId)
      .map((unknownRow) => {
        const row = unknownRow as Record<string, unknown>;
        const validated = validateValue(SnapshotRecordSchema, {
          schema_version: SCHEMA_VERSION,
          snapshot_id: row.snapshot_id,
          campaign_id: row.campaign_id,
          revision: row.revision,
          state_schema_version: row.state_schema_version,
          content_manifest_hash: row.content_manifest_hash,
          state_hash: row.state_hash,
          trigger: row.trigger,
          state: parseJson(String(row.state_json), "Stored snapshot state"),
          stored_at: row.stored_at,
        });
        if (!validated.success) {
          throw new Error("Stored snapshot failed validation.");
        }
        return validated.value;
      });
  }

  inspectCampaignStorage(
    campaignId: CampaignId,
  ): SqliteCampaignStorageRecord | null {
    const row = this.#database
      .prepare(
        `SELECT campaign_id, current_revision, content_manifest_hash,
          state_json, state_hash FROM campaigns WHERE campaign_id = ?`,
      )
      .get(campaignId) as SqliteCampaignStorageRecord | undefined;
    return row ?? null;
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
      .all(campaignId)
      .map(validateProjectionDraft);
  }

  replaceProjections(
    campaignId: CampaignId,
    projections: readonly RuntimeProjectionDraft[],
    storedAt: string,
  ): {
    readonly byte_identical: boolean;
    readonly previous_count: number;
    readonly replacement_count: number;
  } {
    if (this.#closed) throw new Error("SQLite runtime store is closed.");
    const campaign = this.#loadCampaign(campaignId);
    if (campaign === null) throw new Error("Projection campaign is missing.");
    const validated = projections
      .map(validateProjectionDraft)
      .toSorted((a, b) =>
        [a.audience_kind, a.audience_key, a.projection_kind]
          .join("\u0000")
          .localeCompare(
            [b.audience_kind, b.audience_key, b.projection_kind].join("\u0000"),
          ),
      );
    if (validated.some(({ revision }) => revision !== campaign.revision)) {
      throw new Error("Projection revision must equal the campaign head.");
    }
    const previous = this.inspectProjections(campaignId);
    const byteIdentical = canonicalJson(previous) === canonicalJson(validated);
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      this.#database
        .prepare("DELETE FROM projections WHERE campaign_id = ?")
        .run(campaignId);
      const insert = this.#database.prepare(
        `INSERT INTO projections(campaign_id, audience_kind, audience_key,
          projection_kind, projection_revision, schema_version,
          canonical_json, stored_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      );
      for (const projection of validated) {
        insert.run(
          campaignId,
          projection.audience_kind,
          projection.audience_key,
          projection.projection_kind,
          projection.revision,
          projection.canonical_json,
          storedAt,
        );
      }
      this.#database.exec("COMMIT");
    } catch (error) {
      this.#database.exec("ROLLBACK");
      throw error;
    }
    return {
      byte_identical: byteIdentical,
      previous_count: previous.length,
      replacement_count: validated.length,
    };
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
        loadUndoCandidate: (campaignId, targetTransactionId) =>
          this.#loadUndoCandidate(campaignId, targetTransactionId),
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
    const state = parseState(row.state_json);
    if (
      state.campaign_id !== row.campaign_id ||
      hashGameState(state) !== row.state_hash
    ) {
      throw new Error(
        "Stored campaign head failed hash or identity validation.",
      );
    }
    return {
      campaign_id: row.campaign_id,
      revision: row.current_revision,
      state,
      state_hash: row.state_hash,
    };
  }

  #readCampaignSeed(campaignId: CampaignId): Uint8Array | null {
    const row = this.#database
      .prepare("SELECT seed FROM campaigns WHERE campaign_id = ?")
      .get(campaignId) as { seed: Buffer } | undefined;
    return row === undefined ? null : new Uint8Array(row.seed);
  }

  #loadUndoCandidate(
    campaignId: CampaignId,
    targetTransactionId: TransactionId | null,
  ): ReturnType<AtomicCommandStore["loadUndoCandidate"]> {
    const latest = this.inspectTransactions(campaignId)
      .filter(
        (transaction) =>
          transaction.outcome !== "rejected" &&
          transaction.pre_state_hash !== transaction.post_state_hash,
      )
      .at(-1);
    if (latest === undefined) return { status: "none" };
    if (
      targetTransactionId !== null &&
      targetTransactionId !== latest.transaction_id
    ) {
      return {
        status: "target_not_latest",
        latest_transaction_id: latest.transaction_id,
      };
    }
    return {
      status: "found",
      candidate: {
        transaction: latest,
        events: this.inspectEvents(campaignId).filter(
          ({ transaction_id }) => transaction_id === latest.transaction_id,
        ),
        already_compensated:
          this.#database
            .prepare(
              `SELECT 1 FROM transactions
               WHERE campaign_id = ? AND outcome = 'undo'
                 AND undo_target_transaction_id = ?`,
            )
            .get(campaignId, latest.transaction_id) !== undefined,
      },
    };
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
    const storedCommand = parseCommand(row.canonical_json);
    if (
      storedCommand.command_id !== row.command_id ||
      storedCommand.transaction_id !== row.transaction_id ||
      taggedSha256(row.canonical_json) !== row.command_hash ||
      canonicalJson(storedCommand) !== row.canonical_json
    ) {
      throw new Error("Stored command identity or hash is invalid.");
    }
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
      ? result.projections.map(validateProjectionDraft)
      : [];
    if (
      canonicalJson(command.value) !== row.canonical_json ||
      transaction.value.command_id !== row.command_id ||
      transaction.value.transaction_id !== row.transaction_id ||
      postState.value.campaign_id !== transaction.value.campaign_id ||
      hashGameState(postState.value) !== transaction.value.post_state_hash ||
      events.length !== transaction.value.event_count ||
      events.some(
        (event, index) =>
          event.campaign_id !== transaction.value.campaign_id ||
          event.transaction_id !== transaction.value.transaction_id ||
          event.caused_by_command_id !== transaction.value.command_id ||
          event.transaction_index !== index ||
          event.stream_revision !== transaction.value.first_revision + index,
      )
    ) {
      throw new Error("Stored command result relationships are invalid.");
    }
    const persistedTransaction = this.#database
      .prepare(
        `SELECT post_state_json, post_state_hash FROM transactions
         WHERE transaction_id = ? AND command_id = ?`,
      )
      .get(row.transaction_id, row.command_id) as
      | { post_state_json: string; post_state_hash: StateHash }
      | undefined;
    if (
      persistedTransaction === undefined ||
      persistedTransaction.post_state_hash !==
        transaction.value.post_state_hash ||
      persistedTransaction.post_state_json !== canonicalJson(postState.value)
    ) {
      throw new Error("Stored transaction does not match its command result.");
    }
    const persistedEvents = this.#database
      .prepare(
        "SELECT canonical_json FROM events WHERE transaction_id = ? ORDER BY transaction_index",
      )
      .all(row.transaction_id) as Array<{ canonical_json: string }>;
    if (
      persistedEvents.length !== events.length ||
      persistedEvents.some(
        (event, index) => event.canonical_json !== canonicalJson(events[index]),
      )
    ) {
      throw new Error("Stored events do not match their command result.");
    }
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
      transaction.pre_state_hash !== input.pre_state_hash ||
      transaction.first_revision !== campaign.revision + 1 ||
      transaction.event_count !== input.events.length ||
      input.events.at(-1)?.stream_revision !== transaction.last_revision ||
      transaction.command_id !== stored.command_id ||
      transaction.transaction_id !== stored.transaction_id ||
      input.post_state.campaign_id !== transaction.campaign_id
    ) {
      throw new Error("SQLite commit does not extend the campaign head.");
    }
    if (
      hashGameState(input.post_state) !== input.post_state_hash ||
      transaction.post_state_hash !== input.post_state_hash
    ) {
      throw new Error("SQLite commit post-state hash is invalid.");
    }
    input.events.forEach((event, index) => {
      if (
        event.campaign_id !== transaction.campaign_id ||
        event.transaction_id !== transaction.transaction_id ||
        event.caused_by_command_id !== transaction.command_id ||
        event.transaction_index !== index ||
        event.stream_revision !== transaction.first_revision + index
      ) {
        throw new Error("SQLite commit event relationships are invalid.");
      }
    });
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
        canonicalStateJson(input.post_state),
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
    this.#database
      .prepare("DELETE FROM projections WHERE campaign_id = ?")
      .run(transaction.campaign_id);
    for (const projection of input.projections) {
      validateProjectionDraft(projection);
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
    this.#writeTriggeredSnapshot(input);
  }

  #writeTriggeredSnapshot(input: AtomicCommitInput): void {
    const transaction = input.stored_command.commit.transaction;
    const sceneReset = input.events.find(
      (event) => event.kind === "scene_resources_reset",
    );
    const lastSnapshot = this.#database
      .prepare(
        "SELECT max(revision) AS revision FROM snapshots WHERE campaign_id = ?",
      )
      .get(transaction.campaign_id) as { revision: number | null };
    const sinceSnapshot =
      transaction.last_revision - (lastSnapshot.revision ?? 0);
    const trigger =
      sceneReset?.kind === "scene_resources_reset"
        ? sceneReset.payload.boundary === "session_start"
          ? "session_boundary"
          : "scene_transition"
        : sinceSnapshot >= SNAPSHOT_EVENT_THRESHOLD
          ? "event_threshold"
          : null;
    if (trigger === null) return;
    const snapshotId = `snapshot_${sha256Hex(
      `snapshot\u0000${transaction.transaction_id}\u0000${transaction.last_revision}`,
    ).slice(0, 32)}`;
    const candidate = {
      schema_version: SCHEMA_VERSION,
      snapshot_id: snapshotId,
      campaign_id: transaction.campaign_id,
      revision: transaction.last_revision,
      state_schema_version: input.post_state.state_schema_version,
      content_manifest_hash: input.post_state.content_manifest_hash,
      state_hash: input.post_state_hash,
      trigger,
      state: input.post_state,
      stored_at: transaction.committed_at,
    };
    const validated = validateValue(SnapshotRecordSchema, candidate);
    if (!validated.success) {
      throw new Error("Triggered snapshot failed validation.");
    }
    this.#database
      .prepare(
        `INSERT INTO snapshots(snapshot_id, campaign_id, revision,
          state_schema_version, content_manifest_hash, state_hash, trigger,
          state_json, stored_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        validated.value.snapshot_id,
        validated.value.campaign_id,
        validated.value.revision,
        validated.value.state_schema_version,
        validated.value.content_manifest_hash,
        validated.value.state_hash,
        validated.value.trigger,
        canonicalStateJson(validated.value.state),
        validated.value.stored_at,
      );
  }
}
