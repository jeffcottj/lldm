import {
  canonicalJson,
  type CampaignId,
  type CommittedTransactionRecord,
  type GameEvent,
  type GameState,
  type SnapshotRecord,
  type StateHash,
} from "@lldm/contracts";
import { applyGameEvent, createEmptyCampaignState } from "@lldm/engine";
import { hashGameState } from "../hashing/state-hash.js";
import { deterministicIdentityPort, eventIdFrom } from "./defaults.js";
import { InMemoryAtomicStore } from "./in-memory-store.js";
import { CommandCoordinator } from "./coordinator.js";
import type { ContentManifestPort } from "../ports/index.js";
import type { SqliteRuntimeStore } from "../sqlite/store.js";

export interface ReplayDiagnostic {
  readonly code: string;
  readonly safe_detail: string;
  readonly campaign_id: CampaignId;
  readonly transaction_id?: string;
  readonly revision?: number;
  readonly expected?: string | number;
  readonly actual?: string | number;
}

export interface ReplaySuccess {
  readonly success: true;
  readonly source: "full" | "snapshot";
  readonly fallback: ReplayDiagnostic | null;
  readonly campaign_id: CampaignId;
  readonly revision: number;
  readonly transaction_count: number;
  readonly event_count: number;
  readonly state_hash: StateHash;
  readonly state: GameState;
}

export interface ReplayFailure {
  readonly success: false;
  readonly diagnostic: ReplayDiagnostic;
}

export type ReplayResult = ReplaySuccess | ReplayFailure;

class ReplayMismatch extends Error {
  constructor(readonly diagnostic: ReplayDiagnostic) {
    super(diagnostic.safe_detail);
  }
}

function mismatch(
  campaignId: CampaignId,
  input: Omit<ReplayDiagnostic, "campaign_id">,
): never {
  throw new ReplayMismatch({ campaign_id: campaignId, ...input });
}

function applyTransaction(input: {
  readonly campaignId: CampaignId;
  readonly state: GameState;
  readonly expectedRevision: number;
  readonly transaction: CommittedTransactionRecord;
  readonly events: readonly GameEvent[];
}): GameState {
  const { campaignId, transaction } = input;
  if (transaction.first_revision !== input.expectedRevision + 1) {
    mismatch(campaignId, {
      code: "replay.revision_gap",
      safe_detail: "Transaction history contains a revision gap.",
      transaction_id: transaction.transaction_id,
      revision: transaction.first_revision,
      expected: input.expectedRevision + 1,
      actual: transaction.first_revision,
    });
  }
  if (input.events.length !== transaction.event_count) {
    mismatch(campaignId, {
      code: "replay.event_count_mismatch",
      safe_detail: "Transaction event count does not match stored events.",
      transaction_id: transaction.transaction_id,
      revision: transaction.first_revision,
      expected: transaction.event_count,
      actual: input.events.length,
    });
  }
  const preHash = hashGameState(input.state);
  if (preHash !== transaction.pre_state_hash) {
    mismatch(campaignId, {
      code: "replay.pre_state_hash_mismatch",
      safe_detail: "Transaction pre-state hash diverges from replay.",
      transaction_id: transaction.transaction_id,
      revision: transaction.first_revision,
      expected: transaction.pre_state_hash,
      actual: preHash,
    });
  }

  let state = input.state;
  input.events.forEach((event, index) => {
    const revision = transaction.first_revision + index;
    const expectedEventId = eventIdFrom(
      deterministicIdentityPort,
      transaction.transaction_id,
      index,
    );
    if (
      event.stream_revision !== revision ||
      event.transaction_index !== index ||
      event.transaction_id !== transaction.transaction_id ||
      event.caused_by_command_id !== transaction.command_id ||
      event.campaign_id !== campaignId ||
      event.event_id !== expectedEventId
    ) {
      mismatch(campaignId, {
        code: "replay.event_identity_mismatch",
        safe_detail: "Event ordering, causation, or identity is invalid.",
        transaction_id: transaction.transaction_id,
        revision,
        expected: expectedEventId,
        actual: event.event_id,
      });
    }
    if (index === 0) {
      const expectedKind =
        transaction.outcome === "rejected"
          ? "command_rejected"
          : "command_accepted";
      if (
        event.kind !== expectedKind ||
        event.payload.command_hash !== transaction.command_hash
      ) {
        mismatch(campaignId, {
          code: "replay.command_audit_mismatch",
          safe_detail: "Transaction command audit event is invalid.",
          transaction_id: transaction.transaction_id,
          revision,
          expected: expectedKind,
          actual: event.kind,
        });
      }
    }
    const applied = applyGameEvent(state, event);
    if (!applied.success) {
      mismatch(campaignId, {
        code: "replay.event_application_failed",
        safe_detail: `Event ${event.kind} failed authoritative application.`,
        transaction_id: transaction.transaction_id,
        revision,
      });
    }
    state = applied.value;
  });
  const postHash = hashGameState(state);
  if (postHash !== transaction.post_state_hash) {
    mismatch(campaignId, {
      code: "replay.post_state_hash_mismatch",
      safe_detail: "Transaction post-state hash diverges from replay.",
      transaction_id: transaction.transaction_id,
      revision: transaction.last_revision,
      expected: transaction.post_state_hash,
      actual: postHash,
    });
  }
  return state;
}

