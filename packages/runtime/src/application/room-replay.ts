import {
  ROOM_STATE_SCHEMA_VERSION,
  SCHEMA_VERSION,
  type RoomEvent,
  type RoomState,
  type RoomTransactionRecord,
  validateRoomState,
} from "@lldm/contracts";
import { hashRoomState } from "../hashing/room-state-hash.js";

function publicEntry(
  state: RoomState,
  event: RoomEvent,
  kind: RoomState["recent_public_history"][number]["kind"],
  text: string,
) {
  return [
    ...state.recent_public_history,
    {
      room_revision: event.room_revision,
      kind,
      text,
      ...(event.addressed_participant_id === undefined
        ? {}
        : { participant_id: event.addressed_participant_id }),
      ...(event.addressed_seat_id === undefined
        ? {}
        : { seat_id: event.addressed_seat_id }),
    },
  ].slice(-40);
}

export function initialRoomStateFromEvent(event: RoomEvent): RoomState {
  if (
    event.room_revision !== 1 ||
    event.transaction_index !== 0 ||
    event.body.kind !== "room_created"
  )
    throw new Error(
      "Room replay must begin with room_created at revision one.",
    );
  const payload = event.body.payload;
  const candidate: RoomState = {
    schema_version: SCHEMA_VERSION,
    room_state_schema_version: ROOM_STATE_SCHEMA_VERSION,
    record_kind: "room_state",
    room_session_id: event.room_session_id,
    current_relay_room_id: payload.relay_room_id,
    campaign_id: payload.campaign_id,
    mechanical_manifest_hash: payload.mechanical_manifest_hash,
    presentation_manifest_hash: payload.presentation_manifest_hash,
    mode: payload.mode,
    room_revision: 1,
    view_revision: 1,
    mechanical_revision: 0,
    status: "lobby",
    participants: [],
    seats: payload.seats.map((seat) => ({ ...seat, participant_id: null })),
    player_host_participant_id: null,
    current_beat_id: payload.start_beat_id,
    pending_workflow: null,
    pending_physical: null,
    reaction_deadline: null,
    recoveries: [],
    correction_request: null,
    private_clues: [],
    recent_public_history: [],
    conclusion: null,
  };
  const validated = validateRoomState(candidate);
  if (!validated.success)
    throw new Error("room_created produced invalid state.");
  return validated.value;
}

