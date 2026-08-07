import {
  PHASE_1_CONTENT_MANIFEST_HASH,
  PHASE_1_DEFINITIONS,
  PHASE_1_STARTER_LOADOUTS,
} from "@lldm/content";
import {
  type CampaignId,
  canonicalJson,
  type GameCommand,
  type TransactionId,
} from "@lldm/contracts";
import { createEmptyCampaignState, decideCommand } from "@lldm/engine";
import { describe, expect, it } from "vitest";
import type {
  AtomicStorePort,
  ClockPort,
  ContentManifestPort,
  EngineDeciderPort,
  IdentityPort,
  ProjectionPort,
  RandomPort,
  SeedAccessPort,
} from "../ports/index.js";
import { CommandCoordinator } from "./coordinator.js";
import {
  authoritativeEngineDecider,
  deterministicIdentityPort,
  hmacRandomPort,
  storedSeedAccess,
} from "./defaults.js";
import { InMemoryAtomicStore } from "./in-memory-store.js";

const campaignId = "campaign_coordinator_001" as CampaignId;
const seed = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const catalog = {
  content_manifest_hash: PHASE_1_CONTENT_MANIFEST_HASH,
  definitions: PHASE_1_DEFINITIONS,
};

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

function simulatedCheckCommand(expectedRevision: number): GameCommand {
  return {
    schema_version: 1,
    command_id: "command_coordinator_check_001",
    transaction_id: "transaction_coordinator_check_001",
    campaign_id: campaignId,
    expected_revision: expectedRevision,
    kind: "resolve_check",
    payload: {
      request: {
        schema_version: 1,
        actor_id: "actor_mara_venn_001",
        attribute: "Force",
        attribute_rating: 2,
        discipline: "Athletics",
        discipline_rating: 2,
        target: 13,
        modifier_state: { edge: false, hindrance: false },
        visibility: "public",
        stakes: "Mara opens the floodgate before its counterweight breaks.",
        outcome_bands: [
          { degree: "Crisis", consequence: "The counterweight breaks." },
          { degree: "Setback", consequence: "The gate remains sealed." },
          { degree: "Success", consequence: "The gate opens." },
          { degree: "Triumph", consequence: "The gate opens quietly." },
        ],
        action_feasibility: "possible",
        spark_eligible: true,
      },
      roll_mode: "simulated",
      invoke_spark: false,
    },
  };
}

interface CallCounts {
  clock: number;
  content: number;
  decider: number;
  identity: number;
  projector: number;
  random: number;
  seed: number;
}

function fixture() {
  const store = new InMemoryAtomicStore();
  store.createCampaign({
    state: createEmptyCampaignState(campaignId, PHASE_1_CONTENT_MANIFEST_HASH),
    seed,
  });
  const calls: CallCounts = {
    clock: 0,
    content: 0,
    decider: 0,
    identity: 0,
    projector: 0,
    random: 0,
    seed: 0,
  };
  const clock: ClockPort = {
    now: () => {
      calls.clock += 1;
      return `2026-08-07T17:00:${String(calls.clock).padStart(2, "0")}.000Z`;
    },
  };
  const content: ContentManifestPort = {
    resolve: (hash) => {
      calls.content += 1;
      return hash === PHASE_1_CONTENT_MANIFEST_HASH ? catalog : null;
    },
  };
  const identity: IdentityPort = {
    allocate: (...input) => {
      calls.identity += 1;
      return deterministicIdentityPort.allocate(...input);
    },
  };
  const seedAccess: SeedAccessPort = {
    readSeed: (...input) => {
      calls.seed += 1;
      return storedSeedAccess.readSeed(...input);
    },
  };
  const random: RandomPort = {
    draw: (input) => {
      calls.random += 1;
      return hmacRandomPort.draw(input);
    },
  };
  const decider: EngineDeciderPort = {
    decide: (input) => {
      calls.decider += 1;
      return decideCommand(input);
    },
  };
  const projector: ProjectionPort = {
    project: () => {
      calls.projector += 1;
      return [];
    },
  };
  const coordinator = new CommandCoordinator({
    store,
    clock,
    content,
    identity,
    seed_access: seedAccess,
    random,
    decider,
    projector,
  });
  return { calls, coordinator, store };
}