function replayFrom(input: {
  readonly campaignId: CampaignId;
  readonly initialState: GameState;
  readonly initialRevision: number;
  readonly transactions: readonly CommittedTransactionRecord[];
  readonly events: readonly GameEvent[];
}): GameState {
  let state = input.initialState;
  let revision = input.initialRevision;
  for (const transaction of input.transactions) {
    if (transaction.last_revision <= input.initialRevision) continue;
    if (transaction.first_revision <= input.initialRevision) {
      mismatch(input.campaignId, {
        code: "replay.snapshot_transaction_boundary",
        safe_detail: "Snapshot revision splits a transaction.",
        transaction_id: transaction.transaction_id,
        revision: input.initialRevision,
      });
    }
    const events = input.events.filter(
      (event) => event.transaction_id === transaction.transaction_id,
    );
    state = applyTransaction({
      campaignId: input.campaignId,
      state,
      expectedRevision: revision,
      transaction,
      events,
    });
    revision = transaction.last_revision;
  }
  return state;
}

function validateSnapshot(input: {
  readonly campaignId: CampaignId;
  readonly snapshot: SnapshotRecord;
  readonly manifestHash: string;
  readonly transactions: readonly CommittedTransactionRecord[];
}): void {
  const snapshot = input.snapshot;
  if (
    snapshot.campaign_id !== input.campaignId ||
    snapshot.state.campaign_id !== input.campaignId ||
    snapshot.content_manifest_hash !== input.manifestHash ||
    snapshot.state.content_manifest_hash !== input.manifestHash
  ) {
    mismatch(input.campaignId, {
      code: "snapshot.identity_mismatch",
      safe_detail: "Snapshot campaign or manifest identity is invalid.",
      revision: snapshot.revision,
      expected: input.manifestHash,
      actual: snapshot.content_manifest_hash,
    });
  }
  const stateHash = hashGameState(snapshot.state);
  if (stateHash !== snapshot.state_hash) {
    mismatch(input.campaignId, {
      code: "snapshot.state_hash_mismatch",
      safe_detail: "Snapshot state hash is invalid.",
      revision: snapshot.revision,
      expected: snapshot.state_hash,
      actual: stateHash,
    });
  }
  if (snapshot.revision > 0) {
    const boundary = input.transactions.find(
      ({ last_revision }) => last_revision === snapshot.revision,
    );
    if (
      boundary === undefined ||
      boundary.post_state_hash !== snapshot.state_hash
    ) {
      mismatch(input.campaignId, {
        code: "snapshot.boundary_mismatch",
        safe_detail: "Snapshot does not match a transaction boundary.",
        revision: snapshot.revision,
        expected: boundary?.post_state_hash ?? "transaction boundary",
        actual: snapshot.state_hash,
      });
    }
  }
}

