import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { basename, dirname, join } from "node:path";
import Database from "better-sqlite3";
import { taggedSha256 } from "@lldm/contracts";

const MIGRATION_1_SQL = `
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL UNIQUE,
  checksum TEXT NOT NULL CHECK (checksum GLOB 'sha256:[0-9a-f]*' AND length(checksum) = 71),
  applied_at TEXT NOT NULL,
  success INTEGER NOT NULL CHECK (success IN (0, 1))
) STRICT;

CREATE TABLE campaigns (
  campaign_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  state_schema_version INTEGER NOT NULL CHECK (state_schema_version = 1),
  current_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
  seed BLOB NOT NULL CHECK (length(seed) = 32),
  seed_fingerprint TEXT NOT NULL CHECK (seed_fingerprint GLOB 'sha256:[0-9a-f]*' AND length(seed_fingerprint) = 71),
  content_manifest_hash TEXT NOT NULL CHECK (content_manifest_hash GLOB 'sha256:[0-9a-f]*' AND length(content_manifest_hash) = 71),
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  state_hash TEXT NOT NULL CHECK (state_hash GLOB 'sha256:[0-9a-f]*' AND length(state_hash) = 71),
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE commands (
  command_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE RESTRICT,
  transaction_id TEXT NOT NULL UNIQUE,
  expected_revision INTEGER NOT NULL CHECK (expected_revision >= 0),
  kind TEXT NOT NULL,
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  command_hash TEXT NOT NULL CHECK (command_hash GLOB 'sha256:[0-9a-f]*' AND length(command_hash) = 71),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'undo')),
  committed_transaction_id TEXT NOT NULL UNIQUE,
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  UNIQUE (campaign_id, command_id),
  CHECK (committed_transaction_id = transaction_id)
) STRICT;

CREATE TABLE transactions (
  transaction_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE RESTRICT,
  command_id TEXT NOT NULL UNIQUE,
  first_revision INTEGER NOT NULL CHECK (first_revision > 0),
  last_revision INTEGER NOT NULL CHECK (last_revision >= first_revision),
  event_count INTEGER NOT NULL CHECK (event_count > 0 AND event_count = last_revision - first_revision + 1),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected', 'undo')),
  undo_target_transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
  rejection_code TEXT,
  safe_detail TEXT,
  pre_state_hash TEXT NOT NULL CHECK (pre_state_hash GLOB 'sha256:[0-9a-f]*' AND length(pre_state_hash) = 71),
  post_state_hash TEXT NOT NULL CHECK (post_state_hash GLOB 'sha256:[0-9a-f]*' AND length(post_state_hash) = 71),
  post_state_json TEXT NOT NULL CHECK (json_valid(post_state_json)),
  committed_at TEXT NOT NULL,
  UNIQUE (campaign_id, first_revision),
  UNIQUE (campaign_id, last_revision),
  UNIQUE (campaign_id, transaction_id),
  UNIQUE (transaction_id, command_id, campaign_id),
  FOREIGN KEY (campaign_id, command_id) REFERENCES commands(campaign_id, command_id) ON DELETE RESTRICT,
  CHECK ((outcome = 'rejected' AND rejection_code IS NOT NULL AND safe_detail IS NOT NULL AND pre_state_hash = post_state_hash) OR (outcome <> 'rejected' AND rejection_code IS NULL AND safe_detail IS NULL)),
  CHECK ((outcome = 'undo' AND undo_target_transaction_id IS NOT NULL) OR (outcome <> 'undo' AND undo_target_transaction_id IS NULL))
) STRICT;

CREATE TABLE events (
  campaign_id TEXT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE RESTRICT,
  stream_revision INTEGER NOT NULL CHECK (stream_revision > 0),
  event_id TEXT NOT NULL UNIQUE,
  transaction_id TEXT NOT NULL,
  transaction_index INTEGER NOT NULL CHECK (transaction_index >= 0),
  caused_by_command_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  PRIMARY KEY (campaign_id, stream_revision),
  UNIQUE (transaction_id, transaction_index),
  FOREIGN KEY (campaign_id, transaction_id) REFERENCES transactions(campaign_id, transaction_id) ON DELETE RESTRICT,
  FOREIGN KEY (transaction_id, caused_by_command_id, campaign_id) REFERENCES transactions(transaction_id, command_id, campaign_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE snapshots (
  snapshot_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision >= 0),
  state_schema_version INTEGER NOT NULL CHECK (state_schema_version = 1),
  content_manifest_hash TEXT NOT NULL CHECK (content_manifest_hash GLOB 'sha256:[0-9a-f]*' AND length(content_manifest_hash) = 71),
  state_hash TEXT NOT NULL CHECK (state_hash GLOB 'sha256:[0-9a-f]*' AND length(state_hash) = 71),
  trigger TEXT NOT NULL CHECK (trigger IN ('scene_transition', 'session_boundary', 'event_threshold', 'checkpoint')),
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  stored_at TEXT NOT NULL,
  UNIQUE (campaign_id, revision)
) STRICT;

CREATE TABLE projections (
  campaign_id TEXT NOT NULL REFERENCES campaigns(campaign_id) ON DELETE RESTRICT,
  audience_kind TEXT NOT NULL CHECK (audience_kind IN ('public', 'seat_private', 'host_control')),
  audience_key TEXT NOT NULL,
  projection_kind TEXT NOT NULL,
  projection_revision INTEGER NOT NULL CHECK (projection_revision >= 0),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  stored_at TEXT NOT NULL,
  PRIMARY KEY (campaign_id, audience_kind, audience_key, projection_kind)
) STRICT;

CREATE INDEX events_by_transaction ON events(transaction_id, transaction_index);
CREATE INDEX transactions_by_campaign_revision ON transactions(campaign_id, first_revision, last_revision);
CREATE INDEX snapshots_by_campaign_revision ON snapshots(campaign_id, revision DESC);
PRAGMA user_version = 1;
`.trim();

