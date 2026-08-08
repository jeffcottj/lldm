import {
  type CorrectionRequestId,
  ROOM_STATE_SCHEMA_VERSION,
  SCHEMA_VERSION,
  type RoomCommand,
  RoomCommandSchema,
  type RoomCommandHash,
  type RoomEvent,
  validateRoomEvent,
  type RoomEventBody,
  type RoomState,
  type RoomTransactionRecord,
  RoomTransactionRecordSchema,
  canonicalJson,
  sha256Hex,
  taggedSha256,
  validateValue,
} from "@lldm/contracts";
import { hashRoomState } from "../hashing/room-state-hash.js";
import { applyRoomEvent, initialRoomStateFromEvent } from "./room-replay.js";

export interface StoredRoomCommand {
  readonly command: RoomCommand;
  readonly command_canonical_json: string;
  readonly command_hash: RoomCommandHash;
  readonly transaction: RoomTransactionRecord;
  readonly events: readonly RoomEvent[];
  readonly post_state: RoomState;
}

export interface RoomCommitInput extends StoredRoomCommand {
  readonly pre_state: RoomState | null;
  readonly pending_mechanical_workflow?: PendingMechanicalWorkflowRecord;
  readonly completed_mechanical_workflow?: CompletedMechanicalWorkflowRecord;
}

export interface PendingMechanicalWorkflowRecord {
  readonly workflow_id: string;
  readonly room_session_id: string;
  readonly client_command_id: string;
  readonly room_command_id: string;
  readonly game_command_id: string;
  readonly game_transaction_id: string;
  readonly expected_mechanical_revision: number;
  readonly derived_game_command_json: string;
}

export interface CompletedMechanicalWorkflowRecord {
  readonly workflow_id: string;
  readonly status: "completed" | "failed";
  readonly mechanical_outcome_json: string;
  readonly completed_at: string;
}

export interface RoomStorePort {
  readiness():
    | { readonly status: "current" }
    | { readonly status: "unavailable"; readonly safe_detail: string };
  findRoomCommand(
    roomCommandId: RoomCommand["room_command_id"],
  ): StoredRoomCommand | null;
  findClientCommand(
    clientCommandId: NonNullable<RoomCommand["client_command_id"]>,
  ): StoredRoomCommand | null;
  roomTransactionIdExists(
    roomTransactionId: RoomCommand["room_transaction_id"],
  ): boolean;
  loadRoom(roomSessionId: RoomCommand["room_session_id"]): RoomState | null;
  commitRoom(input: RoomCommitInput): void;
}

export interface RoomEventProposal {
  readonly visibility: RoomEvent["visibility"];
  readonly addressed_participant_id?: RoomEvent["addressed_participant_id"];
  readonly addressed_seat_id?: RoomEvent["addressed_seat_id"];
  readonly body: RoomEventBody;
}

export type RoomDecision =
  | {
      readonly accepted: true;
      readonly events: readonly RoomEventProposal[];
      readonly linked_game_transaction_id?: RoomTransactionRecord["linked_game_transaction_id"];
      readonly pending_mechanical_workflow?: PendingMechanicalWorkflowRecord;
      readonly completed_mechanical_workflow?: CompletedMechanicalWorkflowRecord;
    }
  | {
      readonly accepted: false;
      readonly code: string;
      readonly safe_detail: string;
    };

export type RoomSubmissionResult =
  | {
      readonly result_kind:
        | "committed_acceptance"
        | "committed_rejection"
        | "idempotent_replay";
      readonly commit: StoredRoomCommand;
    }
  | {
      readonly result_kind:
        | "malformed_command"
        | "room_command_identity_collision"
        | "room_transaction_identity_collision"
        | "storage_incompatible";
      readonly safe_detail: string;
    };

function eventId(
  command: RoomCommand,
  index: number,
): RoomEvent["room_event_id"] {
  return `room_event_${sha256Hex(`${command.room_transaction_id}\u0000${index}`).slice(0, 32)}` as RoomEvent["room_event_id"];
}

