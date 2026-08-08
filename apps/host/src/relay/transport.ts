import {
  canonicalJson,
  type ParticipantId,
  PROTOCOL_VERSION,
  type RelayCreateRoomResult,
  type RelayRoutedFrame,
  RelayRoutedFrameSchema,
  SCHEMA_VERSION,
  sha256Hex,
  TransportMessageSchema,
  validateValue,
} from "@lldm/contracts";
import type { RoomApplication } from "../room-application.js";

function protocolToken(token: string): string {
  return `lldm-auth.${Buffer.from(token, "utf8").toString("base64url")}`;
}

function participantFor(roomId: string, connectionId: string): ParticipantId {
  return `participant_${sha256Hex(`participant_v1\u0000${roomId}\u0000${connectionId}`).slice(0, 32)}` as ParticipantId;
}

export class ApplianceRelayTransport {
  readonly #application: RoomApplication;
  readonly #relay: Pick<
    RelayCreateRoomResult,
    "room_id" | "appliance_token" | "expires_at" | "join_url"
  >;
  readonly #pendingConnections = new Map<ParticipantId, string>();
  readonly #participantViewCursors = new Map<ParticipantId, number>();
  readonly #playerHostViewCursors = new Map<ParticipantId, number>();
  #socket: WebSocket | null = null;
  readonly #sequences = new Map<string, number>();
  #retry = 0;
  #closed = false;

  constructor(
    application: RoomApplication,
    relay: Pick<
      RelayCreateRoomResult,
      "room_id" | "appliance_token" | "expires_at" | "join_url"
    >,
  ) {
    this.#application = application;
    this.#relay = relay;
  }

