import {
  PROTOCOL_VERSION,
  RelayTokenClaimsSchema,
  SCHEMA_VERSION,
  type RelayTokenClaims,
  validateValue,
} from "@lldm/contracts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey(secret: string) {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export function randomSecret(bytes = 24): string {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return base64Url(data);
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return base64Url(new Uint8Array(digest));
}

export async function safeSecretEqual(
  left: string,
  right: string,
): Promise<boolean> {
  const [a, b] = await Promise.all([hashSecret(left), hashSecret(right)]);
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1)
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
}

export async function signRelayToken(
  claims: RelayTokenClaims,
  secret: string,
): Promise<string> {
  const validated = validateValue(RelayTokenClaimsSchema, claims);
  if (!validated.success)
    throw new Error("Relay token claims failed validation.");
  const body = base64Url(encoder.encode(JSON.stringify(validated.value)));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(secret),
    encoder.encode(body),
  );
  return `${body}.${base64Url(new Uint8Array(signature))}`;
}

export async function verifyRelayToken(
  token: string,
  secret: string,
  nowEpochSeconds: number,
): Promise<RelayTokenClaims | null> {
  const [body, signature, extra] = token.split(".");
  if (body === undefined || signature === undefined || extra !== undefined)
    return null;
  let valid = false;
  try {
    const signatureBytes = fromBase64Url(signature);
    valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(secret),
      signatureBytes.buffer as ArrayBuffer,
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!valid) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(decoder.decode(fromBase64Url(body))) as unknown;
  } catch {
    return null;
  }
  const claims = validateValue(RelayTokenClaimsSchema, raw);
  if (
    !claims.success ||
    claims.value.expires_at_epoch_seconds <= nowEpochSeconds ||
    claims.value.protocol_version !== PROTOCOL_VERSION
  )
    return null;
  return claims.value;
}

export function relayClaims(
  input: Omit<RelayTokenClaims, "schema_version" | "protocol_version">,
): RelayTokenClaims {
  return {
    schema_version: SCHEMA_VERSION,
    protocol_version: PROTOCOL_VERSION,
    ...input,
  };
}
