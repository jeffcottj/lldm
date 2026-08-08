import type {
  ClientCommandId,
  RoomCommandId,
  RoomSessionId,
  RoomTransactionId,
} from "@lldm/contracts";
import type {
  PendingMechanicalWorkflowRecord,
  RoomCommitInput,
  RoomStorePort,
  StoredRoomCommand,
} from "./room-coordinator.js";
import type {
  MechanicalWorkflowStorePort,
  RecoverableMechanicalWorkflow,
} from "./room-workflows.js";
import { hashRoomState } from "../hashing/room-state-hash.js";

export class InMemoryRoomStore
  implements RoomStorePort, MechanicalWorkflowStorePort
{
  readonly #rooms = new Map<RoomSessionId, RoomCommitInput["post_state"]>();
  readonly #commands = new Map<RoomCommandId, StoredRoomCommand>();
  readonly #clientCommands = new Map<ClientCommandId, StoredRoomCommand>();
  readonly #transactionIds = new Set<RoomTransactionId>();
  readonly #workflows = new Map<string, RecoverableMechanicalWorkflow>();
  #ready = true;

  setReady(ready: boolean): void {
    this.#ready = ready;
  }

  readiness() {
    return this.#ready
      ? ({ status: "current" } as const)
      : ({
          status: "unavailable",
          safe_detail: "Room storage requires recovery.",
        } as const);
  }

  findRoomCommand(roomCommandId: RoomCommandId): StoredRoomCommand | null {
    const value = this.#commands.get(roomCommandId);
    return value === undefined ? null : structuredClone(value);
  }

  findClientCommand(
    clientCommandId: ClientCommandId,
  ): StoredRoomCommand | null {
    const value = this.#clientCommands.get(clientCommandId);
    return value === undefined ? null : structuredClone(value);
  }

  roomTransactionIdExists(roomTransactionId: RoomTransactionId): boolean {
    return this.#transactionIds.has(roomTransactionId);
  }

  loadRoom(roomSessionId: RoomSessionId) {
    const value = this.#rooms.get(roomSessionId);
    return value === undefined ? null : structuredClone(value);
  }

  inspectEvents(roomSessionId: RoomSessionId) {
    return [...this.#commands.values()]
      .filter(({ command }) => command.room_session_id === roomSessionId)
      .flatMap(({ events }) => structuredClone(events))
      .sort((left, right) => left.room_revision - right.room_revision);
  }

  inspectTransactions(roomSessionId: RoomSessionId) {
    return [...this.#commands.values()]
      .filter(({ command }) => command.room_session_id === roomSessionId)
      .map(({ transaction }) => structuredClone(transaction))
      .sort(
        (left, right) => left.first_room_revision - right.first_room_revision,
      );
  }

  commitRoom(input: RoomCommitInput): void {
    const current = this.#rooms.get(input.post_state.room_session_id) ?? null;
    if ((current === null) !== (input.pre_state === null))
      throw new Error("Room commit creation/head state mismatch.");
    if (
      current !== null &&
      input.pre_state !== null &&
      hashRoomState(current) !== hashRoomState(input.pre_state)
    )
      throw new Error("Room commit pre-state is stale.");
    if (
      this.#commands.has(input.command.room_command_id) ||
      this.#transactionIds.has(input.command.room_transaction_id)
    )
      throw new Error("Room commit identity is occupied.");
    this.#rooms.set(
      input.post_state.room_session_id,
      structuredClone(input.post_state),
    );
    const stored: StoredRoomCommand = structuredClone(input);
    this.#commands.set(input.command.room_command_id, stored);
    if (input.command.client_command_id !== undefined)
      this.#clientCommands.set(input.command.client_command_id, stored);
    this.#transactionIds.add(input.command.room_transaction_id);
    if (input.pending_mechanical_workflow !== undefined)
      this.#workflows.set(input.pending_mechanical_workflow.workflow_id, {
        ...structuredClone(input.pending_mechanical_workflow),
        status: "pending",
        mechanical_outcome_json: null,
        recovery_attempts: 0,
      });
    if (input.completed_mechanical_workflow !== undefined) {
      const workflow = this.#workflows.get(
        input.completed_mechanical_workflow.workflow_id,
      );
      if (workflow === undefined || workflow.status !== "pending")
        throw new Error("Completed in-memory workflow is not pending.");
      this.#workflows.set(input.completed_mechanical_workflow.workflow_id, {
        ...workflow,
        status: input.completed_mechanical_workflow.status,
        mechanical_outcome_json:
          input.completed_mechanical_workflow.mechanical_outcome_json,
      });
    }
  }

  findWorkflowByClient(
    clientCommandId: string,
  ): RecoverableMechanicalWorkflow | null {
    const value = [...this.#workflows.values()].find(
      ({ client_command_id }) => client_command_id === clientCommandId,
    );
    return value === undefined ? null : structuredClone(value);
  }

  listPendingWorkflows(
    roomSessionId?: RoomSessionId,
  ): readonly RecoverableMechanicalWorkflow[] {
    return [...this.#workflows.values()]
      .filter(
        ({ status, room_session_id }) =>
          status === "pending" &&
          (roomSessionId === undefined || room_session_id === roomSessionId),
      )
      .map((value) => structuredClone(value));
  }

  recordRecoveryAttempt(workflowId: string, _at: string): void {
    const value = this.#workflows.get(workflowId);
    if (value !== undefined)
      this.#workflows.set(workflowId, {
        ...value,
        recovery_attempts: value.recovery_attempts + 1,
      });
  }
}
