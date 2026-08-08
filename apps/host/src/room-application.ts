import { randomBytes } from "node:crypto";
import {
  buildPhase2Encounter,
  PHASE_2_CONTENT_MANIFEST_HASH,
  PHASE_2_DEFINITIONS,
  PHASE_2_PRESENTATION_MANIFEST,
  PHASE_2_PRESENTATION_MANIFEST_HASH,
  PHASE_2_STARTER_LOADOUTS,
} from "@lldm/content";
import {
  type CheckAttemptInput,
  type CheckRequest,
  type ClientCommand,
  type ClientCommandFailureCode,
  ClientCommandFailureCodeSchema,
  type ClientCommandResult,
  ClientCommandResultSchema,
  ClientCommandSchema,
  canonicalJson,
  type GameCommand,
  GameCommandSchema,
  type GuidedOutcome,
  type OutcomeDegree,
  type ParticipantId,
  type PlayableCharacterState,
  type RoomCommand,
  type RoomEventBody,
  type RoomMode,
  type RoomSessionId,
  SCHEMA_VERSION,
  sha256Hex,
  validateValue,
} from "@lldm/contracts";
import { FakeTextProvider } from "@lldm/providers";
import {
  authoritativeContentManifestPort,
  authoritativeProjectionPort,
  buildCombinedProjections,
  buildRoomCreationCommit,
  CommandCoordinator,
  createPhase2Campaign,
  DurableRoomWorkflowService,
  type DurableWorkflowResult,
  deterministicIdentityPort,
  legalActionIdForCampaign,
  ReactionDeadlineService,
  RoomCoordinator,
  SqliteRoomStore,
  SqliteRuntimeStore,
  verifyFullAndSnapshotReplay,
} from "@lldm/runtime";
import type { HostConfig } from "./config.js";
import { GuidedRunner } from "./guided/runner.js";
import type { RelayClientPort } from "./relay/client.js";
import { ApplianceRelayTransport } from "./relay/transport.js";
import { LocalSecretVault } from "./secret-vault.js";

const SEAT_IDS = [
  "seat_mara_001",
  "seat_sable_001",
  "seat_ilyra_001",
  "seat_oren_001",
  "seat_kest_001",
  "seat_nima_001",
] as const;

