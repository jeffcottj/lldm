import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.js";
import { sha256Hex, taggedSha256 } from "./sha256.js";

describe("portable canonical JSON and SHA-256", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(
      canonicalJson({ z: 0, a: [{ y: "two", x: 1 }], middle: false }),
    ).toBe('{"a":[{"x":1,"y":"two"}],"middle":false,"z":0}');
    expect(canonicalJson({ negative_zero: -0 })).toBe('{"negative_zero":0}');
  });

  it("rejects values outside the canonical JSON domain", () => {
    expect(() => canonicalJson({ missing: undefined })).toThrow(TypeError);
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    const cycle: Record<string, unknown> = {};
    cycle.self = cycle;
    expect(() => canonicalJson(cycle)).toThrow(TypeError);
  });

  it("matches published SHA-256 vectors without environment APIs", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(taggedSha256(canonicalJson({ b: 2, a: 1 }))).toBe(
      "sha256:43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777",
    );
  });
});
