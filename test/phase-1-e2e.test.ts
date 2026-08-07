import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { PHASE_1_STARTER_LOADOUTS } from "@lldm/content";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
const main = resolve("apps/cli/src/main.ts");
const tsx = resolve("node_modules/.bin/tsx");
const fixtureTime = "2026-08-07T23:50:00.000Z";

function cli(
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

function json<Output = Record<string, unknown>>(
  result: ReturnType<typeof cli>,
): Output {
  const source = result.stdout.length > 0 ? result.stdout : result.stderr;
  return JSON.parse(source) as Output;
}

function writeJson(directory: string, name: string, value: unknown): string {
  const path = join(directory, name);
  writeFileSync(path, JSON.stringify(value));
  return path;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("phase-1-e2e fresh database and recovery", () => {
  it("runs the production encounter and restart-sensitive operations through CLI processes", {
    timeout: 60_000,
  }, () => {
    const directory = mkdtempSync(join(tmpdir(), "lldm-phase-1-e2e-"));
    temporaryDirectories.push(directory);
    const database = join(directory, "phase-1.sqlite");
    const common = ["--database", database, "--json"];
    const campaignId = "campaign_floodgate_echo_001";

    expect(json(cli(["db", "status", ...common]))).toMatchObject({
      status: "pending",
      current_version: 0,
    });
    expect(
      cli(["db", "migrate", ...common, "--fixture-time", fixtureTime]).status,
    ).toBe(0);
    expect(
      cli([
        "campaign",
        "create",
        ...common,
        "--campaign-id",
        campaignId,
        "--fixture-seed-hex",
        "56".repeat(32),
        "--fixture-time",
        fixtureTime,
      ]).status,
    ).toBe(0);

    const scenario = cli([
      "scenario",
      "run",
      ...common,
      "--file",
      resolve("test/fixtures/phase-1/floodgate-scenario.json"),
      "--fixture-time",
      fixtureTime,
    ]);
    expect(scenario.status, scenario.stderr).toBe(0);
    expect(json(scenario)).toMatchObject({
      operation: "scenario_run",
      result: {
        scenario_id: "scenario_floodgate_echo_001",
        campaign_id: campaignId,
        command_count: 172,
        transaction_count: 172,
        event_count: 437,
        final_revision: 437,
        final_state_hash:
          "sha256:74d159fb4d1b2682078010d017cfae867f06f61723270ff7c3eeae512a560558",
        combat_status: "resolved",
        challenge_status: "failed",
        social_stance: "aligned",
        ritual_status: "completed",
      },
    });

    const starter = PHASE_1_STARTER_LOADOUTS[0];
    if (starter === undefined) throw new Error("Starter fixture is missing.");
    const firstCommand = {
      schema_version: 1,
      command_id: "command_e2e_001_materialize",
      transaction_id: "transaction_e2e_001_materialize",
      campaign_id: campaignId,
      expected_revision: 0,
      kind: "materialize_character",
      payload: {
        foundation: starter.foundation,
        significant_gear: starter.significant_gear,
      },
    };
    const commandPath = writeJson(
      directory,
      "first-command.json",
      firstCommand,
    );
    const retry = cli([
      "command",
      "submit",
      ...common,
      "--file",
      commandPath,
      "--fixture-time",
      "2099-01-01T00:00:00.000Z",
    ]);
    expect(retry.status).toBe(0);
    expect(json(retry)).toMatchObject({
      result: { result_kind: "idempotent_replay" },
    });
    let shown = json(
      cli(["campaign", "show", ...common, "--campaign-id", campaignId]),
    );
    expect(shown).toMatchObject({
      revision: 437,
      transaction_count: 172,
      event_count: 437,
    });

    const collisionPath = writeJson(directory, "collision.json", {
      ...firstCommand,
      expected_revision: 437,
    });
    const collision = cli([
      "command",
      "submit",
      ...common,
      "--file",
      collisionPath,
    ]);
    expect(collision.status).toBe(5);
    expect(json(collision)).toMatchObject({
      result: { result_kind: "command_identity_collision" },
    });

    const stalePath = writeJson(directory, "stale.json", {
      schema_version: 1,
      command_id: "command_e2e_stale_001",
      transaction_id: "transaction_e2e_stale_001",
      campaign_id: campaignId,
      expected_revision: 0,
      kind: "advance_scene",
      payload: {
        scene_id: null,
        next_scene_id: "scene_e2e_stale_001",
        boundary: "session_start",
      },
    });
    const stale = cli([
      "command",
      "submit",
      ...common,
      "--file",
      stalePath,
      "--fixture-time",
      fixtureTime,
    ]);
    expect(stale.status).toBe(4);
    expect(json(stale)).toMatchObject({
      result: {
        result_kind: "committed_rejection",
        commit: {
          transaction: { rejection_code: "expected_revision_mismatch" },
        },
      },
    });
    shown = json(
      cli(["campaign", "show", ...common, "--campaign-id", campaignId]),
    );
    expect(shown).toMatchObject({
      revision: 438,
      transaction_count: 173,
      event_count: 438,
    });

    for (const operation of [
      ["replay", "verify"],
      ["replay", "audit"],
      ["snapshot", "verify"],
      ["projection", "rebuild"],
    ] as const) {
      const result = cli([
        ...operation,
        ...common,
        "--campaign-id",
        campaignId,
        "--fixture-time",
        fixtureTime,
      ]);
      expect(
        result.status,
        `${operation.join(" ")}: ${result.stderr}${result.stdout}`,
      ).toBe(0);
    }
    const snapshots = json<{ readonly result: readonly unknown[] }>(
      cli(["snapshot", "list", ...common, "--campaign-id", campaignId]),
    );
    expect(snapshots.result.length).toBeGreaterThanOrEqual(4);
  });

  it("reopens between physical request, one-use submission, undo, and prohibited undo", {
    timeout: 30_000,
  }, () => {
    const directory = mkdtempSync(join(tmpdir(), "lldm-phase-1-restart-"));
    temporaryDirectories.push(directory);
    const database = join(directory, "restart.sqlite");
    const campaignId = "campaign_e2e_restart_001";
    const common = ["--database", database, "--json"];
    expect(
      cli(["db", "migrate", ...common, "--fixture-time", fixtureTime]).status,
    ).toBe(0);
    expect(
      cli([
        "campaign",
        "create",
        ...common,
        "--campaign-id",
        campaignId,
        "--fixture-seed-hex",
        "78".repeat(32),
        "--fixture-time",
        fixtureTime,
      ]).status,
    ).toBe(0);
    const starter = PHASE_1_STARTER_LOADOUTS[0];
    if (starter === undefined) throw new Error("Starter fixture is missing.");
    const materialize = {
      schema_version: 1,
      command_id: "command_e2e_restart_materialize_001",
      transaction_id: "transaction_e2e_restart_materialize_001",
      campaign_id: campaignId,
      expected_revision: 0,
      kind: "materialize_character",
      payload: {
        foundation: starter.foundation,
        significant_gear: starter.significant_gear,
      },
    };
    expect(
      cli(
        [
          "command",
          "submit",
          ...common,
          "--file",
          "-",
          "--fixture-time",
          fixtureTime,
        ],
        JSON.stringify(materialize),
      ).status,
    ).toBe(0);
    const spend = {
      schema_version: 1,
      command_id: "command_e2e_restart_spend_001",
      transaction_id: "transaction_e2e_restart_spend_001",
      campaign_id: campaignId,
      expected_revision: 2,
      kind: "spend_resource",
      payload: {
        character_id: starter.foundation.character_id,
        resource: "exertion",
        amount: 1,
        reason: "Brace the restart test.",
      },
    };
    expect(
      cli(
        ["command", "submit", ...common, "--file", "-"],
        JSON.stringify(spend),
      ).status,
    ).toBe(0);
    const undone = cli([
      "undo",
      ...common,
      "--campaign-id",
      campaignId,
      "--command-id",
      "command_e2e_restart_undo_001",
      "--transaction-id",
      "transaction_e2e_restart_undo_001",
      "--expected-revision",
      "4",
      "--fixture-time",
      fixtureTime,
    ]);
    expect(undone.status).toBe(0);
    expect(json(undone)).toMatchObject({
      result: {
        result_kind: "committed_acceptance",
        commit: { transaction: { outcome: "undo" } },
      },
    });

    const physical = {
      schema_version: 1,
      command_id: "command_e2e_restart_physical_001",
      transaction_id: "transaction_e2e_restart_physical_001",
      campaign_id: campaignId,
      expected_revision: 7,
      kind: "resolve_check",
      payload: {
        request: {
          schema_version: 1,
          actor_id: starter.foundation.actor_id,
          attribute: "Force",
          attribute_rating: 2,
          discipline: "Athletics",
          discipline_rating: 2,
          target: 13,
          modifier_state: { edge: false, hindrance: false },
          visibility: "eligible_roller",
          stakes: "The chain holds or the floodgate drops.",
          outcome_bands: [
            { degree: "Crisis", consequence: "The chain snaps." },
            { degree: "Setback", consequence: "The gate slips." },
            { degree: "Success", consequence: "The gate holds." },
            { degree: "Triumph", consequence: "The gate locks." },
          ],
          action_feasibility: "possible",
          spark_eligible: true,
          eligible_roller: "seat_e2e_restart_001",
        },
        roll_mode: "physical",
        physical_reason: "pivotal_scene_conclusion",
        invoke_spark: true,
      },
    };
    const requested = cli(
      [
        "command",
        "submit",
        ...common,
        "--file",
        "-",
        "--fixture-time",
        fixtureTime,
      ],
      JSON.stringify(physical),
    );
    expect(requested.status).toBe(0);
    const requestedJson = json<{
      readonly result: {
        readonly commit: {
          readonly events: readonly {
            readonly kind: string;
            readonly payload: {
              readonly disclosure: unknown;
              readonly pending_check_id: string;
              readonly submission_nonce: string;
            };
          }[];
        };
      };
    }>(requested);
    const requestEvent = requestedJson.result.commit.events.find(
      (event) => event.kind === "physical_roll_requested",
    );
    if (requestEvent === undefined) {
      throw new Error("Physical-roll request event is missing.");
    }
    expect(requestEvent.payload.disclosure).toMatchObject({
      target: 13,
      stakes: "The chain holds or the floodgate drops.",
      reason: "pivotal_scene_conclusion",
    });
    const submission = {
      schema_version: 1,
      command_id: "command_e2e_restart_submit_001",
      transaction_id: "transaction_e2e_restart_submit_001",
      campaign_id: campaignId,
      expected_revision: 10,
      kind: "submit_die_result",
      payload: {
        pending_check_id: requestEvent.payload.pending_check_id,
        physical_submission_id: "physical_submission_e2e_restart_001",
        submission_nonce: requestEvent.payload.submission_nonce,
        die_face: 14,
      },
    };
    const submitted = cli(
      ["command", "submit", ...common, "--file", "-"],
      JSON.stringify(submission),
    );
    expect(submitted.status).toBe(0);
    const retry = cli(
      ["command", "submit", ...common, "--file", "-"],
      JSON.stringify(submission),
    );
    expect(json(retry)).toMatchObject({
      result: { result_kind: "idempotent_replay" },
    });
    const secondSubmission = cli(
      ["command", "submit", ...common, "--file", "-"],
      JSON.stringify({
        ...submission,
        command_id: "command_e2e_restart_submit_002",
        transaction_id: "transaction_e2e_restart_submit_002",
        expected_revision: 12,
      }),
    );
    expect(secondSubmission.status).toBe(4);

    const prohibitedUndo = cli([
      "undo",
      ...common,
      "--campaign-id",
      campaignId,
      "--command-id",
      "command_e2e_restart_undo_physical_001",
      "--transaction-id",
      "transaction_e2e_restart_undo_physical_001",
      "--expected-revision",
      "13",
    ]);
    expect(prohibitedUndo.status).toBe(4);
    expect(json(prohibitedUndo)).toMatchObject({
      result: {
        commit: {
          transaction: { rejection_code: "undo_physical_result" },
        },
      },
    });
    expect(
      cli(["replay", "verify", ...common, "--campaign-id", campaignId]).status,
    ).toBe(0);
  });
});
