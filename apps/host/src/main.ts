import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { loadHostConfig } from "./config.js";
import { HttpRelayClient } from "./relay/client.js";
import { buildHostServer } from "./server.js";

async function main(): Promise<void> {
  const config = loadHostConfig();
  mkdirSync(config.data_path, { recursive: true, mode: 0o700 });
  mkdirSync(dirname(config.database_path), { recursive: true, mode: 0o700 });
  const host = await buildHostServer({
    config,
    relay: new HttpRelayClient(config.relay_url, config.relay_credential),
  });
  const shutdown = async () => {
    await host.close();
    process.exitCode = 0;
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  await host.server.listen({ host: config.bind, port: config.port });
}

main().catch((error: unknown) => {
  const safe =
    error instanceof Error && error.message.includes("LLDM_")
      ? error.message
      : "LLDM host startup failed. Check migration and redacted configuration diagnostics.";
  process.stderr.write(`${safe}\n`);
  process.exitCode = 1;
});
