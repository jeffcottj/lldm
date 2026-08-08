import {
  PROTOCOL_VERSION,
  RELAY_MAX_ROOM_LIFETIME_SECONDS,
  RelayCreateRoomRequestSchema,
  SCHEMA_VERSION,
  validateValue,
} from "@lldm/contracts";
import { randomSecret, safeSecretEqual, verifyRelayToken } from "./tokens.js";
import type { ExecutionContextLike, RelayEnvironment } from "./worker-types.js";

function error(code: string, safeDetail: string, status: number): Response {
  return Response.json(
    { schema_version: SCHEMA_VERSION, code, safe_detail: safeDetail },
    { status, headers: { "cache-control": "no-store" } },
  );
}

function roomStub(env: RelayEnvironment, roomId: string) {
  return env.ROOMS.get(env.ROOMS.idFromName(roomId));
}

export function allowedOrigin(
  request: Pick<Request, "headers">,
  env: Pick<RelayEnvironment, "ALLOWED_ORIGINS">,
): boolean {
  const origin = request.headers.get("origin");
  // Appliance and administrative requests are not browser-originated. Their
  // bearer/protocol credential is validated by the endpoint that receives
  // them, while browser WebSockets always carry an Origin header.
  if (origin === null) return true;
  return env.ALLOWED_ORIGINS.split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .includes(origin);
}

async function verifiedBearer(request: Request, env: RelayEnvironment) {
  const authorization = request.headers.get("authorization");
  let token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : undefined;
  if (token === undefined) {
    const protocol = request.headers
      .get("sec-websocket-protocol")
      ?.split(",")
      .map((value) => value.trim())
      .find((value) => value.startsWith("lldm-auth."));
    if (protocol !== undefined) {
      try {
        const encoded = protocol
          .slice("lldm-auth.".length)
          .replaceAll("-", "+")
          .replaceAll("_", "/");
        token = new TextDecoder().decode(
          Uint8Array.from(
            atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, "=")),
            (character) => character.charCodeAt(0),
          ),
        );
      } catch {
        token = undefined;
      }
    }
  }
  if (token === undefined) return null;
  return verifyRelayToken(
    token,
    env.TOKEN_SIGNING_SECRET,
    Math.floor(Date.now() / 1000),
  );
}

export default {
  async fetch(
    request: Request,
    env: RelayEnvironment,
    _context: ExecutionContextLike,
  ): Promise<Response> {
    if (!allowedOrigin(request, env))
      return error(
        "origin_rejected",
        "This origin is not allowed for the room.",
        403,
      );
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const secret = request.headers.get("x-lldm-relay-secret") ?? "";
      if (!(await safeSecretEqual(secret, env.RELAY_CREATE_SECRET)))
        return error(
          "unauthorized",
          "Room creation authorization failed.",
          401,
        );
      const raw = await request.json();
      const parsed = validateValue(RelayCreateRoomRequestSchema, raw);
      if (!parsed.success)
        return error("not_ready", "Room creation request is invalid.", 400);
      const roomId = `room_${randomSecret(18)
        .toLowerCase()
        .replaceAll(/[^a-z0-9]/g, "0")}`;
      return roomStub(env, roomId).fetch(
        new Request(`${url.origin}/internal/create`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            room_id: roomId,
            requested_lifetime_seconds: Math.min(
              parsed.value.requested_lifetime_seconds,
              RELAY_MAX_ROOM_LIFETIME_SECONDS,
            ),
            public_origin: url.origin,
          }),
        }),
      );
    }
    const match =
      /^\/api\/rooms\/([^/]+)\/(join|approve|refresh|revoke|inspect|connect)$/.exec(
        url.pathname,
      );
    if (match !== null) {
      const roomId = decodeURIComponent(match[1] ?? "");
      const action = match[2];
      if (!/^room_[a-z0-9]+$/.test(roomId))
        return error("room_not_found", "Room identifier is invalid.", 404);
      if (action === "join" && request.method === "POST")
        return roomStub(env, roomId).fetch(
          new Request(`${url.origin}/internal/join`, request),
        );
      if (
        (action === "approve" || action === "revoke") &&
        request.method === "POST"
      ) {
        const claims = await verifiedBearer(request, env);
        if (claims?.role !== "appliance" || claims.room_id !== roomId)
          return error(
            "unauthorized",
            "Appliance authorization is required.",
            401,
          );
        return roomStub(env, roomId).fetch(
          new Request(`${url.origin}/internal/${action}`, request),
        );
      }
      if (action === "refresh" && request.method === "POST") {
        const claims = await verifiedBearer(request, env);
        if (claims?.role !== "approved_player" || claims.room_id !== roomId)
          return error(
            "unauthorized",
            "Participant reconnect authorization is required.",
            401,
          );
        return roomStub(env, roomId).fetch(
          new Request(`${url.origin}/internal/refresh`, {
            method: "POST",
            headers: { "x-lldm-claims": JSON.stringify(claims) },
          }),
        );
      }
      if (action === "connect" && request.method === "GET") {
        const claims = await verifiedBearer(request, env);
        if (
          claims === null ||
          claims.room_id !== roomId ||
          claims.protocol_version !== PROTOCOL_VERSION
        )
          return error("unauthorized", "Connection token is invalid.", 401);
        const forwarded = new Request(`${url.origin}/internal/socket`, request);
        forwarded.headers.set("x-lldm-claims", JSON.stringify(claims));
        return roomStub(env, roomId).fetch(forwarded);
      }
      if (action === "inspect" && request.method === "GET") {
        const claims = await verifiedBearer(request, env);
        if (claims?.role !== "appliance" || claims.room_id !== roomId)
          return error(
            "unauthorized",
            "Appliance authorization is required.",
            401,
          );
        return roomStub(env, roomId).fetch(
          new Request(`${url.origin}/internal/inspect`),
        );
      }
    }
    if (url.pathname.startsWith("/api/"))
      return error("room_not_found", "Relay endpoint was not found.", 404);
    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    headers.set("x-lldm-protocol-version", String(PROTOCOL_VERSION));
    if (url.pathname === "/" || url.pathname.startsWith("/room/"))
      headers.set("cache-control", "no-cache");
    return new Response(asset.body, {
      status: asset.status,
      statusText: asset.statusText,
      headers,
    });
  },
};
