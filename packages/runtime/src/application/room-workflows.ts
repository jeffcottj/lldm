import {
  type ClientCommandId,
  type GameCommand,
  GameCommandSchema,
  type MechanicalWorkflowId,
  type RoomCommand,
  RoomCommandSchema,
  type RoomState,
  SCHEMA_VERSION,
  canonicalJson,
  sha256Hex,
  validateValue,
} from "@lldm/contracts";
import type { CommandCoordinator } from "./coordinator.js";
import type { CommandSubmissionResult } from "./types.js";
import {
  type PendingMechanicalWorkflowRecord,
  type RoomDecision,
  RoomCoordinator,
  type RoomStorePort,
} from "./room-coordinator.js";

export interface RecoverableMechanicalWorkflow
  extends PendingMechanicalWorkflowRecord {
  readonly status: "pending" | "completed" | "failed";
  readonly mechanical_outcome_json: string | null;
  readonly recovery_attempts: number;
}

export interface MechanicalWorkflowStorePort {
  findWorkflowByClient(
    clientCommandId: string,
  ): RecoverableMechanicalWorkflow | null;
  listPendingWorkflows(
    roomSessionId?: RoomCommand["room_session_id"],
  ): readonly RecoverableMechanicalWorkflow[];
  recordRecoveryAttempt(workflowId: string, at: string): void;
}

export interface StableGameEnvelope {
  readonly command_id: GameCommand["command_id"];
  readonly transaction_id: GameCommand["transaction_id"];
}

export function deriveStableGameEnvelope(
  roomSessionId: string,
  clientCommandId: string,
): StableGameEnvelope {
  const digest = sha256Hex(
    `room_to_game_v1\u0000${roomSessionId}\u0000${clientCommandId}`,
  );
  return {
    command_id:
      `command_room_${digest.slice(0, 32)}` as GameCommand["command_id"],
    transaction_id:
      `transaction_room_${digest.slice(32)}` as GameCommand["transaction_id"],
  };
}

function workflowId(
  roomSessionId: string,
  clientCommandId: string,
): MechanicalWorkflowId {
  return `mechanical_workflow_${sha256Hex(`workflow_v1\u0000${roomSessionId}\u0000${clientCommandId}`).slice(0, 32)}` as MechanicalWorkflowId;
}

export type GameCommandMapper = (input: {
  readonly room: RoomState;
  readonly room_command: RoomCommand;
  readonly envelope: StableGameEnvelope;
}) => unknown;

export type DurableWorkflowResult =
  | {
      readonly result_kind: "completed" | "recovered";
      readonly mechanical: CommandSubmissionResult;
      readonly room: RoomState;
    }
  | { readonly result_kind: "rejected"; readonly safe_detail: string }
  | { readonly result_kind: "pending_recovery"; readonly safe_detail: string };

export class DurableRoomWorkflowService {
  readonly #roomCoordinator: RoomCoordinator;
  readonly #roomStore: RoomStorePort & MechanicalWorkflowStorePort;
  readonly #gameCoordinator: CommandCoordinator;
  readonly #now: () => string;

