import { describe, expect, it } from "vitest";
import validFixtures from "./fixtures/valid.json" with { type: "json" };
import {
  CheckRequestSchema,
  DieFaceSchema,
  PhysicalRollDisclosureSchema,
  StandardTargetSchema,
} from "./checks.js";
import { validateValue } from "./validation.js";

describe("resolution and physical-roll contracts", () => {
  it.each([9, 11, 12, 14, 20, 23])(
    "rejects nonstandard target %i",
    (target) => {
      expect(validateValue(StandardTargetSchema, target).success).toBe(false);
    },
  );

  it.each([0, 21, 1.5])("rejects invalid die face %s", (face) => {
    expect(validateValue(DieFaceSchema, face).success).toBe(false);
  });

  it("makes modifier stacking unrepresentable", () => {
    const request: Record<string, unknown> = structuredClone(
      validFixtures.resolve_check_command.payload.request,
    );
    const modifier = request.modifier_state;
    if (typeof modifier !== "object" || modifier === null) {
      throw new Error("Fixture modifier state is missing.");
    }
    (modifier as Record<string, unknown>).edge_count = 2;
    const result = validateValue(CheckRequestSchema, request);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(({ path }) => path.includes("edge_count")),
      ).toBe(true);
    }
  });

  it("requires all physical disclosure fields", () => {
    const disclosure: Record<string, unknown> = structuredClone(
      validFixtures.physical_roll_requested_event.payload.disclosure,
    );
    delete disclosure.stakes;
    delete disclosure.eligible_roller;
    const result = validateValue(PhysicalRollDisclosureSchema, disclosure);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some(({ path }) => path === "/stakes")).toBe(true);
      expect(
        result.issues.some(({ path }) => path === "/eligible_roller"),
      ).toBe(true);
    }
  });

  it("rejects empty physical stakes", () => {
    const disclosure: Record<string, unknown> = structuredClone(
      validFixtures.physical_roll_requested_event.payload.disclosure,
    );
    disclosure.stakes = "";
    expect(
      validateValue(PhysicalRollDisclosureSchema, disclosure).success,
    ).toBe(false);
  });

  it("requires one ordered outcome entry for every die face", () => {
    const disclosure = structuredClone(
      validFixtures.physical_roll_requested_event.payload.disclosure,
    );
    const secondFace = disclosure.face_to_outcome[1];
    if (secondFace === undefined)
      throw new Error("Disclosure fixture is incomplete.");
    secondFace.face = 1;
    expect(
      validateValue(PhysicalRollDisclosureSchema, disclosure).success,
    ).toBe(false);
  });

  it("does not permit an impossible request to carry a die face", () => {
    const impossible = {
      ...validFixtures.impossible_check_rejection,
      die_face: 12,
    };
    expect(validateValue(CheckRequestSchema, impossible).success).toBe(false);
  });
});