function opaque(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString("hex")}`;
}

function derived(prefix: string, key: string): string {
  return `${prefix}_${sha256Hex(`${prefix}\u0000${key}`).slice(0, 32)}`;
}

export interface ConnectionBinding {
  readonly connection_id: ClientCommand["connection_id"];
  readonly participant_id: ParticipantId;
  readonly room_id: ClientCommand["room_id"];
}

export interface CreatedRoom {
  readonly room_session_id: RoomSessionId;
  readonly campaign_id: string;
  readonly relay_room_id: string;
  readonly join_url: string;
  readonly fallback_code: string;
  readonly host_bootstrap_proof: string;
  readonly seed_fingerprint: string;
}

export class RoomApplication {
  readonly #config: HostConfig;
  readonly #relay: RelayClientPort;
  readonly #runtimeStore: SqliteRuntimeStore;
  readonly #roomStore: SqliteRoomStore;
  readonly #roomCoordinator: RoomCoordinator;
  readonly #gameCoordinator: CommandCoordinator;
  readonly #workflow: DurableRoomWorkflowService;
  readonly #vault: LocalSecretVault;
  readonly #guided: GuidedRunner;
  readonly #commandResults = new Map<ParticipantId, ClientCommandResult[]>();
  readonly #relayApprovals = new Map<
    ParticipantId,
    Awaited<ReturnType<RelayClientPort["approve"]>>
  >();
  readonly #hostRecoveryCodes = new Map<
    RoomSessionId,
    { readonly code_hash: string; readonly expires_at: number }
  >();
  readonly #transports = new Map<RoomSessionId, ApplianceRelayTransport>();
  readonly #recoveryTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #reactionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #reactionDeadlines: ReactionDeadlineService;
  #nextWorkflowCrash: "after_room_start" | "after_game_commit" | undefined;

  constructor(config: HostConfig, relay: RelayClientPort) {
    this.#config = config;
    this.#relay = relay;
    this.#runtimeStore = new SqliteRuntimeStore(config.database_path);
    this.#roomStore = new SqliteRoomStore(config.database_path);
    this.#roomCoordinator = new RoomCoordinator({ store: this.#roomStore });
    this.#gameCoordinator = new CommandCoordinator({
      store: this.#runtimeStore,
      content: authoritativeContentManifestPort,
    });
    this.#workflow = new DurableRoomWorkflowService({
      room_store: this.#roomStore,
      game_coordinator: this.#gameCoordinator,
    });
    this.#vault = new LocalSecretVault(config.data_path);
    this.#guided = new GuidedRunner({
      manifest: PHASE_2_PRESENTATION_MANIFEST,
      provider: new FakeTextProvider(),
      store: this.#roomStore,
    });
    this.#reactionDeadlines = new ReactionDeadlineService({
      store: this.#roomStore,
      scheduler: {
        schedule: (key, at, callback) => {
          const previous = this.#reactionTimers.get(key);
          if (previous !== undefined) clearTimeout(previous);
          this.#reactionTimers.set(
            key,
            setTimeout(callback, Math.max(0, at - Date.now())),
          );
        },
        cancel: (key) => {
          const timer = this.#reactionTimers.get(key);
          if (timer !== undefined) clearTimeout(timer);
          this.#reactionTimers.delete(key);
        },
      },
      sink: {
        submit: (command) => {
          void this.#resolveReactionTimeout(command.room_session_id);
        },
      },
    });
  }

  async createRun(
    mode: RoomMode,
    fixtureSeedHex?: string,
  ): Promise<CreatedRoom> {
    if (mode === "rehearsal" && !this.#config.rehearsal_enabled)
      throw new Error("Rehearsal mode is disabled by appliance configuration.");
    if (fixtureSeedHex !== undefined && !this.#config.test_mode)
      throw new Error(
        "Fixed seeds are unavailable outside explicit test mode.",
      );
    const relay = await this.#relay.createRoom({
      lifetime_seconds: this.#config.room_lifetime_seconds,
    });
    const campaignId = (
      fixtureSeedHex === undefined
        ? opaque("campaign")
        : `campaign_fixture_${sha256Hex(`campaign_fixture_v1\u0000${fixtureSeedHex}`).slice(0, 32)}`
    ) as Parameters<typeof createPhase2Campaign>[0]["campaign_id"];
    const roomSessionId = (
      fixtureSeedHex === undefined
        ? opaque("room_session")
        : `room_session_fixture_${sha256Hex(`room_fixture_v1\u0000${fixtureSeedHex}`).slice(0, 32)}`
    ) as RoomSessionId;
    const createdAt = new Date().toISOString();
    const campaign = createPhase2Campaign({
      store: this.#runtimeStore,
      campaign_id: campaignId,
      created_at: createdAt,
      ...(fixtureSeedHex === undefined
        ? {}
        : { fixture_seed_hex: fixtureSeedHex }),
    });
    const roomCommand: RoomCommand = {
      schema_version: SCHEMA_VERSION,
      room_command_id: derived(
        "room_command",
        `${roomSessionId}:create`,
      ) as RoomCommand["room_command_id"],
      room_transaction_id: derived(
        "room_transaction",
        `${roomSessionId}:create`,
      ) as RoomCommand["room_transaction_id"],
      room_session_id: roomSessionId,
      source: "system",
      expected_room_revision: 0,
      expected_view_revision: 0,
      intent: { kind: "start_run", payload: {} },
    };
    const body: Extract<RoomEventBody, { kind: "room_created" }> = {
      kind: "room_created",
      payload: {
        relay_room_id: relay.room_id,
        mode,
        start_beat_id: PHASE_2_PRESENTATION_MANIFEST.start_beat_id,
        campaign_id: campaignId,
        mechanical_manifest_hash: PHASE_2_CONTENT_MANIFEST_HASH,
        presentation_manifest_hash: PHASE_2_PRESENTATION_MANIFEST_HASH,
        seats: PHASE_2_STARTER_LOADOUTS.map((loadout, index) => ({
          seat_id: SEAT_IDS[index] as never,
          character_id: loadout.foundation.character_id,
          starter_loadout_id: loadout.starter_loadout_id,
        })),
      },
    };
    this.#roomStore.commitRoom(
      buildRoomCreationCommit({
        command: roomCommand,
        body,
        committed_at: createdAt,
      }),
    );
    this.#roomStore.storeRelaySession({
      room_session_id: roomSessionId,
      relay_room_id: relay.room_id,
      relay_endpoint: this.#config.relay_url,
      appliance_token_ciphertext: this.#vault.encrypt(relay.appliance_token),
      invite_secret_ciphertext: this.#vault.encrypt(
        canonicalJson({
          invite_secret: relay.invite_secret,
          host_bootstrap_proof: relay.host_bootstrap_proof,
          fallback_code: relay.fallback_code,
          join_url: relay.join_url,
        }),
      ),
      expires_at: relay.expires_at,
      updated_at: createdAt,
    });
    if (!new URL(relay.join_url).hostname.endsWith(".invalid")) {
      const transport = new ApplianceRelayTransport(this, relay);
      this.#transports.set(roomSessionId, transport);
      transport.connect();
    }
    this.#rebuildCombined(roomSessionId);
    return {
      room_session_id: roomSessionId,
      campaign_id: campaignId,
      relay_room_id: relay.room_id,
      join_url: relay.join_url,
      fallback_code: relay.fallback_code,
      host_bootstrap_proof: relay.host_bootstrap_proof,
      seed_fingerprint: campaign.seed_fingerprint,
    };
  }

  resumableRooms() {
    return this.#roomStore.listResumableRooms();
  }

  injectNextWorkflowCrash(
    boundary: "after_room_start" | "after_game_commit",
  ): void {
    if (!this.#config.test_mode)
      throw new Error("Workflow failure injection is test-only.");
    this.#nextWorkflowCrash = boundary;
  }

  pendingWorkflowCount(): number {
    if (!this.#config.test_mode)
      throw new Error("Workflow inspection is test-only.");
    return this.#roomStore.listPendingWorkflows().length;
  }

  async resume(roomSessionId: RoomSessionId) {
    const initialState = this.#roomStore.verifyReplay(roomSessionId);
    const initialMechanical = verifyFullAndSnapshotReplay(
      this.#runtimeStore,
      initialState.campaign_id,
    );
    if (!initialMechanical.success)
      throw new Error("The mechanical stream failed replay verification.");
    const pending = this.#roomStore.listPendingWorkflows().map((workflow) => ({
      workflow,
      command: this.#roomStore.findRoomCommand(
        workflow.room_command_id as RoomCommand["room_command_id"],
      )?.command,
    }));
    const recovered = this.#workflow.recoverPending();
    for (const [index, outcome] of recovered.entries()) {
      const context = pending[index];
      if (
        context?.command !== undefined &&
        (outcome.result_kind === "completed" ||
          outcome.result_kind === "recovered") &&
        this.#workflowAccepted(outcome)
      ) {
        await this.#afterMechanicalCommit(
          context.command.room_session_id,
          context.command.intent.kind,
          outcome,
        );
        this.#rebuildCombined(context.command.room_session_id);
      }
    }
    const state = this.#roomStore.verifyReplay(roomSessionId);
    const mechanical = verifyFullAndSnapshotReplay(
      this.#runtimeStore,
      state.campaign_id,
    );
    if (
      !mechanical.success ||
      mechanical.revision !== state.mechanical_revision
    )
      throw new Error(
        "The room and mechanical streams failed linkage verification.",
      );
    this.#rebuildCombined(roomSessionId);
    const relay = this.#roomStore.loadRelaySession(roomSessionId);
    if (
      relay !== null &&
      Date.parse(relay.expires_at) > Date.now() &&
      !this.#transports.has(roomSessionId) &&
      !new URL(relay.relay_endpoint).hostname.endsWith(".invalid")
    ) {
      const transport = new ApplianceRelayTransport(this, {
        room_id: relay.relay_room_id as never,
        appliance_token: this.#vault.decrypt(relay.appliance_token_ciphertext),
        expires_at: relay.expires_at,
        join_url: `${relay.relay_endpoint}/room/${relay.relay_room_id}`,
      });
      this.#transports.set(roomSessionId, transport);
      transport.connect();
    }
    return { state, recovered };
  }

  publicDelivery(
    roomSessionId: RoomSessionId,
    cursor = 0,
    forceSnapshot = false,
  ) {
    return this.#roomStore.deliveriesSince({
      room_session_id: roomSessionId,
      audience_kind: "public_tv",
      audience_key: "public",
      cursor,
      force_snapshot: forceSnapshot,
    });
  }

  participantDelivery(
    roomSessionId: RoomSessionId,
    participantId: ParticipantId,
    cursor = 0,
    forceSnapshot = false,
  ) {
    return this.#roomStore.deliveriesSince({
      room_session_id: roomSessionId,
      audience_kind: "participant_private",
      audience_key: participantId,
      cursor,
      force_snapshot: forceSnapshot,
    });
  }

  playerHostDelivery(
    roomSessionId: RoomSessionId,
    participantId: ParticipantId,
    cursor = 0,
    forceSnapshot = false,
  ) {
    return this.#roomStore.deliveriesSince({
      room_session_id: roomSessionId,
      audience_kind: "player_host_operational",
      audience_key: `player_host:${participantId}`,
      cursor,
      force_snapshot: forceSnapshot,
    });
  }

  roomForRelay(roomId: string) {
    return this.#findRoomForRelay(roomId);
  }

  noteParticipantConnection(
    roomId: string,
    participantId: ParticipantId,
    connected: boolean,
  ): void {
    let state = this.#findRoomForRelay(roomId);
    const participant = state?.participants.find(
      ({ participant_id }) => participant_id === participantId,
    );
    if (
      state === null ||
      state === undefined ||
      participant?.status !== "approved"
    )
      return;
    const seats = state.seats.filter(
      ({ participant_id }) => participant_id === participantId,
    );
    if (seats.length === 0) return;
    const reactionSeatId = state.reaction_deadline?.seat_id;
    if (
      reactionSeatId !== undefined &&
      seats.some(({ seat_id }) => seat_id === reactionSeatId)
    ) {
      this.#reactionDeadlines.setConnectionKnown(
        state.room_session_id,
        connected,
      );
      state = this.#roomStore.loadRoom(state.room_session_id);
      if (state === null) return;
    }
    const now = Date.now();
    const events = seats.map((seat) => ({
      visibility: "public" as const,
      addressed_participant_id: participantId,
      addressed_seat_id: seat.seat_id,
      body: {
        kind: "recovery_status_changed" as const,
        payload: connected
          ? { seat_id: seat.seat_id, status: "connected" as const }
          : {
              seat_id: seat.seat_id,
              status: "grace" as const,
              grace_expires_at: new Date(now + 30_000).toISOString(),
            },
      },
    }));
    const command = this.#systemRoomCommand(
      state,
      `connection:${participantId}:${connected}:${state.room_revision}`,
      {
        kind: "reaction_timeout",
        payload: {
          reaction_window_id:
            `reaction_window_connection_${sha256Hex(participantId).slice(0, 16)}` as never,
        },
      },
    );
    const submitted = this.#roomCoordinator.submit(command, () => ({
      accepted: true,
      events,
    }));
    if (!("commit" in submitted)) return;
    for (const seat of seats) {
      const timerKey = `${state.room_session_id}:${seat.seat_id}`;
      const existing = this.#recoveryTimers.get(timerKey);
      if (existing !== undefined) clearTimeout(existing);
      this.#recoveryTimers.delete(timerKey);
      if (!connected) {
        const timer = setTimeout(() => {
          const current = this.#roomStore.loadRoom(state.room_session_id);
          if (
            current === null ||
            !current.recoveries.some(
              ({ seat_id, status }) =>
                seat_id === seat.seat_id && status === "grace",
            )
          )
            return;
          const timeoutCommand = this.#systemRoomCommand(
            current,
            `recovery_required:${seat.seat_id}:${current.room_revision}`,
            {
              kind: "reaction_timeout",
              payload: {
                reaction_window_id:
                  `reaction_window_recovery_${sha256Hex(seat.seat_id).slice(0, 16)}` as never,
              },
            },
          );
          const expired = this.#roomCoordinator.submit(timeoutCommand, () => ({
            accepted: true,
            events: [
              {
                visibility: "public",
                addressed_seat_id: seat.seat_id,
                body: {
                  kind: "recovery_status_changed",
                  payload: {
                    seat_id: seat.seat_id,
                    status: "recovery_required",
                  },
                },
              },
            ],
          }));
          if ("commit" in expired) this.#rebuildCombined(state.room_session_id);
          this.#recoveryTimers.delete(timerKey);
        }, 30_000);
        this.#recoveryTimers.set(timerKey, timer);
      }
    }
    this.#rebuildCombined(state.room_session_id);
  }

  issueHostRecoveryCode(roomSessionId: RoomSessionId): string {
    if (this.#roomStore.loadRoom(roomSessionId) === null)
      throw new Error("Room session is unavailable.");
    const code = String(
      Number.parseInt(randomBytes(4).toString("hex"), 16) % 1_000_000,
    ).padStart(6, "0");
    this.#hostRecoveryCodes.set(roomSessionId, {
      code_hash: sha256Hex(code),
      expires_at: Date.now() + 5 * 60_000,
    });
    return code;
  }

  localJoinDetails(roomSessionId: RoomSessionId) {
    const room = this.#roomStore.loadRoom(roomSessionId);
    const relay = this.#roomStore.loadRelaySession(roomSessionId);
    if (
      room === null ||
      relay === null ||
      room.current_relay_room_id !== relay.relay_room_id ||
      Date.parse(relay.expires_at) <= Date.now()
    )
      return null;
    const secrets = this.#relaySecrets(roomSessionId);
    return {
      room_id: relay.relay_room_id,
      join_url:
        secrets.join_url ??
        `${relay.relay_endpoint}/room/${encodeURIComponent(relay.relay_room_id)}#invite=${encodeURIComponent(secrets.invite_secret)}`,
      fallback_code: secrets.fallback_code ?? "Unavailable",
      host_bootstrap_proof:
        room.player_host_participant_id === null
          ? secrets.host_bootstrap_proof
          : null,
      expires_at: relay.expires_at,
    };
  }

  takeRelayApproval(participantId: ParticipantId) {
    const approval = this.#relayApprovals.get(participantId) ?? null;
    this.#relayApprovals.delete(participantId);
    return approval;
  }

  async approveRelayParticipant(
    roomId: string,
    participantId: ParticipantId,
    connectionId: string,
  ) {
    const room = this.#findRoomForRelay(roomId);
    if (room === null) throw new Error("Relay room is not active locally.");
    const participant = room.participants.find(
      ({ participant_id }) => participant_id === participantId,
    );
    if (participant?.status !== "approved")
      throw new Error("Participant is not locally approved.");
    const relaySession = this.#roomStore.loadRelaySession(room.room_session_id);
    if (relaySession === null) throw new Error("Relay session is unavailable.");
    const approval = await this.#relay.approve({
      room_id: roomId,
      appliance_token: this.#vault.decrypt(
        relaySession.appliance_token_ciphertext,
      ),
      connection_id: connectionId,
      participant_id: participantId,
    });
    this.#relayApprovals.set(participantId, approval);
    return approval;
  }

  async bootstrapFirstPlayerHost(input: {
    readonly room_session_id: RoomSessionId;
    readonly binding: ConnectionBinding;
    readonly display_name: string;
    readonly proof: string;
  }) {
    const state = this.#roomStore.loadRoom(input.room_session_id);
    if (
      state === null ||
      state.player_host_participant_id !== null ||
      state.current_relay_room_id !== input.binding.room_id
    )
      throw new Error("First player-host bootstrap is not available.");
    const relay = this.#relaySecrets(input.room_session_id);
    if (relay.host_bootstrap_proof !== input.proof)
      throw new Error("Player-host bootstrap proof is invalid.");
    const existing = state.participants.find(
      ({ participant_id }) => participant_id === input.binding.participant_id,
    );
    let afterJoin = state;
    if (existing === undefined) {
      const join = this.#roomCoordinator.submit(
        this.#roomCommandFromIntent(
          input.room_session_id,
          input.binding.participant_id,
          {
            kind: "request_join",
            payload: { display_name: input.display_name },
          },
          `bootstrap_join:${input.binding.participant_id}`,
        ),
      );
      if (!("commit" in join)) throw new Error(join.safe_detail);
      afterJoin = join.commit.post_state;
    } else if (existing.status !== "pending")
      throw new Error("First player-host participant is not pending.");
    const hostCommand = this.#systemRoomCommand(
      afterJoin,
      `bootstrap_host:${input.binding.participant_id}`,
      {
        kind: "approve_participant",
        payload: { participant_id: input.binding.participant_id },
      },
    );
    const approved = this.#roomCoordinator.submit(hostCommand, () => ({
      accepted: true,
      events: [
        {
          visibility: "public",
          body: {
            kind: "participant_approved",
            payload: { participant_id: input.binding.participant_id },
          },
        },
        {
          visibility: "public",
          body: {
            kind: "player_host_assigned",
            payload: {
              participant_id: input.binding.participant_id,
              reason: "bootstrap",
            },
          },
        },
      ],
    }));
    if (!("commit" in approved)) throw new Error(approved.safe_detail);
    const relaySession = this.#roomStore.loadRelaySession(
      input.room_session_id,
    );
    if (relaySession === null) throw new Error("Relay session is unavailable.");
    const approval = await this.#relay.approve({
      room_id: input.binding.room_id,
      appliance_token: this.#vault.decrypt(
        relaySession.appliance_token_ciphertext,
      ),
      connection_id: input.binding.connection_id,
      participant_id: input.binding.participant_id,
    });
    this.#relayApprovals.set(input.binding.participant_id, approval);
    this.#rebuildCombined(input.room_session_id);
    return approval;
  }

  async submitClient(
    raw: unknown,
    binding: ConnectionBinding,
  ): Promise<ClientCommandResult> {
    const parsed = validateValue(ClientCommandSchema, raw);
    if (
      !parsed.success ||
      parsed.value.connection_id !== binding.connection_id ||
      parsed.value.room_id !== binding.room_id ||
      (parsed.value.participant_id !== undefined &&
        parsed.value.participant_id !== binding.participant_id)
    )
      return this.#clientResult(
        raw,
        "rejected",
        "malformed_command",
        "Command identity or payload failed validation.",
        binding.participant_id,
      );
    const client = parsed.value;
    const state = this.#findRoomForRelay(binding.room_id);
    if (state === null)
      return this.#clientResult(
        client,
        "rejected",
        "room_expired",
        "The relay room is not linked to an active local session.",
        binding.participant_id,
      );
    const roomCommand = this.#roomCommandFromClient(state, client, binding);
    if (client.intent.kind === "recover_player_host") {
      const participant = state.participants.find(
        ({ participant_id }) => participant_id === binding.participant_id,
      );
      if (state.player_host_participant_id === null) {
        if (participant?.status !== "pending")
          return this.#clientResult(
            client,
            "rejected",
            "participant_not_approved",
            "Join the room before redeeming the first player-host proof.",
            binding.participant_id,
          );
        try {
          await this.bootstrapFirstPlayerHost({
            room_session_id: state.room_session_id,
            binding,
            display_name: participant.display_name,
            proof: client.intent.payload.proof,
          });
          const updated = this.#roomStore.loadRoom(state.room_session_id);
          return this.#clientResult(
            client,
            "accepted",
            undefined,
            "Player-host authority was established.",
            binding.participant_id,
            updated ?? undefined,
          );
        } catch {
          return this.#clientResult(
            client,
            "rejected",
            "host_recovery_proof_invalid",
            "The TV proof is invalid or already used.",
            binding.participant_id,
          );
        }
      }
      const recovery = this.#hostRecoveryCodes.get(state.room_session_id);
      if (
        participant?.status !== "approved" ||
        recovery === undefined ||
        recovery.expires_at <= Date.now() ||
        recovery.code_hash !== sha256Hex(client.intent.payload.proof)
      )
        return this.#clientResult(
          client,
          "rejected",
          "host_recovery_proof_invalid",
          "The TV recovery code is invalid or expired.",
          binding.participant_id,
        );
      this.#hostRecoveryCodes.delete(state.room_session_id);
      const recovered = this.#roomCoordinator.submit(roomCommand, () => ({
        accepted: true,
        events: [
          {
            visibility: "public",
            body: {
              kind: "player_host_assigned",
              payload: {
                participant_id: binding.participant_id,
                reason: "recovery",
              },
            },
          },
        ],
      }));
      if (!("commit" in recovered))
        return this.#clientResult(
          client,
          "rejected",
          "internal_recovery_required",
          recovered.safe_detail,
          binding.participant_id,
        );
      this.#rebuildCombined(state.room_session_id);
      return this.#clientResult(
        client,
        "accepted",
        undefined,
        "Player-host authority recovered from the TV code.",
        binding.participant_id,
        recovered.commit.post_state,
      );
    }
    if (client.intent.kind === "record_party_choice") {
      if (state.player_host_participant_id !== binding.participant_id)
        return this.#clientResult(
          client,
          "rejected",
          "not_player_host",
          "Only the player-host records the table's agreed choice.",
          binding.participant_id,
        );
      try {
        const advanced = await this.#guided.advance(
          roomCommand,
          "selected_option",
          client.intent.payload.option_id,
        );
        await this.#enterCurrentBeat(state.room_session_id);
        this.#rebuildCombined(state.room_session_id);
        const updated = this.#roomStore.loadRoom(state.room_session_id);
        return this.#clientResult(
          client,
          "accepted",
          undefined,
          `The guided choice advanced to ${advanced.beat_id}.`,
          binding.participant_id,
          updated ?? undefined,
        );
      } catch {
        return this.#clientResult(
          client,
          "rejected",
          "stale_view",
          "That party choice is unavailable at the current guided beat.",
          binding.participant_id,
        );
      }
    }
    if (client.intent.kind === "start_run") {
      if (state.player_host_participant_id !== binding.participant_id)
        return this.#clientResult(
          client,
          "rejected",
          "not_player_host",
          "Only the current player-host can start the run.",
          binding.participant_id,
        );
      const claimed = state.seats.filter(
        ({ participant_id }) => participant_id !== null,
      );
      if (state.status !== "lobby" || claimed.length < 3 || claimed.length > 5)
        return this.#clientResult(
          client,
          "rejected",
          "run_not_ready",
          "Claim three to five heroes before starting the guided run.",
          binding.participant_id,
        );
      for (const seat of claimed) {
        const current = this.#roomStore.loadRoom(state.room_session_id);
        if (current === null)
          return this.#clientResult(
            client,
            "rejected",
            "storage_recovery_required",
            "The room became unavailable while preparing the party.",
            binding.participant_id,
          );
        const mechanical = this.#runtimeStore.inspectCampaign(
          current.campaign_id,
        );
        if (
          mechanical?.state.party.characters.some(
            ({ character_id }) => character_id === seat.character_id,
          )
        )
          continue;
        const loadout = PHASE_2_STARTER_LOADOUTS.find(
          ({ starter_loadout_id }) =>
            starter_loadout_id === seat.starter_loadout_id,
        );
        if (loadout === undefined)
          return this.#clientResult(
            client,
            "rejected",
            "run_not_ready",
            "A claimed starter could not be resolved from the pinned manifest.",
            binding.participant_id,
          );
        const workflowKey = `${client.client_command_id}:materialize:${seat.seat_id}`;
        const system: RoomCommand = {
          schema_version: SCHEMA_VERSION,
          room_command_id: derived("room_command", workflowKey) as never,
          room_transaction_id: derived(
            "room_transaction",
            workflowKey,
          ) as never,
          room_session_id: current.room_session_id,
          source: "system",
          client_command_id: derived("client_command", workflowKey) as never,
          seat_id: seat.seat_id,
          expected_room_revision: current.room_revision,
          expected_view_revision: current.view_revision,
          intent: { kind: "start_run", payload: {} },
        };
        const materialized = this.#workflow.submit(
          system,
          ({ room, envelope }) => ({
            schema_version: SCHEMA_VERSION,
            command_id: envelope.command_id,
            transaction_id: envelope.transaction_id,
            campaign_id: room.campaign_id,
            expected_revision: room.mechanical_revision,
            kind: "materialize_character",
            payload: {
              foundation: loadout.foundation,
              significant_gear: loadout.significant_gear,
            },
          }),
        );
        if (
          materialized.result_kind !== "completed" &&
          materialized.result_kind !== "recovered"
        )
          return this.#clientResult(
            client,
            "rejected",
            "internal_recovery_required",
            "safe_detail" in materialized
              ? materialized.safe_detail
              : "Party materialization requires recovery.",
            binding.participant_id,
          );
      }
      const prepared = this.#runtimeStore.inspectCampaign(state.campaign_id);
      if (prepared?.state.party.supply === 0) {
        this.#submitSystemMechanical(
          state.room_session_id,
          `${client.client_command_id}:provision_starting_supply`,
          { kind: "start_run", payload: {} },
          (current, envelope) => ({
            ...this.#gameEnvelope(current, envelope),
            kind: "provision_starting_supply",
            payload: {},
          }),
        );
      }
      const ready = this.#roomStore.loadRoom(state.room_session_id);
      if (ready === null)
        return this.#clientResult(
          client,
          "rejected",
          "storage_recovery_required",
          "The prepared room could not be reloaded.",
          binding.participant_id,
        );
      const finalCommand = {
        ...this.#roomCommandFromClient(ready, client, binding),
        expected_room_revision: ready.room_revision,
        expected_view_revision: ready.view_revision,
      };
      const started = this.#roomCoordinator.submit(finalCommand);
      if (
        !("commit" in started) ||
        started.commit.transaction.outcome !== "accepted"
      )
        return this.#clientResult(
          client,
          "rejected",
          "run_not_ready",
          "The run could not start from the current room state.",
          binding.participant_id,
        );
      this.#rebuildCombined(state.room_session_id);
      return this.#clientResult(
        client,
        "accepted",
        undefined,
        "The claimed party is materialized and the guided run is active.",
        binding.participant_id,
        started.commit.post_state,
      );
    }
    if (
      client.intent.kind === "withdraw_combat" &&
      state.player_host_participant_id !== binding.participant_id
    )
      return this.#clientResult(
        client,
        "rejected",
        "not_player_host",
        "Only the player-host can confirm a whole-party withdrawal.",
        binding.participant_id,
      );
    const mechanicalKinds = new Set([
      "claim_activation",
      "commit_legal_action",
      "choose_spark",
      "choose_guided_option",
      "submit_die",
      "resolve_reaction",
      "confirm_correction",
      "withdraw_combat",
    ]);
    if (mechanicalKinds.has(client.intent.kind)) {
      let outcome: DurableWorkflowResult;
      const injectedCrash = this.#nextWorkflowCrash;
      this.#nextWorkflowCrash = undefined;
      try {
        outcome = this.#workflow.submit(
          roomCommand,
          ({ room, room_command, envelope }) =>
            this.#mapMechanical(room, room_command, envelope),
          injectedCrash,
        );
      } catch {
        if (injectedCrash !== undefined) throw new Error("Injected crash");
        return this.#clientResult(
          client,
          "rejected",
          "stale_legal_candidate",
          "That mechanic is no longer legal in the current state.",
          binding.participant_id,
        );
      }
      this.#rebuildCombined(state.room_session_id);
      switch (outcome.result_kind) {
        case "completed":
        case "recovered": {
          if (!this.#workflowAccepted(outcome))
            return this.#clientResult(
              client,
              "rejected",
              "stale_legal_candidate",
              "The rules engine rejected that mechanic in the current state.",
              binding.participant_id,
              outcome.room,
            );
          await this.#afterMechanicalCommit(
            state.room_session_id,
            client.intent.kind,
            outcome,
          );
          this.#rebuildCombined(state.room_session_id);
          const updated = this.#roomStore.loadRoom(state.room_session_id);
          return this.#clientResult(
            client,
            "accepted",
            undefined,
            "The mechanic was committed and recorded.",
            binding.participant_id,
            updated ?? outcome.room,
          );
        }
        case "pending_recovery":
          return this.#clientResult(
            client,
            "rejected",
            "room_busy_recovering",
            outcome.safe_detail,
            binding.participant_id,
          );
        case "rejected":
          return this.#clientResult(
            client,
            "rejected",
            "stale_legal_candidate",
            outcome.safe_detail,
            binding.participant_id,
          );
      }
    }
    const submitted = this.#roomCoordinator.submit(roomCommand);
    if (!("commit" in submitted))
      return this.#clientResult(
        client,
        "rejected",
        "internal_recovery_required",
        submitted.safe_detail,
        binding.participant_id,
      );
    this.#rebuildCombined(state.room_session_id);
    const committedRejection = submitted.commit.events.find(
      ({ body }) => body.kind === "room_command_rejected",
    );
    const validatedFailure = validateValue(
      ClientCommandFailureCodeSchema,
      committedRejection?.body.kind === "room_command_rejected"
        ? committedRejection.body.payload.code
        : "stale_view",
    );
    return this.#clientResult(
      client,
      submitted.commit.transaction.outcome === "accepted"
        ? "accepted"
        : "rejected",
      submitted.commit.transaction.outcome === "accepted"
        ? undefined
        : validatedFailure.success
          ? validatedFailure.value
          : "stale_view",
      submitted.commit.transaction.outcome === "accepted"
        ? "The room command was recorded."
        : committedRejection?.body.kind === "room_command_rejected"
          ? committedRejection.body.payload.safe_detail
          : "The room state changed; refresh and try again.",
      binding.participant_id,
      submitted.commit.post_state,
    );
  }

  close(): void {
    for (const timer of this.#recoveryTimers.values()) clearTimeout(timer);
    this.#recoveryTimers.clear();
    for (const timer of this.#reactionTimers.values()) clearTimeout(timer);
    this.#reactionTimers.clear();
    for (const transport of this.#transports.values()) transport.close();
    this.#roomStore.close();
    this.#runtimeStore.close();
  }

  #findRoomForRelay(roomId: string) {
    for (const resumable of this.#roomStore.listResumableRooms()) {
      const state = this.#roomStore.loadRoom(resumable.room_session_id);
      if (state?.current_relay_room_id === roomId) return state;
    }
    return null;
  }

  #roomCommandFromClient(
    state: NonNullable<ReturnType<SqliteRoomStore["loadRoom"]>>,
    client: ClientCommand,
    binding: ConnectionBinding,
  ): RoomCommand {
    const key = `${state.room_session_id}:${client.client_command_id}`;
    return {
      schema_version: SCHEMA_VERSION,
      room_command_id: derived(
        "room_command",
        key,
      ) as RoomCommand["room_command_id"],
      room_transaction_id: derived(
        "room_transaction",
        key,
      ) as RoomCommand["room_transaction_id"],
      room_session_id: state.room_session_id,
      source: "client",
      client_command_id: client.client_command_id,
      client_command_hash:
        `sha256:${sha256Hex(canonicalJson(client))}` as never,
      participant_id: binding.participant_id,
      ...(client.seat_id === undefined ? {} : { seat_id: client.seat_id }),
      expected_room_revision: state.room_revision,
      // A pending relay participant has not received a filtered projection and
      // therefore cannot know the room's current view revision. Joining is the
      // one client intent anchored to the host's current revision; every
      // approved-participant intent remains subject to stale-view rejection.
      expected_view_revision:
        client.intent.kind === "request_join"
          ? state.view_revision
          : client.expected_view_revision,
      intent: client.intent,
    };
  }

  #roomCommandFromIntent(
    roomSessionId: RoomSessionId,
    participantId: ParticipantId,
    intent: RoomCommand["intent"],
    key: string,
  ): RoomCommand {
    const state = this.#roomStore.loadRoom(roomSessionId);
    if (state === null) throw new Error("Room session is unavailable.");
    const scopedKey = `${roomSessionId}:${key}`;
    return {
      schema_version: SCHEMA_VERSION,
      room_command_id: derived("room_command", scopedKey) as never,
      room_transaction_id: derived("room_transaction", scopedKey) as never,
      room_session_id: roomSessionId,
      source: "system",
      participant_id: participantId,
      expected_room_revision: state.room_revision,
      expected_view_revision: state.view_revision,
      intent,
    };
  }

  #systemRoomCommand(
    state: NonNullable<ReturnType<SqliteRoomStore["loadRoom"]>>,
    key: string,
    intent: RoomCommand["intent"],
  ): RoomCommand {
    const scopedKey = `${state.room_session_id}:${key}`;
    return {
      schema_version: SCHEMA_VERSION,
      room_command_id: derived("room_command", scopedKey) as never,
      room_transaction_id: derived("room_transaction", scopedKey) as never,
      room_session_id: state.room_session_id,
      source: "system",
      expected_room_revision: state.room_revision,
      expected_view_revision: state.view_revision,
      intent,
    };
  }

  #mapMechanical(
    room: NonNullable<ReturnType<SqliteRoomStore["loadRoom"]>>,
    command: RoomCommand,
    envelope: { command_id: string; transaction_id: string },
  ) {
    const mechanical = this.#runtimeStore.inspectCampaign(room.campaign_id);
    if (mechanical === null)
      throw new Error("Mechanical campaign is unavailable.");
    const seatId =
      command.seat_id ??
      ("seat_id" in command.intent.payload
        ? command.intent.payload.seat_id
        : undefined);
    const seat = room.seats.find(({ seat_id }) => seat_id === seatId);
    const character = mechanical.state.party.characters.find(
      ({ character_id }) => character_id === seat?.character_id,
    );
    const common = {
      schema_version: SCHEMA_VERSION,
      command_id: envelope.command_id,
      transaction_id: envelope.transaction_id,
      campaign_id: room.campaign_id,
      expected_revision: room.mechanical_revision,
    };
    let candidate: unknown;
    switch (command.intent.kind) {
      case "claim_activation":
        if (mechanical.state.combat === null || character === undefined)
          throw new Error("Hero activation is not currently legal.");
        candidate = {
          ...common,
          kind: "choose_hero_activation",
          payload: {
            combat_id: mechanical.state.combat.combat_id,
            actor_id: character.foundation.actor_id,
          },
        };
        break;
      case "commit_legal_action": {
        if (mechanical.state.combat === null || character === undefined)
          throw new Error("Combat action is not currently legal.");
        const drafts = authoritativeProjectionPort.project({
          state: mechanical.state,
          revision: mechanical.revision,
          catalog: {
            content_manifest_hash: PHASE_2_CONTENT_MANIFEST_HASH,
            definitions: PHASE_2_DEFINITIONS,
          },
          legal_action_id_for: (key) =>
            legalActionIdForCampaign(
              deterministicIdentityPort,
              room.campaign_id,
              key,
            ),
        });
        const privateDraft = drafts.find(
          ({ audience_kind, audience_key }) =>
            audience_kind === "seat_private" &&
            audience_key === character.character_id,
        );
        if (
          privateDraft === undefined ||
          !privateDraft.canonical_json.includes(
            command.intent.payload.legal_action_id,
          )
        )
          throw new Error("Legal action candidate is stale or unauthorized.");
        candidate = {
          ...common,
          kind: "execute_combat_action",
          payload: {
            combat_id: mechanical.state.combat.combat_id,
            legal_action_id: command.intent.payload.legal_action_id,
            invoke_spark: false,
          },
        };
        break;
      }
      case "choose_spark":
        if (
          room.current_beat_id !== "guided_beat_optional_spark_001" ||
          character === undefined ||
          seat === undefined
        )
          throw new Error(
            "The optional Spark check is not currently available.",
          );
        candidate = {
          ...common,
          kind: "resolve_check",
          payload: this.#checkAttempt({
            character,
            seat_id: seat.seat_id,
            attribute: "Insight",
            discipline: "Vigilance",
            target: 13,
            stakes:
              "Cross the first Floodgate approach before the channel closes the safe route.",
            outcome_bands: [
              {
                degree: "Crisis",
                consequence:
                  "The crossing closes and the party enters under immediate pressure.",
              },
              {
                degree: "Setback",
                consequence:
                  "The party crosses, but the dry route is lost behind them.",
              },
              {
                degree: "Success",
                consequence: "The party crosses before the mechanism shifts.",
              },
              {
                degree: "Triumph",
                consequence:
                  "The party crosses and reads the mechanism's next opening.",
              },
            ],
            invoke_spark: command.intent.payload.invoke_spark,
          }),
        };
        break;
      case "choose_guided_option": {
        if (character === undefined || seat === undefined)
          throw new Error(
            "A selected hero is required for this guided mechanic.",
          );
        if (room.current_beat_id === "guided_beat_challenge_001") {
          const challenge = mechanical.state.challenges.find(
            ({ challenge_id }) =>
              challenge_id === "challenge_floodgate_sequence_001",
          );
          if (challenge === undefined)
            throw new Error("The Floodgate challenge is unavailable.");
          const route =
            command.intent.payload.option_id ===
            "guided_option_challenge_route_001";
          if (
            !route &&
            command.intent.payload.option_id !==
              "guided_option_challenge_brace_001"
          )
            throw new Error("The challenge option is stale.");
          candidate = {
            ...common,
            kind: "advance_challenge",
            payload: {
              challenge_id: challenge.challenge_id,
              check: this.#checkAttempt({
                character,
                seat_id: seat.seat_id,
                attribute: route ? "Finesse" : "Force",
                discipline: route ? "Subterfuge" : "Athletics",
                target: 13,
                stakes: route
                  ? "Find the maintenance route before rising water seals it."
                  : "Force the relief controls before the gallery floods.",
                outcome_bands: [
                  {
                    degree: "Crisis",
                    consequence:
                      "Danger rises twice and the party reaches the works at a lasting cost.",
                  },
                  {
                    degree: "Setback",
                    consequence:
                      "Danger rises and the chosen approach closes behind the party.",
                  },
                  {
                    degree: "Success",
                    consequence:
                      "Progress advances and the route remains usable.",
                  },
                  {
                    degree: "Triumph",
                    consequence:
                      "Progress advances twice and exposes a strong position.",
                  },
                ],
                invoke_spark: false,
              }),
            },
          };
          break;
        }
        if (room.current_beat_id === "guided_beat_ritual_001") {
          const ritual = mechanical.state.rituals.find(
            ({ ritual_id }) => ritual_id === "ritual_floodgate_relief_001",
          );
          if (ritual === undefined)
            throw new Error("The Floodgate ritual is unavailable.");
          const reverse =
            command.intent.payload.option_id ===
            "guided_option_ritual_reverse_001";
          if (
            !reverse &&
            command.intent.payload.option_id !==
              "guided_option_ritual_ground_001"
          )
            throw new Error("The ritual option is stale.");
          candidate = {
            ...common,
            kind: "resolve_ritual",
            payload: {
              ritual_id: ritual.ritual_id,
              check: this.#checkAttempt({
                character,
                seat_id: seat.seat_id,
                attribute: reverse ? "Insight" : "Force",
                discipline: reverse ? "Mysticism" : "Craft",
                target: 13,
                stakes: reverse
                  ? "Reverse the current without waking the relief violently."
                  : "Ground the surge through the bell without breaking the controls.",
                outcome_bands: [
                  {
                    degree: "Crisis",
                    consequence:
                      "The current snaps back and the custodian wakes along the opened route.",
                  },
                  {
                    degree: "Setback",
                    consequence:
                      "The relief turns unevenly and the custodian wakes ready.",
                  },
                  {
                    degree: "Success",
                    consequence:
                      "The relief turns and leaves the party positioned for the custodian.",
                  },
                  {
                    degree: "Triumph",
                    consequence:
                      "The relief turns cleanly and reveals a reserve cache.",
                  },
                ],
                invoke_spark: false,
              }),
            },
          };
          break;
        }
        throw new Error(
          "The guided option has no bounded mechanic at this beat.",
        );
      }
      case "submit_die": {
        const payload = command.intent.payload;
        if (
          !mechanical.state.pending_physical_checks.some(
            ({ pending_check_id, submission_nonce, disclosure }) =>
              pending_check_id === payload.pending_check_id &&
              submission_nonce === payload.submission_nonce &&
              disclosure.eligible_roller === payload.seat_id,
          )
        )
          throw new Error(
            "Physical roll nonce is stale or belongs to another seat.",
          );
        candidate = {
          ...common,
          kind: "submit_die_result",
          payload: {
            pending_check_id: payload.pending_check_id,
            physical_submission_id: derived(
              "physical_submission",
              command.client_command_id ?? command.room_command_id,
            ),
            submission_nonce: payload.submission_nonce,
            die_face: payload.die_face,
          },
        };
        break;
      }
      case "resolve_reaction":
        if (mechanical.state.combat === null || character === undefined)
          throw new Error("Reaction is not currently legal.");
        candidate = {
          ...common,
          kind: "resolve_reaction",
          payload: {
            combat_id: mechanical.state.combat.combat_id,
            reaction_window_id: command.intent.payload.reaction_window_id,
            actor_id: character.foundation.actor_id,
            legal_action_id:
              command.intent.payload.response === "pass"
                ? null
                : (command.intent.payload.legal_action_id ?? null),
          },
        };
        break;
      case "confirm_correction":
        if (
          room.correction_request?.correction_request_id !==
          command.intent.payload.correction_request_id
        )
          throw new Error("Correction request is stale.");
        candidate = {
          ...common,
          kind: "undo_transaction",
          payload: {
            target_transaction_id:
              room.correction_request.target_transaction_id,
          },
        };
        break;
      case "withdraw_combat":
        if (
          mechanical.state.combat === null ||
          mechanical.state.combat.status !== "active"
        )
          throw new Error("Combat withdrawal is not currently legal.");
        candidate = {
          ...common,
          kind: "withdraw_from_combat",
          payload: { combat_id: mechanical.state.combat.combat_id },
        };
        break;
      default:
        throw new Error("Client intent has no bounded mechanical mapping.");
    }
    const validated = validateValue(GameCommandSchema, candidate);
    if (!validated.success)
      throw new Error("Mapped game command failed validation.");
    return validated.value;
  }

  #checkAttempt(input: {
    readonly character: PlayableCharacterState;
    readonly seat_id: RoomCommand["seat_id"];
    readonly attribute: "Force" | "Finesse" | "Insight" | "Presence";
    readonly discipline:
      | "Athletics"
      | "Subterfuge"
      | "Craft"
      | "Lore"
      | "Vigilance"
      | "Influence"
      | "Survival"
      | "Mysticism";
    readonly target: 10 | 13 | 16 | 19 | 22;
    readonly stakes: string;
    readonly outcome_bands: readonly [
      { readonly degree: "Crisis"; readonly consequence: string },
      { readonly degree: "Setback"; readonly consequence: string },
      { readonly degree: "Success"; readonly consequence: string },
      { readonly degree: "Triumph"; readonly consequence: string },
    ];
    readonly invoke_spark: boolean;
    readonly physical_reason?: "pivotal_scene_conclusion";
  }): CheckAttemptInput {
    if (input.seat_id === undefined)
      throw new Error("A check requires an eligible seat.");
    const attribute = input.character.foundation.attributes.find(
      (candidate) => candidate.attribute === input.attribute,
    )?.rating;
    const discipline = input.character.foundation.disciplines.find(
      (candidate) => candidate.discipline === input.discipline,
    )?.rating;
    if (attribute === undefined || discipline === undefined)
      throw new Error("A check references unavailable hero ratings.");
    const request: CheckRequest = {
      schema_version: SCHEMA_VERSION,
      actor_id: input.character.foundation.actor_id,
      attribute: input.attribute,
      attribute_rating: attribute,
      discipline: input.discipline,
      discipline_rating: discipline,
      target: input.target,
      modifier_state: { edge: false, hindrance: false },
      visibility: "public" as const,
      stakes: input.stakes,
      outcome_bands: [
        { ...input.outcome_bands[0] },
        { ...input.outcome_bands[1] },
        { ...input.outcome_bands[2] },
        { ...input.outcome_bands[3] },
      ],
      action_feasibility: "possible" as const,
      spark_eligible: input.physical_reason === undefined,
      eligible_roller: input.seat_id,
    };
    return input.physical_reason === undefined
      ? { request, roll_mode: "simulated", invoke_spark: input.invoke_spark }
      : {
          request,
          roll_mode: "physical",
          physical_reason: input.physical_reason,
          invoke_spark: false,
        };
  }

  #workflowAccepted(outcome: DurableWorkflowResult): boolean {
    return (
      (outcome.result_kind === "completed" ||
        outcome.result_kind === "recovered") &&
      "commit" in outcome.mechanical &&
      outcome.mechanical.commit.transaction.outcome === "accepted"
    );
  }

  #workflowEvents(
    outcome: Extract<
      DurableWorkflowResult,
      { result_kind: "completed" | "recovered" }
    >,
  ) {
    if (!("commit" in outcome.mechanical))
      throw new Error("A completed room workflow has no mechanical commit.");
    return outcome.mechanical.commit.events;
  }

  #outcomeDegree(
    outcome: Extract<
      DurableWorkflowResult,
      { result_kind: "completed" | "recovered" }
    >,
  ): OutcomeDegree | null {
    const event = [...this.#workflowEvents(outcome)]
      .reverse()
      .find(({ kind }) => kind === "check_resolved");
    return event?.kind === "check_resolved"
      ? event.payload.result.final_degree
      : null;
  }

  #combatOutcome(
    outcome: Extract<
      DurableWorkflowResult,
      { result_kind: "completed" | "recovered" }
    >,
  ): "heroes_prevailed" | "heroes_withdrew" | "heroes_defeated" | null {
    const event = [...this.#workflowEvents(outcome)]
      .reverse()
      .find(({ kind }) => kind === "combat_resolved");
    return event?.kind === "combat_resolved" ? event.payload.outcome : null;
  }

  #systemMechanicalCommand(
    state: NonNullable<ReturnType<SqliteRoomStore["loadRoom"]>>,
    key: string,
    intent: RoomCommand["intent"],
  ): RoomCommand {
    return {
      ...this.#systemRoomCommand(state, key, intent),
      client_command_id: derived(
        "client_command",
        `${state.room_session_id}:${key}`,
      ) as never,
    };
  }

  #submitSystemMechanical(
    roomSessionId: RoomSessionId,
    key: string,
    intent: RoomCommand["intent"],
    mapper: (
      room: NonNullable<ReturnType<SqliteRoomStore["loadRoom"]>>,
      envelope: {
        readonly command_id: GameCommand["command_id"];
        readonly transaction_id: GameCommand["transaction_id"];
      },
    ) => unknown,
  ): Extract<
    DurableWorkflowResult,
    { result_kind: "completed" | "recovered" }
  > {
    const state = this.#roomStore.loadRoom(roomSessionId);
    if (state === null)
      throw new Error("Guided mechanical room is unavailable.");
    const command = this.#systemMechanicalCommand(state, key, intent);
    const outcome = this.#workflow.submit(command, ({ room, envelope }) =>
      mapper(room, envelope),
    );
    if (
      (outcome.result_kind !== "completed" &&
        outcome.result_kind !== "recovered") ||
      !this.#workflowAccepted(outcome)
    ) {
      const rejectedEvent =
        outcome.result_kind === "completed" ||
        outcome.result_kind === "recovered"
          ? this.#workflowEvents(outcome).find(
              ({ kind }) => kind === "command_rejected",
            )
          : undefined;
      const rejectionDetail =
        rejectedEvent?.kind === "command_rejected"
          ? rejectedEvent.payload.safe_detail
          : "safe_detail" in outcome
            ? outcome.safe_detail
            : undefined;
      throw new Error(
        `A bounded guided mechanic was rejected by the rules engine${rejectionDetail === undefined ? "." : `: ${rejectionDetail}`}`,
      );
    }
    return outcome;
  }

  #gameEnvelope(
    room: NonNullable<ReturnType<SqliteRoomStore["loadRoom"]>>,
    envelope: {
      readonly command_id: GameCommand["command_id"];
      readonly transaction_id: GameCommand["transaction_id"];
    },
  ) {
    return {
      schema_version: SCHEMA_VERSION,
      command_id: envelope.command_id,
      transaction_id: envelope.transaction_id,
      campaign_id: room.campaign_id,
      expected_revision: room.mechanical_revision,
    };
  }

  #firstClaimedHero(
    room: NonNullable<ReturnType<SqliteRoomStore["loadRoom"]>>,
  ) {
    const seat = room.seats.find(
      ({ participant_id }) => participant_id !== null,
    );
    const mechanical = this.#runtimeStore.inspectCampaign(room.campaign_id);
    const character = mechanical?.state.party.characters.find(
      ({ character_id }) => character_id === seat?.character_id,
    );
    if (seat === undefined || character === undefined)
      throw new Error(
        "The guided mechanic requires a claimed materialized hero.",
      );
    return { seat, character, mechanical };
  }

  async #afterMechanicalCommit(
    roomSessionId: RoomSessionId,
    intentKind: ClientCommand["intent"]["kind"],
    outcome: Extract<
      DurableWorkflowResult,
      { result_kind: "completed" | "recovered" }
    >,
  ): Promise<void> {
    const room = this.#roomStore.loadRoom(roomSessionId);
    if (room === null)
      throw new Error("Guided room is unavailable after a mechanic.");
    if (intentKind === "choose_spark") {
      if (this.#outcomeDegree(outcome) !== null) {
        await this.#advanceGuided(roomSessionId, "continue");
        await this.#enterCurrentBeat(roomSessionId);
      }
      return;
    }
    if (intentKind === "choose_guided_option") {
      const degree = this.#outcomeDegree(outcome);
      if (degree === null)
        throw new Error(
          "A guided subsystem check committed without an outcome band.",
        );
      await this.#advanceGuided(roomSessionId, degree);
      await this.#enterCurrentBeat(roomSessionId);
      return;
    }
    if (intentKind === "withdraw_combat") {
      await this.#advanceCombatConclusion(
        roomSessionId,
        this.#combatOutcome(outcome),
      );
      return;
    }
    if (intentKind === "resolve_reaction") {
      await this.#continueReactionOrCombat(roomSessionId);
      return;
    }
    if (intentKind === "submit_die") {
      if (room.current_beat_id === "guided_beat_optional_spark_001") {
        await this.#advanceGuided(roomSessionId, "continue");
        await this.#enterCurrentBeat(roomSessionId);
        return;
      }
      if (room.current_beat_id === "guided_beat_physical_001") {
        const degree = this.#outcomeDegree(outcome);
        if (degree === null)
          throw new Error(
            "The pivotal physical roll committed without an outcome band.",
          );
        await this.#advanceGuided(roomSessionId, degree);
        return;
      }
    }
    if (room.current_beat_id === "guided_beat_combat_001") {
      const resolved = this.#combatOutcome(outcome);
      if (resolved !== null) {
        await this.#advanceCombatConclusion(roomSessionId, resolved);
        return;
      }
      await this.#runEnemyFallbacks(roomSessionId);
    }
  }

  async #advanceGuided(
    roomSessionId: RoomSessionId,
    outcome: GuidedOutcome,
  ): Promise<void> {
    const state = this.#roomStore.loadRoom(roomSessionId);
    if (state === null) throw new Error("Guided room is unavailable.");
    const command = this.#systemRoomCommand(
      state,
      `guided:${state.current_beat_id}:${outcome}:${state.room_revision}`,
      {
        kind: "choose_guided_option",
        payload: {
          option_id: `guided_option_system_${outcome.toLowerCase()}` as never,
        },
      },
    );
    await this.#guided.advance(command, outcome);
  }

  async #advanceCombatConclusion(
    roomSessionId: RoomSessionId,
    outcome: "heroes_prevailed" | "heroes_withdrew" | "heroes_defeated" | null,
  ): Promise<void> {
    if (outcome === null)
      throw new Error("Combat completion has no canonical outcome.");
    const guidedOutcome =
      outcome === "heroes_prevailed"
        ? "combat_victory"
        : outcome === "heroes_withdrew"
          ? "withdrawal"
          : "defeat";
    await this.#advanceGuided(roomSessionId, guidedOutcome);
    await this.#enterCurrentBeat(roomSessionId);
  }

  async #enterCurrentBeat(roomSessionId: RoomSessionId): Promise<void> {
    let room = this.#roomStore.loadRoom(roomSessionId);
    if (room === null) throw new Error("Guided room is unavailable.");
    const operation = this.#guided.operationFor(roomSessionId);
    if (operation.kind === "scene_transition") {
      await this.#advanceGuided(roomSessionId, "continue");
      await this.#enterCurrentBeat(roomSessionId);
      return;
    }
    if (operation.kind === "start_challenge") {
      const mechanical = this.#runtimeStore.inspectCampaign(room.campaign_id);
      if (
        mechanical === null ||
        mechanical.state.challenges.some(
          ({ challenge_id }) =>
            challenge_id === "challenge_floodgate_sequence_001",
        )
      )
        return;
      const definition = PHASE_2_DEFINITIONS.find(
        ({ content_definition_id }) =>
          content_definition_id === operation.definition_id,
      );
      if (definition?.kind !== "challenge")
        throw new Error("Guided challenge definition is unavailable.");
      this.#submitSystemMechanical(
        roomSessionId,
        "guided:start_challenge:floodgate",
        {
          kind: "choose_guided_option",
          payload: {
            option_id: "guided_option_system_start_challenge" as never,
          },
        },
        (current, envelope) => ({
          ...this.#gameEnvelope(current, envelope),
          kind: "start_challenge",
          payload: {
            challenge: {
              schema_version: SCHEMA_VERSION,
              record_kind: "challenge_state",
              challenge_id: "challenge_floodgate_sequence_001",
              definition: {
                content_definition_id: definition.content_definition_id,
                definition_revision: definition.definition_revision,
              },
              progress: {
                current: 0,
                maximum: definition.payload.progress_maximum,
              },
              danger: {
                current: 0,
                maximum: definition.payload.danger_maximum,
              },
              tie_rule: definition.payload.tie_rule,
              status: "active",
            },
          },
        }),
      );
      return;
    }
    if (operation.kind === "establish_social") {
      const definition = PHASE_2_DEFINITIONS.find(
        ({ content_definition_id }) =>
          content_definition_id === operation.definition_id,
      );
      if (definition?.kind !== "social_profile")
        throw new Error("Guided social definition is unavailable.");
      const existing = this.#runtimeStore.inspectCampaign(room.campaign_id);
      if (existing === null)
        throw new Error("Guided social campaign is unavailable.");
      if (
        !existing.state.social_states.some(
          ({ npc_actor_id }) => npc_actor_id === "actor_gatewarden_nera_001",
        )
      ) {
        this.#submitSystemMechanical(
          roomSessionId,
          "guided:establish_social:gatewarden",
          {
            kind: "choose_guided_option",
            payload: {
              option_id: "guided_option_system_establish_social" as never,
            },
          },
          (current, envelope) => ({
            ...this.#gameEnvelope(current, envelope),
            kind: "establish_social_state",
            payload: {
              social_state: {
                schema_version: SCHEMA_VERSION,
                record_kind: "social_state",
                npc_actor_id: "actor_gatewarden_nera_001",
                definition: {
                  content_definition_id: definition.content_definition_id,
                  definition_revision: definition.definition_revision,
                },
                motives: definition.payload.motives,
                fears: definition.payload.fears,
                stance: definition.payload.initial_stance,
                leverage: [],
                leverage_capacity: definition.payload.leverage_capacity,
                hard_limits: definition.payload.hard_limits.map(
                  (statement, index) => ({
                    social_limit_id: `social_limit_gatewarden_${index + 1}`,
                    statement,
                  }),
                ),
              },
            },
          }),
        );
      }
      room = this.#roomStore.loadRoom(roomSessionId);
      if (room === null) throw new Error("Guided social room disappeared.");
      const { seat, character } = this.#firstClaimedHero(room);
      const attempt = this.#submitSystemMechanical(
        roomSessionId,
        "guided:attempt_social:gatewarden",
        {
          kind: "choose_guided_option",
          payload: {
            option_id: "guided_option_system_attempt_social" as never,
          },
        },
        (current, envelope) => ({
          ...this.#gameEnvelope(current, envelope),
          kind: "attempt_social_shift",
          payload: {
            npc_actor_id: "actor_gatewarden_nera_001",
            requested_stance: "receptive",
            challenged_limit_id: null,
            check: this.#checkAttempt({
              character,
              seat_id: seat.seat_id,
              attribute: "Presence",
              discipline: "Influence",
              target: 13,
              stakes:
                "Convince the gatewarden that opening the relief protects the trapped crew.",
              outcome_bands: [
                {
                  degree: "Crisis",
                  consequence:
                    "The exchange hardens her fear, but she allows one costly attempt.",
                },
                {
                  degree: "Setback",
                  consequence:
                    "She yields only after demanding the party carry the risk.",
                },
                {
                  degree: "Success",
                  consequence:
                    "She accepts the plan and shares the bell-stair route.",
                },
                {
                  degree: "Triumph",
                  consequence:
                    "She joins the plan and reveals the safest grounding point.",
                },
              ],
              invoke_spark: false,
            }),
          },
        }),
      );
      const degree = this.#outcomeDegree(attempt);
      if (degree === null)
        throw new Error("Social resolution has no outcome band.");
      await this.#advanceGuided(roomSessionId, degree);
      await this.#enterCurrentBeat(roomSessionId);
      return;
    }
    if (operation.kind === "start_ritual") {
      const definition = PHASE_2_DEFINITIONS.find(
        ({ content_definition_id }) =>
          content_definition_id === operation.definition_id,
      );
      if (definition?.kind !== "ritual")
        throw new Error("Guided ritual definition is unavailable.");
      let mechanical = this.#runtimeStore.inspectCampaign(room.campaign_id);
      if (mechanical === null)
        throw new Error("Guided ritual campaign is unavailable.");
      if (
        !mechanical.state.rituals.some(
          ({ ritual_id }) => ritual_id === "ritual_floodgate_relief_001",
        )
      ) {
        this.#submitSystemMechanical(
          roomSessionId,
          "guided:start_ritual:floodgate",
          {
            kind: "choose_guided_option",
            payload: {
              option_id: "guided_option_system_start_ritual" as never,
            },
          },
          (current, envelope) => ({
            ...this.#gameEnvelope(current, envelope),
            kind: "start_ritual",
            payload: {
              ritual: {
                schema_version: SCHEMA_VERSION,
                record_kind: "ritual_state",
                ritual_id: "ritual_floodgate_relief_001",
                definition: {
                  content_definition_id: definition.content_definition_id,
                  definition_revision: definition.definition_revision,
                },
                status: "preparing",
                requirements: definition.payload.requirements,
                costs: definition.payload.costs,
                contributor_ids: [],
                paid_cost_count: 0,
                target: {
                  kind: "place",
                  place_tag: "floodgate_relief_circuit",
                },
              },
              established_fictional_position_tags: [
                "floodgate_current_reversed",
              ],
            },
          }),
        );
      }
      mechanical = this.#runtimeStore.inspectCampaign(room.campaign_id);
      const ritual = mechanical?.state.rituals.find(
        ({ ritual_id }) => ritual_id === "ritual_floodgate_relief_001",
      );
      if (ritual?.status === "preparing") {
        const { character } = this.#firstClaimedHero(room);
        this.#submitSystemMechanical(
          roomSessionId,
          "guided:contribute_ritual:floodgate",
          {
            kind: "choose_guided_option",
            payload: {
              option_id: "guided_option_system_contribute_ritual" as never,
            },
          },
          (current, envelope) => ({
            ...this.#gameEnvelope(current, envelope),
            kind: "contribute_ritual",
            payload: {
              ritual_id: ritual.ritual_id,
              character_id: character.character_id,
              paid_cost_index: ritual.paid_cost_count,
            },
          }),
        );
      }
      return;
    }
    if (operation.kind === "start_combat") {
      const mechanical = this.#runtimeStore.inspectCampaign(room.campaign_id);
      if (mechanical === null || mechanical.state.combat !== null) return;
      const claimed = room.seats
        .filter(({ participant_id }) => participant_id !== null)
        .map(({ starter_loadout_id, seat_id }) => ({
          starter_loadout_id,
          seat_id,
        }));
      const combat = buildPhase2Encounter(claimed);
      this.#submitSystemMechanical(
        roomSessionId,
        `guided:start_combat:${operation.variant_key}`,
        {
          kind: "choose_guided_option",
          payload: { option_id: "guided_option_system_start_combat" as never },
        },
        (current, envelope) => ({
          ...this.#gameEnvelope(current, envelope),
          kind: "start_combat",
          payload: { combat },
        }),
      );
      return;
    }
    if (operation.kind === "resolve_check" && operation.physical) {
      const mechanical = this.#runtimeStore.inspectCampaign(room.campaign_id);
      if (
        mechanical === null ||
        mechanical.state.pending_physical_checks.length > 0
      )
        return;
      const { seat, character } = this.#firstClaimedHero(room);
      this.#submitSystemMechanical(
        roomSessionId,
        "guided:final_physical:floodgate",
        {
          kind: "choose_spark",
          payload: { seat_id: seat.seat_id, invoke_spark: false },
        },
        (current, envelope) => ({
          ...this.#gameEnvelope(current, envelope),
          kind: "resolve_check",
          payload: this.#checkAttempt({
            character,
            seat_id: seat.seat_id,
            attribute: "Force",
            discipline: "Craft",
            target: 16,
            stakes:
              "Set the final locking tooth before the surge reaches the open spillway.",
            outcome_bands: [
              {
                degree: "Crisis",
                consequence:
                  "The surge tears through the gallery before the lock catches.",
              },
              {
                degree: "Setback",
                consequence:
                  "The lock catches only after the old pump gallery is ruined.",
              },
              {
                degree: "Success",
                consequence:
                  "The locking tooth seats and the lower ward drains safely.",
              },
              {
                degree: "Triumph",
                consequence:
                  "The lock seats cleanly and preserves the old works.",
              },
            ],
            invoke_spark: false,
            physical_reason: "pivotal_scene_conclusion",
          }),
        }),
      );
    }
  }

  async #runEnemyFallbacks(roomSessionId: RoomSessionId): Promise<void> {
    for (let step = 0; step < 24; step += 1) {
      const room = this.#roomStore.loadRoom(roomSessionId);
      const mechanical =
        room === null
          ? null
          : this.#runtimeStore.inspectCampaign(room.campaign_id);
      const combat = mechanical?.state.combat;
      if (
        room === null ||
        mechanical === null ||
        combat === null ||
        combat === undefined
      )
        return;
      if (
        combat.status !== "active" ||
        combat.reaction_window !== null ||
        mechanical.state.pending_physical_checks.length > 0
      )
        return;
      if (combat.active_side !== "enemy" && combat.active_actor_id === null)
        return;
      const actor =
        combat.active_actor_id === null
          ? combat.participants.find(
              (candidate) =>
                candidate.side === "enemy" &&
                candidate.guard.current > 0 &&
                !candidate.activation_spent,
            )
          : combat.participants.find(
              (candidate) =>
                candidate.actor_id === combat.active_actor_id &&
                candidate.side === "enemy",
            );
      if (actor === undefined || actor.side !== "enemy") return;
      const selected = this.#submitSystemMechanical(
        roomSessionId,
        `enemy:select:${combat.round}:${actor.actor_id}:${mechanical.revision}:${step}`,
        {
          kind: "claim_activation",
          payload: { seat_id: "seat_system_enemy" as never },
        },
        (current, envelope) => ({
          ...this.#gameEnvelope(current, envelope),
          kind: "select_enemy_fallback",
          payload: { combat_id: combat.combat_id, actor_id: actor.actor_id },
        }),
      );
      const selection = [...this.#workflowEvents(selected)]
        .reverse()
        .find(({ kind }) => kind === "enemy_action_selected");
      if (selection?.kind !== "enemy_action_selected")
        throw new Error(
          "Enemy fallback committed without a selected legal action.",
        );
      const executed = this.#submitSystemMechanical(
        roomSessionId,
        `enemy:execute:${combat.round}:${actor.actor_id}:${mechanical.revision}:${step}`,
        {
          kind: "commit_legal_action",
          payload: {
            seat_id: "seat_system_enemy" as never,
            legal_action_id: selection.payload.candidate.legal_action_id,
          },
        },
        (current, envelope) => ({
          ...this.#gameEnvelope(current, envelope),
          kind: "execute_combat_action",
          payload: {
            combat_id: combat.combat_id,
            legal_action_id: selection.payload.candidate.legal_action_id,
            invoke_spark: false,
          },
        }),
      );
      const outcome = this.#combatOutcome(executed);
      if (outcome !== null) {
        await this.#advanceCombatConclusion(roomSessionId, outcome);
        return;
      }
      if (
        await this.#openReactionAfterEnemyAction(
          roomSessionId,
          selection.payload.candidate,
        )
      )
        return;
    }
    throw new Error(
      "Enemy fallback exceeded the bounded activation step limit.",
    );
  }

  async #openReactionAfterEnemyAction(
    roomSessionId: RoomSessionId,
    candidate: { readonly target: unknown; readonly actor_id: string },
  ): Promise<boolean> {
    const target = candidate.target as {
      readonly kind?: string;
      readonly actor_id?: string;
    };
    if (target.kind !== "actor" || target.actor_id === undefined) return false;
    const room = this.#roomStore.loadRoom(roomSessionId);
    const mechanical =
      room === null
        ? null
        : this.#runtimeStore.inspectCampaign(room.campaign_id);
    const combat = mechanical?.state.combat;
    const affected = combat?.participants.find(
      ({ actor_id }) => actor_id === target.actor_id,
    );
    if (
      room === null ||
      combat === null ||
      combat === undefined ||
      combat.status !== "active" ||
      affected?.side !== "hero" ||
      combat.reaction_window !== null
    )
      return false;
    const reactionWindowId = derived(
      "reaction_window",
      `${roomSessionId}:${combat.round}:${candidate.actor_id}:${target.actor_id}:${room.mechanical_revision}`,
    ) as never;
    this.#submitSystemMechanical(
      roomSessionId,
      `reaction:open:${reactionWindowId}`,
      {
        kind: "reaction_timeout",
        payload: { reaction_window_id: reactionWindowId },
      },
      (current, envelope) => ({
        ...this.#gameEnvelope(current, envelope),
        kind: "open_reaction_window",
        payload: {
          combat_id: combat.combat_id,
          reaction_window_id: reactionWindowId,
          triggering_actor_id: affected.actor_id,
        },
      }),
    );
    await this.#continueReactionOrCombat(roomSessionId);
    return true;
  }

  async #continueReactionOrCombat(roomSessionId: RoomSessionId): Promise<void> {
    const room = this.#roomStore.loadRoom(roomSessionId);
    const mechanical =
      room === null
        ? null
        : this.#runtimeStore.inspectCampaign(room.campaign_id);
    const combat = mechanical?.state.combat;
    if (
      room === null ||
      mechanical === null ||
      combat === null ||
      combat === undefined ||
      combat.status !== "active"
    )
      return;
    const window = combat.reaction_window;
    if (window === null) {
      await this.#runEnemyFallbacks(roomSessionId);
      return;
    }
    const actorId = window.eligible_actor_ids[0];
    const character = mechanical.state.party.characters.find(
      ({ foundation }) => foundation.actor_id === actorId,
    );
    const seat = room.seats.find(
      ({ character_id }) => character_id === character?.character_id,
    );
    const fallbackSeat = room.seats[0];
    if (actorId === undefined) return;
    if (character === undefined || seat === undefined) {
      if (fallbackSeat === undefined) return;
      const passed = this.#submitSystemMechanical(
        roomSessionId,
        `reaction:auto_pass:${window.reaction_window_id}:${actorId}`,
        {
          kind: "resolve_reaction",
          payload: {
            seat_id: fallbackSeat.seat_id,
            reaction_window_id: window.reaction_window_id,
            response: "pass",
          },
        },
        (current, envelope) => ({
          ...this.#gameEnvelope(current, envelope),
          kind: "resolve_reaction",
          payload: {
            combat_id: combat.combat_id,
            reaction_window_id: window.reaction_window_id,
            actor_id: actorId,
            legal_action_id: null,
          },
        }),
      );
      if (this.#combatOutcome(passed) !== null) return;
      await this.#continueReactionOrCombat(roomSessionId);
      return;
    }
    const connected = !room.recoveries.some(
      ({ seat_id }) => seat_id === seat.seat_id,
    );
    this.#reactionDeadlines.setConnectionKnown(roomSessionId, connected);
    this.#reactionDeadlines.start({
      room_session_id: roomSessionId,
      seat_id: seat.seat_id,
      reaction_window_id: window.reaction_window_id as never,
      duration_ms: 10_000,
    });
  }

  async #resolveReactionTimeout(roomSessionId: RoomSessionId): Promise<void> {
    try {
      const room = this.#roomStore.loadRoom(roomSessionId);
      const mechanical =
        room === null
          ? null
          : this.#runtimeStore.inspectCampaign(room.campaign_id);
      const combat = mechanical?.state.combat;
      const window = combat?.reaction_window;
      const actorId = window?.eligible_actor_ids[0];
      const character = mechanical?.state.party.characters.find(
        ({ foundation }) => foundation.actor_id === actorId,
      );
      const seat = room?.seats.find(
        ({ character_id }) => character_id === character?.character_id,
      );
      if (
        room === null ||
        combat === null ||
        combat === undefined ||
        window === null ||
        window === undefined ||
        actorId === undefined ||
        seat === undefined
      )
        return;
      this.#submitSystemMechanical(
        roomSessionId,
        `reaction:timeout_pass:${window.reaction_window_id}:${actorId}`,
        {
          kind: "resolve_reaction",
          payload: {
            seat_id: seat.seat_id,
            reaction_window_id: window.reaction_window_id,
            response: "pass",
          },
        },
        (current, envelope) => ({
          ...this.#gameEnvelope(current, envelope),
          kind: "resolve_reaction",
          payload: {
            combat_id: combat.combat_id,
            reaction_window_id: window.reaction_window_id,
            actor_id: actorId,
            legal_action_id: null,
          },
        }),
      );
      await this.#continueReactionOrCombat(roomSessionId);
      this.#rebuildCombined(roomSessionId);
      await this.#transports.get(roomSessionId)?.flush(roomSessionId);
    } catch {
      // The deadline is advisory; a stale timeout must never mutate a newer room state.
    }
  }

  #rebuildCombined(roomSessionId: RoomSessionId): void {
    const room = this.#roomStore.loadRoom(roomSessionId);
    if (room === null)
      throw new Error("Room session is unavailable for projection rebuild.");
    const mechanical = this.#runtimeStore.inspectCampaign(room.campaign_id);
    if (mechanical === null)
      throw new Error(
        "Mechanical campaign is unavailable for projection rebuild.",
      );
    const drafts = authoritativeProjectionPort.project({
      state: mechanical.state,
      revision: mechanical.revision,
      catalog: {
        content_manifest_hash: PHASE_2_CONTENT_MANIFEST_HASH,
        definitions: PHASE_2_DEFINITIONS,
      },
      legal_action_id_for: (key) =>
        legalActionIdForCampaign(
          deterministicIdentityPort,
          room.campaign_id,
          key,
        ),
    });
    const projections = buildCombinedProjections({
      room,
      mechanical: drafts,
      presentation: PHASE_2_PRESENTATION_MANIFEST,
      command_results: this.#commandResults,
    });
    this.#roomStore.replaceCombinedProjections({
      room_session_id: roomSessionId,
      projections,
      stored_at: new Date().toISOString(),
    });
  }

  #relaySecrets(roomSessionId: RoomSessionId): {
    invite_secret: string;
    host_bootstrap_proof: string;
    fallback_code?: string;
    join_url?: string;
  } {
    const record = this.#roomStore.loadRelaySession(roomSessionId);
    if (record === null) throw new Error("Relay session is unavailable.");
    return JSON.parse(this.#vault.decrypt(record.invite_secret_ciphertext)) as {
      invite_secret: string;
      host_bootstrap_proof: string;
      fallback_code?: string;
      join_url?: string;
    };
  }

  #clientResult(
    source: unknown,
    status: "accepted" | "rejected",
    code: ClientCommandFailureCode | undefined,
    safeDetail: string,
    participantId: ParticipantId,
    explicitState?: NonNullable<ReturnType<SqliteRoomStore["loadRoom"]>>,
  ): ClientCommandResult {
    const state =
      explicitState ??
      this.#findRoomForRelay(
        (source as Partial<ClientCommand>).room_id ?? "",
      ) ??
      this.#roomStore.loadRoom(
        this.#roomStore.listResumableRooms()[0]
          ?.room_session_id as RoomSessionId,
      );
    const clientCommandId =
      (source as Partial<ClientCommand>).client_command_id ??
      derived("client_command", `${participantId}:${Date.now()}`);
    const result =
      status === "accepted"
        ? {
            schema_version: SCHEMA_VERSION,
            client_command_id: clientCommandId,
            status,
            room_revision: state?.room_revision ?? 0,
            view_revision: state?.view_revision ?? 0,
            safe_detail: safeDetail,
          }
        : {
            schema_version: SCHEMA_VERSION,
            client_command_id: clientCommandId,
            status,
            code: code ?? "internal_recovery_required",
            room_revision: state?.room_revision ?? 0,
            view_revision: state?.view_revision ?? 0,
            safe_detail: safeDetail,
          };
    const validated = validateValue(ClientCommandResultSchema, result);
    if (!validated.success)
      throw new Error("Host produced invalid client result.");
    const list = this.#commandResults.get(participantId) ?? [];
    list.push(validated.value);
    this.#commandResults.set(participantId, list.slice(-16));
    return validated.value;
  }
}
