import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export interface HostConfig {
  readonly bind: "127.0.0.1" | "::1" | "0.0.0.0";
  readonly port: number;
  readonly database_path: string;
  readonly data_path: string;
  readonly web_assets_path: string;
  readonly public_pwa_url: string;
  readonly relay_url: string;
  readonly relay_credential: string;
  readonly room_lifetime_seconds: number;
  readonly rehearsal_enabled: boolean;
  readonly test_mode: boolean;
}

function absolutePath(value: string, name: string): string {
  const path = isAbsolute(value) ? value : resolve(value);
  if (path === "/") throw new Error(`${name} cannot be the filesystem root.`);
  return path;
}

function integer(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  name: string,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum)
    throw new Error(
      `${name} must be an integer from ${minimum} through ${maximum}.`,
    );
  return parsed;
}

export function loadHostConfig(
  environment: NodeJS.ProcessEnv = process.env,
): HostConfig {
  const testMode = environment.LLDM_TEST_MODE === "1";
  const bind = environment.LLDM_BIND ?? "127.0.0.1";
  if (
    bind !== "127.0.0.1" &&
    bind !== "::1" &&
    !(bind === "0.0.0.0" && environment.LLDM_CONTAINER_LOOPBACK_PUBLISH === "1")
  )
    throw new Error(
      "LLDM_BIND must remain loopback-only unless Compose explicitly limits a container bind to host loopback.",
    );
  const dataPath = absolutePath(
    environment.LLDM_DATA_PATH ?? "/var/lib/lldm",
    "LLDM_DATA_PATH",
  );
  const credentialPath = environment.LLDM_RELAY_CREDENTIAL_FILE;
  if (credentialPath === undefined || !existsSync(credentialPath))
    throw new Error(
      "LLDM_RELAY_CREDENTIAL_FILE must name a readable secret file.",
    );
  const relayCredential = readFileSync(credentialPath, "utf8").trim();
  if (relayCredential.length < 22)
    throw new Error("Relay credential is too short.");
  const publicUrl = environment.LLDM_PUBLIC_PWA_URL;
  const relayUrl = environment.LLDM_RELAY_URL;
  const testLoopbackHttp = (value: string | undefined) => {
    if (!testMode || value === undefined) return false;
    try {
      const parsed = new URL(value);
      return (
        parsed.protocol === "http:" &&
        (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost")
      );
    } catch {
      return false;
    }
  };
  if (
    publicUrl === undefined ||
    (!publicUrl.startsWith("https://") && !testLoopbackHttp(publicUrl))
  )
    throw new Error("LLDM_PUBLIC_PWA_URL must use HTTPS.");
  if (
    relayUrl === undefined ||
    (!relayUrl.startsWith("https://") && !testLoopbackHttp(relayUrl))
  )
    throw new Error("LLDM_RELAY_URL must use HTTPS.");
  return {
    bind,
    port: integer(environment.LLDM_PORT, 3210, 1024, 65535, "LLDM_PORT"),
    data_path: dataPath,
    database_path: absolutePath(
      environment.LLDM_DATABASE_PATH ?? `${dataPath}/lldm.sqlite`,
      "LLDM_DATABASE_PATH",
    ),
    web_assets_path: absolutePath(
      environment.LLDM_WEB_ASSETS_PATH ?? resolve("apps/web/dist"),
      "LLDM_WEB_ASSETS_PATH",
    ),
    public_pwa_url: publicUrl,
    relay_url: relayUrl.replace(/\/$/, ""),
    relay_credential: relayCredential,
    room_lifetime_seconds: integer(
      environment.LLDM_ROOM_LIFETIME_SECONDS,
      86_400,
      60,
      86_400,
      "LLDM_ROOM_LIFETIME_SECONDS",
    ),
    rehearsal_enabled: environment.LLDM_REHEARSAL_ENABLED === "1",
    test_mode: testMode,
  };
}

export function redactedConfig(config: HostConfig) {
  return {
    bind: config.bind,
    port: config.port,
    database_path: config.database_path,
    data_path: config.data_path,
    web_assets_path: config.web_assets_path,
    public_pwa_url: config.public_pwa_url,
    relay_url: config.relay_url,
    relay_credential: "[redacted]",
    room_lifetime_seconds: config.room_lifetime_seconds,
    rehearsal_enabled: config.rehearsal_enabled,
    test_mode: config.test_mode,
  };
}
