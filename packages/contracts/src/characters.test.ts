import { describe, expect, it } from "vitest";
import validFixtures from "./fixtures/valid.json" with { type: "json" };
import { validateCharacterFoundation } from "./characters.js";

function validCharacter(): Record<string, unknown> {
  return structuredClone(validFixtures.character_foundation);
}

function objectArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value))
    throw new Error(`${label} fixture is not an array.`);
  return value.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`${label} fixture contains a non-object.`);
    }
    return entry as Record<string, unknown>;
  });
}

describe("character foundation", () => {
  it("accepts the selected attribute and 1/3/4 discipline allocations", () => {
    expect(validateCharacterFoundation(validCharacter()).success).toBe(true);
  });

  it("gives reordered assignments the same derived meaning", () => {
    const character = validCharacter();
    character.attributes = objectArray(
      character.attributes,
      "attributes",
    ).reverse();
    character.disciplines = objectArray(
      character.disciplines,
      "disciplines",
    ).reverse();
    expect(validateCharacterFoundation(character).success).toBe(true);
  });

  it("rejects duplicate and therefore missing attributes at their paths", () => {
    const character = validCharacter();
    const attributes = objectArray(character.attributes, "attributes");
    attributes[1] = { attribute: "Force", rating: 1 };
    character.attributes = attributes;
    const result = validateCharacterFoundation(character);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(({ code }) => code === "allocation.duplicate"),
      ).toBe(true);
      expect(
        result.issues.some(({ code }) => code === "allocation.missing"),
      ).toBe(true);
    }
  });

  it("rejects incorrect rating distributions", () => {
    const character = validCharacter();
    const disciplines = objectArray(character.disciplines, "disciplines");
    disciplines[0] = { ...disciplines[0], rating: 1 };
    character.disciplines = disciplines;
    const result = validateCharacterFoundation(character);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(
          ({ path, code }) =>
            path === "$.disciplines" && code === "allocation.distribution",
        ),
      ).toBe(true);
    }
  });

  it("counts Unicode code points and rejects padding and controls", () => {
    const emojiName = validCharacter();
    emojiName.display_name = "🧭".repeat(40);
    expect(validateCharacterFoundation(emojiName).success).toBe(true);

    const padded = validCharacter();
    padded.drive = " Improvised permission ";
    const result = validateCharacterFoundation(padded);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(({ code }) => code === "text.not_trimmed"),
      ).toBe(true);
    }

    const controlled = validCharacter();
    controlled.bond = "A bell\u0007 rings between us.";
    const controlledResult = validateCharacterFoundation(controlled);
    expect(controlledResult.success).toBe(false);
    if (!controlledResult.success) {
      expect(
        controlledResult.issues.some(
          ({ code }) => code === "text.control_character",
        ),
      ).toBe(true);
    }
  });

  it("requires exactly four stable gear slots while allowing empty slots", () => {
    const character = validCharacter();
    const gear = character.significant_gear;
    if (!Array.isArray(gear)) throw new Error("Gear fixture is not an array.");
    gear.pop();
    expect(validateCharacterFoundation(character).success).toBe(false);
  });
});
