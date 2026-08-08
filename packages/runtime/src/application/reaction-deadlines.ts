import {
  SCHEMA_VERSION,
  type ReactionWindowId,
  type RoomCommand,
  type RoomSessionId,
  type RoomState,
  type SeatId,
  sha256Hex,
} from "@lldm/contracts";
import { RoomCoordinator, type RoomStorePort } from "./room-coordinator.js";

export interface ReactionSchedulerPort {
  schedule(key: string, at_epoch_ms: number, callback: () => void): void;
  cancel(key: string): void;
}

export interface ReactionTimeoutSink {
  submit(command: RoomCommand): void;
}

function key(
  roomSessionId: RoomSessionId,
  reactionWindowId: ReactionWindowId,
): string {
  return `${roomSessionId}:${reactionWindowId}`;
}

function command(
  state: RoomState,
  suffix: string,
  intent: RoomCommand["intent"],
): RoomCommand {
  const digest = sha256Hex(
    `reaction_deadline_v1\u0000${state.room_session_id}\u0000${suffix}\u0000${state.room_revision}`,
  );
  return {
    schema_version: SCHEMA_VERSION,
    room_command_id: `room_command_reaction_${digest.slice(0, 24)}` as never,
    room_transaction_id:
      `room_transaction_reaction_${digest.slice(24, 48)}` as never,
    room_session_id: state.room_session_id,
    source: "system",
    client_command_id:
      `client_command_reaction_${digest.slice(0, 24)}` as never,
    expected_room_revision: state.room_revision,
    expected_view_revision: state.view_revision,
    intent,
  };
}

export class ReactionDeadlineService {
  readonly #store: RoomStorePort;
  readonly #coordinator: RoomCoordinator;
  readonly #scheduler: ReactionSchedulerPort;
  readonly #sink: ReactionTimeoutSink;
  readonly #now: () => number;
  readonly #connected = new Map<RoomSessionId, boolean>();

