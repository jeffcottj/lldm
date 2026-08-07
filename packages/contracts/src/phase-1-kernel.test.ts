import { describe, expect, it } from "vitest";
import validFixtures from "./fixtures/valid.json" with { type: "json" };
import { GameCommandSchema } from "./commands.js";
import { GameEventSchema } from "./events.js";
import { validateValue } from "./validation.js";

describe("Phase 1 contract kernel", () => {
  it("keeps a stale command structurally valid for canonical rejection", () => {
    const stale = {
      ...structuredClone(validFixtures.resolve_check_command),
      command_id: "command_stale_001",
      transaction_id: "transaction_stale_001",
      expected_revision: 0,
    };
    expect(validateValue(GameCommandSchema, stale).success).toBe(true);
    expect(stale.expected_revision).toBeLessThan(
      validFixtures.accepted_transaction.last_revision,
    );
  });

  it("provides a valid same-ID identity-collision input pair", () => {
    const original = structuredClone(validFixtures.resolve_check_command);
    const changed = structuredClone(validFixtures.resolve_check_command);
    changed.payload.invoke_spark = true;

    expect(validateValue(GameCommandSchema, original).success).toBe(true);
    expect(validateValue(GameCommandSchema, changed).success).toBe(true);
    expect(changed.command_id).toBe(original.command_id);
    expect(changed).not.toEqual(original);
  });

  it("rejects extra properties and unknown event variants centrally", () => {
    const extra = {
      ...structuredClone(validFixtures.command_accepted_event),
      storage_timestamp: "2026-08-07T18:00:00.000Z",
    };
    expect(validateValue(GameEventSchema, extra).success).toBe(false);

    const unknown = {
      ...structuredClone(validFixtures.command_accepted_event),
      kind: "command_maybe",
    };
    expect(validateValue(GameEventSchema, unknown).success).toBe(false);
  });
});
