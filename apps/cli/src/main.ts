#!/usr/bin/env node

import { readFileSync } from "node:fs";
import {
  auditSqliteCampaignCommands,
  CommandCoordinator,
  createPhase1Campaign,
  migrateSqliteDatabase,
  phase1ContentManifestPort,
  PHASE_1_CONTENT_MANIFEST_HASH,
  readSqliteDatabaseStatus,
  rebuildSqliteProjections,
  replaySqliteCampaign,
  RUNTIME_VERSION,
  runPhase1ScenarioFixture,
  SqliteRuntimeStore,
  verifyFullAndSnapshotReplay,
} from "@lldm/runtime";
import type { CampaignId, GameCommand, TransactionId } from "@lldm/contracts";

const CLI_VERSION = "0.0.0";
const HELP = `LLDM deterministic runtime CLI

Usage: lldm <command> <subcommand> --database <path> [options]

Commands:
  db status|migrate           Inspect or explicitly migrate SQLite storage.
  campaign create|show       Create or inspect a local campaign.
  command submit             Submit one validated JSON command from file/stdin.
  scenario run               Submit a JSON command array from file/stdin.
  replay verify|audit        Verify events/snapshots or re-execute commands.
  snapshot list|verify       Inspect snapshot metadata or verify recovery.
  projection show|rebuild    Inspect a filtered view or rebuild derived rows.
  undo                       Compensate the latest eligible transaction.

Global options:
  --database <path>          Required; no repository-root database default exists.
  --json                     Emit stable versioned JSON without ANSI escapes.
  --help                     Show help for the selected command.
  --version                  Show CLI and runtime versions.

Safety boundaries: commands never auto-migrate; normal campaign creation never
accepts an explicit seed. Room, phone, TV, network, provider, narration, audio,
and generated-media features remain outside this Phase 1 CLI.`;

const HELP_BY_COMMAND: Record<string, string> = {
  db: `Usage: lldm db status|migrate --database <path> [--json]\nMigrations are explicit and create a verified sibling backup first.`,
  campaign: `Usage: lldm campaign create|show --database <path> --campaign-id <id> [--json]\nTest fixtures alone may use --fixture-seed-hex <64 lowercase hex digits>.`,
  command: `Usage: lldm command submit --database <path> --file <json|-> [--json]\nWithout --file, one JSON value is read from stdin.`,
  scenario: `Usage: lldm scenario run --database <path> --file <json|-> [--json]\nInput is an array of commands or an object with a commands array.`,
  replay: `Usage: lldm replay verify|audit --database <path> --campaign-id <id> [--json]`,
  snapshot: `Usage: lldm snapshot list|verify --database <path> --campaign-id <id> [--json]`,
  projection: `Usage: lldm projection show|rebuild --database <path> --campaign-id <id> [--audience public|seat_private|host_control] [--audience-key <key>] [--json]`,
  undo: `Usage: lldm undo --database <path> --campaign-id <id> --command-id <id> --transaction-id <id> --expected-revision <n> [--target-transaction-id <id>] [--json]`,
};

interface ParsedArguments {
  readonly positionals: readonly string[];
  readonly options: ReadonlyMap<string, string | true>;
}

class CliFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: number,
  ) {
    super(message);
  }
}

function parseArguments(arguments_: readonly string[]): ParsedArguments {
  const positionals: string[] = [];
  const options = new Map<string, string | true>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === undefined || argument === "--") continue;
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const name = argument.slice(2);
    if (["help", "json", "version"].includes(name)) {
      options.set(name, true);
      continue;
    }
    const value = arguments_[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new CliFailure(
        "usage.missing_option_value",
        `--${name} requires a value.`,
        2,
      );
    }
    options.set(name, value);
    index += 1;
  }
  return { positionals, options };
}

function option(arguments_: ParsedArguments, name: string): string | undefined {
  const value = arguments_.options.get(name);
  return typeof value === "string" ? value : undefined;
}

function requiredOption(arguments_: ParsedArguments, name: string): string {
  const value = option(arguments_, name);
  if (value === undefined) {
    throw new CliFailure(
      "usage.missing_required_option",
      `--${name} is required.`,
      2,
    );
  }
  return value;
}