describe("transactional command coordinator", () => {
  it("commits acceptance, stale and legal rejections with contiguous hashes", () => {
    const { calls, coordinator, store } = fixture();
    const accepted = coordinator.submit(
      materializeCommand({
        commandId: "command_coordinator_materialize_001",
        transactionId: "transaction_coordinator_materialize_001",
        expectedRevision: 0,
      }),
    );
    expect(accepted.result_kind).toBe("committed_acceptance");
    if (accepted.result_kind !== "committed_acceptance") return;
    expect(accepted.commit.transaction).toMatchObject({
      first_revision: 1,
      last_revision: 2,
      event_count: 2,
      outcome: "accepted",
      committed_at: "2026-08-07T17:00:01.000Z",
    });

    const stale = coordinator.submit(
      materializeCommand({
        commandId: "command_coordinator_stale_001",
        transactionId: "transaction_coordinator_stale_001",
        expectedRevision: 0,
        displayName: "Stale Mara",
      }),
    );
    expect(stale.result_kind).toBe("committed_rejection");
    if (stale.result_kind !== "committed_rejection") return;
    expect(stale.commit.transaction).toMatchObject({
      first_revision: 3,
      last_revision: 3,
      rejection_code: "expected_revision_mismatch",
    });
    expect(stale.commit.transaction.pre_state_hash).toBe(
      stale.commit.transaction.post_state_hash,
    );

    const illegal = coordinator.submit(
      materializeCommand({
        commandId: "command_coordinator_illegal_001",
        transactionId: "transaction_coordinator_illegal_001",
        expectedRevision: 3,
      }),
    );
    expect(illegal.result_kind).toBe("committed_rejection");
    if (illegal.result_kind !== "committed_rejection") return;
    expect(illegal.commit.transaction).toMatchObject({
      first_revision: 4,
      last_revision: 4,
      rejection_code: "engine_legality",
    });
    expect(store.inspectCampaign(campaignId)?.revision).toBe(4);
    expect(calls.clock).toBe(3);
    expect(calls.decider).toBe(2);
    expect(calls.projector).toBe(3);
  });

  it("short-circuits identical retry and rejects both identity collision forms", () => {
    const { calls, coordinator, store } = fixture();
    const command = materializeCommand({
      commandId: "command_coordinator_retry_001",
      transactionId: "transaction_coordinator_retry_001",
      expectedRevision: 0,
    });
    const first = coordinator.submit(command);
    expect(first.result_kind).toBe("committed_acceptance");
    const beforeRetry = structuredClone(calls);
    const retry = coordinator.submit(structuredClone(command));
    expect(retry.result_kind).toBe("idempotent_replay");
    if (
      first.result_kind !== "committed_acceptance" ||
      retry.result_kind !== "idempotent_replay"
    ) {
      return;
    }
    expect(retry.transaction).toEqual(first.commit.transaction);
    expect(canonicalJson(retry.commit)).toBe(canonicalJson(first.commit));
    expect(calls).toEqual(beforeRetry);

    const commandCollision = coordinator.submit({
      ...structuredClone(command),
      expected_revision: 2,
    });
    expect(commandCollision.result_kind).toBe("command_identity_collision");
    expect(calls).toEqual(beforeRetry);

    const transactionCollision = coordinator.submit(
      materializeCommand({
        commandId: "command_coordinator_other_001",
        transactionId: "transaction_coordinator_retry_001",
        expectedRevision: 2,
        displayName: "Other Mara",
      }),
    );
    expect(transactionCollision.result_kind).toBe(
      "transaction_identity_collision",
    );
    expect(calls).toEqual(beforeRetry);
    expect(store.inspectCampaign(campaignId)?.revision).toBe(2);
  });

  it("validates malformed input before storage and never canonicalizes it", () => {
    const { calls, store } = fixture();
    let transactions = 0;
    const countingStore: AtomicStorePort = {
      transact: (operation) => {
        transactions += 1;
        return store.transact(operation);
      },
    };
    const guarded = new CommandCoordinator({
      store: countingStore,
      content: { resolve: () => catalog },
    });
    const result = guarded.submit({ kind: "materialize_character" });
    expect(result.result_kind).toBe("malformed_command");
    expect(transactions).toBe(0);
    expect(calls).toEqual({
      clock: 0,
      content: 0,
      decider: 0,
      identity: 0,
      projector: 0,
      random: 0,
      seed: 0,
    });
  });

  it("draws once, records the draw, and cannot reroll an identical retry", () => {
    const { calls, coordinator } = fixture();
    const materialized = coordinator.submit(
      materializeCommand({
        commandId: "command_coordinator_materialize_random_001",
        transactionId: "transaction_coordinator_materialize_random_001",
        expectedRevision: 0,
      }),
    );
    if (materialized.result_kind !== "committed_acceptance") {
      throw new Error("Random coordinator setup failed.");
    }
    const command = simulatedCheckCommand(2);
    const resolved = coordinator.submit(command);
    expect(resolved.result_kind).toBe("committed_acceptance");
    if (resolved.result_kind !== "committed_acceptance") return;
    expect(resolved.commit.events[1]).toMatchObject({
      kind: "check_resolved",
      payload: {
        random_draw: {
          algorithm_version: "hmac_sha256_v1",
          command_id: command.command_id,
        },
      },
    });
    expect(calls.seed).toBe(1);
    expect(calls.random).toBe(1);
    const beforeRetry = structuredClone(calls);
    expect(coordinator.submit(command).result_kind).toBe("idempotent_replay");
    expect(calls).toEqual(beforeRetry);
  });

  it("rolls back atomically when a pre-commit boundary throws", () => {
    const boundaries = [
      "clock",
      "identity",
      "content",
      "decider",
      "projector",
      "commit",
    ] as const;
    for (const boundary of boundaries) {
      const base = new InMemoryAtomicStore();
      base.createCampaign({
        state: createEmptyCampaignState(
          campaignId,
          PHASE_1_CONTENT_MANIFEST_HASH,
        ),
        seed,
      });
      const store: AtomicStorePort =
        boundary === "commit"
          ? {
              transact: (operation) =>
                base.transact((atomic) =>
                  operation({
                    ...atomic,
                    commit: () => {
                      throw new Error("injected commit failure");
                    },
                  }),
                ),
            }
          : base;
      const coordinator = new CommandCoordinator({
        store,
        content: {
          resolve: () => {
            if (boundary === "content")
              throw new Error("injected content failure");
            return catalog;
          },
        },
        clock: {
          now: () => {
            if (boundary === "clock") throw new Error("injected clock failure");
            return "2026-08-07T18:00:00.000Z";
          },
        },
        identity: {
          allocate: (...input) => {
            if (boundary === "identity")
              throw new Error("injected identity failure");
            return deterministicIdentityPort.allocate(...input);
          },
        },
        decider: {
          decide: (input) => {
            if (boundary === "decider")
              throw new Error("injected decider failure");
            return authoritativeEngineDecider.decide(input);
          },
        },
        projector: {
          project: () => {
            if (boundary === "projector")
              throw new Error("injected projector failure");
            return [];
          },
        },
      });
      const result = coordinator.submit(
        materializeCommand({
          commandId: `command_failure_${boundary}_001`,
          transactionId: `transaction_failure_${boundary}_001`,
          expectedRevision: 0,
        }),
      );
      expect(result.result_kind, boundary).toBe("recovery_required");
      expect(base.inspectCampaign(campaignId)?.revision, boundary).toBe(0);
    }
  });
});
