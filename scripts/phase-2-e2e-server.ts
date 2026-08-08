import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateSqliteDatabase } from "@lldm/runtime";
import { HttpRelayClient } from "../apps/host/src/relay/client.js";
import { buildHostServer } from "../apps/host/src/server.js";

const relayOrigin = "http://127.0.0.1:8787";
const hostOrigin = "http://127.0.0.1:3210";
const relayCreateSecret = "phase2-playwright-relay-create-secret";
const tokenSigningSecret = "phase2-playwright-token-signing-secret";
const wranglerCli = fileURLToPath(import.meta.resolve("wrangler"));
const dataPath = mkdtempSync(join(tmpdir(), "lldm-phase2-playwright-"));
const databasePath = join(dataPath, "lldm.sqlite");
let relay: ChildProcess | null = null;
let host: Awaited<ReturnType<typeof buildHostServer>> | null = null;
let control: Server | null = null;
let stopping = false;
let restartingRelay = false;

async function waitFor(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Local relay exited with code ${child.exitCode}.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("Local relay did not become ready within 30 seconds.");
}

async function startRelay(): Promise<void> {
  const child = spawn(
    process.execPath,
    [
      wranglerCli,
      "dev",
      "--config",
      "wrangler.jsonc",
      "--ip",
      "127.0.0.1",
      "--port",
      "8787",
      "--persist-to",
      join(dataPath, "wrangler"),
      "--show-interactive-dev-session=false",
      "--var",
      `RELAY_CREATE_SECRET:${relayCreateSecret}`,
      "--var",
      `TOKEN_SIGNING_SECRET:${tokenSigningSecret}`,
      "--var",
      `ALLOWED_ORIGINS:${relayOrigin}`,
    ],
    { cwd: resolve("."), stdio: "inherit" },
  );
  relay = child;
  child.once("exit", (code) => {
    if (!stopping && !restartingRelay && relay === child) void stop(code ?? 1);
  });
  await waitFor(`${relayOrigin}/`, child);
}

async function stopRelay(): Promise<void> {
  const child = relay;
  if (child === null) return;
  relay = null;
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise<void>((resolveExit) => child.once("exit", resolveExit)),
      new Promise<void>((resolveWait) => setTimeout(resolveWait, 5_000)),
    ]);
    if (child.exitCode === null) child.kill("SIGKILL");
  }
}

async function startHost(): Promise<void> {
  host = await buildHostServer({
    config: {
      bind: "127.0.0.1",
      port: 3210,
      database_path: databasePath,
      data_path: dataPath,
      web_assets_path: resolve("apps/web/dist"),
      public_pwa_url: relayOrigin,
      relay_url: relayOrigin,
      relay_credential: relayCreateSecret,
      room_lifetime_seconds: 3_600,
      rehearsal_enabled: true,
      test_mode: true,
    },
    relay: new HttpRelayClient(relayOrigin, relayCreateSecret),
  });
  await host.server.listen({ host: "127.0.0.1", port: 3210 });
}

async function restartHost(): Promise<void> {
  await host?.close();
  host = null;
  await startHost();
}

async function restartRelay(): Promise<void> {
  restartingRelay = true;
  try {
    await stopRelay();
    await startRelay();
  } finally {
    restartingRelay = false;
  }
}

async function startControlServer(): Promise<void> {
  control = createServer((request, response) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://127.0.0.1:3211");
      if (request.method === "POST" && url.pathname === "/host/restart")
        await restartHost();
      else if (request.method === "POST" && url.pathname === "/relay/restart")
        await restartRelay();
      else if (
        request.method === "POST" &&
        url.pathname === "/host/inject-workflow-crash"
      ) {
        const boundary = url.searchParams.get("boundary");
        if (
          boundary !== "after_room_start" &&
          boundary !== "after_game_commit"
        ) {
          response.writeHead(400).end();
          return;
        }
        host?.application?.injectNextWorkflowCrash(boundary);
      } else if (
        request.method === "GET" &&
        url.pathname === "/host/pending-workflows"
      ) {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            pending_workflows:
              host?.application?.pendingWorkflowCount() ?? null,
          }),
        );
        return;
      } else {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ready" }));
    })().catch(() => {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "recovery_required" }));
    });
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    control?.once("error", rejectListen);
    control?.listen(3211, "127.0.0.1", () => resolveListen());
  });
}

async function stop(exitCode = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  try {
    if (control !== null)
      await new Promise<void>((resolveClose) =>
        control?.close(() => resolveClose()),
      );
    control = null;
    await host?.close();
    host = null;
    await stopRelay();
  } finally {
    rmSync(dataPath, { recursive: true, force: true });
    process.exitCode = exitCode;
  }
}

async function main(): Promise<void> {
  migrateSqliteDatabase({
    database_path: databasePath,
    committed_at: new Date().toISOString(),
  });
  await startRelay();
  await startHost();
  await startControlServer();
  process.stdout.write(
    `Phase 2 Playwright relay ${relayOrigin}, host ${hostOrigin}, and loopback test control are ready.\n`,
  );
}

process.once("SIGINT", () => void stop(0));
process.once("SIGTERM", () => void stop(0));
process.once("exit", () => rmSync(dataPath, { recursive: true, force: true }));

main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "Phase 2 harness failed."}\n`,
  );
  void stop(1);
});
