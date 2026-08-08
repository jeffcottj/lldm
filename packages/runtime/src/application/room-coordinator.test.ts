import {
  PHASE_2_CONTENT_MANIFEST_HASH,
  PHASE_2_PRESENTATION_MANIFEST_HASH,
  PHASE_2_STARTER_LOADOUTS,
} from "@lldm/content";
import {
  SCHEMA_VERSION,
  type RoomCommand,
  type RoomEventBody,
} from "@lldm/contracts";
import { createEmptyCampaignState } from "@lldm/engine";
import { describe, expect, it } from "vitest";
import { CommandCoordinator } from "./coordinator.js";
import {
  authoritativeContentManifestPort,
  emptyProjectionPort,
} from "./defaults.js";
import { InMemoryRoomStore } from "./in-memory-room-store.js";
import { InMemoryAtomicStore } from "./in-memory-store.js";
import {
  RoomCoordinator,
  buildRoomCreationCommit,
  type RoomStorePort,
} from "./room-coordinator.js";
import { replayRoom } from "./room-replay.js";
import { DurableRoomWorkflowService } from "./room-workflows.js";
import { ReactionDeadlineService } from "./reaction-deadlines.js";

const roomSessionId = "room_session_runtime_phase2_001" as const;
const campaignId = "campaign_runtime_phase2_001" as const;
const participantId = "participant_runtime_phase2_001" as const;

function roomCommand(
  state: { readonly room_revision: number; readonly view_revision: number },
  key: string,
  intent: RoomCommand["intent"],
  extra: Partial<RoomCommand> = {},
): RoomCommand {
  return {
    schema_version: SCHEMA_VERSION,
    room_command_id: `room_command_${key}` as never,
    room_transaction_id: `room_transaction_${key}` as never,
    room_session_id: roomSessionId,
    source: "system",
    expected_room_revision: state.room_revision,
    expected_view_revision: state.view_revision,
    intent,
    ...extra,
  };
}

function createRoom(store: InMemoryRoomStore) {
  const command = roomCommand(
    { room_revision: 0, view_revision: 0 },
    "create_phase2_001",
    { kind: "start_run", payload: {} },
  );
  const body: Extract<RoomEventBody, { kind: "room_created" }> = {
    kind: "room_created",
    payload: {
      relay_room_id: "room_runtime_phase2_001",
      mode: "normal",
      start_beat_id: "guided_beat_opening_001",
      campaign_id: campaignId,
      mechanical_manifest_hash: PHASE_2_CONTENT_MANIFEST_HASH,
      presentation_manifest_hash: PHASE_2_PRESENTATION_MANIFEST_HASH,
      seats: PHASE_2_STARTER_LOADOUTS.map((starter, index) => ({
        seat_id: `seat_runtime_${index + 1}_001` as never,
        character_id: starter.foundation.character_id,
        starter_loadout_id: starter.starter_loadout_id,
      })),
    },
  };
  store.commitRoom(
    buildRoomCreationCommit({
      command,
      body,
      committed_at: "2026-08-07T20:00:00.000Z",
    }),
  );
  return store.loadRoom(roomSessionId)!;
}

function approveAndClaim(store: InMemoryRoomStore) {
  const coordinator = new RoomCoordinator({
    store,
    now: () => "2026-08-07T20:00:01.000Z",
  });
  let state = createRoom(store);
  const join = roomCommand(
    state,
    "join_phase2_001",
    { kind: "request_join", payload: { display_name: "River" } },
    {
      source: "client",
      participant_id: participantId,
      client_command_id: "client_command_join_phase2_001",
    },
  );
  const joined = coordinator.submit(join);
  if (!("commit" in joined)) throw new Error(joined.safe_detail);
  state = joined.commit.post_state;
  const approve = coordinator.submit(
    roomCommand(state, "approve_phase2_001", {
      kind: "approve_participant",
      payload: { participant_id: participantId },
    }),
    () => ({
      accepted: true,
      events: [
        {
          visibility: "public",
          body: {
            kind: "participant_approved",
            payload: { participant_id: participantId },
          },
        },
        {
          visibility: "public",
          body: {
            kind: "player_host_assigned",
            payload: { participant_id: participantId, reason: "bootstrap" },
          },
        },
      ],
    }),
  );
  if (!("commit" in approve)) throw new Error(approve.safe_detail);
  state = approve.commit.post_state;
  const seat = state.seats[0]!;
  const claim = coordinator.submit(
    roomCommand(
      state,
      "claim_phase2_001",
      {
        kind: "claim_hero",
        payload: {
          seat_id: seat.seat_id,
          starter_loadout_id: seat.starter_loadout_id,
        },
      },
      {
        source: "client",
        participant_id: participantId,
        client_command_id: "client_command_claim_phase2_001",
        seat_id: seat.seat_id,
      },
    ),
  );
  if (!("commit" in claim)) throw new Error(claim.safe_detail);
  return { coordinator, state: claim.commit.post_state, seat };
}

