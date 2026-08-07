import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  PHASE_1_CONTENT_MANIFEST_HASH,
  PHASE_1_DEFINITIONS,
  PHASE_1_STARTER_LOADOUTS,
} from "@lldm/content";
import {
  type CampaignId,
  type CharacterId,
  type GameCommand,
  type TransactionId,
} from "@lldm/contracts";
import { createEmptyCampaignState } from "@lldm/engine";
import { afterEach, describe, expect, it } from "vitest";
import { migrateSqliteDatabase } from "../sqlite/migrations.js";
import { SqliteRuntimeStore } from "../sqlite/store.js";
import { CommandCoordinator } from "./coordinator.js";
import { replaySqliteCampaign } from "./replay.js";

const campaignId = "campaign_undo_001" as CampaignId;
const temporaryDirectories: string[] = [];
const catalog = {
  content_manifest_hash: PHASE_1_CONTENT_MANIFEST_HASH,
  definitions: PHASE_1_DEFINITIONS,
};

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "lldm-undo-"));
  temporaryDirectories.push(directory);
  const path = join(directory, "campaign.sqlite");
  migrateSqliteDatabase({
    database_path: path,
    committed_at: "2026-08-07T23:00:00.000Z",
  });
  const store = new SqliteRuntimeStore(path);
  store.createCampaign({
    state: createEmptyCampaignState(campaignId, PHASE_1_CONTENT_MANIFEST_HASH),
    seed: Uint8Array.from({ length: 32 }, (_, index) => index + 41),
    created_at: "2026-08-07T23:00:01.000Z",
  });
  let call = 0;
  const coordinator = new CommandCoordinator({
    store,
    content: { resolve: () => catalog },
    clock: {
      now: () => `2026-08-07T23:01:${String(++call).padStart(2, "0")}.000Z`,
    },
  });
  return { coordinator, store };
}

function materialize(): GameCommand {
  const starter = PHASE_1_STARTER_LOADOUTS[0];
  if (starter === undefined) throw new Error("Starter fixture is missing.");
  return {
    schema_version: 1,
    command_id: "command_undo_materialize_001",
    transaction_id: "transaction_undo_materialize_001" as TransactionId,
    campaign_id: campaignId,
    expected_revision: 0,
    kind: "materialize_character",
    payload: {
      foundation: starter.foundation,
      significant_gear: starter.significant_gear,
    },
  };
}

function spend(expectedRevision: number): GameCommand {
  const starter = PHASE_1_STARTER_LOADOUTS[0];
  if (starter === undefined) throw new Error("Starter fixture is missing.");
  return {
    schema_version: 1,
    command_id: "command_undo_spend_001",
    transaction_id: "transaction_undo_spend_001",
    campaign_id: campaignId,
    expected_revision: expectedRevision,
    kind: "spend_resource",
    payload: {
      character_id: starter.foundation.character_id,
      resource: "exertion",
      amount: 1,
      reason: "Brace the floodgate chain.",
    },
  };
}

function physicalCheck(expectedRevision: number): GameCommand {
  const starter = PHASE_1_STARTER_LOADOUTS[0];
  if (starter === undefined) throw new Error("Starter fixture is missing.");
  return {
    schema_version: 1,
    command_id: "command_undo_physical_001",
    transaction_id: "transaction_undo_physical_001",
    campaign_id: campaignId,
    expected_revision: expectedRevision,
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
        stakes: "Hold the floodgate before its last chain snaps.",
        outcome_bands: [
          { degree: "Crisis", consequence: "The chain snaps immediately." },
          { degree: "Setback", consequence: "The gate slips." },
          { degree: "Success", consequence: "The gate holds." },
          { degree: "Triumph", consequence: "The gate locks safely." },
        ],
        action_feasibility: "possible",
        spark_eligible: true,
        eligible_roller: "seat_undo_mara_001",
      },
      roll_mode: "physical",
      physical_reason: "pivotal_scene_conclusion",
      invoke_spark: true,
    },
  };
}

function undo(input: {
  readonly commandId: string;
  readonly transactionId: string;
  readonly expectedRevision: number;
  readonly target?: TransactionId | null;
}): GameCommand {
  return {
    schema_version: 1,
    command_id: input.commandId as GameCommand["command_id"],
    transaction_id: input.transactionId as TransactionId,
    campaign_id: campaignId,
    expected_revision: input.expectedRevision,
    kind: "undo_transaction",
    payload: { target_transaction_id: input.target ?? null },
  };
}