const MIGRATION_2_SQL = `
CREATE TABLE room_sessions (
  room_session_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  room_state_schema_version INTEGER NOT NULL CHECK (room_state_schema_version = 1),
  current_relay_room_id TEXT,
  campaign_id TEXT NOT NULL UNIQUE REFERENCES campaigns(campaign_id) ON DELETE RESTRICT,
  mechanical_manifest_hash TEXT NOT NULL CHECK (mechanical_manifest_hash GLOB 'sha256:[0-9a-f]*' AND length(mechanical_manifest_hash) = 71),
  presentation_manifest_hash TEXT NOT NULL CHECK (presentation_manifest_hash GLOB 'sha256:[0-9a-f]*' AND length(presentation_manifest_hash) = 71),
  current_room_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_room_revision >= 0),
  current_view_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_view_revision >= 0),
  current_mechanical_revision INTEGER NOT NULL DEFAULT 0 CHECK (current_mechanical_revision >= 0),
  room_state_json TEXT NOT NULL CHECK (json_valid(room_state_json)),
  room_state_hash TEXT NOT NULL CHECK (room_state_hash GLOB 'sha256:[0-9a-f]*' AND length(room_state_hash) = 71),
  status TEXT NOT NULL CHECK (status IN ('lobby', 'active', 'suspended', 'completed')),
  mode TEXT NOT NULL CHECK (mode IN ('normal', 'rehearsal')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  relay_expires_at TEXT
) STRICT;

CREATE TABLE room_commands (
  room_command_id TEXT PRIMARY KEY,
  room_session_id TEXT NOT NULL REFERENCES room_sessions(room_session_id) ON DELETE RESTRICT,
  client_command_id TEXT UNIQUE,
  room_transaction_id TEXT NOT NULL UNIQUE,
  participant_id TEXT,
  seat_id TEXT,
  expected_room_revision INTEGER NOT NULL CHECK (expected_room_revision >= 0),
  expected_view_revision INTEGER NOT NULL CHECK (expected_view_revision >= 0),
  kind TEXT NOT NULL,
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  command_hash TEXT NOT NULL CHECK (command_hash GLOB 'sha256:[0-9a-f]*' AND length(command_hash) = 71),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  UNIQUE (room_session_id, room_command_id),
  UNIQUE (room_session_id, client_command_id)
) STRICT;

CREATE TABLE room_transactions (
  room_transaction_id TEXT PRIMARY KEY,
  room_session_id TEXT NOT NULL REFERENCES room_sessions(room_session_id) ON DELETE RESTRICT,
  room_command_id TEXT NOT NULL UNIQUE,
  first_room_revision INTEGER NOT NULL CHECK (first_room_revision > 0),
  last_room_revision INTEGER NOT NULL CHECK (last_room_revision >= first_room_revision),
  event_count INTEGER NOT NULL CHECK (event_count > 0 AND event_count = last_room_revision - first_room_revision + 1),
  outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  pre_room_state_hash TEXT NOT NULL CHECK (pre_room_state_hash GLOB 'sha256:[0-9a-f]*' AND length(pre_room_state_hash) = 71),
  post_room_state_hash TEXT NOT NULL CHECK (post_room_state_hash GLOB 'sha256:[0-9a-f]*' AND length(post_room_state_hash) = 71),
  linked_game_transaction_id TEXT REFERENCES transactions(transaction_id) ON DELETE RESTRICT,
  committed_at TEXT NOT NULL,
  UNIQUE (room_session_id, first_room_revision),
  UNIQUE (room_session_id, last_room_revision),
  UNIQUE (room_session_id, room_transaction_id),
  FOREIGN KEY (room_session_id, room_command_id) REFERENCES room_commands(room_session_id, room_command_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE room_events (
  room_session_id TEXT NOT NULL REFERENCES room_sessions(room_session_id) ON DELETE RESTRICT,
  room_revision INTEGER NOT NULL CHECK (room_revision > 0),
  room_event_id TEXT NOT NULL UNIQUE,
  room_transaction_id TEXT NOT NULL,
  transaction_index INTEGER NOT NULL CHECK (transaction_index >= 0),
  caused_by_room_command_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('public', 'participant_private', 'player_host_operational', 'server_internal')),
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  PRIMARY KEY (room_session_id, room_revision),
  UNIQUE (room_transaction_id, transaction_index),
  FOREIGN KEY (room_session_id, room_transaction_id) REFERENCES room_transactions(room_session_id, room_transaction_id) ON DELETE RESTRICT,
  FOREIGN KEY (room_session_id, caused_by_room_command_id) REFERENCES room_commands(room_session_id, room_command_id) ON DELETE RESTRICT
) STRICT;

CREATE TABLE mechanical_workflows (
  workflow_id TEXT PRIMARY KEY,
  room_session_id TEXT NOT NULL REFERENCES room_sessions(room_session_id) ON DELETE RESTRICT,
  client_command_id TEXT NOT NULL UNIQUE,
  room_command_id TEXT NOT NULL UNIQUE REFERENCES room_commands(room_command_id) ON DELETE RESTRICT,
  game_command_id TEXT NOT NULL UNIQUE,
  game_transaction_id TEXT NOT NULL UNIQUE,
  expected_mechanical_revision INTEGER NOT NULL CHECK (expected_mechanical_revision >= 0),
  derived_game_command_json TEXT NOT NULL CHECK (json_valid(derived_game_command_json)),
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  mechanical_outcome_json TEXT CHECK (mechanical_outcome_json IS NULL OR json_valid(mechanical_outcome_json)),
  recovery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (recovery_attempts >= 0),
  last_recovery_at TEXT,
  completed_at TEXT
) STRICT;

CREATE TABLE room_projections (
  room_session_id TEXT NOT NULL REFERENCES room_sessions(room_session_id) ON DELETE RESTRICT,
  audience_kind TEXT NOT NULL CHECK (audience_kind IN ('public_tv', 'participant_private', 'player_host_operational', 'server_internal')),
  audience_key TEXT NOT NULL,
  view_revision INTEGER NOT NULL CHECK (view_revision >= 0),
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  stored_at TEXT NOT NULL,
  PRIMARY KEY (room_session_id, audience_kind, audience_key)
) STRICT;

CREATE TABLE room_projection_deltas (
  room_session_id TEXT NOT NULL REFERENCES room_sessions(room_session_id) ON DELETE RESTRICT,
  audience_key TEXT NOT NULL,
  base_view_revision INTEGER NOT NULL CHECK (base_view_revision >= 0),
  target_view_revision INTEGER NOT NULL CHECK (target_view_revision = base_view_revision + 1),
  canonical_json TEXT NOT NULL CHECK (json_valid(canonical_json)),
  stored_at TEXT NOT NULL,
  PRIMARY KEY (room_session_id, audience_key, target_view_revision)
) STRICT;

CREATE TABLE relay_sessions (
  room_session_id TEXT PRIMARY KEY REFERENCES room_sessions(room_session_id) ON DELETE CASCADE,
  relay_room_id TEXT NOT NULL,
  relay_endpoint TEXT NOT NULL,
  appliance_token_ciphertext TEXT NOT NULL,
  invite_secret_ciphertext TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;

CREATE INDEX room_events_by_transaction ON room_events(room_transaction_id, transaction_index);
CREATE INDEX room_transactions_by_revision ON room_transactions(room_session_id, first_room_revision, last_room_revision);
CREATE INDEX mechanical_workflows_pending ON mechanical_workflows(room_session_id, status);
CREATE INDEX room_deltas_by_audience ON room_projection_deltas(room_session_id, audience_key, target_view_revision);
PRAGMA user_version = 2;
`.trim();

