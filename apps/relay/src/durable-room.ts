import {
  PROTOCOL_VERSION,
  RELAY_APPLIANCE_FRAMES_PER_MINUTE,
  RELAY_COMMANDS_PER_MINUTE,
  RELAY_MAX_CONNECTIONS,
  RELAY_MAX_FRAME_BYTES,
  RELAY_MAX_PENDING_JOINS,
  RELAY_MAX_ROOM_LIFETIME_SECONDS,
  RelayRedeemInviteRequestSchema,
  RelayRoutedFrameSchema,
  RelayTokenClaimsSchema,
  SCHEMA_VERSION,
  validateValue,
} from "@lldm/contracts";
import {
  hashSecret,
  randomSecret,
  relayClaims,
  signRelayToken,
} from "./tokens.js";
import type {
  DurableObjectStateLike,
  HibernatingWebSocket,
  RelayEnvironment,
} from "./worker-types.js";

interface RoomMetadata {
  readonly room_id: string;
  readonly created_at_epoch_ms: number;
  readonly expires_at_epoch_ms: number;
  readonly invite_hash: string;
  readonly bootstrap_hash: string;
  readonly bootstrap_used: boolean;
  readonly fallback_code: string;
}

interface SocketAttachment {
  readonly room_id: string;
  readonly connection_id: string;
  readonly role: "appliance" | "pending_player" | "approved_player";
  readonly participant_id?: string;
  readonly expires_at_epoch_seconds: number;
  readonly last_seq: number;
  readonly rate_window_minute: number;
  readonly rate_count: number;
  readonly target_sequences?: Readonly<Record<string, number>>;
}

