import { describe, expect, it } from "vitest";
import {
  drawHmacSha256V1,
  fingerprintCampaignSeed,
  frameHmacSha256V1Input,
} from "./hmac-sha256-v1.js";

const seed = Uint8Array.from({ length: 32 }, (_, index) => index);
const vectorInput = {
  seed,
  campaign_id: "campaign_vector_001",
  command_id: "command_vector_001",
  purpose: "check.d20",
  purpose_local_index: 0,
  minimum: 1,
  maximum: 20,
} as const;

describe("hmac_sha256_v1 deterministic randomness", () => {
  it("matches the published framing and draw vector", () => {
    expect(
      Buffer.from(
        frameHmacSha256V1Input({ ...vectorInput, block_counter: 0 }),
      ).toString("hex"),
    ).toBe(
      "0000000e4c4c444d2072616e646f6d2076310000001363616d706169676e5f766563746f725f30303100000012636f6d6d616e645f766563746f725f30303100000009636865636b2e6432300000000000000000",
    );
    expect(fingerprintCampaignSeed(seed)).toBe(
      "sha256:630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd",
    );
    expect(drawHmacSha256V1(vectorInput)).toEqual({
      schema_version: 1,
      algorithm_version: "hmac_sha256_v1",
      seed_fingerprint:
        "sha256:630dcd2966c4336691125448bbb25b4ff412a49c732db2c8abc1b8581bd710dd",
      campaign_id: "campaign_vector_001",
      command_id: "command_vector_001",
      purpose: "check.d20",
      purpose_local_index: 0,
      minimum: 1,
      maximum: 20,
      realized_value: 7,
      rejection_count: 0,
    });
  });

  it("isolates purposes without shifting an existing draw", () => {
    const original = drawHmacSha256V1(vectorInput);
    const other = drawHmacSha256V1({
      ...vectorInput,
      purpose: "enemy.tie_break",
      minimum: 0,
      maximum: 2,
    });
    expect(other.realized_value).toBe(2);
    expect(other).not.toEqual(original);
    expect(drawHmacSha256V1(vectorInput)).toEqual(original);
  });

  it("frames campaign, command, purpose, and local index independently", () => {
    const original = Buffer.from(
      frameHmacSha256V1Input({ ...vectorInput, block_counter: 0 }),
    ).toString("hex");
    for (const changed of [
      { ...vectorInput, campaign_id: "campaign_vector_002" },
      { ...vectorInput, command_id: "command_vector_002" },
      { ...vectorInput, purpose: "check.other" },
      { ...vectorInput, purpose_local_index: 1 },
    ]) {
      expect(
        Buffer.from(
          frameHmacSha256V1Input({ ...changed, block_counter: 0 }),
        ).toString("hex"),
      ).not.toBe(original);
    }
  });

  it("uses rejection sampling and records rejected blocks", () => {
    const record = drawHmacSha256V1(
      { ...vectorInput, minimum: 0, maximum: 9 },
      (_framed, blockCounter) =>
        blockCounter === 0 ? new Uint8Array(32).fill(0xff) : new Uint8Array(32),
    );
    expect(record).toMatchObject({
      realized_value: 0,
      rejection_count: 1,
    });
  });

  it("supports inclusive singleton and signed ranges", () => {
    expect(
      drawHmacSha256V1({ ...vectorInput, minimum: 4, maximum: 4 })
        .realized_value,
    ).toBe(4);
    const signed = drawHmacSha256V1({
      ...vectorInput,
      minimum: -2,
      maximum: 2,
    });
    expect(signed.realized_value).toBeGreaterThanOrEqual(-2);
    expect(signed.realized_value).toBeLessThanOrEqual(2);
  });

  it("rejects invalid seeds, ranges, and purpose indexes", () => {
    expect(() =>
      drawHmacSha256V1({ ...vectorInput, seed: new Uint8Array(31) }),
    ).toThrow(/32 bytes/);
    expect(() =>
      drawHmacSha256V1({ ...vectorInput, minimum: 2, maximum: 1 }),
    ).toThrow(/ordered safe integers/);
    expect(() =>
      drawHmacSha256V1({ ...vectorInput, purpose_local_index: -1 }),
    ).toThrow(/unsigned 32-bit/);
  });
});