function exertion(store: SqliteRuntimeStore, characterId: CharacterId): number {
  const state = store.inspectCampaign(campaignId)?.state;
  const character = state?.party.characters.find(
    ({ character_id }) => character_id === characterId,
  );
  if (character === undefined) throw new Error("Character is missing.");
  return character.resources.exertion.current;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("compensating undo", () => {
  it("reverses only the latest eligible transaction and preserves history", () => {
    const { coordinator, store } = fixture();
    const starter = PHASE_1_STARTER_LOADOUTS[0];
    if (starter === undefined) throw new Error("Starter fixture is missing.");
    expect(coordinator.submit(materialize()).result_kind).toBe(
      "committed_acceptance",
    );
    expect(coordinator.submit(spend(2)).result_kind).toBe(
      "committed_acceptance",
    );
    expect(exertion(store, starter.foundation.character_id)).toBe(2);
    const originalTransactions = store.inspectTransactions(campaignId);

    const staleTarget = coordinator.submit(
      undo({
        commandId: "command_undo_wrong_target_001",
        transactionId: "transaction_undo_wrong_target_001",
        expectedRevision: 4,
        target: "transaction_undo_materialize_001" as TransactionId,
      }),
    );
    expect(staleTarget.result_kind).toBe("committed_rejection");
    if (staleTarget.result_kind === "committed_rejection") {
      expect(staleTarget.commit.transaction).toMatchObject({
        rejection_code: "undo_target_not_latest",
        pre_state_hash: staleTarget.commit.transaction.post_state_hash,
      });
    }

    const compensated = coordinator.submit(
      undo({
        commandId: "command_undo_latest_001",
        transactionId: "transaction_undo_latest_001",
        expectedRevision: 5,
      }),
    );
    expect(compensated.result_kind).toBe("committed_acceptance");
    if (compensated.result_kind === "committed_acceptance") {
      expect(compensated.commit.transaction).toMatchObject({
        outcome: "undo",
        undo_target_transaction_id: "transaction_undo_spend_001",
      });
      expect(compensated.commit.events.map(({ kind }) => kind)).toEqual([
        "command_accepted",
        "resource_changed",
        "transaction_compensated",
      ]);
    }
    expect(exertion(store, starter.foundation.character_id)).toBe(3);
    expect(store.inspectTransactions(campaignId).slice(0, 2)).toEqual(
      originalTransactions,
    );
    const replay = replaySqliteCampaign(store, campaignId);
    expect(replay.success).toBe(true);

    const undoUndo = coordinator.submit(
      undo({
        commandId: "command_undo_undo_001",
        transactionId: "transaction_undo_undo_001",
        expectedRevision: 8,
      }),
    );
    expect(undoUndo.result_kind).toBe("committed_rejection");
    if (undoUndo.result_kind === "committed_rejection") {
      expect(undoUndo.commit.transaction).toMatchObject({
        rejection_code: "undo_target_is_undo",
      });
    }
    store.close();
  });

  it("rejects a latest non-invertible materialization with a stable reason", () => {
    const { coordinator, store } = fixture();
    expect(coordinator.submit(materialize()).result_kind).toBe(
      "committed_acceptance",
    );
    const result = coordinator.submit(
      undo({
        commandId: "command_undo_noninvertible_001",
        transactionId: "transaction_undo_noninvertible_001",
        expectedRevision: 2,
      }),
    );
    expect(result.result_kind).toBe("committed_rejection");
    if (result.result_kind === "committed_rejection") {
      expect(result.commit.transaction).toMatchObject({
        rejection_code: "undo_non_invertible_dependency",
      });
    }
    expect(store.inspectCampaign(campaignId)?.revision).toBe(3);
    store.close();
  });

  it("invalidates an unresolved physical nonce and restores spent Spark", () => {
    const { coordinator, store } = fixture();
    const starter = PHASE_1_STARTER_LOADOUTS[0];
    if (starter === undefined) throw new Error("Starter fixture is missing.");
    expect(coordinator.submit(materialize()).result_kind).toBe(
      "committed_acceptance",
    );
    expect(coordinator.submit(physicalCheck(2)).result_kind).toBe(
      "committed_acceptance",
    );
    const pending = store.inspectCampaign(campaignId)?.state;
    expect(pending?.pending_physical_checks).toHaveLength(1);
    expect(pending?.party.characters[0]?.resources.spark.available).toBe(false);
    const result = coordinator.submit(
      undo({
        commandId: "command_undo_physical_latest_001",
        transactionId: "transaction_undo_physical_latest_001",
        expectedRevision: 5,
      }),
    );
    expect(result.result_kind).toBe("committed_acceptance");
    const restored = store.inspectCampaign(campaignId)?.state;
    expect(restored?.pending_physical_checks).toEqual([]);
    expect(
      restored?.party.characters.find(
        ({ character_id }) => character_id === starter.foundation.character_id,
      )?.resources.spark.available,
    ).toBe(true);
    expect(replaySqliteCampaign(store, campaignId).success).toBe(true);
    store.close();
  });
});
