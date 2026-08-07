import type {
  CommittedTransactionRecord,
  NonCanonicalCommandFailureCode,
  ValidationIssue,
} from "@lldm/contracts";
import type { CommittedCommand } from "../ports/index.js";

export type CommandSubmissionResult =
  | {
      readonly result_kind: "committed_acceptance";
      readonly commit: CommittedCommand;
    }
  | {
      readonly result_kind: "committed_rejection";
      readonly commit: CommittedCommand;
    }
  | {
      readonly result_kind: "idempotent_replay";
      readonly transaction: CommittedTransactionRecord;
      readonly commit: CommittedCommand;
    }
  | {
      readonly result_kind: NonCanonicalCommandFailureCode;
      readonly safe_detail: string;
      readonly issues?: readonly ValidationIssue[];
    };