interface ParticipantAuthorization {
  readonly connection_id: string;
  readonly token_hash: string;
  readonly expires_at_epoch_ms: number;
  readonly revoked: boolean;
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function safeError(code: string, safeDetail: string, status: number): Response {
  return json(
    { schema_version: SCHEMA_VERSION, code, safe_detail: safeDetail },
    status,
  );
}

function opaqueSuffix(bytes = 16): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return [...data].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export class DurableRoom {
  readonly #state: DurableObjectStateLike;
  readonly #env: RelayEnvironment;

  constructor(state: DurableObjectStateLike, env: RelayEnvironment) {
    this.#state = state;
    this.#env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname.endsWith("/internal/create"))
      return this.#create(request);
    if (request.method === "POST" && url.pathname.endsWith("/internal/join"))
      return this.#join(request);
    if (request.method === "POST" && url.pathname.endsWith("/internal/approve"))
      return this.#approve(request);
    if (request.method === "POST" && url.pathname.endsWith("/internal/refresh"))
      return this.#refresh(request);
    if (request.method === "POST" && url.pathname.endsWith("/internal/revoke"))
      return this.#revoke(request);
    if (request.method === "GET" && url.pathname.endsWith("/internal/socket"))
      return this.#socket(request);
    if (request.method === "GET" && url.pathname.endsWith("/internal/inspect"))
      return this.#inspect();
    return safeError("not_ready", "Relay room route is unavailable.", 404);
  }

  async #create(request: Request): Promise<Response> {
    if ((await this.#state.storage.get<RoomMetadata>("room")) !== undefined)
      return safeError("unauthorized", "Room already exists.", 409);
    const body = (await request.json()) as {
      room_id?: string;
      requested_lifetime_seconds?: number;
      public_origin?: string;
    };
    const lifetime = Math.min(
      Number(body.requested_lifetime_seconds ?? 0),
      RELAY_MAX_ROOM_LIFETIME_SECONDS,
    );
    if (typeof body.room_id !== "string" || lifetime < 60)
      return safeError("not_ready", "Room creation request is invalid.", 400);
    const invite = randomSecret();
    const bootstrap = randomSecret();
    const applianceTokenId = randomSecret(16);
    const now = Date.now();
    const metadata: RoomMetadata = {
      room_id: body.room_id,
      created_at_epoch_ms: now,
      expires_at_epoch_ms: now + lifetime * 1000,
      invite_hash: await hashSecret(invite),
      bootstrap_hash: await hashSecret(bootstrap),
      bootstrap_used: false,
      fallback_code: randomSecret(5)
        .replaceAll(/[^A-Z0-9]/g, "A")
        .toUpperCase()
        .slice(0, 6)
        .padEnd(6, "A"),
    };
    await this.#state.storage.put("room", metadata);
    await this.#state.storage.put("appliance_token_id", applianceTokenId);
    await this.#state.storage.setAlarm(metadata.expires_at_epoch_ms);
    const expirySeconds = Math.floor(metadata.expires_at_epoch_ms / 1000);
    const applianceToken = await signRelayToken(
      relayClaims({
        room_id: body.room_id as never,
        connection_id: `connection_appliance_${opaqueSuffix(12)}` as never,
        role: "appliance",
        audience: "appliance",
        expires_at_epoch_seconds: expirySeconds,
        token_id: applianceTokenId,
      }),
      this.#env.TOKEN_SIGNING_SECRET,
    );
    const origin =
      typeof body.public_origin === "string"
        ? body.public_origin
        : "https://invalid.local";
    return json(
      {
        schema_version: SCHEMA_VERSION,
        protocol_version: PROTOCOL_VERSION,
        room_id: body.room_id,
        appliance_token: applianceToken,
        invite_secret: invite,
        host_bootstrap_proof: bootstrap,
        expires_at: new Date(metadata.expires_at_epoch_ms).toISOString(),
        join_url: `${origin}/room/${encodeURIComponent(body.room_id)}#invite=${encodeURIComponent(invite)}`,
        fallback_code: metadata.fallback_code,
      },
      201,
    );
  }

  async #join(request: Request): Promise<Response> {
    const metadata = await this.#state.storage.get<RoomMetadata>("room");
    if (metadata === undefined || metadata.expires_at_epoch_ms <= Date.now())
      return safeError("room_expired", "This room has expired.", 410);
    const raw = await request.json();
    const parsed = validateValue(RelayRedeemInviteRequestSchema, raw);
    if (
      !parsed.success ||
      parsed.value.room_id !== metadata.room_id ||
      (parsed.value.invite_secret === undefined
        ? parsed.value.fallback_code !== metadata.fallback_code
        : (await hashSecret(parsed.value.invite_secret)) !==
          metadata.invite_hash)
    )
      return safeError("unauthorized", "Invite proof is invalid.", 401);
    const pending =
      (await this.#state.storage.get<number>("pending_count")) ?? 0;
    if (pending >= RELAY_MAX_PENDING_JOINS)
      return safeError(
        "connection_limit",
        "The pending join queue is full.",
        429,
      );
    if (parsed.value.host_bootstrap_proof !== undefined) {
      if (
        metadata.bootstrap_used ||
        (await hashSecret(parsed.value.host_bootstrap_proof)) !==
          metadata.bootstrap_hash
      )
        return safeError(
          "proof_already_used",
          "Host bootstrap proof is invalid or already used.",
          409,
        );
      await this.#state.storage.put("room", {
        ...metadata,
        bootstrap_used: true,
      });
    }
    const connectionId = `connection_player_${opaqueSuffix(12)}`;
    const tokenId = randomSecret(16);
    await this.#state.storage.put(`pending:${connectionId}`, {
      token_hash: await hashSecret(tokenId),
      expires_at_epoch_ms: Math.min(
        metadata.expires_at_epoch_ms,
        Date.now() + 15 * 60_000,
      ),
    });
    await this.#state.storage.put("pending_count", pending + 1);
    const pendingToken = await signRelayToken(
      relayClaims({
        room_id: metadata.room_id as never,
        connection_id: connectionId as never,
        role: "pending_player",
        audience: "pending",
        expires_at_epoch_seconds: Math.floor(
          Math.min(metadata.expires_at_epoch_ms, Date.now() + 15 * 60_000) /
            1000,
        ),
        token_id: tokenId,
      }),
      this.#env.TOKEN_SIGNING_SECRET,
    );
    return json(
      {
        schema_version: SCHEMA_VERSION,
        protocol_version: PROTOCOL_VERSION,
        room_id: metadata.room_id,
        connection_id: connectionId,
        pending_token: pendingToken,
        status: "pending_approval",
      },
      202,
    );
  }

  async #socket(request: Request): Promise<Response> {
    const rawClaims = request.headers.get("x-lldm-claims");
    if (rawClaims === null)
      return safeError(
        "unauthorized",
        "Socket authorization is required.",
        401,
      );
    let claims: unknown;
    try {
      claims = JSON.parse(rawClaims) as unknown;
    } catch {
      return safeError("unauthorized", "Socket authorization is invalid.", 401);
    }
    const parsed = validateValue(RelayTokenClaimsSchema, claims);
    const metadata = await this.#state.storage.get<RoomMetadata>("room");
    if (
      !parsed.success ||
      metadata === undefined ||
      parsed.value.room_id !== metadata.room_id ||
      parsed.value.expires_at_epoch_seconds <= Math.floor(Date.now() / 1000)
    )
      return safeError("unauthorized", "Socket authorization is invalid.", 401);
    if (!(await this.#claimsRemainAuthorized(parsed.value)))
      return safeError(
        "unauthorized",
        "Socket authorization is no longer active.",
        401,
      );
    const existingSockets = this.#state.getWebSockets();
    const replacedAttachment = existingSockets
      .filter(
        (existing) =>
          existing.readyState === WebSocket.OPEN &&
          (existing.deserializeAttachment() as SocketAttachment)
            .connection_id === parsed.value.connection_id,
      )
      .map((existing) => existing.deserializeAttachment() as SocketAttachment)
      .find(({ role }) => role === parsed.value.role);
    for (const existing of existingSockets) {
      const existingAttachment =
        existing.deserializeAttachment() as SocketAttachment;
      if (existingAttachment.connection_id === parsed.value.connection_id)
        existing.close(1000, "connection_replaced");
    }
    const remainingConnectionCount = existingSockets.filter(
      (existing) =>
        existing.readyState === WebSocket.OPEN &&
        (existing.deserializeAttachment() as SocketAttachment).connection_id !==
          parsed.value.connection_id,
    ).length;
    if (remainingConnectionCount >= RELAY_MAX_CONNECTIONS)
      return safeError(
        "connection_limit",
        "The room connection limit is reached.",
        429,
      );
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: SocketAttachment = {
      room_id: parsed.value.room_id,
      connection_id: parsed.value.connection_id,
      role: parsed.value.role,
      ...(parsed.value.participant_id === undefined
        ? {}
        : { participant_id: parsed.value.participant_id }),
      expires_at_epoch_seconds: parsed.value.expires_at_epoch_seconds,
      last_seq: replacedAttachment?.last_seq ?? -1,
      rate_window_minute:
        replacedAttachment?.rate_window_minute ??
        Math.floor(Date.now() / 60_000),
      rate_count: replacedAttachment?.rate_count ?? 0,
      ...(parsed.value.role === "appliance" &&
      replacedAttachment?.target_sequences !== undefined
        ? { target_sequences: replacedAttachment.target_sequences }
        : {}),
    };
    server.serializeAttachment(attachment);
    this.#state.acceptWebSocket(server);
    return new Response(null, {
      status: 101,
      headers: { "sec-websocket-protocol": "lldm-v1" },
      webSocket: client,
    } as ResponseInit & { webSocket: WebSocket });
  }

  async #approve(request: Request): Promise<Response> {
    const metadata = await this.#state.storage.get<RoomMetadata>("room");
    const body = (await request.json()) as {
      connection_id?: string;
      participant_id?: string;
    };
    if (
      metadata === undefined ||
      typeof body.connection_id !== "string" ||
      typeof body.participant_id !== "string"
    )
      return safeError("not_ready", "Approval request is invalid.", 400);
    const pending = await this.#state.storage.get<{
      expires_at_epoch_ms: number;
    }>(`pending:${body.connection_id}`);
    if (pending === undefined || pending.expires_at_epoch_ms <= Date.now())
      return safeError(
        "unauthorized",
        "Pending connection is unavailable.",
        404,
      );
    const tokenId = randomSecret(16);
    const expiry = Math.min(
      metadata.expires_at_epoch_ms,
      Date.now() + 12 * 60 * 60_000,
    );
    await this.#state.storage.delete(`pending:${body.connection_id}`);
    const pendingCount =
      (await this.#state.storage.get<number>("pending_count")) ?? 1;
    await this.#state.storage.put(
      "pending_count",
      Math.max(0, pendingCount - 1),
    );
    await this.#state.storage.put<ParticipantAuthorization>(
      `participant:${body.participant_id}`,
      {
        connection_id: body.connection_id,
        token_hash: await hashSecret(tokenId),
        expires_at_epoch_ms: expiry,
        revoked: false,
      },
    );
    const reconnectToken = await signRelayToken(
      relayClaims({
        room_id: metadata.room_id as never,
        connection_id: body.connection_id as never,
        role: "approved_player",
        participant_id: body.participant_id as never,
        audience: "participant",
        expires_at_epoch_seconds: Math.floor(expiry / 1000),
        token_id: tokenId,
      }),
      this.#env.TOKEN_SIGNING_SECRET,
    );
    return json({
      schema_version: SCHEMA_VERSION,
      protocol_version: PROTOCOL_VERSION,
      room_id: metadata.room_id,
      participant_id: body.participant_id,
      connection_id: body.connection_id,
      reconnect_token: reconnectToken,
      expires_at: new Date(expiry).toISOString(),
    });
  }

  async #refresh(request: Request): Promise<Response> {
    const metadata = await this.#state.storage.get<RoomMetadata>("room");
    const rawClaims = request.headers.get("x-lldm-claims");
    if (metadata === undefined || rawClaims === null)
      return safeError(
        "unauthorized",
        "Reconnect authorization is invalid.",
        401,
      );
    let raw: unknown;
    try {
      raw = JSON.parse(rawClaims) as unknown;
    } catch {
      return safeError(
        "unauthorized",
        "Reconnect authorization is invalid.",
        401,
      );
    }
    const claims = validateValue(RelayTokenClaimsSchema, raw);
    if (
      !claims.success ||
      claims.value.role !== "approved_player" ||
      claims.value.participant_id === undefined ||
      claims.value.room_id !== metadata.room_id ||
      !(await this.#claimsRemainAuthorized(claims.value))
    )
      return safeError(
        "unauthorized",
        "Reconnect authorization is invalid.",
        401,
      );
    const connectionId = `connection_player_${opaqueSuffix(12)}`;
    const tokenId = randomSecret(16);
    const expiry = Math.min(
      metadata.expires_at_epoch_ms,
      Date.now() + 12 * 60 * 60_000,
    );
    await this.#state.storage.put<ParticipantAuthorization>(
      `participant:${claims.value.participant_id}`,
      {
        connection_id: connectionId,
        token_hash: await hashSecret(tokenId),
        expires_at_epoch_ms: expiry,
        revoked: false,
      },
    );
    for (const socket of this.#state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment;
      if (attachment.participant_id === claims.value.participant_id)
        socket.close(1000, "connection_rotated");
    }
    const reconnectToken = await signRelayToken(
      relayClaims({
        room_id: metadata.room_id as never,
        connection_id: connectionId as never,
        role: "approved_player",
        participant_id: claims.value.participant_id,
        audience: "participant",
        expires_at_epoch_seconds: Math.floor(expiry / 1000),
        token_id: tokenId,
      }),
      this.#env.TOKEN_SIGNING_SECRET,
    );
    return json({
      schema_version: SCHEMA_VERSION,
      protocol_version: PROTOCOL_VERSION,
      room_id: metadata.room_id,
      participant_id: claims.value.participant_id,
      connection_id: connectionId,
      reconnect_token: reconnectToken,
      expires_at: new Date(expiry).toISOString(),
    });
  }

  async #claimsRemainAuthorized(
    claims: import("@lldm/contracts").RelayTokenClaims,
  ): Promise<boolean> {
    if (claims.role === "appliance")
      return (
        (await this.#state.storage.get<string>("appliance_token_id")) ===
        claims.token_id
      );
    if (claims.role === "pending_player") {
      const pending = await this.#state.storage.get<{
        token_hash: string;
        expires_at_epoch_ms: number;
      }>(`pending:${claims.connection_id}`);
      return (
        pending !== undefined &&
        pending.expires_at_epoch_ms > Date.now() &&
        pending.token_hash === (await hashSecret(claims.token_id))
      );
    }
    if (claims.participant_id === undefined) return false;
    const participant = await this.#state.storage.get<ParticipantAuthorization>(
      `participant:${claims.participant_id}`,
    );
    return (
      participant !== undefined &&
      !participant.revoked &&
      participant.connection_id === claims.connection_id &&
      participant.expires_at_epoch_ms > Date.now() &&
      participant.token_hash === (await hashSecret(claims.token_id))
    );
  }

  async #revoke(request: Request): Promise<Response> {
    const body = (await request.json()) as { participant_id?: string };
    if (typeof body.participant_id !== "string")
      return safeError("not_ready", "Revocation request is invalid.", 400);
    const key = `participant:${body.participant_id}`;
    const record = await this.#state.storage.get<Record<string, unknown>>(key);
    if (record !== undefined)
      await this.#state.storage.put(key, { ...record, revoked: true });
    for (const socket of this.#state.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment;
      if (attachment.participant_id === body.participant_id)
        socket.close(1008, "revoked");
    }
    return json({ schema_version: SCHEMA_VERSION, status: "revoked" });
  }

  webSocketMessage(
    socket: HibernatingWebSocket,
    message: string | ArrayBuffer,
  ): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment;
    const bytes =
      typeof message === "string"
        ? new TextEncoder().encode(message).byteLength
        : message.byteLength;
    if (bytes > RELAY_MAX_FRAME_BYTES) {
      socket.close(1009, "frame_too_large");
      return;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(
        typeof message === "string"
          ? message
          : new TextDecoder().decode(message),
      ) as unknown;
    } catch {
      socket.close(1007, "invalid_frame");
      return;
    }
    const parsed = validateValue(RelayRoutedFrameSchema, raw);
    if (
      !parsed.success ||
      parsed.value.sender_participant_id !== undefined ||
      parsed.value.sender_role !== undefined ||
      (attachment.role === "appliance"
        ? parsed.value.recipient_connection_id === undefined ||
          parsed.value.message.connection_id !==
            parsed.value.recipient_connection_id
        : parsed.value.message.connection_id !== attachment.connection_id)
    ) {
      socket.close(1008, "unauthorized_frame");
      return;
    }
    if (
      attachment.role === "approved_player" &&
      parsed.value.message.kind === "client_command" &&
      parsed.value.message.payload.participant_id !== attachment.participant_id
    ) {
      socket.close(1008, "participant_mismatch");
      return;
    }
    const minute = Math.floor(Date.now() / 60_000);
    const countsAgainstRate =
      attachment.role === "appliance" ||
      parsed.value.message.kind === "client_command";
    const count = countsAgainstRate
      ? attachment.rate_window_minute === minute
        ? attachment.rate_count + 1
        : 1
      : attachment.rate_window_minute === minute
        ? attachment.rate_count
        : 0;
    const rateLimit =
      attachment.role === "appliance"
        ? RELAY_APPLIANCE_FRAMES_PER_MINUTE
        : RELAY_COMMANDS_PER_MINUTE;
    if (countsAgainstRate && count > rateLimit) {
      socket.close(1008, "rate_limit");
      return;
    }
    const sequenceKey =
      parsed.value.recipient_connection_id ?? attachment.connection_id;
    const lastSequence =
      attachment.role === "appliance"
        ? (attachment.target_sequences?.[sequenceKey] ?? -1)
        : attachment.last_seq;
    if (parsed.value.message.seq <= lastSequence) return;
    if (parsed.value.message.seq !== lastSequence + 1) {
      socket.send(
        JSON.stringify({
          schema_version: 1,
          code: "sequence_gap",
          safe_detail: "Message sequence has a gap.",
        }),
      );
      return;
    }
    socket.serializeAttachment(
      attachment.role === "appliance"
        ? {
            ...attachment,
            target_sequences: {
              ...attachment.target_sequences,
              [sequenceKey]: parsed.value.message.seq,
            },
            rate_window_minute: minute,
            rate_count: count,
          }
        : {
            ...attachment,
            last_seq: parsed.value.message.seq,
            rate_window_minute: minute,
            rate_count: count,
          },
    );
    const sockets = this.#state.getWebSockets();
    if (attachment.role === "appliance") {
      if (parsed.value.recipient_connection_id === undefined) return;
      const target = sockets.find(
        (candidate) =>
          candidate.readyState === WebSocket.OPEN &&
          (candidate.deserializeAttachment() as SocketAttachment)
            .connection_id === parsed.value.recipient_connection_id,
      );
      target?.send(typeof message === "string" ? message : message.slice(0));
    } else {
      const appliance = sockets.find(
        (candidate) =>
          candidate.readyState === WebSocket.OPEN &&
          (candidate.deserializeAttachment() as SocketAttachment).role ===
            "appliance",
      );
      appliance?.send(
        JSON.stringify({
          ...parsed.value,
          sender_participant_id: attachment.participant_id,
          sender_role: attachment.role,
        }),
      );
    }
  }

  webSocketClose(socket: HibernatingWebSocket): void {
    const attachment = socket.deserializeAttachment() as SocketAttachment;
    if (
      attachment.role !== "approved_player" ||
      attachment.participant_id === undefined
    )
      return;
    const sockets = this.#state.getWebSockets();
    const replacement = sockets.some((candidate) => {
      if (candidate === socket || candidate.readyState !== WebSocket.OPEN)
        return false;
      const candidateAttachment =
        candidate.deserializeAttachment() as SocketAttachment;
      return (
        candidateAttachment.role === "approved_player" &&
        candidateAttachment.participant_id === attachment.participant_id
      );
    });
    if (replacement) return;
    const appliance = sockets.find(
      (candidate) =>
        candidate.readyState === WebSocket.OPEN &&
        (candidate.deserializeAttachment() as SocketAttachment).role ===
          "appliance",
    );
    if (appliance === undefined) return;
    const sequence = attachment.last_seq + 1;
    appliance.send(
      JSON.stringify({
        schema_version: SCHEMA_VERSION,
        sender_participant_id: attachment.participant_id,
        sender_role: attachment.role,
        message: {
          schema_version: SCHEMA_VERSION,
          protocol_version: PROTOCOL_VERSION,
          message_id: `message_relay_disconnect_${opaqueSuffix(12)}`,
          room_id: attachment.room_id,
          connection_id: attachment.connection_id,
          seq: sequence,
          kind: "connection_status",
          payload: {
            participant_id: attachment.participant_id,
            status: "disconnected",
          },
        },
      }),
    );
  }

  async alarm(): Promise<void> {
    for (const socket of this.#state.getWebSockets())
      socket.close(1001, "room_expired");
    await this.#state.storage.deleteAll();
  }

  async #inspect(): Promise<Response> {
    const metadata = await this.#state.storage.get<RoomMetadata>("room");
    return json({
      present: metadata !== undefined,
      room_id: metadata?.room_id ?? null,
      expires_at_epoch_ms: metadata?.expires_at_epoch_ms ?? null,
      connection_count: this.#state.getWebSockets().length,
      payload_records: 0,
    });
  }
}