function timestamp(arguments_: ParsedArguments): string {
  return option(arguments_, "fixture-time") ?? new Date().toISOString();
}

function readJsonInput(arguments_: ParsedArguments): unknown {
  const file = option(arguments_, "file");
  const source = file === undefined || file === "-" ? 0 : file;
  const text = readFileSync(source, "utf8");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new CliFailure(
      "input.malformed_json",
      "Input is not valid JSON; no runtime command was submitted.",
      2,
    );
  }
}

function output(
  arguments_: ParsedArguments,
  value: Record<string, unknown>,
  human: string,
): void {
  if (arguments_.options.get("json") === true) {
    process.stdout.write(
      `${JSON.stringify({ schema_version: 1, ...value })}\n`,
    );
  } else {
    process.stdout.write(`${human}\n`);
  }
}

function withStore<Result>(
  path: string,
  operation: (store: SqliteRuntimeStore) => Result,
): Result {
  const store = new SqliteRuntimeStore(path);
  try {
    return operation(store);
  } finally {
    store.close();
  }
}

function coordinator(
  store: SqliteRuntimeStore,
  arguments_: ParsedArguments,
): CommandCoordinator {
  const fixtureTime = option(arguments_, "fixture-time");
  return new CommandCoordinator({
    store,
    content: phase1ContentManifestPort,
    ...(fixtureTime === undefined ? {} : { clock: { now: () => fixtureTime } }),
  });
}

function commandResultExitCode(resultKind: string): number {
  return ["committed_acceptance", "idempotent_replay"].includes(resultKind)
    ? 0
    : resultKind === "committed_rejection"
      ? 4
      : 5;
}

