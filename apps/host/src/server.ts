import { existsSync } from "node:fs";
import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import { RoomSessionIdSchema, validateValue } from "@lldm/contracts";
import { readSqliteDatabaseStatus } from "@lldm/runtime";
import Fastify, { type FastifyInstance } from "fastify";
import QRCode from "qrcode";
import type { HostConfig } from "./config.js";
import type { RelayClientPort } from "./relay/client.js";
import { RoomApplication } from "./room-application.js";

function safeRoomSessionId(value: unknown) {
  const parsed = validateValue(RoomSessionIdSchema, value);
  return parsed.success ? parsed.value : null;
}

export interface HostServer {
  readonly server: FastifyInstance;
  readonly application: RoomApplication | null;
  close(): Promise<void>;
}

export async function buildHostServer(input: {
  readonly config: HostConfig;
  readonly relay: RelayClientPort;
}): Promise<HostServer> {
  const server = Fastify({
    logger: false,
    bodyLimit: 64 * 1024,
    trustProxy: false,
  });
  await server.register(fastifyWebsocket, { options: { maxPayload: 262_144 } });
  const migration = readSqliteDatabaseStatus(input.config.database_path);
  const application =
    migration.status === "current" && migration.current_version === 2
      ? new RoomApplication(input.config, input.relay)
      : null;

  server.get("/healthz", async () => ({
    status: "alive",
    schema: migration.status,
    ready: application !== null,
  }));
  server.get("/readyz", async (_request, reply) =>
    application === null
      ? reply.code(503).send({
          status: "migration_required",
          safe_detail:
            "Run the explicit LLDM database migration, then restart the appliance host.",
        })
      : { status: "ready" },
  );
  server.get("/api/tv/startup", async (_request, reply) =>
    application === null
      ? reply.code(503).send({
          status: "migration_required",
          safe_detail:
            "Run pnpm lldm -- db migrate against the configured database.",
        })
      : { status: "ready", resumable_rooms: application.resumableRooms() },
  );
  server.post<{
    Body: { mode?: "normal" | "rehearsal"; fixture_seed_hex?: string };
  }>("/api/tv/runs", async (request, reply) => {
    if (application === null)
      return reply.code(503).send({ status: "migration_required" });
    if (request.body?.fixture_seed_hex !== undefined && !input.config.test_mode)
      return reply.code(400).send({ status: "fixed_seed_forbidden" });
    try {
      const created = await application.createRun(
        request.body?.mode ?? "normal",
        request.body?.fixture_seed_hex,
      );
      return reply.code(201).send({
        ...created,
        qr_svg: await QRCode.toString(created.join_url, {
          type: "svg",
          margin: 1,
        }),
      });
    } catch {
      return reply.code(503).send({
        status: "relay_or_storage_unavailable",
        safe_detail:
          "The room could not be created. Existing sessions were not changed.",
      });
    }
  });
  server.post<{ Params: { roomSessionId: string } }>(
    "/api/tv/rooms/:roomSessionId/resume",
    async (request, reply) => {
      if (application === null)
        return reply.code(503).send({ status: "migration_required" });
      const roomSessionId = safeRoomSessionId(request.params.roomSessionId);
      if (roomSessionId === null)
        return reply.code(400).send({ status: "invalid_room" });
      try {
        const resumed = await application.resume(roomSessionId);
        return {
          status: "resume_ready",
          room_revision: resumed.state.room_revision,
          mechanical_revision: resumed.state.mechanical_revision,
          recovered_workflows: resumed.recovered.length,
        };
      } catch {
        return reply.code(409).send({
          status: "recovery_required",
          safe_detail: "The saved room did not pass replay verification.",
        });
      }
    },
  );
  server.get<{
    Params: { roomSessionId: string };
    Querystring: { cursor?: string };
  }>("/api/tv/rooms/:roomSessionId/view", async (request, reply) => {
    if (application === null)
      return reply.code(503).send({ status: "migration_required" });
    const roomSessionId = safeRoomSessionId(request.params.roomSessionId);
    if (roomSessionId === null)
      return reply.code(400).send({ status: "invalid_room" });
    const cursor = Number(request.query.cursor ?? 0);
    if (!Number.isInteger(cursor) || cursor < 0)
      return reply.code(400).send({ status: "invalid_cursor" });
    return { deliveries: application.publicDelivery(roomSessionId, cursor) };
  });
  server.get<{ Params: { roomSessionId: string } }>(
    "/api/tv/rooms/:roomSessionId/join",
    async (request, reply) => {
      if (application === null)
        return reply.code(503).send({ status: "migration_required" });
      const roomSessionId = safeRoomSessionId(request.params.roomSessionId);
      if (roomSessionId === null)
        return reply.code(400).send({ status: "invalid_room" });
      const details = application.localJoinDetails(roomSessionId);
      if (details === null)
        return reply.code(410).send({
          status: "relay_expired",
          safe_detail:
            "Confirm relay-room replacement from the player-host before showing a new join code.",
        });
      return {
        ...details,
        qr_svg: await QRCode.toString(details.join_url, {
          type: "svg",
          margin: 1,
        }),
      };
    },
  );
  server.post<{ Params: { roomSessionId: string } }>(
    "/api/tv/rooms/:roomSessionId/host-recovery",
    async (request, reply) => {
      if (application === null)
        return reply.code(503).send({ status: "migration_required" });
      const roomSessionId = safeRoomSessionId(request.params.roomSessionId);
      if (roomSessionId === null)
        return reply.code(400).send({ status: "invalid_room" });
      try {
        return {
          status: "issued",
          proof: application.issueHostRecoveryCode(roomSessionId),
          expires_in_seconds: 300,
        };
      } catch {
        return reply.code(404).send({ status: "invalid_room" });
      }
    },
  );
  server.get<{
    Params: { roomSessionId: string };
    Querystring: { cursor?: string };
  }>(
    "/api/tv/rooms/:roomSessionId/stream",
    { websocket: true },
    (socket, request) => {
      const roomSessionId = safeRoomSessionId(request.params.roomSessionId);
      if (application === null || roomSessionId === null) {
        socket.close(1008, "room_unavailable");
        return;
      }
      const cursor = Number(request.query.cursor ?? 0);
      try {
        socket.send(
          JSON.stringify({
            deliveries: application.publicDelivery(
              roomSessionId,
              Number.isInteger(cursor) && cursor >= 0 ? cursor : 0,
            ),
          }),
        );
      } catch {
        socket.close(1011, "recovery_required");
      }
    },
  );
  server.get("/api/diagnostics", async () => ({
    status: application === null ? "not_ready" : "ready",
    migration_status: migration.status,
    resumable_room_ids:
      application
        ?.resumableRooms()
        .map(({ room_session_id }) => room_session_id) ?? [],
  }));

  if (existsSync(input.config.web_assets_path)) {
    await server.register(fastifyStatic, {
      root: input.config.web_assets_path,
      wildcard: false,
      immutable: true,
      maxAge: "1h",
    });
    server.get("/tv", async (_request, reply) =>
      reply.sendFile("index.html", { maxAge: 0, immutable: false }),
    );
    server.get("/tv/*", async (_request, reply) =>
      reply.sendFile("index.html", { maxAge: 0, immutable: false }),
    );
  } else {
    server.get("/tv", async (_request, reply) =>
      reply
        .type("text/html")
        .send(
          `<!doctype html><html lang="en"><meta charset="utf-8"><title>LLDM recovery</title><body><main><h1>LLDM is starting</h1><p>${application === null ? "Database migration or recovery is required." : "TV assets are unavailable; committed game state is safe."}</p></main></body></html>`,
        ),
    );
  }

  return {
    server,
    application,
    async close() {
      application?.close();
      await server.close();
    },
  };
}
