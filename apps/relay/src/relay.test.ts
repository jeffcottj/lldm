import {
  PROTOCOL_VERSION,
  SCHEMA_VERSION,
  type RelayCreateRoomResult,
  type RelayPendingJoinResult,
} from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import { DurableRoom } from "./durable-room.js";
import { relayClaims, signRelayToken, verifyRelayToken } from "./tokens.js";
import type {
  DurableObjectStateLike,
  DurableObjectStorageLike,
  HibernatingWebSocket,
  RelayEnvironment,
} from "./worker-types.js";

class MemoryStorage implements DurableObjectStorageLike {
  readonly values = new Map<string, unknown>();
  alarm: number | Date | null = null;
  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, structuredClone(value));
  }
  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }
  async deleteAll(): Promise<void> {
    this.values.clear();
  }
  async setAlarm(value: number | Date): Promise<void> {
    this.alarm = value;
  }
}

function fixture() {
  const storage = new MemoryStorage();
  const sockets: HibernatingWebSocket[] = [];
  const state: DurableObjectStateLike = {
    storage,
    acceptWebSocket: (socket) => sockets.push(socket),
    getWebSockets: () => sockets,
  };
  const env = {
    TOKEN_SIGNING_SECRET: "test-signing-secret-with-at-least-32-bytes",
  } as RelayEnvironment;
  return { storage, sockets, room: new DurableRoom(state, env), env };
}

function socketFixture(attachment: Record<string, unknown>) {
  const sent: string[] = [];
  return {
    sent,
    socket: {
      readyState: WebSocket.OPEN,
      send: (value: string) => sent.push(value),
      deserializeAttachment: () => attachment,
      serializeAttachment: () => undefined,
    } as unknown as HibernatingWebSocket,
  };
}

describe("relay token and ephemeral room boundary", () => {
  it("signs routing-only claims and rejects expiry or tampering", async () => {
    const secret = "test-signing-secret-with-at-least-32-bytes";
    const claims = relayClaims({
      room_id: "room_relay_phase2_001",
      connection_id: "connection_relay_phase2_001",
      role: "approved_player",
      participant_id: "participant_relay_phase2_001",
      audience: "participant",
      expires_at_epoch_seconds: 2_000_000_000,
      token_id: "token_relay_phase2_001",
    });
    const token = await signRelayToken(claims, secret);
    await expect(
      verifyRelayToken(token, secret, 1_900_000_000),
    ).resolves.toEqual(claims);
    await expect(
      verifyRelayToken(`${token}x`, secret, 1_900_000_000),
    ).resolves.toBeNull();
    await expect(
      verifyRelayToken(token, secret, 2_000_000_000),
    ).resolves.toBeNull();
  });

  it("creates, joins, approves, rotates connection identity, and deletes metadata", async () => {
    const { storage, room, env } = fixture();
    const createdResponse = await room.fetch(
      new Request("https://relay.example/internal/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          room_id: "room_relay_phase2_001",
          requested_lifetime_seconds: 3_600,
          public_origin: "https://relay.example",
        }),
      }),
    );
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as RelayCreateRoomResult;
    expect(created.join_url).toContain("#invite=");
    const joinedResponse = await room.fetch(
      new Request("https://relay.example/internal/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          schema_version: SCHEMA_VERSION,
          protocol_version: PROTOCOL_VERSION,
          room_id: created.room_id,
          invite_secret: created.invite_secret,
          display_name: "Rain",
          host_bootstrap_proof: created.host_bootstrap_proof,
        }),
      }),
    );
    expect(joinedResponse.status).toBe(202);
    const joined = (await joinedResponse.json()) as RelayPendingJoinResult;
    const participantId = "participant_relay_phase2_001";
    const approvedResponse = await room.fetch(
      new Request("https://relay.example/internal/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connection_id: joined.connection_id,
          participant_id: participantId,
        }),
      }),
    );
    expect(approvedResponse.status).toBe(200);
    const approved = (await approvedResponse.json()) as {
      reconnect_token: string;
      connection_id: string;
    };
    const claims = await verifyRelayToken(
      approved.reconnect_token,
      env.TOKEN_SIGNING_SECRET,
      Math.floor(Date.now() / 1_000),
    );
    expect(claims?.participant_id).toBe(participantId);
    const refreshedResponse = await room.fetch(
      new Request("https://relay.example/internal/refresh", {
        method: "POST",
        headers: { "x-lldm-claims": JSON.stringify(claims) },
      }),
    );
    expect(refreshedResponse.status).toBe(200);
    const refreshed = (await refreshedResponse.json()) as {
      reconnect_token: string;
      connection_id: string;
    };
    expect(refreshed.connection_id).not.toBe(approved.connection_id);
    await expect(
      verifyRelayToken(
        refreshed.reconnect_token,
        env.TOKEN_SIGNING_SECRET,
        Math.floor(Date.now() / 1_000),
      ),
    ).resolves.toMatchObject({
      participant_id: participantId,
      connection_id: refreshed.connection_id,
    });

    const inspect = await room.fetch(
      new Request("https://relay.example/internal/inspect"),
    );
    await expect(inspect.json()).resolves.toMatchObject({
      present: true,
      payload_records: 0,
    });
    const serialized = JSON.stringify([...storage.values]);
    expect(serialized).not.toContain("private_clue");
    expect(serialized).not.toContain("narration");
    await room.alarm();
    expect(storage.values.size).toBe(0);
  });

  it("accepts the short fallback only through the pending join path", async () => {
    const { storage, room } = fixture();
    await room.fetch(
      new Request("https://relay.example/internal/create", {
        method: "POST",
        body: JSON.stringify({
          room_id: "room_relay_phase2_002",
          requested_lifetime_seconds: 600,
          public_origin: "https://relay.example",
        }),
      }),
    );
    const metadata = await storage.get<{ fallback_code: string }>("room");
    const response = await room.fetch(
      new Request("https://relay.example/internal/join", {
        method: "POST",
        body: JSON.stringify({
          schema_version: 1,
          protocol_version: 1,
          room_id: "room_relay_phase2_002",
          fallback_code: metadata?.fallback_code,
          display_name: "Mica",
        }),
      }),
    );
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      status: "pending_approval",
    });
  });

  it("does not report a disconnect while an approved replacement socket is open", () => {
    const { room, sockets } = fixture();
    const common = {
      room_id: "room_relay_phase2_003",
      expires_at_epoch_seconds: 2_000_000_000,
      last_seq: 4,
      rate_window_minute: 0,
      rate_count: 0,
    };
    const appliance = socketFixture({
      ...common,
      connection_id: "connection_appliance_phase2_003",
      role: "appliance",
    });
    const closing = socketFixture({
      ...common,
      connection_id: "connection_player_phase2_003",
      role: "approved_player",
      participant_id: "participant_relay_phase2_003",
    });
    const replacement = socketFixture({
      ...common,
      connection_id: "connection_player_phase2_003",
      role: "approved_player",
      participant_id: "participant_relay_phase2_003",
    });
    sockets.push(appliance.socket, closing.socket, replacement.socket);

    room.webSocketClose(closing.socket);

    expect(appliance.sent).toEqual([]);
    sockets.splice(sockets.indexOf(replacement.socket), 1);
    room.webSocketClose(closing.socket);
    expect(appliance.sent).toHaveLength(1);
    expect(JSON.parse(appliance.sent[0] ?? "null")).toMatchObject({
      sender_participant_id: "participant_relay_phase2_003",
      message: {
        kind: "connection_status",
        payload: {
          participant_id: "participant_relay_phase2_003",
          status: "disconnected",
        },
      },
    });
  });
});