export interface SqliteMigration {
  readonly version: number;
  readonly name: string;
  readonly checksum: `sha256:${string}`;
  readonly sql: string;
}

export const SQLITE_MIGRATIONS: readonly SqliteMigration[] = Object.freeze([
  Object.freeze({
    version: 1,
    name: "phase_1_event_store",
    checksum: taggedSha256(MIGRATION_1_SQL),
    sql: MIGRATION_1_SQL,
  }),
  Object.freeze({
    version: 2,
    name: "phase_2_room_stream",
    checksum: taggedSha256(MIGRATION_2_SQL),
    sql: MIGRATION_2_SQL,
  }),
]);

export type SqliteMigrationStatus =
  | {
      readonly status: "current";
      readonly current_version: number;
    }
  | {
      readonly status: "pending";
      readonly current_version: number;
      readonly pending_versions: readonly number[];
    }
  | {
      readonly status: "checksum_mismatch";
      readonly version: number;
      readonly expected_checksum: string;
      readonly actual_checksum: string;
    }
  | {
      readonly status: "failed";
      readonly version: number;
    }
  | {
      readonly status: "future";
      readonly current_version: number;
      readonly runtime_version: number;
    }
  | {
      readonly status: "incompatible";
      readonly safe_detail: string;
    };

function tableExists(database: Database.Database, table: string): boolean {
  return (
    database
      .prepare(
        "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?",
      )
      .get(table) !== undefined
  );
}