describe("replayable room coordination", () => {
  it("is idempotent, rejects identity collisions, records stale views, and replays byte-identically", () => {
    const store = new InMemoryRoomStore();
    const coordinator = new RoomCoordinator({
      store,
      now: () => "2026-08-07T20:01:00.000Z",
    });
    const state = createRoom(store);
    const join = roomCommand(
      state,
      "idempotent_phase2_001",
      { kind: "request_join", payload: { display_name: "Moss" } },
      {
        source: "client",
        participant_id: participantId,
        client_command_id: "client_command_idempotent_phase2_001",
      },
    );
    const first = coordinator.submit(join);
    const repeated = coordinator.submit(structuredClone(join));
    expect(first.result_kind).toBe("committed_acceptance");
    expect(repeated.result_kind).toBe("idempotent_replay");
    const collision = coordinator.submit({
      ...join,
      intent: { kind: "request_join", payload: { display_name: "Changed" } },
    });
    expect(collision.result_kind).toBe("room_command_identity_collision");

    const stale = coordinator.submit(
      roomCommand({ room_revision: 1, view_revision: 1 }, "stale_phase2_001", {
        kind: "suspend_run",
        payload: {},
      }),
    );
    expect(stale.result_kind).toBe("committed_rejection");
    if (!("commit" in stale)) throw new Error(stale.safe_detail);
    expect(stale.commit.events[0]?.body).toMatchObject({
      kind: "room_command_rejected",
      payload: { code: "stale_view" },
    });

    const replayed = replayRoom({
      events: store.inspectEvents(roomSessionId),
      transactions: store.inspectTransactions(roomSessionId),
    });
    expect(replayed).toEqual(store.loadRoom(roomSessionId));
  });

  it("does not mutate the room when an injected atomic commit fails", () => {
    const base = new InMemoryRoomStore();
    const state = createRoom(base);
    const failing: RoomStorePort = {
      readiness: () => base.readiness(),
      findRoomCommand: (id) => base.findRoomCommand(id),
      findClientCommand: (id) => base.findClientCommand(id),
      roomTransactionIdExists: (id) => base.roomTransactionIdExists(id),
      loadRoom: (id) => base.loadRoom(id),
      commitRoom: () => {
        throw new Error("Injected commit failure");
      },
    };
    const coordinator = new RoomCoordinator({ store: failing });
    expect(() =>
      coordinator.submit(
        roomCommand(
          state,
          "atomic_failure_phase2_001",
          {
            kind: "request_join",
            payload: { display_name: "Stone" },
          },
          { participant_id: participantId },
        ),
      ),
    ).toThrow("Injected commit failure");
    expect(base.loadRoom(roomSessionId)).toEqual(state);
  });
});