  connect(): void {
    if (this.#closed) return;
    const url = new URL(this.#relay.join_url);
    url.pathname = `/api/rooms/${encodeURIComponent(this.#relay.room_id)}/connect`;
    url.hash = "";
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(url, [
      "lldm-v1",
      protocolToken(this.#relay.appliance_token),
    ]);
    this.#socket = socket;
    socket.addEventListener("open", () => {
      this.#retry = 0;
    });
    socket.addEventListener("message", (event) => {
      void this.#receive(
        typeof event.data === "string" ? event.data : "",
      ).catch(() => socket.close(4001, "appliance_recovery_required"));
    });
    socket.addEventListener("close", () => {
      this.#socket = null;
      if (this.#closed || Date.parse(this.#relay.expires_at) <= Date.now())
        return;
      const delay = Math.min(10_000, 250 * 2 ** this.#retry);
      this.#retry += 1;
      setTimeout(() => this.connect(), delay);
    });
  }

  close(): void {
    this.#closed = true;
    this.#socket?.close(1000, "appliance_shutdown");
    this.#socket = null;
  }

  async #receive(raw: string): Promise<void> {
    let value: unknown;
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return;
    }
    const frame = validateValue(RelayRoutedFrameSchema, value);
    if (!frame.success) return;
    if (
      frame.value.message.kind === "hello" ||
      frame.value.message.kind === "connection_status"
    ) {
      const participantId =
        frame.value.sender_participant_id ??
        frame.value.message.payload.participant_id;
      if (participantId !== undefined) {
        this.#pendingConnections.set(
          participantId,
          frame.value.message.connection_id,
        );
        this.#application.noteParticipantConnection(
          this.#relay.room_id,
          participantId,
          frame.value.message.kind === "hello" ||
            frame.value.message.payload.status === "connected",
        );
        const room = this.#application.roomForRelay(this.#relay.room_id);
        if (room !== null)
          for (const participant of room.participants.filter(
            ({ status }) => status === "approved",
          )) {
            const connectionId = this.#pendingConnections.get(
              participant.participant_id,
            );
            if (connectionId !== undefined)
              await this.#pushViews(
                room.room_session_id,
                participant.participant_id,
                connectionId,
                0,
                true,
              );
          }
      }
      return;
    }
    if (frame.value.message.kind === "resync_request") {
      const participantId =
        frame.value.sender_participant_id ??
        participantFor(this.#relay.room_id, frame.value.message.connection_id);
      this.#pendingConnections.set(
        participantId,
        frame.value.message.connection_id,
      );
      const room = this.#application.roomForRelay(this.#relay.room_id);
      if (room !== null)
        await this.#pushViews(
          room.room_session_id,
          participantId,
          frame.value.message.connection_id,
          frame.value.message.payload.last_view_revision,
          true,
        );
      return;
    }
    if (
      frame.value.message.kind === "acknowledgement" ||
      frame.value.message.kind === "pong"
    )
      return;
    if (frame.value.message.kind !== "client_command") return;
    const client = frame.value.message.payload;
    const participantId =
      frame.value.sender_participant_id ??
      client.participant_id ??
      participantFor(this.#relay.room_id, client.connection_id);
    this.#pendingConnections.set(participantId, client.connection_id);
    const binding = {
      connection_id: client.connection_id,
      participant_id: participantId,
      room_id: this.#relay.room_id,
    } as const;
    const result = await this.#application.submitClient(client, binding);
    await this.#send(
      client.connection_id,
      "command_result",
      result,
      frame.value.message.message_id,
    );
    if (result.status !== "accepted") return;
    if (client.intent.kind === "approve_participant") {
      const connectionId = this.#pendingConnections.get(
        client.intent.payload.participant_id,
      );
      if (connectionId !== undefined) {
        const approval = await this.#application.approveRelayParticipant(
          this.#relay.room_id,
          client.intent.payload.participant_id,
          connectionId,
        );
        await this.#send(connectionId, "approval_result", approval);
      }
    }
    if (client.intent.kind === "recover_player_host") {
      const approval = this.#application.takeRelayApproval(participantId);
      if (approval !== null)
        await this.#send(client.connection_id, "approval_result", approval);
    }
    const room = this.#application.roomForRelay(this.#relay.room_id);
    if (room !== null) await this.flush(room.room_session_id);
  }

  async flush(
    roomSessionId: import("@lldm/contracts").RoomSessionId,
  ): Promise<void> {
    const room = this.#application.roomForRelay(this.#relay.room_id);
    if (room?.room_session_id !== roomSessionId) return;
    for (const participant of room.participants.filter(
      ({ status }) => status === "approved",
    )) {
      const connectionId = this.#pendingConnections.get(
        participant.participant_id,
      );
      if (connectionId !== undefined)
        await this.#pushViews(
          roomSessionId,
          participant.participant_id,
          connectionId,
          0,
          false,
        );
    }
  }

  async #pushViews(
    roomSessionId: import("@lldm/contracts").RoomSessionId,
    participantId: ParticipantId,
    connectionId: string,
    cursor: number,
    force: boolean,
  ): Promise<void> {
    const forceParticipantSnapshot =
      force || !this.#participantViewCursors.has(participantId);
    let participantCursor = forceParticipantSnapshot
      ? cursor
      : (this.#participantViewCursors.get(participantId) ?? cursor);
    for (const delivery of this.#application.participantDelivery(
      roomSessionId,
      participantId,
      participantCursor,
      forceParticipantSnapshot,
    )) {
      await this.#send(connectionId, "projection_delivery", delivery);
      participantCursor =
        delivery.delivery_kind === "snapshot"
          ? delivery.view.view_revision
          : delivery.target_view_revision;
      this.#participantViewCursors.set(participantId, participantCursor);
    }
    const room = this.#application.roomForRelay(this.#relay.room_id);
    if (room?.player_host_participant_id === participantId) {
      const forceHostSnapshot =
        force || !this.#playerHostViewCursors.has(participantId);
      let hostCursor = forceHostSnapshot
        ? cursor
        : (this.#playerHostViewCursors.get(participantId) ?? cursor);
      for (const delivery of this.#application.playerHostDelivery(
        roomSessionId,
        participantId,
        hostCursor,
        forceHostSnapshot,
      )) {
        await this.#send(connectionId, "projection_delivery", delivery);
        hostCursor =
          delivery.delivery_kind === "snapshot"
            ? delivery.view.view_revision
            : delivery.target_view_revision;
        this.#playerHostViewCursors.set(participantId, hostCursor);
      }
    }
  }

  async #send(
    recipientConnectionId: string,
    kind:
      | "command_result"
      | "approval_result"
      | "projection_delivery"
      | "acknowledgement",
    payload: unknown,
    replyTo?: string,
  ): Promise<void> {
    const sequence = this.#sequences.get(recipientConnectionId) ?? 0;
    const candidate = {
      schema_version: SCHEMA_VERSION,
      protocol_version: PROTOCOL_VERSION,
      message_id: `message_appliance_${sha256Hex(`${this.#relay.room_id}:${recipientConnectionId}:${sequence}:${kind}`).slice(0, 24)}`,
      room_id: this.#relay.room_id,
      connection_id: recipientConnectionId,
      seq: sequence,
      ...(replyTo === undefined ? {} : { reply_to: replyTo }),
      kind,
      payload,
    };
    const message = validateValue(TransportMessageSchema, candidate);
    if (!message.success)
      throw new Error("Host produced an invalid transport message.");
    const frame: RelayRoutedFrame = {
      schema_version: SCHEMA_VERSION,
      recipient_connection_id: recipientConnectionId as never,
      message: message.value,
    };
    const validated = validateValue(RelayRoutedFrameSchema, frame);
    if (!validated.success)
      throw new Error("Host produced an invalid relay frame.");
    this.#sequences.set(recipientConnectionId, sequence + 1);
    this.#socket?.send(canonicalJson(validated.value));
  }
}