function run(arguments_: ParsedArguments): void {
  const [command, subcommand] = arguments_.positionals;
  if (arguments_.options.get("version") === true) {
    process.stdout.write(`lldm ${CLI_VERSION} (runtime ${RUNTIME_VERSION})\n`);
    return;
  }
  if (command === undefined || arguments_.options.get("help") === true) {
    process.stdout.write(
      `${command === undefined ? HELP : (HELP_BY_COMMAND[command] ?? HELP)}\n`,
    );
    return;
  }
  const database = requiredOption(arguments_, "database");

  if (command === "db" && subcommand === "status") {
    const status = readSqliteDatabaseStatus(database);
    output(
      arguments_,
      { operation: "db_status", ...status },
      `Database schema: ${status.status}.`,
    );
    process.exitCode =
      status.status === "current" || status.status === "pending" ? 0 : 3;
    return;
  }
  if (command === "db" && subcommand === "migrate") {
    const result = migrateSqliteDatabase({
      database_path: database,
      committed_at: timestamp(arguments_),
    });
    output(
      arguments_,
      { operation: "db_migrate", ...result },
      `Database schema: ${result.status}.`,
    );
    return;
  }
  if (command === "campaign" && subcommand === "create") {
    if (option(arguments_, "seed") !== undefined) {
      throw new CliFailure(
        "campaign.explicit_seed_forbidden",
        "Ordinary campaign creation rejects explicit seeds; use the fixture-only flag in tests.",
        2,
      );
    }
    const campaignId = requiredOption(arguments_, "campaign-id") as CampaignId;
    const fixtureSeed = option(arguments_, "fixture-seed-hex");
    const result = withStore(database, (store) =>
      createPhase1Campaign({
        store,
        campaign_id: campaignId,
        created_at: timestamp(arguments_),
        ...(fixtureSeed === undefined ? {} : { fixture_seed_hex: fixtureSeed }),
      }),
    );
    output(
      arguments_,
      { operation: "campaign_create", ...result },
      `${fixtureSeed === undefined ? "Created" : "WARNING: fixture-seeded"} campaign ${campaignId} at revision 0.`,
    );
    return;
  }
  if (command === "campaign" && subcommand === "show") {
    const campaignId = requiredOption(arguments_, "campaign-id") as CampaignId;
    const result = withStore(database, (store) => {
      const campaign = store.inspectCampaignStorage(campaignId);
      if (campaign === null)
        throw new CliFailure(
          "campaign.not_found",
          "Campaign was not found.",
          3,
        );
      return {
        campaign_id: campaign.campaign_id,
        revision: campaign.current_revision,
        content_manifest_hash: campaign.content_manifest_hash,
        state_hash: campaign.state_hash,
        transaction_count: store.inspectTransactions(campaignId).length,
        event_count: store.inspectEvents(campaignId).length,
      };
    });
    output(
      arguments_,
      { operation: "campaign_show", ...result },
      `Campaign ${campaignId}: revision ${result.revision}, ${result.event_count} events.`,
    );
    return;
  }
  if (command === "command" && subcommand === "submit") {
    const raw = readJsonInput(arguments_);
    const result = withStore(database, (store) =>
      coordinator(store, arguments_).submit(raw),
    );
    output(
      arguments_,
      { operation: "command_submit", result },
      `Command result: ${result.result_kind}.`,
    );
    process.exitCode = commandResultExitCode(result.result_kind);
    return;
  }
  if (command === "scenario" && subcommand === "run") {
    const raw = readJsonInput(arguments_);
    if (
      typeof raw === "object" &&
      raw !== null &&
      (raw as { record_kind?: unknown }).record_kind ===
        "phase_1_scenario_fixture"
    ) {
      const fixtureTime = option(arguments_, "fixture-time");
      const result = withStore(database, (store) =>
        runPhase1ScenarioFixture({
          store,
          fixture: raw,
          ...(fixtureTime === undefined ? {} : { committed_at: fixtureTime }),
        }),
      );
      output(
        arguments_,
        { operation: "scenario_run", result },
        `Scenario ${result.scenario_id}: ${result.final_revision} revisions, ${result.combat_status}.`,
      );
      return;
    }
    const commands = Array.isArray(raw)
      ? raw
      : typeof raw === "object" &&
          raw !== null &&
          Array.isArray((raw as { commands?: unknown }).commands)
        ? (raw as { commands: unknown[] }).commands
        : null;
    if (commands === null)
      throw new CliFailure(
        "scenario.commands_missing",
        "Scenario input must contain a commands array.",
        2,
      );
    const results = withStore(database, (store) => {
      const runtime = coordinator(store, arguments_);
      return commands.map((candidate) => runtime.submit(candidate));
    });
    const failed = results.find(
      (result) => commandResultExitCode(result.result_kind) !== 0,
    );
    output(
      arguments_,
      { operation: "scenario_run", command_count: commands.length, results },
      `Scenario submitted ${commands.length} commands${failed === undefined ? "." : `; stopped status includes ${failed.result_kind}.`}`,
    );
    process.exitCode =
      failed === undefined ? 0 : commandResultExitCode(failed.result_kind);
    return;
  }
  if (
    command === "replay" &&
    (subcommand === "verify" || subcommand === "audit")
  ) {
    const campaignId = requiredOption(arguments_, "campaign-id") as CampaignId;
    const result = withStore(database, (store) =>
      subcommand === "verify"
        ? verifyFullAndSnapshotReplay(store, campaignId)
        : auditSqliteCampaignCommands({
            store,
            campaign_id: campaignId,
            content: phase1ContentManifestPort,
          }),
    );
    const success = "success" in result ? result.success : result.compatible;
    output(
      arguments_,
      { operation: `replay_${subcommand}`, result },
      `Replay ${subcommand}: ${success ? "verified" : "failed"}.`,
    );
    process.exitCode = success ? 0 : 5;
    return;
  }
  if (
    command === "snapshot" &&
    (subcommand === "list" || subcommand === "verify")
  ) {
    const campaignId = requiredOption(arguments_, "campaign-id") as CampaignId;
    const result = withStore(database, (store) =>
      subcommand === "list"
        ? store
            .inspectSnapshots(campaignId)
            .map(({ state: _state, ...snapshot }) => snapshot)
        : replaySqliteCampaign(store, campaignId),
    );
    const success =
      !Object.hasOwn(result as object, "success") ||
      (result as { success: boolean }).success;
    output(
      arguments_,
      { operation: `snapshot_${subcommand}`, result },
      `Snapshot ${subcommand}: ${success ? "ok" : "failed"}.`,
    );
    process.exitCode = success ? 0 : 5;
    return;
  }
  if (command === "projection" && subcommand === "show") {
    const campaignId = requiredOption(arguments_, "campaign-id") as CampaignId;
    const audience = option(arguments_, "audience") ?? "public";
    if (!["public", "seat_private", "host_control"].includes(audience)) {
      throw new CliFailure(
        "projection.invalid_audience",
        "Projection audience is invalid.",
        2,
      );
    }
    const audienceKey =
      option(arguments_, "audience-key") ??
      (audience === "public"
        ? "public"
        : audience === "host_control"
          ? "host"
          : undefined);
    if (audienceKey === undefined)
      throw new CliFailure(
        "projection.audience_key_required",
        "Seat-private projection requires --audience-key.",
        2,
      );
    const result = withStore(
      database,
      (store) =>
        store
          .inspectProjections(campaignId)
          .find(
            (projection) =>
              projection.audience_kind === audience &&
              projection.audience_key === audienceKey,
          ) ?? null,
    );
    if (result === null)
      throw new CliFailure(
        "projection.not_found",
        "Projection was not found.",
        3,
      );
    output(
      arguments_,
      {
        operation: "projection_show",
        projection: JSON.parse(result.canonical_json),
      },
      `Projection ${audience}/${audienceKey}: revision ${result.revision}.`,
    );
    return;
  }
  if (command === "projection" && subcommand === "rebuild") {
    const campaignId = requiredOption(arguments_, "campaign-id") as CampaignId;
    const catalog = phase1ContentManifestPort.resolve(
      PHASE_1_CONTENT_MANIFEST_HASH,
    );
    if (catalog === null)
      throw new CliFailure(
        "content.unavailable",
        "Production content is unavailable.",
        5,
      );
    const result = withStore(database, (store) =>
      rebuildSqliteProjections({
        store,
        campaign_id: campaignId,
        catalog,
        stored_at: timestamp(arguments_),
      }),
    );
    output(
      arguments_,
      { operation: "projection_rebuild", result },
      `Projection rebuild: ${result.success ? "verified" : "failed"}.`,
    );
    process.exitCode = result.success ? 0 : 5;
    return;
  }
  if (command === "undo" && subcommand === undefined) {
    const expectedRevision = Number(
      requiredOption(arguments_, "expected-revision"),
    );
    if (!Number.isInteger(expectedRevision) || expectedRevision < 0)
      throw new CliFailure(
        "undo.invalid_revision",
        "Expected revision must be a non-negative integer.",
        2,
      );
    const raw: GameCommand = {
      schema_version: 1,
      command_id: requiredOption(
        arguments_,
        "command-id",
      ) as GameCommand["command_id"],
      transaction_id: requiredOption(
        arguments_,
        "transaction-id",
      ) as TransactionId,
      campaign_id: requiredOption(arguments_, "campaign-id") as CampaignId,
      expected_revision: expectedRevision,
      kind: "undo_transaction",
      payload: {
        target_transaction_id:
          (option(arguments_, "target-transaction-id") as
            | TransactionId
            | undefined) ?? null,
      },
    };
    const result = withStore(database, (store) =>
      coordinator(store, arguments_).submit(raw),
    );
    output(
      arguments_,
      { operation: "undo", result },
      `Undo result: ${result.result_kind}.`,
    );
    process.exitCode = commandResultExitCode(result.result_kind);
    return;
  }
  throw new CliFailure(
    "usage.unknown_command",
    `Unknown command: ${arguments_.positionals.join(" ")}.`,
    2,
  );
}

try {
  run(parseArguments(process.argv.slice(2)));
} catch (error) {
  const failure =
    error instanceof CliFailure
      ? error
      : new CliFailure(
          "runtime.operation_failed",
          "The operation failed without changing canonical history.",
          5,
        );
  const json = process.argv.includes("--json");
  if (json) {
    process.stderr.write(
      `${JSON.stringify({ schema_version: 1, error: { code: failure.code, safe_detail: failure.message } })}\n`,
    );
  } else {
    process.stderr.write(`${failure.message}\n`);
  }
  process.exitCode = failure.exitCode;
}