function envelopeEvents(
  command: RoomCommand,
  firstRevision: number,
  proposals: readonly RoomEventProposal[],
): readonly RoomEvent[] {
  return proposals.map((proposal, index) => {
    const result = validateRoomEvent({
      schema_version: SCHEMA_VERSION,
      room_event_id: eventId(command, index),
      room_session_id: command.room_session_id,
      room_transaction_id: command.room_transaction_id,
      caused_by_room_command_id: command.room_command_id,
      transaction_index: index,
      room_revision: firstRevision + index,
      visibility: proposal.visibility,
      ...(proposal.addressed_participant_id === undefined
        ? {}
        : { addressed_participant_id: proposal.addressed_participant_id }),
      ...(proposal.addressed_seat_id === undefined
        ? {}
        : { addressed_seat_id: proposal.addressed_seat_id }),
      body: proposal.body,
    });
    if (!result.success)
      throw new Error(
        `Runtime produced invalid room event: ${result.issues.map(({ path, code }) => `${path}:${code}`).join(",")}`,
      );
    return result.value;
  });
}

function rejected(code: string, safe_detail: string): RoomDecision {
  return { accepted: false, code, safe_detail };
}

export function decideRoomOnlyCommand(
  state: RoomState,
  command: RoomCommand,
): RoomDecision {
  const participant =
    command.participant_id === undefined
      ? undefined
      : state.participants.find(
          ({ participant_id }) => participant_id === command.participant_id,
        );
  const isPlayerHost =
    command.participant_id !== undefined &&
    command.participant_id === state.player_host_participant_id;
  const requireApproved = (): RoomDecision | null =>
    participant?.status === "approved"
      ? null
      : rejected(
          "participant_not_approved",
          "This participant is not approved for the room.",
        );
  const requirePlayerHost = (): RoomDecision | null =>
    isPlayerHost
      ? null
      : rejected(
          "not_player_host",
          "Only the current player-host may use this control.",
        );
  const intent = command.intent;
  switch (intent.kind) {
    case "request_join":
      if (command.participant_id === undefined)
        return rejected("not_authenticated", "Join identity was not resolved.");
      if (participant !== undefined)
        return rejected(
          "participant_exists",
          "This participant already has a room record.",
        );
      return {
        accepted: true,
        events: [
          {
            visibility: "player_host_operational",
            body: {
              kind: "participant_join_requested",
              payload: {
                participant_id: command.participant_id,
                display_name: intent.payload.display_name,
              },
            },
          },
        ],
      };
    case "approve_participant":
    case "reject_participant": {
      const denied = requirePlayerHost();
      if (denied !== null) return denied;
      const target = state.participants.find(
        ({ participant_id }) =>
          participant_id === intent.payload.participant_id,
      );
      if (target?.status !== "pending")
        return rejected(
          "join_not_pending",
          "The join request is no longer pending.",
        );
      return {
        accepted: true,
        events: [
          {
            visibility: "public",
            body: {
              kind:
                intent.kind === "approve_participant"
                  ? "participant_approved"
                  : "participant_rejected",
              payload: { participant_id: target.participant_id },
            },
          },
        ],
      };
    }
    case "claim_hero": {
      const denied = requireApproved();
      if (denied !== null) return denied;
      const seat = state.seats.find(
        ({ seat_id, starter_loadout_id }) =>
          seat_id === intent.payload.seat_id &&
          starter_loadout_id === intent.payload.starter_loadout_id,
      );
      if (seat === undefined)
        return rejected(
          "stale_legal_candidate",
          "That starter is no longer available.",
        );
      if (seat.participant_id !== null)
        return rejected(
          "hero_just_taken",
          "That hero was just taken. Choose another.",
        );
      if (
        state.mode === "normal" &&
        state.seats.some(
          ({ participant_id }) => participant_id === command.participant_id,
        )
      )
        return rejected(
          "normal_mode_seat_limit",
          "Normal play assigns one hero to each participant.",
        );
      return {
        accepted: true,
        events: [
          {
            visibility: "public",
            body: {
              kind: "seat_assigned",
              payload: {
                seat_id: seat.seat_id,
                participant_id: command.participant_id as NonNullable<
                  typeof command.participant_id
                >,
                starter_loadout_id: seat.starter_loadout_id,
              },
            },
          },
        ],
      };
    }
    case "release_seat":
    case "release_disconnected_activation": {
      const seatId = intent.payload.seat_id;
      const seat = state.seats.find(({ seat_id }) => seat_id === seatId);
      if (seat === undefined)
        return rejected("seat_not_owned", "The seat does not exist.");
      if (!isPlayerHost && seat.participant_id !== command.participant_id)
        return rejected(
          "seat_not_owned",
          "This participant does not own the seat.",
        );
      return {
        accepted: true,
        events: [
          {
            visibility: "public",
            body: { kind: "seat_released", payload: { seat_id: seatId } },
          },
        ],
      };
    }
    case "select_seat": {
      const seat = state.seats.find(
        ({ seat_id }) => seat_id === intent.payload.seat_id,
      );
      if (
        seat === undefined ||
        seat.participant_id !== command.participant_id ||
        command.participant_id === undefined
      )
        return rejected(
          "seat_not_owned",
          "This participant does not own the selected seat.",
        );
      return {
        accepted: true,
        events: [
          {
            visibility: "participant_private",
            addressed_participant_id: command.participant_id,
            addressed_seat_id: seat.seat_id,
            body: {
              kind: "selected_seat_changed",
              payload: {
                participant_id: command.participant_id,
                seat_id: seat.seat_id,
              },
            },
          },
        ],
      };
    }
    case "record_party_choice": {
      const denied = requirePlayerHost();
      if (denied !== null) return denied;
      return rejected(
        "guided_runner_required",
        "The guided runner must validate this option against the active beat.",
      );
    }
    case "request_correction": {
      const denied = requireApproved();
      if (denied !== null || command.participant_id === undefined)
        return (
          denied ??
          rejected("not_authenticated", "Participant identity is required.")
        );
      if (state.correction_request !== null)
        return rejected(
          "correction_pending",
          "A correction request is already pending.",
        );
      const id =
        `correction_request_${sha256Hex(command.room_command_id).slice(0, 32)}` as CorrectionRequestId;
      return {
        accepted: true,
        events: [
          {
            visibility: "player_host_operational",
            body: {
              kind: "correction_requested",
              payload: {
                correction_request_id: id,
                participant_id: command.participant_id,
                target_transaction_id: intent.payload.target_transaction_id,
              },
            },
          },
        ],
      };
    }
    case "cancel_correction": {
      if (
        state.correction_request?.correction_request_id !==
          intent.payload.correction_request_id ||
        (!isPlayerHost &&
          state.correction_request.participant_id !== command.participant_id)
      )
        return rejected(
          "correction_not_eligible",
          "This correction request cannot be cancelled here.",
        );
      return {
        accepted: true,
        events: [
          {
            visibility: "public",
            body: {
              kind: "correction_resolved",
              payload: {
                correction_request_id: intent.payload.correction_request_id,
                result: "cancelled",
                safe_detail: "The correction request was cancelled.",
              },
            },
          },
        ],
      };
    }
    case "transfer_player_host": {
      const denied = requirePlayerHost();
      if (denied !== null) return denied;
      const target = state.participants.find(
        ({ participant_id }) =>
          participant_id === intent.payload.participant_id,
      );
      if (target?.status !== "approved")
        return rejected(
          "participant_not_approved",
          "Host authority can transfer only to an approved participant.",
        );
      return {
        accepted: true,
        events: [
          {
            visibility: "public",
            body: {
              kind: "player_host_assigned",
              payload: {
                participant_id: target.participant_id,
                reason: "transfer",
              },
            },
          },
        ],
      };
    }
    case "reassign_seat": {
      const denied = requirePlayerHost();
      if (denied !== null) return denied;
      const target = state.participants.find(
        ({ participant_id }) =>
          participant_id === intent.payload.participant_id,
      );
      const seat = state.seats.find(
        ({ seat_id }) => seat_id === intent.payload.seat_id,
      );
      if (target?.status !== "approved" || seat === undefined)
        return rejected(
          "stale_legal_candidate",
          "The participant or seat is no longer available.",
        );
      if (
        state.mode === "normal" &&
        state.seats.some(
          ({ participant_id, seat_id }) =>
            participant_id === target.participant_id &&
            seat_id !== seat.seat_id,
        )
      )
        return rejected(
          "normal_mode_seat_limit",
          "Normal play assigns one hero to each participant.",
        );
      const events: RoomEventProposal[] = [];
      if (seat.participant_id !== null)
        events.push({
          visibility: "public",
          body: { kind: "seat_released", payload: { seat_id: seat.seat_id } },
        });
      events.push({
        visibility: "public",
        body: {
          kind: "seat_assigned",
          payload: {
            seat_id: seat.seat_id,
            participant_id: target.participant_id,
            starter_loadout_id: seat.starter_loadout_id,
          },
        },
      });
      return { accepted: true, events };
    }
    case "start_run":
    case "suspend_run":
    case "resume_run": {
      const denied = requirePlayerHost();
      if (denied !== null) return denied;
      const status =
        intent.kind === "start_run" || intent.kind === "resume_run"
          ? "active"
          : "suspended";
      return {
        accepted: true,
        events: [
          {
            visibility: "public",
            body: { kind: "run_status_changed", payload: { status } },
          },
        ],
      };
    }
    case "claim_activation":
    case "commit_legal_action":
    case "choose_spark":
    case "submit_die":
    case "resolve_reaction":
    case "reaction_timeout":
    case "choose_guided_option":
    case "confirm_correction":
    case "recover_player_host":
    case "replace_relay_room":
    case "withdraw_combat":
      return rejected(
        "workflow_service_required",
        "This command requires its bounded workflow service.",
      );
    default: {
      const exhaustive: never = intent;
      return rejected(
        "unsupported_intent",
        `Unsupported intent ${(exhaustive as { kind?: string }).kind ?? "unknown"}.`,
      );
    }
  }
}

