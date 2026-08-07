import { createHash, createHmac } from "node:crypto";
import {
  type CampaignId,
  type CommandId,
  RANDOMNESS_ALGORITHM_VERSION,
  type RandomDrawRecord,
  type RandomPurpose,
  SCHEMA_VERSION,
  validateRandomDrawRecord,
} from "@lldm/contracts";

const DOMAIN_TAG = "LLDM random v1";
const UINT32_MAXIMUM = 0xffff_ffff;
const TWO_TO_256 = 1n << 256n;

export interface RandomDrawInput {
  readonly seed: Uint8Array;
  readonly campaign_id: CampaignId;
  readonly command_id: CommandId;
  readonly purpose: RandomPurpose;
  readonly purpose_local_index: number;
  readonly minimum: number;
  readonly maximum: number;
}

export type DigestProvider = (
  framedInput: Uint8Array,
  blockCounter: number,
) => Uint8Array;

function uint32(value: number, label: string): Uint8Array {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAXIMUM) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer.`);
  }
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, false);
  return bytes;
}

function frameString(value: string): Uint8Array {
  const encoded = new TextEncoder().encode(value);
  return concatenate([uint32(encoded.length, "UTF-8 frame length"), encoded]);
}

function concatenate(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((length, part) => length + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function frameHmacSha256V1Input(input: {
  readonly campaign_id: CampaignId;
  readonly command_id: CommandId;
  readonly purpose: RandomPurpose;
  readonly purpose_local_index: number;
  readonly block_counter: number;
}): Uint8Array {
  return concatenate([
    frameString(DOMAIN_TAG),
    frameString(input.campaign_id),
    frameString(input.command_id),
    frameString(input.purpose),
    uint32(input.purpose_local_index, "Purpose-local index"),
    uint32(input.block_counter, "Block counter"),
  ]);
}

function digestToUnsignedBigInt(digest: Uint8Array): bigint {
  if (digest.length !== 32) {
    throw new RangeError("HMAC-SHA-256 digest must contain 32 bytes.");
  }
  let value = 0n;
  for (const byte of digest) value = (value << 8n) | BigInt(byte);
  return value;
}

export function fingerprintCampaignSeed(seed: Uint8Array): `sha256:${string}` {
  if (seed.length !== 32) {
    throw new RangeError("Campaign seed must contain exactly 32 bytes.");
  }
  return `sha256:${createHash("sha256").update(seed).digest("hex")}`;
}

export function drawHmacSha256V1(
  input: RandomDrawInput,
  injectedDigestProvider?: DigestProvider,
): RandomDrawRecord {
  if (input.seed.length !== 32) {
    throw new RangeError("Campaign seed must contain exactly 32 bytes.");
  }
  if (
    !Number.isSafeInteger(input.minimum) ||
    !Number.isSafeInteger(input.maximum) ||
    input.minimum > input.maximum
  ) {
    throw new RangeError("Random range must use ordered safe integers.");
  }
  uint32(input.purpose_local_index, "Purpose-local index");

  const rangeSize = BigInt(input.maximum - input.minimum + 1);
  const acceptanceLimit = TWO_TO_256 - (TWO_TO_256 % rangeSize);
  let blockCounter = 0;
  let rejectionCount = 0;

  while (true) {
    const framed = frameHmacSha256V1Input({
      campaign_id: input.campaign_id,
      command_id: input.command_id,
      purpose: input.purpose,
      purpose_local_index: input.purpose_local_index,
      block_counter: blockCounter,
    });
    const digest =
      injectedDigestProvider === undefined
        ? new Uint8Array(
            createHmac("sha256", input.seed).update(framed).digest(),
          )
        : injectedDigestProvider(framed, blockCounter);
    const unsigned = digestToUnsignedBigInt(digest);
    if (unsigned < acceptanceLimit) {
      const record = {
        schema_version: SCHEMA_VERSION,
        algorithm_version: RANDOMNESS_ALGORITHM_VERSION,
        seed_fingerprint: fingerprintCampaignSeed(input.seed),
        campaign_id: input.campaign_id,
        command_id: input.command_id,
        purpose: input.purpose,
        purpose_local_index: input.purpose_local_index,
        minimum: input.minimum,
        maximum: input.maximum,
        realized_value: input.minimum + Number(unsigned % rangeSize),
        rejection_count: rejectionCount,
      };
      const validated = validateRandomDrawRecord(record);
      if (!validated.success) {
        throw new Error("HMAC draw produced an invalid random record.");
      }
      return validated.value;
    }
    rejectionCount += 1;
    blockCounter += 1;
    if (blockCounter > UINT32_MAXIMUM) {
      throw new RangeError(
        "Random rejection sampling exhausted block counters.",
      );
    }
  }
}
