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