export class RoomCoordinator {
  readonly #store: RoomStorePort;
  readonly #now: () => string;

  constructor(input: {
    readonly store: RoomStorePort;
    readonly now?: () => string;
  }) {
    this.#store = input.store;
    this.#now = input.now ?? (() => new Date().toISOString());
  }

  submit(
    rawCommand: unknown,
    decide: (
      state: RoomState,
      command: RoomCommand,
    ) => RoomDecision = decideRoomOnlyCommand,
  ): RoomSubmissionResult {
    const parsed = validateValue(RoomCommandSchema, rawCommand);
    if (!parsed.success)
      return {
        result_kind: "malformed_command",
        safe_detail: "Room command failed centralized validation.",
      };
    const command = parsed.value;
    const canonical = canonicalJson(command);
    const hash = taggedSha256(canonical) as RoomCommandHash;
    const existing = this.#store.findRoomCommand(command.room_command_id);
    if (existing !== null)
      return existing.command_hash === hash &&
        existing.command_canonical_json === canonical
        ? { result_kind: "idempotent_replay", commit: existing }
        : {
            result_kind: "room_command_identity_collision",
            safe_detail:
              "Room command identity is already bound to different canonical data.",
          };
    if (command.client_command_id !== undefined) {
      const clientExisting = this.#store.findClientCommand(
        command.client_command_id,
      );
      if (clientExisting !== null)
        return clientExisting.command_hash === hash &&
          clientExisting.command_canonical_json === canonical
          ? { result_kind: "idempotent_replay", commit: clientExisting }
          : {
              result_kind: "room_command_identity_collision",
              safe_detail:
                "Client command identity is already bound to different canonical data.",
            };
    }
    if (this.#store.roomTransactionIdExists(command.room_transaction_id))
      return {
        result_kind: "room_transaction_identity_collision",
        safe_detail: "Room transaction identity is already occupied.",
      };
    const ready = this.#store.readiness();
    if (ready.status !== "current")
      return {
        result_kind: "storage_incompatible",
        safe_detail: ready.safe_detail,
      };
    const state = this.#store.loadRoom(command.room_session_id);
    if (state === null)
      return {
        result_kind: "storage_incompatible",
        safe_detail: "Room session does not exist.",
      };
    let decision: RoomDecision;
    if (
      command.expected_room_revision !== state.room_revision ||
      command.expected_view_revision !== state.view_revision
    )
      decision = rejected(
        "stale_view",
        `Expected room/view ${command.expected_room_revision}/${command.expected_view_revision}; current is ${state.room_revision}/${state.view_revision}.`,
      );
    else if (
      state.pending_workflow !== null &&
      command.source !== "system" &&
      !["request_join", "select_seat", "cancel_correction"].includes(
        command.intent.kind,
      )
    )
      decision = rejected(
        "room_busy_recovering",
        "The room is finishing a durable mechanical workflow.",
      );
    else decision = decide(state, command);
    const proposals = decision.accepted
      ? decision.events
      : [
          {
            visibility: "server_internal" as const,
            body: {
              kind: "room_command_rejected" as const,
              payload: {
                code: decision.code,
                safe_detail: decision.safe_detail,
              },
            },
          },
        ];
    if (proposals.length === 0)
      throw new Error(
        "Every canonical room transaction must contain an event.",
      );
    const events = envelopeEvents(command, state.room_revision + 1, proposals);
    let post = state;
    for (const event of events) post = applyRoomEvent(post, event);
    const transactionCandidate = {
      schema_version: SCHEMA_VERSION,
      room_session_id: command.room_session_id,
      room_command_id: command.room_command_id,
      ...(command.client_command_id === undefined
        ? {}
        : { client_command_id: command.client_command_id }),
      command_hash: hash,
      room_transaction_id: command.room_transaction_id,
      first_room_revision: events[0]?.room_revision,
      last_room_revision: events.at(-1)?.room_revision,
      event_count: events.length,
      pre_room_state_hash: hashRoomState(state),
      post_room_state_hash: hashRoomState(post),
      outcome: decision.accepted ? "accepted" : "rejected",
      ...(decision.accepted && decision.linked_game_transaction_id !== undefined
        ? { linked_game_transaction_id: decision.linked_game_transaction_id }
        : {}),
      committed_at: this.#now(),
    };
    const transaction = validateValue(
      RoomTransactionRecordSchema,
      transactionCandidate,
    );
    if (!transaction.success)
      throw new Error(
        `Runtime produced invalid room transaction: ${transaction.issues.map(({ path, code }) => `${path}:${code}`).join(",")}`,
      );
    const commit: StoredRoomCommand = {
      command,
      command_canonical_json: canonical,
      command_hash: hash,
      transaction: transaction.value,
      events,
      post_state: post,
    };
    this.#store.commitRoom({
      ...commit,
      pre_state: state,
      ...(decision.accepted &&
      decision.pending_mechanical_workflow !== undefined
        ? { pending_mechanical_workflow: decision.pending_mechanical_workflow }
        : {}),
      ...(decision.accepted &&
      decision.completed_mechanical_workflow !== undefined
        ? {
            completed_mechanical_workflow:
              decision.completed_mechanical_workflow,
          }
        : {}),
    });
    return {
      result_kind: decision.accepted
        ? "committed_acceptance"
        : "committed_rejection",
      commit,
    };
  }
}