export function replaySqliteCampaign(
  store: SqliteRuntimeStore,
  campaignId: CampaignId,
  options: { readonly prefer_snapshot?: boolean } = {},
): ReplayResult {
  try {
    const campaign = store.inspectCampaignStorage(campaignId);
    if (campaign === null) {
      mismatch(campaignId, {
        code: "replay.campaign_missing",
        safe_detail: "Campaign does not exist.",
      });
    }
    const transactions = store.inspectTransactions(campaignId);
    const events = store.inspectEvents(campaignId);
    let source: ReplaySuccess["source"] = "full";
    let fallback: ReplayDiagnostic | null = null;
    let initialState = createEmptyCampaignState(
      campaignId,
      campaign.content_manifest_hash,
    );
    let initialRevision = 0;
    if (options.prefer_snapshot !== false) {
      try {
        const snapshot = store.inspectSnapshots(campaignId)[0];
        if (snapshot !== undefined) {
          validateSnapshot({
            campaignId,
            snapshot,
            manifestHash: campaign.content_manifest_hash,
            transactions,
          });
          source = "snapshot";
          initialState = snapshot.state;
          initialRevision = snapshot.revision;
        }
      } catch (error) {
        const diagnostic =
          error instanceof ReplayMismatch
            ? error.diagnostic
            : {
                campaign_id: campaignId,
                code: "snapshot.validation_failed",
                safe_detail:
                  "Stored snapshot was invalid; verified full replay was used.",
              };
        fallback = diagnostic;
        source = "full";
        initialState = createEmptyCampaignState(
          campaignId,
          campaign.content_manifest_hash,
        );
        initialRevision = 0;
      }
    }
    const state = replayFrom({
      campaignId,
      initialState,
      initialRevision,
      transactions,
      events,
    });
    const stateHash = hashGameState(state);
    const lastRevision = transactions.at(-1)?.last_revision ?? 0;
    if (
      lastRevision !== campaign.current_revision ||
      stateHash !== campaign.state_hash ||
      canonicalJson(state) !== campaign.state_json
    ) {
      mismatch(campaignId, {
        code: "replay.campaign_head_mismatch",
        safe_detail: "Replayed state does not match the stored campaign head.",
        revision: lastRevision,
        expected: campaign.state_hash,
        actual: stateHash,
      });
    }
    return {
      success: true,
      source,
      fallback,
      campaign_id: campaignId,
      revision: lastRevision,
      transaction_count: transactions.length,
      event_count: events.length,
      state_hash: stateHash,
      state,
    };
  } catch (error) {
    return {
      success: false,
      diagnostic:
        error instanceof ReplayMismatch
          ? error.diagnostic
          : {
              code: "replay.storage_validation_failed",
              safe_detail:
                "Stored canonical history failed schema or relationship validation.",
              campaign_id: campaignId,
            },
    };
  }
}

export function verifyFullAndSnapshotReplay(
  store: SqliteRuntimeStore,
  campaignId: CampaignId,
): ReplayResult {
  const full = replaySqliteCampaign(store, campaignId, {
    prefer_snapshot: false,
  });
  if (!full.success) return full;
  const accelerated = replaySqliteCampaign(store, campaignId, {
    prefer_snapshot: true,
  });
  if (!accelerated.success) return accelerated;
  if (
    full.state_hash !== accelerated.state_hash ||
    canonicalJson(full.state) !== canonicalJson(accelerated.state)
  ) {
    return {
      success: false,
      diagnostic: {
        code: "replay.path_divergence",
        safe_detail: "Full and snapshot replay paths diverged.",
        campaign_id: campaignId,
        revision: full.revision,
        expected: full.state_hash,
        actual: accelerated.state_hash,
      },
    };
  }
  return accelerated;
}