  constructor(input: {
    readonly room_store: RoomStorePort & MechanicalWorkflowStorePort;
    readonly game_coordinator: CommandCoordinator;
    readonly now?: () => string;
  }) {
    this.#roomStore = input.room_store;
    this.#roomCoordinator = new RoomCoordinator({
      store: input.room_store,
      ...(input.now === undefined ? {} : { now: input.now }),
    });
    this.#gameCoordinator = input.game_coordinator;
    this.#now = input.now ?? (() => new Date().toISOString());
  }

  submit(
    rawRoomCommand: unknown,
    mapper: GameCommandMapper,
    injectCrash?: "after_room_start" | "after_game_commit",
  ): DurableWorkflowResult {
    const roomCommandResult = validateValue(RoomCommandSchema, rawRoomCommand);
    if (!roomCommandResult.success)
      return {
        result_kind: "rejected",
        safe_detail: "Room workflow command failed validation.",
      };
    const roomCommand = roomCommandResult.value;
    if (
      roomCommand.client_command_id === undefined ||
      (roomCommand.source === "client" &&
        roomCommand.participant_id === undefined)
    )
      return {
        result_kind: "rejected",
        safe_detail:
          "Mechanical workflows require an authenticated client command or a bounded system command.",
      };
    const state = this.#roomStore.loadRoom(roomCommand.room_session_id);
    if (state === null)
      return {
        result_kind: "rejected",
        safe_detail: "Room session does not exist.",
      };
    const seatId =
      roomCommand.seat_id ??
      ("seat_id" in roomCommand.intent.payload
        ? roomCommand.intent.payload.seat_id
        : undefined);
    if (seatId !== undefined && roomCommand.source === "client") {
      const seat = state.seats.find(({ seat_id }) => seat_id === seatId);
      if (seat?.participant_id !== roomCommand.participant_id)
        return {
          result_kind: "rejected",
          safe_detail: "The selected seat is not owned by this participant.",
        };
    }
    const envelope = deriveStableGameEnvelope(
      state.room_session_id,
      roomCommand.client_command_id,
    );
    const rawGame = mapper({
      room: state,
      room_command: roomCommand,
      envelope,
    });
    const game = validateValue(GameCommandSchema, rawGame);
    if (
      !game.success ||
      game.value.command_id !== envelope.command_id ||
      game.value.transaction_id !== envelope.transaction_id ||
      game.value.campaign_id !== state.campaign_id ||
      game.value.expected_revision !== state.mechanical_revision
    )
      return {
        result_kind: "rejected",
        safe_detail: "Bounded room-to-game mapping failed validation.",
      };
    const workflow: PendingMechanicalWorkflowRecord = {
      workflow_id: workflowId(
        state.room_session_id,
        roomCommand.client_command_id,
      ),
      room_session_id: state.room_session_id,
      client_command_id: roomCommand.client_command_id,
      room_command_id: roomCommand.room_command_id,
      game_command_id: game.value.command_id,
      game_transaction_id: game.value.transaction_id,
      expected_mechanical_revision: state.mechanical_revision,
      derived_game_command_json: canonicalJson(game.value),
    };
    const startDecision = (): RoomDecision => ({
      accepted: true,
      events: [
        ...(roomCommand.intent.kind === "commit_legal_action" &&
        roomCommand.intent.payload.player_flavor !== undefined &&
        roomCommand.participant_id !== undefined &&
        seatId !== undefined
          ? [
              {
                visibility: "public" as const,
                addressed_participant_id: roomCommand.participant_id,
                addressed_seat_id: seatId,
                body: {
                  kind: "player_flavor_recorded" as const,
                  payload: {
                    participant_id: roomCommand.participant_id,
                    seat_id: seatId,
                    text: roomCommand.intent.payload.player_flavor,
                  },
                },
              },
            ]
          : []),
        {
          visibility: "server_internal",
          body: {
            kind: "mechanical_workflow_started",
            payload: {
              workflow_id: workflow.workflow_id as MechanicalWorkflowId,
              client_command_id: workflow.client_command_id as ClientCommandId,
              game_transaction_id: game.value.transaction_id,
              expected_mechanical_revision: state.mechanical_revision,
            },
          },
        },
      ],
      pending_mechanical_workflow: workflow,
    });
    const started = this.#roomCoordinator.submit(roomCommand, startDecision);
    if (
      started.result_kind === "malformed_command" ||
      started.result_kind === "room_command_identity_collision" ||
      started.result_kind === "room_transaction_identity_collision" ||
      started.result_kind === "storage_incompatible"
    )
      return { result_kind: "rejected", safe_detail: started.safe_detail };
    if (started.result_kind === "committed_rejection")
      return {
        result_kind: "rejected",
        safe_detail: "Room rejected the mechanical workflow.",
      };
    if (injectCrash === "after_room_start")
      throw new Error("Injected crash after durable room workflow start.");
    const existing = this.#roomStore.findWorkflowByClient(
      roomCommand.client_command_id,
    );
    if (existing?.status === "completed") {
      const current = this.#roomStore.loadRoom(roomCommand.room_session_id);
      if (current === null)
        return {
          result_kind: "pending_recovery",
          safe_detail: "Completed workflow room is unavailable.",
        };
      return {
        result_kind: "recovered",
        mechanical: JSON.parse(
          existing.mechanical_outcome_json ?? "null",
        ) as CommandSubmissionResult,
        room: current,
      };
    }
    const mechanical = this.#gameCoordinator.submit(game.value);
    if (injectCrash === "after_game_commit")
      throw new Error("Injected crash after mechanical commit.");
    return this.#finalize(workflow, mechanical, roomCommand.intent);
  }

  recoverPending(): readonly DurableWorkflowResult[] {
    const results: DurableWorkflowResult[] = [];
    for (const workflow of this.#roomStore.listPendingWorkflows()) {
      this.#roomStore.recordRecoveryAttempt(workflow.workflow_id, this.#now());
      const parsed = validateValue(
        GameCommandSchema,
        JSON.parse(workflow.derived_game_command_json) as unknown,
      );
      if (!parsed.success) {
        results.push({
          result_kind: "pending_recovery",
          safe_detail: "Stored workflow command is corrupt.",
        });
        continue;
      }
      const roomCommand = this.#roomStore.findRoomCommand(
        workflow.room_command_id as RoomCommand["room_command_id"],
      );
      if (roomCommand === null) {
        results.push({
          result_kind: "pending_recovery",
          safe_detail: "Stored workflow room command is missing.",
        });
        continue;
      }
      results.push(
        this.#finalize(
          workflow,
          this.#gameCoordinator.submit(parsed.value),
          roomCommand.command.intent,
          true,
        ),
      );
    }
    return results;
  }

  #finalize(
    workflow: PendingMechanicalWorkflowRecord,
    mechanical: CommandSubmissionResult,
    originalIntent: RoomCommand["intent"],
    recovered = false,
  ): DurableWorkflowResult {
    const state = this.#roomStore.loadRoom(
      workflow.room_session_id as RoomCommand["room_session_id"],
    );
    if (state === null)
      return {
        result_kind: "pending_recovery",
        safe_detail: "Workflow room is unavailable.",
      };
    const committed =
      mechanical.result_kind === "committed_acceptance" ||
      mechanical.result_kind === "committed_rejection" ||
      mechanical.result_kind === "idempotent_replay";
    const outcomeJson = canonicalJson(mechanical);
    const finalCommand: RoomCommand = {
      schema_version: SCHEMA_VERSION,
      room_command_id:
        `room_command_finalize_${sha256Hex(workflow.workflow_id).slice(0, 24)}` as RoomCommand["room_command_id"],
      room_transaction_id:
        `room_transaction_finalize_${sha256Hex(workflow.workflow_id).slice(0, 24)}` as RoomCommand["room_transaction_id"],
      room_session_id: state.room_session_id,
      source: "system",
      expected_room_revision: state.room_revision,
      expected_view_revision: state.view_revision,
      intent: originalIntent,
    };
    const physicalRequest = committed
      ? mechanical.commit.events.find(
          ({ kind }) => kind === "physical_roll_requested",
        )
      : undefined;
    const finalDecision = (): RoomDecision =>
      committed
        ? {
            accepted: true,
            linked_game_transaction_id:
              mechanical.commit.transaction.transaction_id,
            events: [
              {
                visibility: "public",
                body: {
                  kind: "mechanical_workflow_completed",
                  payload: {
                    workflow_id: workflow.workflow_id as MechanicalWorkflowId,
                    game_transaction_id:
                      mechanical.commit.transaction.transaction_id,
                    final_mechanical_revision:
                      mechanical.commit.transaction.last_revision,
                    outcome: mechanical.commit.transaction.outcome,
                  },
                },
              },
              ...(physicalRequest?.kind === "physical_roll_requested"
                ? [
                    {
                      visibility: "public" as const,
                      addressed_seat_id:
                        physicalRequest.payload.disclosure.eligible_roller,
                      body: {
                        kind: "physical_roll_waiting" as const,
                        payload: {
                          seat_id:
                            physicalRequest.payload.disclosure.eligible_roller,
                          pending_check_id:
                            physicalRequest.payload.pending_check_id,
                        },
                      },
                    },
                  ]
                : []),
              ...(originalIntent.kind === "resolve_reaction" &&
              state.reaction_deadline?.reaction_window_id ===
                originalIntent.payload.reaction_window_id
                ? [
                    {
                      visibility: "public" as const,
                      body: {
                        kind: "reaction_deadline_cleared" as const,
                        payload: {
                          reaction_window_id:
                            originalIntent.payload.reaction_window_id,
                          result: originalIntent.payload.response,
                        },
                      },
                    },
                  ]
                : []),
              ...(originalIntent.kind === "confirm_correction" &&
              state.correction_request?.correction_request_id ===
                originalIntent.payload.correction_request_id
                ? [
                    {
                      visibility: "public" as const,
                      body: {
                        kind: "correction_resolved" as const,
                        payload: {
                          correction_request_id:
                            originalIntent.payload.correction_request_id,
                          result: "accepted" as const,
                          safe_detail:
                            "The eligible latest transaction was corrected by a recorded compensating undo.",
                        },
                      },
                    },
                  ]
                : []),
            ],
            completed_mechanical_workflow: {
              workflow_id: workflow.workflow_id,
              status: "completed",
              mechanical_outcome_json: outcomeJson,
              completed_at: this.#now(),
            },
          }
        : {
            accepted: true,
            events: [
              {
                visibility: "server_internal",
                body: {
                  kind: "mechanical_workflow_failed",
                  payload: {
                    workflow_id: workflow.workflow_id as MechanicalWorkflowId,
                    safe_code: mechanical.result_kind,
                  },
                },
              },
            ],
            completed_mechanical_workflow: {
              workflow_id: workflow.workflow_id,
              status: "failed",
              mechanical_outcome_json: outcomeJson,
              completed_at: this.#now(),
            },
          };
    const finalized = this.#roomCoordinator.submit(finalCommand, finalDecision);
    if (!("commit" in finalized))
      return {
        result_kind: "pending_recovery",
        safe_detail: finalized.safe_detail,
      };
    return {
      result_kind: recovered ? "recovered" : "completed",
      mechanical,
      room: finalized.commit.post_state,
    };
  }
}