export function readMigrationStatus(
  database: Database.Database,
): SqliteMigrationStatus {
  const latest = SQLITE_MIGRATIONS.at(-1)?.version ?? 0;
  const userVersion = Number(database.pragma("user_version", { simple: true }));
  if (!tableExists(database, "schema_migrations")) {
    const applicationTables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all();
    if (userVersion > latest) {
      return {
        status: "future",
        current_version: userVersion,
        runtime_version: latest,
      };
    }
    return applicationTables.length === 0 && userVersion === 0
      ? {
          status: "pending",
          current_version: 0,
          pending_versions: SQLITE_MIGRATIONS.map(({ version }) => version),
        }
      : {
          status: "incompatible",
          safe_detail:
            "Database has unrecognized tables and no LLDM migration registry.",
        };
  }
  const rows = database
    .prepare(
      "SELECT version, name, checksum, success FROM schema_migrations ORDER BY version",
    )
    .all() as Array<{
    version: number;
    name: string;
    checksum: string;
    success: number;
  }>;
  const currentVersion = rows.at(-1)?.version ?? 0;
  if (currentVersion > latest) {
    return {
      status: "future",
      current_version: currentVersion,
      runtime_version: latest,
    };
  }
  for (const row of rows) {
    if (row.success !== 1) return { status: "failed", version: row.version };
    const expected = SQLITE_MIGRATIONS.find(
      ({ version }) => version === row.version,
    );
    if (expected === undefined) {
      return {
        status: "future",
        current_version: currentVersion,
        runtime_version: latest,
      };
    }
    if (expected.name !== row.name || expected.checksum !== row.checksum) {
      return {
        status: "checksum_mismatch",
        version: row.version,
        expected_checksum: expected.checksum,
        actual_checksum: row.checksum,
      };
    }
  }
  if (
    rows.some((row, index) => row.version !== index + 1) ||
    userVersion !== currentVersion
  ) {
    return {
      status: "incompatible",
      safe_detail:
        "SQLite user_version and the ordered migration registry do not agree.",
    };
  }
  const pending = SQLITE_MIGRATIONS.filter(
    ({ version }) => version > currentVersion,
  ).map(({ version }) => version);
  return pending.length === 0
    ? { status: "current", current_version: currentVersion }
    : {
        status: "pending",
        current_version: currentVersion,
        pending_versions: pending,
      };
}