export function applyRoomEvent(state: RoomState, event: RoomEvent): RoomState {
  if (
    event.room_session_id !== state.room_session_id ||
    event.room_revision !== state.room_revision + 1
  )
    throw new Error("Room event identity or revision is not contiguous.");
  const next = structuredClone(state);
  next.room_revision = event.room_revision;
  next.view_revision += 1;
  const body = event.body;
  switch (body.kind) {
    case "room_created":
      throw new Error("room_created may appear only at revision one.");
    case "room_command_rejected":
      break;
    case "participant_join_requested":
      next.participants.push({
        ...body.payload,
        status: "pending",
        selected_seat_id: null,
      });
      break;
    case "participant_approved": {
      const participant = next.participants.find(
        ({ participant_id }) => participant_id === body.payload.participant_id,
      );
      if (participant === undefined)
        throw new Error("Cannot approve a missing participant.");
      participant.status = "approved";
      break;
    }
    case "participant_rejected": {
      const participant = next.participants.find(
        ({ participant_id }) => participant_id === body.payload.participant_id,
      );
      if (participant === undefined)
        throw new Error("Cannot reject a missing participant.");
      participant.status = "rejected";
      break;
    }
    case "player_host_assigned":
      next.player_host_participant_id = body.payload.participant_id;
      next.recent_public_history = publicEntry(
        next,
        event,
        "state_change",
        "Player-host authority changed.",
      );
      break;
    case "seat_assigned": {
      const seat = next.seats.find(
        ({ seat_id }) => seat_id === body.payload.seat_id,
      );
      if (
        seat === undefined ||
        seat.starter_loadout_id !== body.payload.starter_loadout_id
      )
        throw new Error("Seat assignment does not match the room roster.");
      seat.participant_id = body.payload.participant_id;
      const participant = next.participants.find(
        ({ participant_id }) => participant_id === body.payload.participant_id,
      );
      if (participant === undefined)
        throw new Error("Seat owner does not exist.");
      participant.selected_seat_id ??= seat.seat_id;
      next.recent_public_history = publicEntry(
        next,
        event,
        "state_change",
        `${participant.display_name} claimed a hero.`,
      );
      break;
    }
    case "seat_released": {
      const seat = next.seats.find(
        ({ seat_id }) => seat_id === body.payload.seat_id,
      );
      if (seat === undefined) throw new Error("Released seat does not exist.");
      const owner = seat.participant_id;
      seat.participant_id = null;
      if (owner !== null) {
        const participant = next.participants.find(
          ({ participant_id }) => participant_id === owner,
        );
        if (participant?.selected_seat_id === seat.seat_id)
          participant.selected_seat_id =
            next.seats.find((candidate) => candidate.participant_id === owner)
              ?.seat_id ?? null;
      }
      break;
    }
    case "selected_seat_changed": {
      const participant = next.participants.find(
        ({ participant_id }) => participant_id === body.payload.participant_id,
      );
      if (participant === undefined)
        throw new Error("Selected-seat participant is missing.");
      participant.selected_seat_id = body.payload.seat_id;
      break;
    }
    case "run_status_changed":
      next.status = body.payload.status;
      break;
    case "guided_beat_changed":
      next.current_beat_id = body.payload.beat_id;
      if (body.payload.selected_option_id !== undefined)
        next.recent_public_history = publicEntry(
          next,
          event,
          "choice",
          `The table chose ${body.payload.selected_option_id}.`,
        );
      break;
    case "mechanical_workflow_started":
      if (next.pending_workflow !== null)
        throw new Error("Only one mechanical workflow may be pending.");
      next.pending_workflow = {
        workflow_id: body.payload.workflow_id,
        game_transaction_id: body.payload.game_transaction_id,
        expected_mechanical_revision: body.payload.expected_mechanical_revision,
        status: "pending",
      };
      break;
    case "mechanical_workflow_completed":
      if (next.pending_workflow?.workflow_id !== body.payload.workflow_id)
        throw new Error("Completed workflow is not pending.");
      next.pending_workflow = null;
      next.mechanical_revision = body.payload.final_mechanical_revision;
      next.pending_physical = null;
      break;
    case "mechanical_workflow_failed":
      if (next.pending_workflow?.workflow_id !== body.payload.workflow_id)
        throw new Error("Failed workflow is not pending.");
      next.pending_workflow.status = "failed";
      break;
    case "private_clue_presented":
      next.private_clues.push(body.payload);
      break;
    case "public_narration_recorded":
      next.recent_public_history = publicEntry(
        next,
        event,
        "narration",
        body.payload.text,
      );
      break;
    case "player_flavor_recorded":
      next.recent_public_history = publicEntry(
        next,
        event,
        "player_flavor",
        body.payload.text,
      );
      break;
    case "reaction_deadline_started":
      next.reaction_deadline = {
        ...body.payload,
        paused: false,
        remaining_ms: null,
      };
      break;
    case "reaction_deadline_paused":
      if (next.reaction_deadline?.seat_id !== body.payload.seat_id)
        throw new Error("Paused reaction seat is not pending.");
      next.reaction_deadline.paused = true;
      next.reaction_deadline.remaining_ms = body.payload.remaining_ms;
      break;
    case "reaction_deadline_cleared":
      if (
        next.reaction_deadline?.reaction_window_id !==
        body.payload.reaction_window_id
      )
        throw new Error("Cleared reaction deadline is not pending.");
      next.reaction_deadline = null;
      next.recent_public_history = publicEntry(
        next,
        event,
        "state_change",
        body.payload.result === "timeout"
          ? "The connected reaction window expired and recorded a pass."
          : `The reaction was recorded as ${body.payload.result}.`,
      );
      break;
    case "recovery_status_changed": {
      next.recoveries = next.recoveries.filter(
        ({ seat_id }) => seat_id !== body.payload.seat_id,
      );
      if (body.payload.status !== "connected")
        next.recoveries.push({
          seat_id: body.payload.seat_id,
          status: body.payload.status,
          ...(body.payload.grace_expires_at === undefined
            ? {}
            : { grace_expires_at: body.payload.grace_expires_at }),
        });
      if (
        body.payload.status === "connected" &&
        next.reaction_deadline?.seat_id === body.payload.seat_id
      )
        next.reaction_deadline.paused = false;
      break;
    }
    case "correction_requested":
      next.correction_request = body.payload;
      break;
    case "correction_resolved":
      if (
        next.correction_request?.correction_request_id !==
        body.payload.correction_request_id
      )
        throw new Error("Correction result is not pending.");
      next.correction_request = null;
      next.recent_public_history = publicEntry(
        next,
        event,
        "state_change",
        body.payload.safe_detail,
      );
      break;
    case "relay_room_replaced":
      next.current_relay_room_id = body.payload.new_room_id;
      break;
    case "physical_roll_waiting":
      next.pending_physical = body.payload;
      break;
    case "room_conclusion_recorded":
      next.conclusion = body.payload.conclusion;
      next.status = "completed";
      next.recent_public_history = publicEntry(
        next,
        event,
        "state_change",
        body.payload.summary,
      );
      break;
    default: {
      const exhaustive: never = body;
      throw new Error(
        `Unhandled room event ${(exhaustive as { kind?: string }).kind ?? "unknown"}.`,
      );
    }
  }
  const validated = validateRoomState(next);
  if (!validated.success)
    throw new Error(
      `Room event produced invalid state: ${validated.issues.map(({ code }) => code).join(",")}`,
    );
  return validated.value;
}