export type CommandAuditResult =
  | {
      readonly compatible: true;
      readonly campaign_id: CampaignId;
      readonly transaction_count: number;
      readonly event_count: number;
    }
  | {
      readonly compatible: false;
      readonly campaign_id: CampaignId;
      readonly safe_detail: string;
      readonly transaction_id?: string;
      readonly revision?: number;
    };

export function auditSqliteCampaignCommands(input: {
  readonly store: SqliteRuntimeStore;
  readonly campaign_id: CampaignId;
  readonly content: ContentManifestPort;
}): CommandAuditResult {
  const campaign = input.store.inspectCampaignStorage(input.campaign_id);
  const seed = input.store.readCampaignSeedForAudit(input.campaign_id);
  if (campaign === null || seed === null) {
    return {
      compatible: false,
      campaign_id: input.campaign_id,
      safe_detail: "Campaign or audit seed is unavailable.",
    };
  }
  const commands = input.store.inspectCommands(input.campaign_id);
  const transactions = input.store.inspectTransactions(input.campaign_id);
  const events = input.store.inspectEvents(input.campaign_id);
  const auditStore = new InMemoryAtomicStore();
  auditStore.createCampaign({
    state: createEmptyCampaignState(
      input.campaign_id,
      campaign.content_manifest_hash,
    ),
    seed,
  });
  for (const [index, command] of commands.entries()) {
    const transaction = transactions[index];
    if (transaction === undefined || transaction.outcome === "undo") {
      return {
        compatible: false,
        campaign_id: input.campaign_id,
        safe_detail:
          "Stored history uses an outcome unsupported by command re-execution audit.",
        ...(transaction === undefined
          ? {}
          : { transaction_id: transaction.transaction_id }),
      };
    }
    const coordinator = new CommandCoordinator({
      store: auditStore,
      content: input.content,
      clock: { now: () => transaction.committed_at },
    });
    const result = coordinator.submit(command);
    if (
      result.result_kind !== "committed_acceptance" &&
      result.result_kind !== "committed_rejection"
    ) {
      return {
        compatible: false,
        campaign_id: input.campaign_id,
        safe_detail: `Command re-execution returned ${result.result_kind}.`,
        transaction_id: transaction.transaction_id,
        revision: transaction.first_revision,
      };
    }
    const storedEvents = events.filter(
      (event) => event.transaction_id === transaction.transaction_id,
    );
    const eventMatch =
      canonicalJson(result.commit.events) === canonicalJson(storedEvents);
    const preHashMatch =
      result.commit.transaction.pre_state_hash === transaction.pre_state_hash;
    const postHashMatch =
      result.commit.transaction.post_state_hash === transaction.post_state_hash;
    if (!eventMatch || !preHashMatch || !postHashMatch) {
      return {
        compatible: false,
        campaign_id: input.campaign_id,
        safe_detail: `Command re-execution diverged (${[
          eventMatch ? null : "events",
          preHashMatch ? null : "pre-state hash",
          postHashMatch ? null : "post-state hash",
        ]
          .filter((value) => value !== null)
          .join(", ")}); expected ${storedEvents
          .map(({ kind }) => kind)
          .join("+")}, received ${result.commit.events
          .map(({ kind }) => kind)
          .join("+")}${
          result.commit.events[0]?.kind === "command_rejected"
            ? ` (${result.commit.events[0].payload.safe_detail})`
            : ""
        }.`,
        transaction_id: transaction.transaction_id,
        revision: transaction.first_revision,
      };
    }
  }
  return {
    compatible: true,
    campaign_id: input.campaign_id,
    transaction_count: transactions.length,
    event_count: events.length,
  };
}
