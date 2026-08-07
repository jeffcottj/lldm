import {
  type CampaignId,
  type CommandId,
  type GameEvent,
  type GameState,
  type TransactionId,
  validateGameState,
} from "@lldm/contracts";
import { hashGameState } from "../hashing/state-hash.js";
import type {
  AtomicCommandStore,
  AtomicCommitInput,
  AtomicStorePort,
  RuntimeCampaignHead,
  StorageReadiness,
  StoredCommandRecord,
} from "../ports/index.js";

interface InMemoryCampaignRecord extends RuntimeCampaignHead {
  readonly seed: Uint8Array;
  readonly events: readonly GameEvent[];
}

interface InMemoryData {
  readiness: StorageReadiness;
  campaigns: Map<CampaignId, InMemoryCampaignRecord>;
  commands: Map<CommandId, StoredCommandRecord>;
  transactionIds: Set<TransactionId>;
}

export interface CreateInMemoryCampaignInput {
  readonly state: GameState;
  readonly seed: Uint8Array;
}

export class InMemoryAtomicStore implements AtomicStorePort {
  #data: InMemoryData = {
    readiness: { status: "current" },
    campaigns: new Map(),
    commands: new Map(),
    transactionIds: new Set(),
  };

  createCampaign(input: CreateInMemoryCampaignInput): void {
    const validated = validateGameState(input.state);
    if (!validated.success)
      throw new Error("In-memory campaign state is invalid.");
    if (input.seed.length !== 32) {
      throw new Error("In-memory campaign seed must contain 32 bytes.");
    }
    if (this.#data.campaigns.has(input.state.campaign_id)) {
      throw new Error("In-memory campaign already exists.");
    }
    this.#data.campaigns.set(input.state.campaign_id, {
      campaign_id: input.state.campaign_id,
      revision: 0,
      state: structuredClone(validated.value),
      state_hash: hashGameState(validated.value),
      seed: structuredClone(input.seed),
      events: [],
    });
  }

  setReadiness(readiness: StorageReadiness): void {
    this.#data.readiness = structuredClone(readiness);
  }

  inspectCampaign(campaignId: CampaignId): InMemoryCampaignRecord | null {
    const campaign = this.#data.campaigns.get(campaignId);
    return campaign === undefined ? null : structuredClone(campaign);
  }

  inspectCommand(commandId: CommandId): StoredCommandRecord | null {
    const command = this.#data.commands.get(commandId);
    return command === undefined ? null : structuredClone(command);
  }

  transact<Result>(operation: (store: AtomicCommandStore) => Result): Result {
    const draft = structuredClone(this.#data);
    const atomic: AtomicCommandStore = {
      readiness: () => structuredClone(draft.readiness),
      findCommand: (commandId) => {
        const command = draft.commands.get(commandId);
        return command === undefined ? null : structuredClone(command);
      },
      transactionIdExists: (transactionId) =>
        draft.transactionIds.has(transactionId),
      loadCampaign: (campaignId) => {
        const campaign = draft.campaigns.get(campaignId);
        if (campaign === undefined) return null;
        return {
          campaign_id: campaign.campaign_id,
          revision: campaign.revision,
          state: structuredClone(campaign.state),
          state_hash: campaign.state_hash,
        };
      },
      readCampaignSeed: (campaignId) => {
        const campaign = draft.campaigns.get(campaignId);
        return campaign === undefined ? null : structuredClone(campaign.seed);
      },
      loadUndoCandidate: (campaignId, targetTransactionId) => {
        const commits = [...draft.commands.values()]
          .map(({ commit }) => commit)
          .filter(
            ({ transaction }) =>
              transaction.campaign_id === campaignId &&
              transaction.outcome !== "rejected" &&
              transaction.pre_state_hash !== transaction.post_state_hash,
          )
          .sort(
            (left, right) =>
              right.transaction.last_revision - left.transaction.last_revision,
          );
        const latest = commits[0];
        if (latest === undefined) return { status: "none" as const };
        if (
          targetTransactionId !== null &&
          targetTransactionId !== latest.transaction.transaction_id
        ) {
          return {
            status: "target_not_latest" as const,
            latest_transaction_id: latest.transaction.transaction_id,
          };
        }
        return {
          status: "found" as const,
          candidate: {
            transaction: latest.transaction,
            events: latest.events,
            already_compensated: commits.some(
              ({ transaction }) =>
                transaction.outcome === "undo" &&
                transaction.undo_target_transaction_id ===
                  latest.transaction.transaction_id,
            ),
          },
        };
      },
      commit: (input) => this.#commitDraft(draft, input),
    };
    const result = operation(atomic);
    this.#data = draft;
    return result;
  }

  #commitDraft(draft: InMemoryData, input: AtomicCommitInput): void {
    const transaction = input.stored_command.commit.transaction;
    const campaign = draft.campaigns.get(transaction.campaign_id);
    if (campaign === undefined) throw new Error("Commit campaign is missing.");
    if (
      draft.commands.has(input.stored_command.command_id) ||
      draft.transactionIds.has(input.stored_command.transaction_id)
    ) {
      throw new Error("Commit identity is already occupied.");
    }
    if (
      campaign.state_hash !== input.pre_state_hash ||
      transaction.pre_state_hash !== input.pre_state_hash ||
      transaction.post_state_hash !== input.post_state_hash
    ) {
      throw new Error("Commit state hash does not match the campaign head.");
    }
    if (
      input.events.length !== transaction.event_count ||
      input.events[0]?.stream_revision !== campaign.revision + 1 ||
      input.events.at(-1)?.stream_revision !== transaction.last_revision
    ) {
      throw new Error("Commit events do not form the next contiguous range.");
    }
    input.events.forEach((event, index) => {
      if (
        event.stream_revision !== campaign.revision + index + 1 ||
        event.transaction_index !== index ||
        event.transaction_id !== transaction.transaction_id ||
        event.caused_by_command_id !== transaction.command_id
      ) {
        throw new Error("Commit event identity or ordering is invalid.");
      }
    });
    if (hashGameState(input.post_state) !== input.post_state_hash) {
      throw new Error("Commit post-state hash is invalid.");
    }

    draft.campaigns.set(campaign.campaign_id, {
      ...campaign,
      revision: transaction.last_revision,
      state: structuredClone(input.post_state),
      state_hash: input.post_state_hash,
      events: [...campaign.events, ...structuredClone(input.events)],
    });
    draft.commands.set(
      input.stored_command.command_id,
      structuredClone(input.stored_command),
    );
    draft.transactionIds.add(input.stored_command.transaction_id);
  }
}