export interface RoomReplayInput {
  readonly events: readonly RoomEvent[];
  readonly transactions: readonly RoomTransactionRecord[];
  readonly expected_head_hash?: string;
}

export function replayRoom(input: RoomReplayInput): RoomState {
  if (input.events.length === 0)
    throw new Error("Room replay requires at least room_created.");
  let state: RoomState | null = null;
  let eventIndex = 0;
  for (const transaction of input.transactions) {
    const first = input.events[eventIndex];
    if (
      first === undefined ||
      first.room_revision !== transaction.first_room_revision
    )
      throw new Error("Room transaction first revision mismatch.");
    if (state === null) {
      if (
        first.room_revision !== 1 ||
        transaction.first_room_revision !== 1 ||
        transaction.pre_room_state_hash !== transaction.post_room_state_hash
      )
        throw new Error("Room creation boundary mismatch.");
    } else if (hashRoomState(state) !== transaction.pre_room_state_hash)
      throw new Error("Room transaction pre-state boundary mismatch.");
    for (let index = 0; index < transaction.event_count; index += 1) {
      const event = input.events[eventIndex];
      if (
        event === undefined ||
        event.room_transaction_id !== transaction.room_transaction_id ||
        event.transaction_index !== index
      )
        throw new Error("Room transaction event range is corrupt.");
      state =
        state === null
          ? initialRoomStateFromEvent(event)
          : applyRoomEvent(state, event);
      eventIndex += 1;
    }
    if (
      state === null ||
      hashRoomState(state) !== transaction.post_room_state_hash
    )
      throw new Error("Room transaction post-state boundary mismatch.");
  }
  if (state === null || eventIndex !== input.events.length)
    throw new Error("Room replay did not consume the full stream.");
  if (
    input.expected_head_hash !== undefined &&
    hashRoomState(state) !== input.expected_head_hash
  )
    throw new Error("Room replay head hash mismatch.");
  return state;
}
