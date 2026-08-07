import {
  type CommandHash,
  type CommandRejectionCode,
  canonicalJson,
  type GameCommand,
  GameCommandSchema,
  type GameEvent,
  GameEventSchema,
  type GameState,
  SCHEMA_VERSION,
  taggedSha256,
  type ValidationIssue,
  validateCommittedTransactionRecord,
  validateValue,
} from "@lldm/contracts";
import { applyGameEvent, planTransactionCompensation } from "@lldm/engine";
import { hashGameState } from "../hashing/state-hash.js";
import type {
  AtomicCommandStore,
  AtomicStorePort,
  ClockPort,
  CommittedCommand,
  ContentManifestPort,
  EngineDeciderPort,
  IdentityPort,
  ProjectionPort,
  RandomPort,
  RuntimeAllocatedDecisionFacts,
  SeedAccessPort,
  StoredCommandRecord,
} from "../ports/index.js";
import {
  authoritativeEngineDecider,
  deterministicIdentityPort,
  authoritativeProjectionPort,
  eventIdFrom,
  hmacRandomPort,
  legalActionIdForCampaign,
  storedSeedAccess,
  systemClock,
} from "./defaults.js";
import type { CommandSubmissionResult } from "./types.js";

const RFC3339_MILLISECONDS =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/;

export interface CommandCoordinatorPorts {
  readonly store: AtomicStorePort;
  readonly content: ContentManifestPort;
  readonly clock?: ClockPort;
  readonly identity?: IdentityPort;
  readonly seed_access?: SeedAccessPort;
  readonly random?: RandomPort;
  readonly decider?: EngineDeciderPort;
  readonly projector?: ProjectionPort;
}

function malformed(
  safeDetail: string,
  issues?: readonly ValidationIssue[],
): CommandSubmissionResult {
  return {
    result_kind: "malformed_command",
    safe_detail: safeDetail,
    ...(issues === undefined ? {} : { issues }),
  };
}

function failure(
  resultKind:
    | "command_identity_collision"
    | "transaction_identity_collision"
    | "storage_incompatible"
    | "recovery_required",
  safeDetail: string,
): CommandSubmissionResult {
  return { result_kind: resultKind, safe_detail: safeDetail };
}

function allocateDecisionFacts(
  identity: IdentityPort,
  command: GameCommand,
): RuntimeAllocatedDecisionFacts {
  const transactionId = command.transaction_id;
  return {
    pending_check_id: identity.allocate(
      "pending_check",
      transactionId,
      0,
    ) as RuntimeAllocatedDecisionFacts["pending_check_id"],
    submission_nonce: identity.allocate(
      "physical_roll_nonce",
      transactionId,
      0,
    ) as RuntimeAllocatedDecisionFacts["submission_nonce"],
    wound_id: identity.allocate(
      "wound",
      transactionId,
      0,
    ) as RuntimeAllocatedDecisionFacts["wound_id"],
    death_pending_check_id: identity.allocate(
      "death_pending_check",
      transactionId,
      0,
    ) as RuntimeAllocatedDecisionFacts["death_pending_check_id"],
    death_submission_nonce: identity.allocate(
      "death_physical_roll_nonce",
      transactionId,
      0,
    ) as RuntimeAllocatedDecisionFacts["death_submission_nonce"],
    condition_id: identity.allocate(
      "condition",
      transactionId,
      0,
    ) as RuntimeAllocatedDecisionFacts["condition_id"],
    scar_id: identity.allocate(
      "scar",
      transactionId,
      0,
    ) as RuntimeAllocatedDecisionFacts["scar_id"],
    legal_action_id_for: (stableKey) =>
      legalActionIdForCampaign(identity, command.campaign_id, stableKey),
    event_id_for: (transactionIndex) =>
      eventIdFrom(identity, transactionId, transactionIndex),
  };
}

