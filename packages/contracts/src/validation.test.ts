import { describe, expect, it } from "vitest";
import { CheckRequestSchema, ResolveCheckCommandSchema } from "./checks.js";
import { validateValue } from "./validation.js";
import validFixtures from "./fixtures/valid.json" with { type: "json" };

describe("canonical validation", () => {
  it("returns typed values without coercion", () => {
    const result = validateValue(
      ResolveCheckCommandSchema,
      validFixtures.resolve_check_command,
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.kind).toBe("resolve_check");
      expect(result.value.payload.die_face).toBe(10);
    }
  });

  it("reports path-specific issues and rejects extra properties", () => {
    const input = structuredClone(
      validFixtures.resolve_check_command.payload.request,
    );
    const withExtra: Record<string, unknown> = input;
    withExtra.unbounded_bonus = 9;
    const result = validateValue(CheckRequestSchema, withExtra);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(({ path }) => path === "/unbounded_bonus"),
      ).toBe(true);
    }
  });
});
