import Database from "better-sqlite3";
import {
  type ClientCommandId,
  type RoomCommandId,
  RoomCommandSchema,
  type RoomEvent,
  validateRoomEvent,
  type RoomSessionId,
  RoomStateSchema,
  type RoomTransactionId,
  RoomTransactionRecordSchema,
  canonicalJson,
  validateRoomState,
  validateValue,
  ClientDeliverableViewSchema,
  ServerInternalCombinedViewSchema,
  type ClientDeliverableView,
  type CombinedProjectionDelivery,
  CombinedProjectionDeliverySchema,
} from "@lldm/contracts";
import type {
  PendingMechanicalWorkflowRecord,
  RoomCommitInput,
  RoomStorePort,
  StoredRoomCommand,
} from "../application/room-coordinator.js";
import { replayRoom } from "../application/room-replay.js";
import { hashRoomState } from "../hashing/room-state-hash.js";
import { readMigrationStatus } from "./migrations.js";
import type {
  MechanicalWorkflowStorePort,
  RecoverableMechanicalWorkflow,
} from "../application/room-workflows.js";
import {
  deltaFor,
  snapshotFor,
  type CombinedProjectionSet,
} from "../application/combined-projections.js";

function parsedJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} contains invalid JSON.`);
  }
}

function parseStoredCommit(value: string): StoredRoomCommand {
  const candidate = parsedJson(value, "Stored room command result") as Record<
    string,
    unknown
  >;
  const command = validateValue(RoomCommandSchema, candidate.command);
  const transaction = validateValue(
    RoomTransactionRecordSchema,
    candidate.transaction,
  );
  const postState = validateRoomState(candidate.post_state);
  if (
    !command.success ||
    !transaction.success ||
    !postState.success ||
    !Array.isArray(candidate.events)
  )
    throw new Error("Stored room command result failed validation.");
  const events: RoomEvent[] = [];
  for (const item of candidate.events) {
    const event = validateRoomEvent(item);
    if (!event.success)
      throw new Error("Stored room command event failed validation.");
    events.push(event.value);
  }
  if (
    typeof candidate.command_canonical_json !== "string" ||
    typeof candidate.command_hash !== "string"
  )
    throw new Error("Stored room command binding failed validation.");
  const stored: StoredRoomCommand = {
    command: command.value,
    command_canonical_json: candidate.command_canonical_json,
    command_hash: candidate.command_hash as StoredRoomCommand["command_hash"],
    transaction: transaction.value,
    events,
    post_state: postState.value,
  };
  if (canonicalJson(stored.command) !== stored.command_canonical_json)
    throw new Error("Stored room command canonical bytes changed.");
  return stored;
}

export interface StoredMechanicalWorkflow
  extends RecoverableMechanicalWorkflow {
  readonly workflow_id: string;
  readonly room_session_id: string;
  readonly client_command_id: string;
  readonly room_command_id: string;
  readonly game_command_id: string;
  readonly game_transaction_id: string;
  readonly expected_mechanical_revision: number;
  readonly derived_game_command_json: string;
  readonly status: "pending" | "completed" | "failed";
  readonly mechanical_outcome_json: string | null;
  readonly recovery_attempts: number;
}

export class SqliteRoomStore
  implements RoomStorePort, MechanicalWorkflowStorePort
{
  readonly #database: Database.Database;
  #closed = false;

  constructor(readonly databasePath: string) {
    this.#database = new Database(databasePath);
    this.#database.pragma("foreign_keys = ON");
    this.#database.pragma("journal_mode = WAL");
    this.#database.pragma("synchronous = FULL");
    this.#database.pragma("busy_timeout = 5000");
    const ready = this.readiness();
    if (ready.status !== "current") {
      this.#database.close();
      throw new Error(ready.safe_detail);
    }
  }

  readiness() {
    const status = readMigrationStatus(this.#database);
    return status.status === "current" && status.current_version === 2
      ? ({ status: "current" } as const)
      : ({
          status: "unavailable",
          safe_detail: `Room storage migration status is ${status.status}.`,
        } as const);
  }

  findRoomCommand(roomCommandId: RoomCommandId): StoredRoomCommand | null {
    const row = this.#database
      .prepare(
        "SELECT result_json FROM room_commands WHERE room_command_id = ?",
      )
      .get(roomCommandId) as { result_json: string } | undefined;
    return row === undefined ? null : parseStoredCommit(row.result_json);
  }

  findClientCommand(
    clientCommandId: ClientCommandId,
  ): StoredRoomCommand | null {
    const row = this.#database
      .prepare(
        "SELECT result_json FROM room_commands WHERE client_command_id = ?",
      )
      .get(clientCommandId) as { result_json: string } | undefined;
    return row === undefined ? null : parseStoredCommit(row.result_json);
  }

  roomTransactionIdExists(roomTransactionId: RoomTransactionId): boolean {
    return (
      this.#database
        .prepare(
          "SELECT 1 FROM room_transactions WHERE room_transaction_id = ?",
        )
        .get(roomTransactionId) !== undefined
    );
  }

  loadRoom(roomSessionId: RoomSessionId) {
    const row = this.#database
      .prepare(
        "SELECT room_state_json, room_state_hash FROM room_sessions WHERE room_session_id = ?",
      )
      .get(roomSessionId) as
      | { room_state_json: string; room_state_hash: string }
      | undefined;
    if (row === undefined) return null;
    const state = validateRoomState(
      parsedJson(row.room_state_json, "Stored room state"),
    );
    if (
      !state.success ||
      canonicalJson(state.value) !== row.room_state_json ||
      hashRoomState(state.value) !== row.room_state_hash
    )
      throw new Error("Stored room head failed canonical hash validation.");
    return state.value;
  }

  inspectEvents(roomSessionId: RoomSessionId): readonly RoomEvent[] {
    return this.#database
      .prepare(
        "SELECT canonical_json FROM room_events WHERE room_session_id = ? ORDER BY room_revision",
      )
      .all(roomSessionId)
      .map((row) => {
        const event = validateRoomEvent(
          parsedJson(
            (row as { canonical_json: string }).canonical_json,
            "Stored room event",
          ),
        );
        if (!event.success)
          throw new Error("Stored room event failed validation.");
        return event.value;
      });
  }

  inspectTransactions(roomSessionId: RoomSessionId) {
    return this.#database
      .prepare(
        "SELECT c.result_json FROM room_transactions t JOIN room_commands c ON c.room_command_id = t.room_command_id WHERE t.room_session_id = ? ORDER BY t.first_room_revision",
      )
      .all(roomSessionId)
      .map(
        (row) =>
          parseStoredCommit((row as { result_json: string }).result_json)
            .transaction,
      );
  }

  verifyReplay(roomSessionId: RoomSessionId) {
    const head = this.loadRoom(roomSessionId);
    if (head === null) throw new Error("Room session does not exist.");
    return replayRoom({
      events: this.inspectEvents(roomSessionId),
      transactions: this.inspectTransactions(roomSessionId),
      expected_head_hash: hashRoomState(head),
    });
  }

  listResumableRooms(): readonly {
    readonly room_session_id: RoomSessionId;
    readonly campaign_id: string;
    readonly status: "lobby" | "active" | "suspended";
    readonly updated_at: string;
  }[] {
    return this.#database
      .prepare(
        "SELECT room_session_id, campaign_id, status, updated_at FROM room_sessions WHERE status IN ('lobby', 'active', 'suspended') ORDER BY updated_at DESC",
      )
      .all() as Array<{
      room_session_id: RoomSessionId;
      campaign_id: string;
      status: "lobby" | "active" | "suspended";
      updated_at: string;
    }>;
  }

  storeRelaySession(input: {
    readonly room_session_id: RoomSessionId;
    readonly relay_room_id: string;
    readonly relay_endpoint: string;
    readonly appliance_token_ciphertext: string;
    readonly invite_secret_ciphertext: string;
    readonly expires_at: string;
    readonly updated_at: string;
  }): void {
    this.#database
      .prepare(`INSERT INTO relay_sessions(room_session_id, relay_room_id, relay_endpoint, appliance_token_ciphertext, invite_secret_ciphertext, expires_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(room_session_id) DO UPDATE SET relay_room_id = excluded.relay_room_id, relay_endpoint = excluded.relay_endpoint, appliance_token_ciphertext = excluded.appliance_token_ciphertext, invite_secret_ciphertext = excluded.invite_secret_ciphertext, expires_at = excluded.expires_at, updated_at = excluded.updated_at`)
      .run(
        input.room_session_id,
        input.relay_room_id,
        input.relay_endpoint,
        input.appliance_token_ciphertext,
        input.invite_secret_ciphertext,
        input.expires_at,
        input.updated_at,
      );
  }

  loadRelaySession(roomSessionId: RoomSessionId): {
    readonly relay_room_id: string;
    readonly relay_endpoint: string;
    readonly appliance_token_ciphertext: string;
    readonly invite_secret_ciphertext: string;
    readonly expires_at: string;
  } | null {
    const row = this.#database
      .prepare(
        "SELECT relay_room_id, relay_endpoint, appliance_token_ciphertext, invite_secret_ciphertext, expires_at FROM relay_sessions WHERE room_session_id = ?",
      )
      .get(roomSessionId);
    return row === undefined
      ? null
      : (row as {
          relay_room_id: string;
          relay_endpoint: string;
          appliance_token_ciphertext: string;
          invite_secret_ciphertext: string;
          expires_at: string;
        });
  }

  commitRoom(input: RoomCommitInput): void {
    const transaction = this.#database.transaction(() => {
      const current = this.loadRoom(input.post_state.room_session_id);
      if ((current === null) !== (input.pre_state === null))
        throw new Error("Room commit creation/head mismatch.");
      if (
        current !== null &&
        input.pre_state !== null &&
        hashRoomState(current) !== hashRoomState(input.pre_state)
      )
        throw new Error("Room commit pre-state is stale.");
      if (input.pre_state === null) {
        this.#database
          .prepare(`INSERT INTO room_sessions(
          room_session_id, schema_version, room_state_schema_version, current_relay_room_id,
          campaign_id, mechanical_manifest_hash, presentation_manifest_hash,
          current_room_revision, current_view_revision, current_mechanical_revision,
          room_state_json, room_state_hash, status, mode, created_at, updated_at, relay_expires_at
        ) VALUES (?, 1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`)
          .run(
            input.post_state.room_session_id,
            input.post_state.current_relay_room_id,
            input.post_state.campaign_id,
            input.post_state.mechanical_manifest_hash,
            input.post_state.presentation_manifest_hash,
            input.post_state.room_revision,
            input.post_state.view_revision,
            input.post_state.mechanical_revision,
            canonicalJson(input.post_state),
            hashRoomState(input.post_state),
            input.post_state.status,
            input.post_state.mode,
            input.transaction.committed_at,
            input.transaction.committed_at,
          );
      }
      const resultJson = canonicalJson({
        command: input.command,
        command_canonical_json: input.command_canonical_json,
        command_hash: input.command_hash,
        transaction: input.transaction,
        events: input.events,
        post_state: input.post_state,
      });
      this.#database
        .prepare(`INSERT INTO room_commands(
        room_command_id, room_session_id, client_command_id, room_transaction_id,
        participant_id, seat_id, expected_room_revision, expected_view_revision,
        kind, canonical_json, command_hash, outcome, result_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          input.command.room_command_id,
          input.command.room_session_id,
          input.command.client_command_id ?? null,
          input.command.room_transaction_id,
          input.command.participant_id ?? null,
          input.command.seat_id ?? null,
          input.command.expected_room_revision,
          input.command.expected_view_revision,
          input.command.intent.kind,
          input.command_canonical_json,
          input.command_hash,
          input.transaction.outcome,
          resultJson,
        );
      this.#database
        .prepare(`INSERT INTO room_transactions(
        room_transaction_id, room_session_id, room_command_id, first_room_revision,
        last_room_revision, event_count, outcome, pre_room_state_hash,
        post_room_state_hash, linked_game_transaction_id, committed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(
          input.transaction.room_transaction_id,
          input.transaction.room_session_id,
          input.transaction.room_command_id,
          input.transaction.first_room_revision,
          input.transaction.last_room_revision,
          input.transaction.event_count,
          input.transaction.outcome,
          input.transaction.pre_room_state_hash,
          input.transaction.post_room_state_hash,
          input.transaction.linked_game_transaction_id ?? null,
          input.transaction.committed_at,
        );
      const insertEvent = this.#database.prepare(`INSERT INTO room_events(
        room_session_id, room_revision, room_event_id, room_transaction_id,
        transaction_index, caused_by_room_command_id, kind, visibility, canonical_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const event of input.events)
        insertEvent.run(
          event.room_session_id,
          event.room_revision,
          event.room_event_id,
          event.room_transaction_id,
          event.transaction_index,
          event.caused_by_room_command_id,
          event.body.kind,
          event.visibility,
          canonicalJson(event),
        );
      if (input.pre_state !== null)
        this.#database
          .prepare(`UPDATE room_sessions SET
        current_relay_room_id = ?, current_room_revision = ?, current_view_revision = ?,
        current_mechanical_revision = ?, room_state_json = ?, room_state_hash = ?,
        status = ?, updated_at = ? WHERE room_session_id = ?`)
          .run(
            input.post_state.current_relay_room_id,
            input.post_state.room_revision,
            input.post_state.view_revision,
            input.post_state.mechanical_revision,
            canonicalJson(input.post_state),
            hashRoomState(input.post_state),
            input.post_state.status,
            input.transaction.committed_at,
            input.post_state.room_session_id,
          );
      if (input.pending_mechanical_workflow !== undefined) {
        const workflow = input.pending_mechanical_workflow;
        this.#database
          .prepare(`INSERT INTO mechanical_workflows(
          workflow_id, room_session_id, client_command_id, room_command_id, game_command_id,
          game_transaction_id, expected_mechanical_revision, derived_game_command_json,
          status, mechanical_outcome_json, recovery_attempts
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, 0)`)
          .run(
            workflow.workflow_id,
            workflow.room_session_id,
            workflow.client_command_id,
            workflow.room_command_id,
            workflow.game_command_id,
            workflow.game_transaction_id,
            workflow.expected_mechanical_revision,
            workflow.derived_game_command_json,
          );
      }
      if (input.completed_mechanical_workflow !== undefined) {
        const completed = input.completed_mechanical_workflow;
        const changed = this.#database
          .prepare(
            "UPDATE mechanical_workflows SET status = ?, mechanical_outcome_json = ?, completed_at = ? WHERE workflow_id = ? AND status = 'pending'",
          )
          .run(
            completed.status,
            completed.mechanical_outcome_json,
            completed.completed_at,
            completed.workflow_id,
          );
        if (changed.changes !== 1)
          throw new Error("Completed workflow is not pending.");
      }
    });
    transaction.immediate();
  }

  insertPendingWorkflow(workflow: StoredMechanicalWorkflow): void {
    this.#database
      .prepare(`INSERT INTO mechanical_workflows(
      workflow_id, room_session_id, client_command_id, room_command_id, game_command_id,
      game_transaction_id, expected_mechanical_revision, derived_game_command_json,
      status, mechanical_outcome_json, recovery_attempts
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        workflow.workflow_id,
        workflow.room_session_id,
        workflow.client_command_id,
        workflow.room_command_id,
        workflow.game_command_id,
        workflow.game_transaction_id,
        workflow.expected_mechanical_revision,
        workflow.derived_game_command_json,
        workflow.status,
        workflow.mechanical_outcome_json,
        workflow.recovery_attempts,
      );
  }

  listPendingWorkflows(
    roomSessionId?: RoomSessionId,
  ): readonly StoredMechanicalWorkflow[] {
    const rows =
      roomSessionId === undefined
        ? this.#database
            .prepare(
              "SELECT * FROM mechanical_workflows WHERE status = 'pending' ORDER BY rowid",
            )
            .all()
        : this.#database
            .prepare(
              "SELECT * FROM mechanical_workflows WHERE status = 'pending' AND room_session_id = ? ORDER BY rowid",
            )
            .all(roomSessionId);
    return rows as StoredMechanicalWorkflow[];
  }

  findWorkflowByClient(
    clientCommandId: string,
  ): StoredMechanicalWorkflow | null {
    const row = this.#database
      .prepare("SELECT * FROM mechanical_workflows WHERE client_command_id = ?")
      .get(clientCommandId);
    return row === undefined ? null : (row as StoredMechanicalWorkflow);
  }

  updateWorkflow(input: {
    readonly workflow_id: string;
    readonly status: "completed" | "failed";
    readonly mechanical_outcome_json: string;
    readonly completed_at: string;
  }): void {
    this.#database
      .prepare(
        "UPDATE mechanical_workflows SET status = ?, mechanical_outcome_json = ?, completed_at = ? WHERE workflow_id = ? AND status = 'pending'",
      )
      .run(
        input.status,
        input.mechanical_outcome_json,
        input.completed_at,
        input.workflow_id,
      );
  }

  recordRecoveryAttempt(workflowId: string, at: string): void {
    this.#database
      .prepare(
        "UPDATE mechanical_workflows SET recovery_attempts = recovery_attempts + 1, last_recovery_at = ? WHERE workflow_id = ? AND status = 'pending'",
      )
      .run(at, workflowId);
  }

  replaceCombinedProjections(input: {
    readonly room_session_id: RoomSessionId;
    readonly projections: CombinedProjectionSet;
    readonly stored_at: string;
    readonly retain_deltas?: number;
  }): void {
    const records: Array<{
      audience_kind:
        | "public_tv"
        | "participant_private"
        | "player_host_operational"
        | "server_internal";
      audience_key: string;
      view: ClientDeliverableView | CombinedProjectionSet["server_internal"];
    }> = [
      {
        audience_kind: "public_tv",
        audience_key: "public",
        view: input.projections.public_tv,
      },
      ...[...input.projections.participants].map(([participantId, view]) => ({
        audience_kind: "participant_private" as const,
        audience_key: participantId,
        view,
      })),
      ...(input.projections.player_host === null
        ? []
        : [
            {
              audience_kind: "player_host_operational" as const,
              audience_key: `player_host:${input.projections.player_host.participant_id}`,
              view: input.projections.player_host,
            },
          ]),
      {
        audience_kind: "server_internal",
        audience_key: "server",
        view: input.projections.server_internal,
      },
    ];
    this.#database
      .transaction(() => {
        for (const record of records) {
          const previousRow = this.#database
            .prepare(
              "SELECT canonical_json FROM room_projections WHERE room_session_id = ? AND audience_kind = ? AND audience_key = ?",
            )
            .get(
              input.room_session_id,
              record.audience_kind,
              record.audience_key,
            ) as { canonical_json: string } | undefined;
          if (record.audience_kind !== "server_internal") {
            const current = validateValue(
              ClientDeliverableViewSchema,
              record.view,
            );
            if (!current.success)
              throw new Error(
                "Combined client projection failed validation before storage.",
              );
            if (previousRow !== undefined) {
              const previous = validateValue(
                ClientDeliverableViewSchema,
                parsedJson(
                  previousRow.canonical_json,
                  "Previous combined projection",
                ),
              );
              if (
                previous.success &&
                current.value.view_revision ===
                  previous.value.view_revision + 1 &&
                previous.value.view_kind === current.value.view_kind
              ) {
                const delta = deltaFor(
                  previous.value,
                  current.value,
                  record.audience_key,
                );
                this.#database
                  .prepare(
                    "INSERT OR REPLACE INTO room_projection_deltas(room_session_id, audience_key, base_view_revision, target_view_revision, canonical_json, stored_at) VALUES (?, ?, ?, ?, ?, ?)",
                  )
                  .run(
                    input.room_session_id,
                    record.audience_key,
                    previous.value.view_revision,
                    current.value.view_revision,
                    canonicalJson(delta),
                    input.stored_at,
                  );
              }
            }
          } else {
            const internal = validateValue(
              ServerInternalCombinedViewSchema,
              record.view,
            );
            if (!internal.success)
              throw new Error(
                "Server-internal combined projection failed validation.",
              );
          }
          this.#database
            .prepare(`INSERT INTO room_projections(room_session_id, audience_kind, audience_key, view_revision, canonical_json, stored_at)
          VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(room_session_id, audience_kind, audience_key)
          DO UPDATE SET view_revision = excluded.view_revision, canonical_json = excluded.canonical_json, stored_at = excluded.stored_at`)
            .run(
              input.room_session_id,
              record.audience_kind,
              record.audience_key,
              record.view.view_revision,
              canonicalJson(record.view),
              input.stored_at,
            );
        }
        const retain = input.retain_deltas ?? 64;
        this.#database
          .prepare(`DELETE FROM room_projection_deltas WHERE room_session_id = ? AND target_view_revision <= (
        SELECT MAX(target_view_revision) - ? FROM room_projection_deltas WHERE room_session_id = ?
      )`)
          .run(input.room_session_id, retain, input.room_session_id);
      })
      .immediate();
  }

  deliveriesSince(input: {
    readonly room_session_id: RoomSessionId;
    readonly audience_kind:
      | "public_tv"
      | "participant_private"
      | "player_host_operational";
    readonly audience_key: string;
    readonly cursor: number;
    readonly force_snapshot?: boolean;
  }): readonly CombinedProjectionDelivery[] {
    const row = this.#database
      .prepare(
        "SELECT canonical_json FROM room_projections WHERE room_session_id = ? AND audience_kind = ? AND audience_key = ?",
      )
      .get(input.room_session_id, input.audience_kind, input.audience_key) as
      | { canonical_json: string }
      | undefined;
    if (row === undefined) return [];
    const current = validateValue(
      ClientDeliverableViewSchema,
      parsedJson(row.canonical_json, "Combined projection"),
    );
    if (!current.success)
      throw new Error("Stored combined projection failed validation.");
    if (input.force_snapshot || input.cursor > current.value.view_revision)
      return [snapshotFor(current.value, input.audience_key)];
    if (input.cursor === current.value.view_revision) return [];
    const rows = this.#database
      .prepare(
        "SELECT base_view_revision, target_view_revision, canonical_json FROM room_projection_deltas WHERE room_session_id = ? AND audience_key = ? AND target_view_revision > ? ORDER BY target_view_revision",
      )
      .all(input.room_session_id, input.audience_key, input.cursor) as Array<{
      base_view_revision: number;
      target_view_revision: number;
      canonical_json: string;
    }>;
    let cursor = input.cursor;
    const deliveries: CombinedProjectionDelivery[] = [];
    for (const deltaRow of rows) {
      if (deltaRow.base_view_revision !== cursor)
        return [snapshotFor(current.value, input.audience_key)];
      const parsed = validateValue(
        CombinedProjectionDeliverySchema,
        parsedJson(deltaRow.canonical_json, "Combined delta"),
      );
      if (!parsed.success || parsed.value.delivery_kind !== "delta")
        return [snapshotFor(current.value, input.audience_key)];
      deliveries.push(parsed.value);
      cursor = deltaRow.target_view_revision;
    }
    return cursor === current.value.view_revision
      ? deliveries
      : [snapshotFor(current.value, input.audience_key)];
  }

  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    this.#database.close();
  }
}
