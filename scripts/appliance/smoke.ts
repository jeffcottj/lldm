import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrateSqliteDatabase } from "@lldm/runtime";
import { FakeRelayClient } from "../../apps/host/src/relay/fake.js";
import { buildHostServer } from "../../apps/host/src/server.js";

const dataPath = mkdtempSync(join(tmpdir(), "lldm-appliance-smoke-"));
const databasePath = join(dataPath, "lldm.sqlite");

try {
  migrateSqliteDatabase({
    database_path: databasePath,
    committed_at: new Date().toISOString(),
  });
  const config = {
    bind: "127.0.0.1" as const,
    port: 3210,
    database_path: databasePath,
    data_path: dataPath,
    web_assets_path: join(dataPath, "missing-assets"),
    public_pwa_url: "https://relay.invalid",
    relay_url: "https://relay.invalid",
    relay_credential: "smoke-relay-credential-phase2",
    room_lifetime_seconds: 600,
    rehearsal_enabled: true,
    test_mode: true,
  };
  const first = await buildHostServer({ config, relay: new FakeRelayClient() });
  const created = await first.server.inject({
    method: "POST",
    url: "/api/tv/runs",
    payload: { mode: "rehearsal", fixture_seed_hex: "22".repeat(32) },
  });
  if (created.statusCode !== 201)
    throw new Error("Smoke room creation failed.");
  const roomSessionId = (created.json() as { room_session_id?: string })
    .room_session_id;
  if (roomSessionId === undefined)
    throw new Error("Smoke room identity is missing.");
  await first.close();

  const restarted = await buildHostServer({
    config,
    relay: new FakeRelayClient(),
  });
  const startup = await restarted.server.inject({
    method: "GET",
    url: "/api/tv/startup",
  });
  const resumable =
    (startup.json() as { resumable_rooms?: Array<{ room_session_id: string }> })
      .resumable_rooms ?? [];
  if (!resumable.some((room) => room.room_session_id === roomSessionId))
    throw new Error("Container-equivalent restart lost the local room.");
  const resumed = await restarted.server.inject({
    method: "POST",
    url: `/api/tv/rooms/${encodeURIComponent(roomSessionId)}/resume`,
  });
  if (resumed.statusCode !== 200)
    throw new Error("Smoke room replay verification failed.");
  await restarted.close();
  process.stdout.write(`appliance smoke passed for ${roomSessionId}\n`);
} finally {
  rmSync(dataPath, { recursive: true, force: true });
}
