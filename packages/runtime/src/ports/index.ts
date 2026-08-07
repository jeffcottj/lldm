import type {
  CampaignId,
  CommandHash,
  CommandId,
  CommittedTransactionRecord,
  ConditionId,
  EventId,
  GameCommand,
  GameEvent,
  GameState,
  LegalActionId,
  PendingCheckId,
  PhysicalRollNonce,
  RandomDrawRecord,
  RandomPurpose,
  ScarId,
  StateHash,
  TransactionId,
  WoundId,
} from "@lldm/contracts";
import type {
  CommandDecision,
  CommandDecisionInput,
  EngineContentCatalog,
} from "@lldm/engine";

export const RUNTIME_PORTS_BOUNDARY = "ports" as const;

export type StorageReadiness =
  | { readonly status: "current" }
  | { readonly status: "migration_required"; readonly safe_detail: string }
  | { readonly status: "incompatible"; readonly safe_detail: string }
  | { readonly status: "recovery_required"; readonly safe_detail: string };

export interface RuntimeCampaignHead {
  readonly campaign_id: CampaignId;
  readonly revision: number;
  readonly state: GameState;
  readonly state_hash: StateHash;
}

export interface RuntimeProjectionDraft {
  readonly audience_kind: "public" | "seat_private" | "host_control";
  readonly audience_key: string;
  readonly projection_kind: string;
  readonly revision: number;
  readonly canonical_json: string;
}

export interface CommittedCommand {
  readonly command: GameCommand;
  readonly command_canonical_json: string;
  readonly transaction: CommittedTransactionRecord;
  readonly events: readonly GameEvent[];
  readonly post_state: GameState;
  readonly projections: readonly RuntimeProjectionDraft[];
}

export interface StoredCommandRecord {
  readonly command_id: CommandId;
  readonly transaction_id: TransactionId;
  readonly command_hash: CommandHash;
  readonly command_canonical_json: string;
  readonly commit: CommittedCommand;
}

export interface AtomicCommitInput {
  readonly stored_command: StoredCommandRecord;
  readonly pre_state_hash: StateHash;
  readonly post_state_hash: StateHash;
  readonly post_state: GameState;
  readonly events: readonly GameEvent[];
  readonly projections: readonly RuntimeProjectionDraft[];
}

export interface RuntimeUndoCandidate {
  readonly transaction: CommittedTransactionRecord;
  readonly events: readonly GameEvent[];
  readonly already_compensated: boolean;
}

export interface AtomicCommandStore {
  readiness(): StorageReadiness;
  findCommand(commandId: CommandId): StoredCommandRecord | null;
  transactionIdExists(transactionId: TransactionId): boolean;
  loadCampaign(campaignId: CampaignId): RuntimeCampaignHead | null;
  readCampaignSeed(campaignId: CampaignId): Uint8Array | null;
  loadUndoCandidate(
    campaignId: CampaignId,
    targetTransactionId: TransactionId | null,
  ):
    | { readonly status: "none" }
    | {
        readonly status: "target_not_latest";
        readonly latest_transaction_id: TransactionId;
      }
    | { readonly status: "found"; readonly candidate: RuntimeUndoCandidate };
  commit(input: AtomicCommitInput): void;
}

export interface AtomicStorePort {
  transact<Result>(operation: (store: AtomicCommandStore) => Result): Result;
}

export interface ClockPort {
  now(): string;
}

export type RuntimeIdentityKind =
  | "event"
  | "pending_check"
  | "physical_roll_nonce"
  | "legal_action"
  | "wound"
  | "death_pending_check"
  | "death_physical_roll_nonce"
  | "condition"
  | "scar";

export interface IdentityPort {
  allocate(
    kind: RuntimeIdentityKind,
    transactionId: TransactionId,
    localIndex: number,
    stableKey?: string,
  ): string;
}

export interface SeedAccessPort {
  readSeed(
    store: AtomicCommandStore,
    campaignId: CampaignId,
  ): Uint8Array | null;
}

export interface RandomPort {
  draw(input: {
    readonly seed: Uint8Array;
    readonly campaign_id: CampaignId;
    readonly command_id: CommandId;
    readonly purpose: RandomPurpose;
    readonly purpose_local_index: number;
    readonly minimum: number;
    readonly maximum: number;
  }): RandomDrawRecord;
}

export interface ContentManifestPort {
  resolve(
    contentManifestHash: GameState["content_manifest_hash"],
  ): EngineContentCatalog | null;
}

export interface EngineDeciderPort {
  decide(input: CommandDecisionInput): CommandDecision;
}

export interface ProjectionPort {
  project(input: {
    readonly state: GameState;
    readonly revision: number;
    readonly catalog: EngineContentCatalog;
    readonly legal_action_id_for: (stableKey: string) => LegalActionId;
  }): readonly RuntimeProjectionDraft[];
}

export interface RuntimeAllocatedDecisionFacts {
  readonly pending_check_id: PendingCheckId;
  readonly submission_nonce: PhysicalRollNonce;
  readonly wound_id: WoundId;
  readonly death_pending_check_id: PendingCheckId;
  readonly death_submission_nonce: PhysicalRollNonce;
  readonly condition_id: ConditionId;
  readonly scar_id: ScarId;
  readonly legal_action_id_for: (stableKey: string) => LegalActionId;
  readonly event_id_for: (transactionIndex: number) => EventId;
}
