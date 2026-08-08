import { SCHEMA_VERSION, type NarrationBrief } from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import {
  FakeTextProvider,
  deterministicFallbackSentence,
} from "./fake-text.js";

const brief: NarrationBrief = {
  schema_version: SCHEMA_VERSION,
  committed_fact_codes: ["challenge.Success"],
  allowed_template_ids: ["template_success_001", "template_success_002"],
  fallback_text: "The committed result stands.",
};

describe("deterministic fake text provider", () => {
  it("selects only an allowed template deterministically", async () => {
    const provider = new FakeTextProvider();
    await expect(provider.select(brief)).resolves.toEqual({
      schema_version: SCHEMA_VERSION,
      template_id: "template_success_001",
    });
    await expect(provider.select(brief)).resolves.toEqual(
      await provider.select(brief),
    );
  });

  it("supports delay/failure injection without changing the fallback", async () => {
    const provider = new FakeTextProvider({ delay_ms: 1, fail: true });
    await expect(provider.select(brief)).rejects.toThrow(
      "Injected fake provider failure",
    );
    expect(deterministicFallbackSentence(brief)).toBe(brief.fallback_text);
  });

  it("rejects an invalid brief before choosing text", async () => {
    await expect(
      new FakeTextProvider().select({ ...brief, allowed_template_ids: [] }),
    ).rejects.toThrow("Narration brief failed validation");
  });
});