function quoteSqliteString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function verifyBackup(
  path: string,
  expectedStatus: SqliteMigrationStatus,
): void {
  const backup = new Database(path, { readonly: true, fileMustExist: true });
  try {
    const integrity = backup.pragma("integrity_check", { simple: true });
    if (integrity !== "ok")
      throw new Error("SQLite backup integrity check failed.");
    const foreignKeyFailures = backup.pragma("foreign_key_check") as unknown[];
    if (foreignKeyFailures.length !== 0) {
      throw new Error("SQLite backup foreign-key check failed.");
    }
    const actual = readMigrationStatus(backup);
    if (!isDeepStrictEqual(actual, expectedStatus)) {
      throw new Error(
        "SQLite backup does not preserve the prior schema status.",
      );
    }
  } finally {
    backup.close();
  }
}

export interface MigrateSqliteOptions {
  readonly database_path: string;
  readonly committed_at: string;
  readonly inject_failure_after_sql?: boolean;
}

export interface MigrateSqliteResult {
  readonly status: "migrated" | "current";
  readonly applied_versions: readonly number[];
  readonly backup_path: string | null;
}

export function migrateSqliteDatabase(
  options: MigrateSqliteOptions,
): MigrateSqliteResult {
  const database = new Database(options.database_path);
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 5000");
  try {
    const before = readMigrationStatus(database);
    if (before.status === "current") {
      return { status: "current", applied_versions: [], backup_path: null };
    }
    if (before.status !== "pending") {
      throw new Error(`Database cannot migrate from status ${before.status}.`);
    }
    const backupDirectory = join(
      dirname(options.database_path),
      `${basename(options.database_path)}.backups`,
    );
    mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
    const safeTimestamp = options.committed_at.replaceAll(
      /[^0-9A-Za-z]+/g,
      "-",
    );
    const backupPath = join(
      backupDirectory,
      `${basename(options.database_path)}.before-v${before.pending_versions[0] ?? 1}.${safeTimestamp}.sqlite`,
    );
    if (!existsSync(backupPath)) {
      database.exec(`VACUUM INTO ${quoteSqliteString(backupPath)}`);
      chmodSync(backupPath, 0o600);
    }
    verifyBackup(backupPath, before);

    database.exec("BEGIN IMMEDIATE");
    try {
      const applied: number[] = [];
      for (const migration of SQLITE_MIGRATIONS) {
        if (!before.pending_versions.includes(migration.version)) continue;
        database.exec(migration.sql);
        if (options.inject_failure_after_sql) {
          throw new Error("Injected migration failure.");
        }
        database
          .prepare(
            "INSERT INTO schema_migrations(version, name, checksum, applied_at, success) VALUES (?, ?, ?, ?, 1)",
          )
          .run(
            migration.version,
            migration.name,
            migration.checksum,
            options.committed_at,
          );
        applied.push(migration.version);
      }
      database.exec("COMMIT");
      chmodSync(options.database_path, 0o600);
      return {
        status: "migrated",
        applied_versions: applied,
        backup_path: backupPath,
      };
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  } finally {
    database.close();
  }
}

export function readSqliteDatabaseStatus(
  databasePath: string,
): SqliteMigrationStatus {
  const database = new Database(databasePath);
  try {
    return readMigrationStatus(database);
  } finally {
    database.close();
  }
}
