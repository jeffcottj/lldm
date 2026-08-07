import {
  ATTRIBUTES,
  DISCIPLINES,
  OUTCOME_DEGREES,
  STANDARD_TARGETS,
  CoreTermContentDefinitionSchema,
  validateValue,
} from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import {
  CORE_TERM_CATALOG,
  FUTURE_CONTENT_REGISTRIES,
} from "./core-catalog.js";

describe("Phase 0 core-term catalog", () => {
  it("contains one validated record for every core identifier", () => {
    const expectedCount =
      ATTRIBUTES.length +
      DISCIPLINES.length +
      STANDARD_TARGETS.length +
      OUTCOME_DEGREES.length;
    expect(CORE_TERM_CATALOG).toHaveLength(expectedCount);
    expect(
      new Set(
        CORE_TERM_CATALOG.map(
          ({ payload }) => `${payload.category}:${payload.identifier}`,
        ),
      ).size,
    ).toBe(expectedCount);
    for (const definition of CORE_TERM_CATALOG) {
      expect(
        validateValue(CoreTermContentDefinitionSchema, definition).success,
      ).toBe(true);
    }
  });

  it("keeps later content registries explicitly unavailable and empty", () => {
    for (const registry of Object.values(FUTURE_CONTENT_REGISTRIES)) {
      expect(registry.availability).toBe("unavailable_in_phase_0");
      expect(registry.definitions).toEqual([]);
    }
  });
});
