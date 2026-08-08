import {
  type ClientCommand,
  type ClientCommandIntent,
  ClientCommandSchema,
  type ClientDeliverableView,
  canonicalJson,
  PROTOCOL_VERSION,
  RelayApprovalResultSchema,
  RelayPendingJoinResultSchema,
  RelayRoutedFrameSchema,
  SCHEMA_VERSION,
  TransportMessageSchema,
  validateCombinedProjectionDelivery,
  validateValue,
} from "@lldm/contracts";
import { clearReconnect, loadReconnect, storeReconnect } from "./indexed-db.js";

function id(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function authProtocol(token: string): string {
  const bytes = new TextEncoder().encode(token);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `lldm-auth.${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")}`;
}

export interface RoomTransportHandlers {
  readonly onPhase: (
    phase: import("../state/connection.js").ConnectionPhase,
    message: string,
  ) => void;
  readonly onView: (view: ClientDeliverableView) => void;
  readonly onCommandResult: (
    result: import("@lldm/contracts").ClientCommandResult,
    intentKind: ClientCommandIntent["kind"] | undefined,
  ) => void;
}

export class RoomTransportClient {
  readonly #roomId: string;
  readonly #origin: string;
  readonly #handlers: RoomTransportHandlers;
  #socket: WebSocket | null = null;
  #connectionId: string | null = null;
  #participantId: string | null = null;
  #token: string | null = null;
  #sequence = 0;
  #lastIncomingSequence = -1;
  #viewRevision = 0;
  #participantViewRevision = 0;
  #playerHostViewRevision = 0;
  #inflight = new Map<string, ClientCommand>();
  #receiveQueue: Promise<void> = Promise.resolve();
  #closed = false;

  constructor(roomId: string, origin: string, handlers: RoomTransportHandlers) {
    this.#roomId = roomId;
    this.#origin = origin.replace(/\/$/, "");
    this.#handlers = handlers;
  }

  async reconnectIfAvailable(): Promise<boolean> {
    const reconnect = await loadReconnect(this.#roomId);
    if (reconnect === null || Date.parse(reconnect.expires_at) <= Date.now())
      return false;
    this.#participantId = reconnect.participant_id;
    this.#connectionId = reconnect.connection_id;
    this.#token = reconnect.reconnect_token;
    this.#viewRevision = reconnect.view_revision;
    await this.#connect();
    return true;
  }

  async join(
    displayName: string,
    inviteSecret: string,
    hostBootstrapProof?: string,
    fallbackCode?: string,
  ): Promise<void> {
    const reconnect = await loadReconnect(this.#roomId);
    if (reconnect !== null && Date.parse(reconnect.expires_at) > Date.now()) {
      this.#participantId = reconnect.participant_id;
      this.#connectionId = reconnect.connection_id;
      this.#token = reconnect.reconnect_token;
      this.#viewRevision = reconnect.view_revision;
      await this.#connect();
      return;
    }
    const response = await fetch(
      `${this.#origin}/api/rooms/${encodeURIComponent(this.#roomId)}/join`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema_version: SCHEMA_VERSION,
          protocol_version: PROTOCOL_VERSION,
          room_id: this.#roomId,
          ...(inviteSecret === ""
            ? { fallback_code: fallbackCode }
            : { invite_secret: inviteSecret }),
          display_name: displayName,
          ...(hostBootstrapProof === undefined
            ? {}
            : { host_bootstrap_proof: hostBootstrapProof }),
        }),
      },
    );
    const parsed = validateValue(
      RelayPendingJoinResultSchema,
      await response.json(),
    );
    if (!response.ok || !parsed.success)
      throw new Error("The room invite is invalid or expired.");
    this.#connectionId = parsed.value.connection_id;
    this.#token = parsed.value.pending_token;
    await this.#connect();
    this.#handlers.onPhase(
      "pending_approval",
      "Waiting for the player-host to approve this device.",
    );
    this.sendIntent({
      kind: "request_join",
      payload: { display_name: displayName },
    });
  }

  sendIntent(intent: ClientCommandIntent, seatId?: string): string {
    if (
      this.#socket?.readyState !== WebSocket.OPEN ||
      this.#connectionId === null
    )
      throw new Error("The room connection is not ready.");
    const command = {
      schema_version: SCHEMA_VERSION,
      protocol_version: PROTOCOL_VERSION,
      client_command_id: id("client_command"),
      room_id: this.#roomId,
      connection_id: this.#connectionId,
      ...(this.#participantId === null
        ? {}
        : { participant_id: this.#participantId }),
      ...(seatId === undefined ? {} : { seat_id: seatId }),
      expected_view_revision: this.#viewRevision,
      intent,
    };
    const validated = validateValue(ClientCommandSchema, command);
    if (!validated.success)
      throw new Error("The selected action is no longer valid.");
    this.#inflight.set(validated.value.client_command_id, validated.value);
    this.#send("client_command", validated.value);
    this.#handlers.onPhase(
      "command_pending",
      "Confirming the selected action…",
    );
    return validated.value.client_command_id;
  }

  retry(clientCommandId: string): void {
    const command = this.#inflight.get(clientCommandId);
    if (command === undefined)
      throw new Error("The command draft is unavailable.");
    this.#send("client_command", command);
  }

  close(): void {
    this.#closed = true;
    this.#socket?.close(1000, "player_closed");
  }

  async #connect(refreshParticipantToken = true): Promise<void> {
    if (this.#token === null)
      throw new Error("Reconnect authorization is missing.");
    this.#handlers.onPhase(
      this.#socket === null ? "connecting" : "reconnecting",
      "Connecting to the relay…",
    );
    if (this.#participantId !== null && refreshParticipantToken)
      await this.#refreshToken();
    this.#sequence = 0;
    this.#lastIncomingSequence = -1;
    const url = new URL(
      `${this.#origin}/api/rooms/${encodeURIComponent(this.#roomId)}/connect`,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url, ["lldm-v1", authProtocol(this.#token)]);
    this.#socket = socket;
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Relay WebSocket could not connect.")),
        { once: true },
      );
    });
    socket.addEventListener("message", (event) => {
      this.#receiveQueue = this.#receiveQueue
        .then(() => this.#receive(String(event.data), socket))
        .catch(() => {
          this.#handlers.onPhase(
            "recovery_required",
            "A room update could not be stored. Reconnect to request a fresh filtered snapshot.",
          );
        });
    });
    socket.addEventListener("close", (event) => {
      if (this.#socket !== socket) return;
      this.#socket = null;
      if (this.#closed) return;
      if (event.reason === "room_expired") {
        void clearReconnect(this.#roomId);
        this.#handlers.onPhase(
          "expired_room",
          "This relay room expired. The TV can create a new QR path without losing the saved adventure.",
        );
        return;
      }
      this.#handlers.onPhase(
        "reconnecting",
        "Connection dropped. The active spotlight remains reserved while this device reconnects.",
      );
      setTimeout(() => {
        void this.#connect().catch(() =>
          this.#handlers.onPhase(
            "recovery_required",
            "Reconnect needs help from the player-host.",
          ),
        );
      }, 500);
    });
    this.#send("hello", {
      role: this.#participantId === null ? "pending_player" : "approved_player",
      ...(this.#participantId === null
        ? {}
        : { participant_id: this.#participantId }),
    });
    this.#send("resync_request", {
      last_view_revision: this.#viewRevision,
      reason: this.#viewRevision === 0 ? "cursor_missing" : "sequence_gap",
    });
  }

  async #receive(raw: string, sourceSocket: WebSocket): Promise<void> {
    // Approval rotates the pending socket in place. Messages that were already
    // queued from that retired socket belong to its independent sequence and
    // must not create a false gap after the new socket resets at sequence zero.
    if (this.#socket !== sourceSocket) return;
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    const frame = validateValue(RelayRoutedFrameSchema, value);
    if (!frame.success) return;
    const message = frame.value.message;
    if (message.protocol_version !== PROTOCOL_VERSION) {
      this.#handlers.onPhase(
        "incompatible_protocol",
        "This room requires a newer application. Refresh to update.",
      );
      return;
    }
    if (
      this.#lastIncomingSequence >= 0 &&
      message.seq !== this.#lastIncomingSequence + 1
    ) {
      this.#handlers.onPhase(
        "approved_syncing",
        "A delivery gap was detected; requesting a fresh filtered snapshot.",
      );
      this.#send("resync_request", {
        last_view_revision: this.#viewRevision,
        reason: "sequence_gap",
      });
      return;
    }
    if (message.seq <= this.#lastIncomingSequence) return;
    this.#lastIncomingSequence = message.seq;
    this.#send("acknowledgement", {
      acknowledged_message_id: message.message_id,
    });
    if (message.kind === "approval_result") {
      this.#participantId = message.payload.participant_id;
      this.#connectionId = message.payload.connection_id;
      this.#token = message.payload.reconnect_token;
      await storeReconnect({
        room_id: this.#roomId,
        participant_id: message.payload.participant_id,
        connection_id: message.payload.connection_id,
        reconnect_token: message.payload.reconnect_token,
        expires_at: message.payload.expires_at,
        view_revision: this.#viewRevision,
      });
      this.#handlers.onPhase(
        "approved_syncing",
        "Approved. Loading the private room view…",
      );
      const pendingSocket = this.#socket;
      this.#socket = null;
      pendingSocket?.close(1000, "rotate_connection_token");
      // The approval token is fresh and intentionally retains the pending
      // connection id so the relay can atomically replace that socket. A
      // refresh here would briefly consume a second room connection.
      await this.#connect(false);
      return;
    }
    if (message.kind === "command_result") {
      const inflight = this.#inflight.get(message.payload.client_command_id);
      this.#viewRevision = message.payload.view_revision;
      this.#handlers.onCommandResult(message.payload, inflight?.intent.kind);
      this.#inflight.delete(message.payload.client_command_id);
      return;
    }
    if (
      message.kind === "projection_delivery" ||
      message.kind === "resync_result"
    ) {
      const delivery = validateCombinedProjectionDelivery(message.payload);
      if (!delivery.success) {
        this.#send("resync_request", {
          last_view_revision: this.#viewRevision,
          reason: "delta_invalid",
        });
        return;
      }
      const next =
        delivery.value.delivery_kind === "snapshot"
          ? delivery.value.view
          : delivery.value.operations[0].value;
      const audienceViewRevision =
        next.view_kind === "participant_private"
          ? this.#participantViewRevision
          : next.view_kind === "player_host_operational"
            ? this.#playerHostViewRevision
            : this.#viewRevision;
      if (
        delivery.value.delivery_kind === "delta" &&
        delivery.value.base_view_revision !== audienceViewRevision
      ) {
        this.#send("resync_request", {
          last_view_revision: this.#viewRevision,
          reason: "delta_invalid",
        });
        return;
      }
      if (next.view_kind === "public_tv") return;
      if (
        this.#participantId !== null &&
        "participant_id" in next &&
        next.participant_id !== this.#participantId
      ) {
        this.#handlers.onPhase(
          "recovery_required",
          "A filtered view had the wrong audience and was discarded.",
        );
        return;
      }
      if (next.view_kind === "participant_private")
        this.#participantViewRevision = next.view_revision;
      if (next.view_kind === "player_host_operational")
        this.#playerHostViewRevision = next.view_revision;
      this.#viewRevision = Math.max(
        this.#viewRevision,
        this.#participantViewRevision,
        this.#playerHostViewRevision,
      );
      this.#handlers.onView(next);
      if (this.#participantId !== null && this.#token !== null) {
        const reconnect = await loadReconnect(this.#roomId);
        if (reconnect !== null)
          await storeReconnect({
            ...reconnect,
            view_revision: this.#viewRevision,
          });
      }
    }
  }

  async #refreshToken(): Promise<void> {
    if (this.#token === null || this.#participantId === null) return;
    const response = await fetch(
      `${this.#origin}/api/rooms/${encodeURIComponent(this.#roomId)}/refresh`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${this.#token}` },
      },
    );
    const parsed = validateValue(
      RelayApprovalResultSchema,
      await response.json(),
    );
    if (
      !response.ok ||
      !parsed.success ||
      parsed.value.participant_id !== this.#participantId
    )
      throw new Error("Reconnect authorization could not be rotated.");
    this.#connectionId = parsed.value.connection_id;
    this.#token = parsed.value.reconnect_token;
    await storeReconnect({
      room_id: this.#roomId,
      participant_id: parsed.value.participant_id,
      connection_id: parsed.value.connection_id,
      reconnect_token: parsed.value.reconnect_token,
      expires_at: parsed.value.expires_at,
      view_revision: this.#viewRevision,
    });
  }

  #send(
    kind: "hello" | "client_command" | "resync_request" | "acknowledgement",
    payload: unknown,
  ): void {
    if (
      this.#socket?.readyState !== WebSocket.OPEN ||
      this.#connectionId === null
    )
      return;
    const message = {
      schema_version: SCHEMA_VERSION,
      protocol_version: PROTOCOL_VERSION,
      message_id: id("message"),
      room_id: this.#roomId,
      connection_id: this.#connectionId,
      seq: this.#sequence,
      kind,
      payload,
    };
    const validatedMessage = validateValue(TransportMessageSchema, message);
    if (!validatedMessage.success)
      throw new Error("Outgoing room message failed validation.");
    const frame = validateValue(RelayRoutedFrameSchema, {
      schema_version: SCHEMA_VERSION,
      message: validatedMessage.value,
    });
    if (!frame.success)
      throw new Error("Outgoing relay frame failed validation.");
    this.#sequence += 1;
    this.#socket.send(canonicalJson(frame.value));
  }
}