export function buildRoomCreationCommit(input: {
  readonly command: RoomCommand;
  readonly body: Extract<RoomEventBody, { kind: "room_created" }>;
  readonly committed_at: string;
}): RoomCommitInput {
  const parsed = validateValue(RoomCommandSchema, input.command);
  if (!parsed.success) throw new Error("Room creation command is invalid.");
  const canonical = canonicalJson(parsed.value);
  const hash = taggedSha256(canonical) as RoomCommandHash;
  const events = envelopeEvents(parsed.value, 1, [
    { visibility: "server_internal", body: input.body },
  ]);
  const post = initialRoomStateFromEvent(events[0] as RoomEvent);
  const stateHash = hashRoomState(post);
  const transactionCandidate = {
    schema_version: SCHEMA_VERSION,
    room_session_id: parsed.value.room_session_id,
    room_command_id: parsed.value.room_command_id,
    ...(parsed.value.client_command_id === undefined
      ? {}
      : { client_command_id: parsed.value.client_command_id }),
    command_hash: hash,
    room_transaction_id: parsed.value.room_transaction_id,
    first_room_revision: 1,
    last_room_revision: 1,
    event_count: 1,
    pre_room_state_hash: stateHash,
    post_room_state_hash: stateHash,
    outcome: "accepted" as const,
    committed_at: input.committed_at,
  };
  const transaction = validateValue(
    RoomTransactionRecordSchema,
    transactionCandidate,
  );
  if (!transaction.success)
    throw new Error(
      `Room creation transaction is invalid: ${transaction.issues.map(({ path, code }) => `${path}:${code}`).join(",")}`,
    );
  return {
    command: parsed.value,
    command_canonical_json: canonical,
    command_hash: hash,
    transaction: transaction.value,
    events,
    post_state: post,
    pre_state: null,
  };
}