function envelopeEvents(input: {
  readonly command: GameCommand;
  readonly firstRevision: number;
  readonly commandHash: CommandHash;
  readonly accepted: boolean;
  readonly rejectionCode?: CommandRejectionCode;
  readonly safeDetail?: string;
  readonly domainEvents: readonly {
    readonly kind: string;
    readonly payload: unknown;
  }[];
  readonly eventIdFor: RuntimeAllocatedDecisionFacts["event_id_for"];
}): readonly GameEvent[] {
  const audit = input.accepted
    ? {
        kind: "command_accepted",
        payload: {
          command_kind: input.command.kind,
          command_hash: input.commandHash,
        },
      }
    : {
        kind: "command_rejected",
        payload: {
          command_kind: input.command.kind,
          command_hash: input.commandHash,
          rejection_code: input.rejectionCode,
          safe_detail: input.safeDetail,
        },
      };
  const proposals = input.accepted ? [audit, ...input.domainEvents] : [audit];
  return proposals.map((proposal, transactionIndex) => {
    const result = validateValue(GameEventSchema, {
      schema_version: SCHEMA_VERSION,
      event_id: input.eventIdFor(transactionIndex),
      transaction_id: input.command.transaction_id,
      campaign_id: input.command.campaign_id,
      caused_by_command_id: input.command.command_id,
      transaction_index: transactionIndex,
      stream_revision: input.firstRevision + transactionIndex,
      ...proposal,
    });
    if (!result.success) {
      throw new Error(
        `Runtime produced an invalid event: ${result.issues
          .map(({ path, code }) => `${path}:${code}`)
          .join(", ")}`,
      );
    }
    return result.value;
  });
}

function applyEvents(
  state: GameState,
  events: readonly GameEvent[],
): GameState {
  let current = state;
  for (const event of events) {
    const applied = applyGameEvent(current, event);
    if (!applied.success) {
      throw new Error(
        `Event application failed at revision ${event.stream_revision}: ${applied.issues
          .map(({ path, code }) => `${path}:${code}`)
          .join(", ")}`,
      );
    }
    current = applied.value;
  }
  return current;
}

function commitDecision(input: {
  readonly store: AtomicCommandStore;
  readonly command: GameCommand;
  readonly commandCanonicalJson: string;
  readonly commandHash: CommandHash;
  readonly state: GameState;
  readonly revision: number;
  readonly committedAt: string;
  readonly facts: RuntimeAllocatedDecisionFacts;
  readonly accepted: boolean;
  readonly transactionOutcome?: "accepted" | "undo";
  readonly undoTargetTransactionId?: GameCommand["transaction_id"];
  readonly rejectionCode?: CommandRejectionCode;
  readonly safeDetail?: string;
  readonly domainEvents: readonly {
    readonly kind: string;
    readonly payload: unknown;
  }[];
  readonly projector: ProjectionPort;
  readonly catalog: NonNullable<ReturnType<ContentManifestPort["resolve"]>>;
}): CommittedCommand {
  const preStateHash = hashGameState(input.state);
  const events = envelopeEvents({
    command: input.command,
    firstRevision: input.revision + 1,
    commandHash: input.commandHash,
    accepted: input.accepted,
    ...(input.rejectionCode === undefined
      ? {}
      : { rejectionCode: input.rejectionCode }),
    ...(input.safeDetail === undefined ? {} : { safeDetail: input.safeDetail }),
    domainEvents: input.domainEvents,
    eventIdFor: input.facts.event_id_for,
  });
  const postState = applyEvents(input.state, events);
  const postStateHash = hashGameState(postState);
  const lastRevision = input.revision + events.length;
  const transactionOutcome = input.transactionOutcome ?? "accepted";
  const transactionCandidate = {
    schema_version: SCHEMA_VERSION,
    campaign_id: input.command.campaign_id,
    command_id: input.command.command_id,
    command_hash: input.commandHash,
    transaction_id: input.command.transaction_id,
    first_revision: input.revision + 1,
    last_revision: lastRevision,
    event_count: events.length,
    pre_state_hash: preStateHash,
    post_state_hash: postStateHash,
    committed_at: input.committedAt,
    ...(transactionOutcome === "undo"
      ? {
          outcome: "undo" as const,
          undo_target_transaction_id: input.undoTargetTransactionId,
        }
      : input.accepted
        ? { outcome: "accepted" as const }
        : {
            outcome: "rejected" as const,
            rejection_code: input.rejectionCode,
            safe_detail: input.safeDetail,
          }),
  };
  const validatedTransaction =
    validateCommittedTransactionRecord(transactionCandidate);
  if (!validatedTransaction.success) {
    throw new Error("Runtime produced an invalid transaction record.");
  }
  const projections = input.projector.project({
    state: postState,
    revision: lastRevision,
    catalog: input.catalog,
    legal_action_id_for: input.facts.legal_action_id_for,
  });
  const commit: CommittedCommand = {
    command: input.command,
    command_canonical_json: input.commandCanonicalJson,
    transaction: validatedTransaction.value,
    events,
    post_state: postState,
    projections,
  };
  const storedCommand: StoredCommandRecord = {
    command_id: input.command.command_id,
    transaction_id: input.command.transaction_id,
    command_hash: input.commandHash,
    command_canonical_json: input.commandCanonicalJson,
    commit,
  };
  input.store.commit({
    stored_command: storedCommand,
    pre_state_hash: preStateHash,
    post_state_hash: postStateHash,
    post_state: postState,
    events,
    projections,
  });
  return commit;
}

