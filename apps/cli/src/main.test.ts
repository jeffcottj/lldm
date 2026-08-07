import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const main = resolve("apps/cli/src/main.ts");
const tsx = resolve("node_modules/.bin/tsx");
const fixtureTime = "2026-08-07T23:30:00.000Z";

function run(
  arguments_: readonly string[],
  input?: string,
): {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
} {
  const result = spawnSync(tsx, [main, ...arguments_], {
    cwd: resolve("."),
    encoding: "utf8",
    ...(input === undefined ? {} : { input }),
  });
  return {
    status: result.status ?? -1,
    stdout: result.stdout,
    stderr: result.error?.message ?? result.stderr,
  };
}

function setup() {
  const directory = mkdtempSync(join(tmpdir(), "lldm-cli-"));
  temporaryDirectories.push(directory);
  return {
    directory,
    database: join(directory, "campaign.sqlite"),
    campaignId: "campaign_cli_001",
  };
}

function command(campaignId: string, expectedRevision = 0) {
  return {
    schema_version: 1,
    command_id: `command_cli_scene_${expectedRevision}`,
    transaction_id: `transaction_cli_scene_${expectedRevision}`,
    campaign_id: campaignId,
    expected_revision: expectedRevision,
    kind: "advance_scene",
    payload: {
      scene_id: expectedRevision === 0 ? null : "scene_cli_opening_001",
      next_scene_id:
        expectedRevision === 0
          ? "scene_cli_opening_001"
          : "scene_cli_followup_001",
      boundary: expectedRevision === 0 ? "session_start" : "scene",
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("scriptable CLI", () => {
  it("documents every Phase 1 command and safety boundary", () => {
    const help = run(["--help"]);
    expect(help.status, help.stderr).toBe(0);
    for (const name of [
      "db status|migrate",
      "campaign create|show",
      "command submit",
      "scenario run",
      "replay verify|audit",
      "snapshot list|verify",
      "projection show|rebuild",
      "undo",
    ]) {
      expect(help.stdout).toContain(name);
    }
    expect(help.stdout).toContain("never auto-migrate");
    expect(run(["db", "status", "--help"]).stdout).toContain(
      "verified sibling backup",
    );
    expect(run(["scenario", "run", "--help"]).stdout).toContain(
      "commands array",
    );
  });

  it("migrates, creates, reopens, submits, replays, projects, and snapshots", {
    timeout: 20_000,
  }, () => {
    const fixture = setup();
    const common = ["--database", fixture.database, "--json"];
    const status = run(["db", "status", ...common]);
    expect(status.status, status.stderr).toBe(0);
    expect(JSON.parse(status.stdout)).toMatchObject({
      schema_version: 1,
      operation: "db_status",
      status: "pending",
    });
    expect(
      run(["db", "migrate", ...common, "--fixture-time", fixtureTime]).status,
    ).toBe(0);
    const seed = "12".repeat(32);
    const created = run([
      "campaign",
      "create",
      ...common,
      "--campaign-id",
      fixture.campaignId,
      "--fixture-seed-hex",
      seed,
      "--fixture-time",
      fixtureTime,
    ]);
    expect(created.status).toBe(0);
    expect(created.stdout).not.toContain(seed);
    expect(JSON.parse(created.stdout)).toMatchObject({
      operation: "campaign_create",
      campaign_id: fixture.campaignId,
      revision: 0,
      fixture_seed: true,
    });

    const commandPath = join(fixture.directory, "command.json");
    writeFileSync(commandPath, JSON.stringify(command(fixture.campaignId)));
    const submitted = run([
      "command",
      "submit",
      ...common,
      "--file",
      commandPath,
      "--fixture-time",
      fixtureTime,
    ]);
    expect(submitted.status).toBe(0);
    expect(JSON.parse(submitted.stdout)).toMatchObject({
      operation: "command_submit",
      result: { result_kind: "committed_acceptance" },
    });
    const retry = run(
      [
        "command",
        "submit",
        ...common,
        "--file",
        "-",
        "--fixture-time",
        "2099-01-01T00:00:00.000Z",
      ],
      JSON.stringify(command(fixture.campaignId)),
    );
    expect(retry.status).toBe(0);
    expect(JSON.parse(retry.stdout)).toMatchObject({
      result: { result_kind: "idempotent_replay" },
    });

    for (const arguments_ of [
      ["campaign", "show", ...common, "--campaign-id", fixture.campaignId],
      ["replay", "verify", ...common, "--campaign-id", fixture.campaignId],
      ["replay", "audit", ...common, "--campaign-id", fixture.campaignId],
      ["snapshot", "list", ...common, "--campaign-id", fixture.campaignId],
      ["snapshot", "verify", ...common, "--campaign-id", fixture.campaignId],
      ["projection", "show", ...common, "--campaign-id", fixture.campaignId],
      [
        "projection",
        "rebuild",
        ...common,
        "--campaign-id",
        fixture.campaignId,
        "--fixture-time",
        fixtureTime,
      ],
    ]) {
      const result = run(arguments_);
      expect(
        result.status,
        `${arguments_[0]} ${arguments_[1]}: ${result.stderr}`,
      ).toBe(0);
      expect(() => JSON.parse(result.stdout)).not.toThrow();
    }
  });

  it("runs command arrays and rejects malformed JSON before runtime", () => {
    const fixture = setup();
    const common = ["--database", fixture.database, "--json"];
    expect(
      run(["db", "migrate", ...common, "--fixture-time", fixtureTime]).status,
    ).toBe(0);
    expect(
      run([
        "campaign",
        "create",
        ...common,
        "--campaign-id",
        fixture.campaignId,
        "--fixture-seed-hex",
        "34".repeat(32),
        "--fixture-time",
        fixtureTime,
      ]).status,
    ).toBe(0);
    const scenario = run(
      [
        "scenario",
        "run",
        ...common,
        "--file",
        "-",
        "--fixture-time",
        fixtureTime,
      ],
      JSON.stringify({
        commands: [command(fixture.campaignId), command(fixture.campaignId, 2)],
      }),
    );
    expect(scenario.status).toBe(0);
    expect(JSON.parse(scenario.stdout)).toMatchObject({
      operation: "scenario_run",
      command_count: 2,
    });

    const malformed = run(
      ["command", "submit", ...common, "--file", "-"],
      "{not json",
    );
    expect(malformed.status).toBe(2);
    expect(JSON.parse(malformed.stderr)).toEqual({
      schema_version: 1,
      error: {
        code: "input.malformed_json",
        safe_detail:
          "Input is not valid JSON; no runtime command was submitted.",
      },
    });
    const shown = run([
      "campaign",
      "show",
      ...common,
      "--campaign-id",
      fixture.campaignId,
    ]);
    expect(JSON.parse(shown.stdout)).toMatchObject({ revision: 4 });
  });
});