  constructor(input: {
    readonly store: RoomStorePort;
    readonly scheduler: ReactionSchedulerPort;
    readonly sink: ReactionTimeoutSink;
    readonly now?: () => number;
  }) {
    this.#store = input.store;
    this.#coordinator = new RoomCoordinator({
      store: input.store,
      now: () => new Date((input.now ?? Date.now)()).toISOString(),
    });
    this.#scheduler = input.scheduler;
    this.#sink = input.sink;
    this.#now = input.now ?? Date.now;
  }

  start(input: {
    readonly room_session_id: RoomSessionId;
    readonly seat_id: SeatId;
    readonly reaction_window_id: ReactionWindowId;
    readonly duration_ms: number;
  }): RoomState {
    if (
      !Number.isInteger(input.duration_ms) ||
      input.duration_ms < 1 ||
      input.duration_ms > 120_000
    )
      throw new Error("Reaction duration is outside the bounded range.");
    const state = this.#requiredRoom(input.room_session_id);
    const deadline = this.#now() + input.duration_ms;
    const submitted = this.#coordinator.submit(
      command(state, `start:${input.reaction_window_id}`, {
        kind: "reaction_timeout",
        payload: { reaction_window_id: input.reaction_window_id },
      }),
      () => ({
        accepted: true,
        events: [
          {
            visibility: "public",
            addressed_seat_id: input.seat_id,
            body: {
              kind: "reaction_deadline_started",
              payload: {
                seat_id: input.seat_id,
                reaction_window_id: input.reaction_window_id,
                deadline_at: new Date(deadline).toISOString(),
              },
            },
          },
        ],
      }),
    );
    if (!("commit" in submitted)) throw new Error(submitted.safe_detail);
    if (this.#connected.get(input.room_session_id) === true)
      this.#schedule(submitted.commit.post_state);
    return submitted.commit.post_state;
  }

  setConnectionKnown(
    roomSessionId: RoomSessionId,
    connected: boolean,
  ): RoomState {
    this.#connected.set(roomSessionId, connected);
    const state = this.#requiredRoom(roomSessionId);
    const pending = state.reaction_deadline;
    if (pending === null) return state;
    const scheduleKey = key(
      roomSessionId,
      pending.reaction_window_id as ReactionWindowId,
    );
    this.#scheduler.cancel(scheduleKey);
    if (!connected && !pending.paused) {
      const remaining = Math.max(
        0,
        Date.parse(pending.deadline_at) - this.#now(),
      );
      const submitted = this.#coordinator.submit(
        command(state, `pause:${pending.reaction_window_id}`, {
          kind: "reaction_timeout",
          payload: {
            reaction_window_id: pending.reaction_window_id as ReactionWindowId,
          },
        }),
        () => ({
          accepted: true,
          events: [
            {
              visibility: "public",
              addressed_seat_id: pending.seat_id,
              body: {
                kind: "reaction_deadline_paused",
                payload: {
                  seat_id: pending.seat_id,
                  reason: "disconnect",
                  remaining_ms: remaining,
                },
              },
            },
            {
              visibility: "public",
              addressed_seat_id: pending.seat_id,
              body: {
                kind: "recovery_status_changed",
                payload: {
                  seat_id: pending.seat_id,
                  status: "grace",
                  grace_expires_at: new Date(
                    this.#now() + 30_000,
                  ).toISOString(),
                },
              },
            },
          ],
        }),
      );
      if (!("commit" in submitted)) throw new Error(submitted.safe_detail);
      return submitted.commit.post_state;
    }
    if (connected && pending.paused) {
      const remaining = pending.remaining_ms ?? 0;
      const deadline = this.#now() + remaining;
      const submitted = this.#coordinator.submit(
        command(state, `resume:${pending.reaction_window_id}`, {
          kind: "reaction_timeout",
          payload: {
            reaction_window_id: pending.reaction_window_id as ReactionWindowId,
          },
        }),
        () => ({
          accepted: true,
          events: [
            {
              visibility: "public",
              addressed_seat_id: pending.seat_id,
              body: {
                kind: "recovery_status_changed",
                payload: { seat_id: pending.seat_id, status: "connected" },
              },
            },
            {
              visibility: "public",
              addressed_seat_id: pending.seat_id,
              body: {
                kind: "reaction_deadline_started",
                payload: {
                  seat_id: pending.seat_id,
                  reaction_window_id: pending.reaction_window_id,
                  deadline_at: new Date(deadline).toISOString(),
                },
              },
            },
          ],
        }),
      );
      if (!("commit" in submitted)) throw new Error(submitted.safe_detail);
      this.#schedule(submitted.commit.post_state);
      return submitted.commit.post_state;
    }
    if (connected) this.#schedule(state);
    return state;
  }

  recover(roomSessionId: RoomSessionId): RoomState {
    this.#connected.delete(roomSessionId);
    return this.#requiredRoom(roomSessionId);
  }

  #schedule(state: RoomState): void {
    const pending = state.reaction_deadline;
    if (
      pending === null ||
      pending.paused ||
      this.#connected.get(state.room_session_id) !== true
    )
      return;
    const scheduleKey = key(
      state.room_session_id,
      pending.reaction_window_id as ReactionWindowId,
    );
    this.#scheduler.schedule(
      scheduleKey,
      Date.parse(pending.deadline_at),
      () => {
        if (this.#connected.get(state.room_session_id) !== true) return;
        const current = this.#store.loadRoom(state.room_session_id);
        if (
          current?.reaction_deadline?.reaction_window_id !==
            pending.reaction_window_id ||
          current.reaction_deadline.paused
        )
          return;
        this.#sink.submit(
          command(current, `timeout:${pending.reaction_window_id}`, {
            kind: "reaction_timeout",
            payload: {
              reaction_window_id:
                pending.reaction_window_id as ReactionWindowId,
            },
          }),
        );
      },
    );
  }

  #requiredRoom(roomSessionId: RoomSessionId): RoomState {
    const state = this.#store.loadRoom(roomSessionId);
    if (state === null) throw new Error("Reaction room is unavailable.");
    return state;
  }
}