export class CommandCoordinator {
  readonly #ports: Required<CommandCoordinatorPorts>;

  constructor(ports: CommandCoordinatorPorts) {
    this.#ports = {
      ...ports,
      clock: ports.clock ?? systemClock,
      identity: ports.identity ?? deterministicIdentityPort,
      seed_access: ports.seed_access ?? storedSeedAccess,
      random: ports.random ?? hmacRandomPort,
      decider: ports.decider ?? authoritativeEngineDecider,
      projector: ports.projector ?? authoritativeProjectionPort,
    };
  }

  submit(rawCommand: unknown): CommandSubmissionResult {
    const parsed = validateValue(GameCommandSchema, rawCommand);
    if (!parsed.success) {
      return malformed("Command failed centralized validation.", parsed.issues);
    }
    const command = parsed.value;
    const commandCanonicalJson = canonicalJson(command);
    const commandHash = taggedSha256(commandCanonicalJson) as CommandHash;

    try {
      return this.#ports.store.transact((store) => {
        const existing = store.findCommand(command.command_id);
        if (existing !== null) {
          if (
            existing.command_hash === commandHash &&
            existing.command_canonical_json === commandCanonicalJson
          ) {
            return {
              result_kind: "idempotent_replay" as const,
              transaction: existing.commit.transaction,
              commit: existing.commit,
            };
          }
          return failure(
            "command_identity_collision",
            "The command ID is already bound to different canonical command data.",
          );
        }
        if (store.transactionIdExists(command.transaction_id)) {
          return failure(
            "transaction_identity_collision",
            "The transaction ID is already bound to another command.",
          );
        }

        const readiness = store.readiness();
        if (readiness.status === "recovery_required") {
          return failure("recovery_required", readiness.safe_detail);
        }
        if (readiness.status !== "current") {
          return failure("storage_incompatible", readiness.safe_detail);
        }
        const campaign = store.loadCampaign(command.campaign_id);
        if (campaign === null) {
          return failure(
            "storage_incompatible",
            "The command campaign does not exist in this store.",
          );
        }
        if (campaign.state_hash !== hashGameState(campaign.state)) {
          return failure(
            "recovery_required",
            "The stored campaign head does not match its mechanical state hash.",
          );
        }
        const catalog = this.#ports.content.resolve(
          campaign.state.content_manifest_hash,
        );
        if (catalog === null) {
          return failure(
            "recovery_required",
            "The campaign's pinned content manifest is unavailable.",
          );
        }

        const committedAt = this.#ports.clock.now();
        if (!RFC3339_MILLISECONDS.test(committedAt)) {
          throw new Error(
            "Clock returned a non-canonical transaction timestamp.",
          );
        }
        const facts = allocateDecisionFacts(this.#ports.identity, command);
        const common = {
          store,
          command,
          commandCanonicalJson,
          commandHash,
          state: campaign.state,
          revision: campaign.revision,
          committedAt,
          facts,
          projector: this.#ports.projector,
          catalog,
        };

        if (command.expected_revision !== campaign.revision) {
          const commit = commitDecision({
            ...common,
            accepted: false,
            rejectionCode: "expected_revision_mismatch",
            safeDetail: `Expected revision ${command.expected_revision}; current revision is ${campaign.revision}.`,
            domainEvents: [],
          });
          return { result_kind: "committed_rejection" as const, commit };
        }

        if (command.kind === "undo_transaction") {
          const undo = store.loadUndoCandidate(
            command.campaign_id,
            command.payload.target_transaction_id,
          );
          if (undo.status === "none") {
            const commit = commitDecision({
              ...common,
              accepted: false,
              rejectionCode: "undo_no_eligible_transaction",
              safeDetail: "No accepted state-changing transaction is eligible.",
              domainEvents: [],
            });
            return { result_kind: "committed_rejection" as const, commit };
          }
          if (undo.status === "target_not_latest") {
            const commit = commitDecision({
              ...common,
              accepted: false,
              rejectionCode: "undo_target_not_latest",
              safeDetail: `Only latest transaction ${undo.latest_transaction_id} is eligible.`,
              domainEvents: [],
            });
            return { result_kind: "committed_rejection" as const, commit };
          }
          if (undo.candidate.transaction.outcome === "undo") {
            const commit = commitDecision({
              ...common,
              accepted: false,
              rejectionCode: "undo_target_is_undo",
              safeDetail: "A compensation transaction cannot be undone.",
              domainEvents: [],
            });
            return { result_kind: "committed_rejection" as const, commit };
          }
          if (undo.candidate.already_compensated) {
            const commit = commitDecision({
              ...common,
              accepted: false,
              rejectionCode: "undo_already_compensated",
              safeDetail: "The target transaction was already compensated.",
              domainEvents: [],
            });
            return { result_kind: "committed_rejection" as const, commit };
          }
          const plan = planTransactionCompensation({
            state: campaign.state,
            target_transaction_id: undo.candidate.transaction.transaction_id,
            events: undo.candidate.events,
          });
          if (!plan.accepted) {
            const commit = commitDecision({
              ...common,
              accepted: false,
              rejectionCode: plan.rejection_code,
              safeDetail: plan.safe_detail,
              domainEvents: [],
            });
            return { result_kind: "committed_rejection" as const, commit };
          }
          const commit = commitDecision({
            ...common,
            accepted: true,
            transactionOutcome: "undo",
            undoTargetTransactionId: undo.candidate.transaction.transaction_id,
            domainEvents: plan.events,
          });
          return { result_kind: "committed_acceptance" as const, commit };
        }

        let seed: Uint8Array | null = null;
        const random = {
          draw: (request: {
            readonly purpose: import("@lldm/contracts").RandomPurpose;
            readonly purpose_local_index: number;
            readonly minimum: number;
            readonly maximum: number;
          }) => {
            seed ??= this.#ports.seed_access.readSeed(
              store,
              command.campaign_id,
            );
            if (seed === null) {
              throw new Error("Campaign seed is unavailable.");
            }
            return this.#ports.random.draw({
              seed,
              campaign_id: command.campaign_id,
              command_id: command.command_id,
              ...request,
            });
          },
        };
        const decision = this.#ports.decider.decide({
          state: campaign.state,
          command,
          catalog,
          random,
          pending_check_id: facts.pending_check_id,
          submission_nonce: facts.submission_nonce,
          legal_action_id_for: facts.legal_action_id_for,
          wound_id: facts.wound_id,
          death_pending_check_id: facts.death_pending_check_id,
          death_submission_nonce: facts.death_submission_nonce,
          condition_id: facts.condition_id,
          scar_id: facts.scar_id,
        });
        if (!decision.accepted) {
          const commit = commitDecision({
            ...common,
            accepted: false,
            rejectionCode: decision.rejection_code,
            safeDetail: decision.safe_detail,
            domainEvents: [],
          });
          return { result_kind: "committed_rejection" as const, commit };
        }
        const commit = commitDecision({
          ...common,
          accepted: true,
          domainEvents: decision.events,
        });
        return { result_kind: "committed_acceptance" as const, commit };
      });
    } catch {
      return failure(
        "recovery_required",
        "Command coordination failed before an atomic commit completed.",
      );
    }
  }
}