describe("durable room-to-engine workflow", () => {
  function fixture() {
    const roomStore = new InMemoryRoomStore();
    const { state, seat } = approveAndClaim(roomStore);
    const gameStore = new InMemoryAtomicStore();
    gameStore.createCampaign({
      state: createEmptyCampaignState(
        campaignId,
        PHASE_2_CONTENT_MANIFEST_HASH,
      ),
      seed: new Uint8Array(32).fill(7),
    });
    const gameCoordinator = new CommandCoordinator({
      store: gameStore,
      content: authoritativeContentManifestPort,
      projector: emptyProjectionPort,
      clock: { now: () => "2026-08-07T20:02:00.000Z" },
    });
    const workflow = new DurableRoomWorkflowService({
      room_store: roomStore,
      game_coordinator: gameCoordinator,
      now: () => "2026-08-07T20:02:00.000Z",
    });
    const starter = PHASE_2_STARTER_LOADOUTS[0]!;
    const command = roomCommand(
      state,
      "workflow_materialize_phase2_001",
      { kind: "start_run", payload: {} },
      {
        client_command_id: "client_command_workflow_phase2_001",
        seat_id: seat.seat_id,
      },
    );
    const mapper: Parameters<typeof workflow.submit>[1] = ({
      room,
      envelope,
    }) => ({
      schema_version: SCHEMA_VERSION,
      command_id: envelope.command_id,
      transaction_id: envelope.transaction_id,
      campaign_id: room.campaign_id,
      expected_revision: room.mechanical_revision,
      kind: "materialize_character",
      payload: {
        foundation: starter.foundation,
        significant_gear: starter.significant_gear,
      },
    });
    return { roomStore, gameStore, workflow, command, mapper };
  }

  it("recovers exactly after a crash following room workflow start", () => {
    const { roomStore, gameStore, workflow, command, mapper } = fixture();
    expect(() => workflow.submit(command, mapper, "after_room_start")).toThrow(
      "Injected crash",
    );
    expect(roomStore.listPendingWorkflows()).toHaveLength(1);
    expect(gameStore.inspectCampaign(campaignId)?.revision).toBe(0);
    const recovered = workflow.recoverPending();
    expect(recovered).toHaveLength(1);
    expect(recovered[0]?.result_kind).toBe("recovered");
    expect(
      gameStore.inspectCampaign(campaignId)?.state.party.characters,
    ).toHaveLength(1);
    expect(roomStore.listPendingWorkflows()).toHaveLength(0);
  });

  it("reuses the same game transaction after a crash following mechanical commit", () => {
    const { roomStore, gameStore, workflow, command, mapper } = fixture();
    expect(() => workflow.submit(command, mapper, "after_game_commit")).toThrow(
      "Injected crash",
    );
    const afterCrash = gameStore.inspectCampaign(campaignId);
    expect(afterCrash?.state.party.characters).toHaveLength(1);
    const pending = roomStore.listPendingWorkflows()[0];
    expect(pending).toBeDefined();
    const recovered = workflow.recoverPending()[0];
    expect(recovered?.result_kind).toBe("recovered");
    expect(gameStore.inspectCampaign(campaignId)?.revision).toBe(
      afterCrash?.revision,
    );
    expect(
      roomStore.findWorkflowByClient(command.client_command_id!)
        ?.game_transaction_id,
    ).toBe(pending?.game_transaction_id);
  });
});

describe("reaction deadline scheduling", () => {
  it("records a visible pass request only while authoritative connection state is healthy", () => {
    const store = new InMemoryRoomStore();
    const { state, seat } = approveAndClaim(store);
    let now = Date.parse("2026-08-07T20:03:00.000Z");
    const callbacks = new Map<string, () => void>();
    const due = new Map<string, number>();
    const emitted: RoomCommand[] = [];
    const scheduler = {
      schedule(key: string, at: number, callback: () => void) {
        callbacks.set(key, callback);
        due.set(key, at);
      },
      cancel(key: string) {
        callbacks.delete(key);
        due.delete(key);
      },
    };
    const deadlines = new ReactionDeadlineService({
      store,
      scheduler,
      sink: { submit: (command) => emitted.push(command) },
      now: () => now,
    });
    deadlines.setConnectionKnown(roomSessionId, true);
    const started = deadlines.start({
      room_session_id: roomSessionId,
      seat_id: seat.seat_id,
      reaction_window_id: "reaction_window_phase2_001",
      duration_ms: 10_000,
    });
    expect(started.reaction_deadline).toMatchObject({ paused: false });
    expect(callbacks.size).toBe(1);
    now += 4_000;
    const paused = deadlines.setConnectionKnown(roomSessionId, false);
    expect(paused.reaction_deadline).toMatchObject({
      paused: true,
      remaining_ms: 6_000,
    });
    expect(callbacks.size).toBe(0);

    const restarted = new ReactionDeadlineService({
      store,
      scheduler,
      sink: { submit: (command) => emitted.push(command) },
      now: () => now,
    });
    restarted.recover(roomSessionId);
    expect(callbacks.size).toBe(0);
    const resumed = restarted.setConnectionKnown(roomSessionId, true);
    expect(resumed.reaction_deadline).toMatchObject({ paused: false });
    expect([...due.values()]).toEqual([now + 6_000]);
    callbacks.values().next().value?.();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]?.intent).toEqual({
      kind: "reaction_timeout",
      payload: { reaction_window_id: "reaction_window_phase2_001" },
    });
  });
});
