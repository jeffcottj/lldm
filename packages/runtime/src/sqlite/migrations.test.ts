import { chmodSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import {
  migrateSqliteDatabase,
  readMigrationStatus,
  SQLITE_MIGRATIONS,
} from "./migrations.js";

const temporaryDirectories: string[] = [];

function temporaryDatabase(name = "campaign.sqlite"): string {
  const directory = mkdtempSync(join(tmpdir(), "lldm-sqlite-migration-"));
  temporaryDirectories.push(directory);
  return join(directory, name);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("SQLite migration registry and backups", () => {
  it("backs up a fresh file, migrates atomically, and reopens as current", () => {
    const path = temporaryDatabase();
    const before = new Database(path);
    expect(readMigrationStatus(before)).toEqual({
      status: "pending",
      current_version: 0,
      pending_versions: [1, 2],
    });
    before.close();

    const result = migrateSqliteDatabase({
      database_path: path,
      committed_at: "2026-08-07T19:00:00.000Z",
    });
    expect(result).toMatchObject({
      status: "migrated",
      applied_versions: [1, 2],
    });
    expect(result.backup_path).not.toBeNull();
    if (result.backup_path === null) return;
    expect(statSync(result.backup_path).mode & 0o777).toBe(0o600);

    const backup = new Database(result.backup_path, {
      readonly: true,
      fileMustExist: true,
    });
    expect(readMigrationStatus(backup)).toEqual({
      status: "pending",
      current_version: 0,
      pending_versions: [1, 2],
    });
    expect(backup.pragma("integrity_check", { simple: true })).toBe("ok");
    backup.close();

    const migrated = new Database(path);
    expect(readMigrationStatus(migrated)).toEqual({
      status: "current",
      current_version: 2,
    });
    expect(migrated.pragma("user_version", { simple: true })).toBe(2);
    expect(migrated.pragma("integrity_check", { simple: true })).toBe("ok");
    migrated.close();
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("safely reuses a verified deterministic backup after a failed attempt", () => {
    const path = temporaryDatabase();
    const options = {
      database_path: path,
      committed_at: "2026-08-07T19:01:00.000Z",
    } as const;
    expect(() =>
      migrateSqliteDatabase({
        ...options,
        inject_failure_after_sql: true,
      }),
    ).toThrow("Injected migration failure");

    const rolledBack = new Database(path);
    expect(readMigrationStatus(rolledBack).status).toBe("pending");
    expect(rolledBack.pragma("user_version", { simple: true })).toBe(0);
    expect(
      rolledBack
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'campaigns'",
        )
        .get(),
    ).toBeUndefined();
    rolledBack.close();

    expect(migrateSqliteDatabase(options).status).toBe("migrated");
  });

  it("upgrades an intact migration-1 database through a verified backup", () => {
    const path = temporaryDatabase("phase-1.sqlite");
    const phase1 = new Database(path);
    const migration1 = SQLITE_MIGRATIONS[0];
    if (migration1 === undefined)
      throw new Error("Migration 1 is unavailable.");
    phase1.exec(migration1.sql);
    phase1
      .prepare(
        "INSERT INTO schema_migrations(version, name, checksum, applied_at, success) VALUES (?, ?, ?, ?, 1)",
      )
      .run(
        migration1.version,
        migration1.name,
        migration1.checksum,
        "2026-08-07T19:01:30.000Z",
      );
    expect(readMigrationStatus(phase1)).toEqual({
      status: "pending",
      current_version: 1,
      pending_versions: [2],
    });
    phase1.close();

    const result = migrateSqliteDatabase({
      database_path: path,
      committed_at: "2026-08-07T19:01:31.000Z",
    });
    expect(result).toMatchObject({ status: "migrated", applied_versions: [2] });
    if (result.backup_path === null)
      throw new Error("Upgrade backup is missing.");
    const backup = new Database(result.backup_path, {
      readonly: true,
      fileMustExist: true,
    });
    expect(readMigrationStatus(backup)).toEqual({
      status: "pending",
      current_version: 1,
      pending_versions: [2],
    });
    expect(
      backup
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'room_sessions'",
        )
        .get(),
    ).toBeUndefined();
    backup.close();

    const upgraded = new Database(path);
    expect(readMigrationStatus(upgraded)).toEqual({
      status: "current",
      current_version: 2,
    });
    expect(
      upgraded
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'room_sessions'",
        )
        .get(),
    ).toEqual({ name: "room_sessions" });
    upgraded.close();
  });

  it("reports failed, corrupt, future, and incompatible registries without mutation", () => {
    const cases = [
      {
        expected: "failed",
        setup(database: Database.Database) {
          database.exec(
            "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at TEXT, success INTEGER)",
          );
          database
            .prepare("INSERT INTO schema_migrations VALUES (1, ?, ?, ?, 0)")
            .run(
              SQLITE_MIGRATIONS[0]?.name,
              SQLITE_MIGRATIONS[0]?.checksum,
              "2026-08-07T19:02:00.000Z",
            );
          database.pragma("user_version = 1");
        },
      },
      {
        expected: "checksum_mismatch",
        setup(database: Database.Database) {
          database.exec(
            "CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at TEXT, success INTEGER)",
          );
          database
            .prepare("INSERT INTO schema_migrations VALUES (1, ?, ?, ?, 1)")
            .run(
              SQLITE_MIGRATIONS[0]?.name,
              `sha256:${"0".repeat(64)}`,
              "2026-08-07T19:02:00.000Z",
            );
          database.pragma("user_version = 1");
        },
      },
      {
        expected: "future",
        setup(database: Database.Database) {
          database.pragma("user_version = 3");
        },
      },
      {
        expected: "incompatible",
        setup(database: Database.Database) {
          database.exec("CREATE TABLE unrelated(id INTEGER PRIMARY KEY)");
        },
      },
    ] as const;

    for (const fixture of cases) {
      const path = temporaryDatabase(`${fixture.expected}.sqlite`);
      const database = new Database(path);
      fixture.setup(database);
      expect(readMigrationStatus(database).status).toBe(fixture.expected);
      database.close();
      expect(() =>
        migrateSqliteDatabase({
          database_path: path,
          committed_at: "2026-08-07T19:03:00.000Z",
        }),
      ).toThrow(`status ${fixture.expected}`);
      const reopened = new Database(path);
      expect(readMigrationStatus(reopened).status).toBe(fixture.expected);
      reopened.close();
    }
  });

  it("refuses an existing backup that no longer represents the source", () => {
    const path = temporaryDatabase();
    expect(() =>
      migrateSqliteDatabase({
        database_path: path,
        committed_at: "2026-08-07T19:04:00.000Z",
        inject_failure_after_sql: true,
      }),
    ).toThrow();
    const backupPath = join(
      `${path}.backups`,
      "campaign.sqlite.before-v1.2026-08-07T19-04-00-000Z.sqlite",
    );
    const backup = new Database(backupPath);
    backup.exec("CREATE TABLE foreign_data(id INTEGER PRIMARY KEY)");
    backup.close();
    chmodSync(backupPath, 0o600);
    expect(() =>
      migrateSqliteDatabase({
        database_path: path,
        committed_at: "2026-08-07T19:04:00.000Z",
      }),
    ).toThrow("does not preserve the prior schema status");
  });
});
