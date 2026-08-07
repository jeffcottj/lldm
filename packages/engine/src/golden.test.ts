import { ImpossibleCheckRejectionSchema, validateValue } from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import { validateStartingCharacter } from "./character-creation.js";
import {
  MANDATORY_PHYSICAL_ROLL_REASONS,
  selectPhysicalRoll,
} from "./physical-rolls.js";
import {
  finalModifierFor,
  normalizeModifierState,
  resolveCheck,
} from "./resolution.js";
import {
  fixtureCharacter,
  fixtureCheckRequest,
  requestForModifier,
} from "./test-helpers.js";

function expectResolved(
  result: ReturnType<typeof resolveCheck>,
): Exclude<
  ReturnType<typeof resolveCheck>,
  { action_feasibility: "impossible" }
> {
  if ("action_feasibility" in result) {
    throw new Error(
      "Expected a resolved check, but the action was impossible.",
    );
  }
  return result;
}

describe("clean-room golden resolution examples", () => {
  it.each([
    { face: 8, delta: -5, degree: "Crisis" },
    { face: 9, delta: -4, degree: "Setback" },
    { face: 12, delta: -1, degree: "Setback" },
    { face: 13, delta: 0, degree: "Success" },
    { face: 17, delta: 4, degree: "Success" },
    { face: 18, delta: 5, degree: "Triumph" },
  ] as const)(
    "classifies target delta $delta as $degree",
    ({ face, delta, degree }) => {
      const result = expectResolved(
        resolveCheck({
          action_feasibility: "possible",
          request: requestForModifier(0, 13),
          die_face: face,
          roll_mode: "simulated",
        }),
      );
      expect(result.target_delta).toBe(delta);
      expect(result.final_degree).toBe(degree);
    },
  );

  it("applies natural shifts and clamps the end degrees", () => {
    const downgraded = expectResolved(
      resolveCheck({
        action_feasibility: "possible",
        request: requestForModifier(6, 10),
        die_face: 1,
        roll_mode: "simulated",
      }),
    );
    expect(downgraded).toMatchObject({
      base_degree: "Setback",
      natural_face_adjustment: -1,
      final_degree: "Crisis",
    });

    const upgraded = expectResolved(
      resolveCheck({
        action_feasibility: "possible",
        request: requestForModifier(0, 22),
        die_face: 20,
        roll_mode: "simulated",
      }),
    );
    expect(upgraded).toMatchObject({
      base_degree: "Setback",
      natural_face_adjustment: 1,
      final_degree: "Success",
    });

    const crisisClamp = expectResolved(
      resolveCheck({
        action_feasibility: "possible",
        request: requestForModifier(0, 13),
        die_face: 1,
        roll_mode: "simulated",
      }),
    );
    const triumphClamp = expectResolved(
      resolveCheck({
        action_feasibility: "possible",
        request: requestForModifier(0, 13),
        die_face: 20,
        roll_mode: "simulated",
      }),
    );
    expect(crisisClamp.final_degree).toBe("Crisis");
    expect(triumphClamp.final_degree).toBe("Triumph");
  });

  it("shows Edge, Hindrance, and cancellation as separate components", () => {
    expect(normalizeModifierState({ edge: true, hindrance: false })).toEqual({
      edge: { active: true, value: 2 },
      hindrance: { active: false, value: 0 },
      situational_modifier: 2,
    });
    expect(normalizeModifierState({ edge: false, hindrance: true })).toEqual({
      edge: { active: false, value: 0 },
      hindrance: { active: true, value: -2 },
      situational_modifier: -2,
    });
    expect(normalizeModifierState({ edge: true, hindrance: true })).toEqual({
      edge: { active: true, value: 2 },
      hindrance: { active: true, value: -2 },
      situational_modifier: 0,
    });
  });

  it("rejects an impossible action without any die input", () => {
    const validated = validateValue(ImpossibleCheckRejectionSchema, {
      schema_version: 1,
      actor_id: "actor_sable_001",
      action_feasibility: "impossible",
      code: "action_impossible",
      reason: "The sealed arch has no opening to cross.",
    });
    if (!validated.success) throw new Error("Impossible fixture is invalid.");
    expect(
      resolveCheck({
        action_feasibility: "impossible",
        rejection: validated.value,
      }),
    ).toEqual(validated.value);
  });

  it("returns deeply equal, frozen results for identical inputs", () => {
    const input = {
      action_feasibility: "possible",
      request: fixtureCheckRequest(),
      die_face: 10,
      roll_mode: "simulated",
    } as const;
    const first = expectResolved(resolveCheck(input));
    const second = expectResolved(resolveCheck(input));
    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.modifier_breakdown)).toBe(true);
  });
});

describe("physical-roll golden examples", () => {
  it.each(MANDATORY_PHYSICAL_ROLL_REASONS)(
    "selects mandatory reason %s",
    (reason) => {
      const result = selectPhysicalRoll({
        attempt: fixtureCheckRequest(),
        mandatory_reasons: [reason],
        invoke_spark: false,
        resolution_status: "unresolved",
      });
      expect(result.selected).toBe(true);
      if (result.selected) expect(result.primary_reason).toBe(reason);
    },
  );

  it("uses fixed reason precedence while preserving Spark separately", () => {
    const result = selectPhysicalRoll({
      attempt: fixtureCheckRequest(),
      mandatory_reasons: [
        "pivotal_scene_conclusion",
        "declared_irreversible_stake",
      ],
      invoke_spark: true,
      resolution_status: "unresolved",
    });
    expect(result.selected).toBe(true);
    if (result.selected) {
      expect(result.primary_reason).toBe("declared_irreversible_stake");
      expect(result.applied_reasons).toEqual([
        "declared_irreversible_stake",
        "pivotal_scene_conclusion",
        "spark_invocation",
      ]);
      expect(result.spark_spent).toBe(true);
    }
  });

  it("grants Spark Edge before cancelling Hindrance", () => {
    const request = requestForModifier(-1);
    const result = selectPhysicalRoll({
      attempt: request,
      mandatory_reasons: [],
      invoke_spark: true,
      resolution_status: "unresolved",
    });
    expect(result.selected).toBe(true);
    if (result.selected) {
      expect(result.request.modifier_state).toEqual({
        edge: true,
        hindrance: true,
      });
      expect(result.disclosure.modifier_breakdown.situational_modifier).toBe(0);
      expect(finalModifierFor(result.request)).toBe(1);
    }
  });

  it("matches the literal disclosure fixture, including all twenty faces", () => {
    const result = selectPhysicalRoll({
      attempt: fixtureCheckRequest(),
      mandatory_reasons: ["pivotal_scene_conclusion"],
      invoke_spark: false,
      resolution_status: "unresolved",
    });
    expect(result.selected).toBe(true);
    if (result.selected) {
      expect(result.disclosure).toMatchObject({
        target: 13,
        final_modifier: 3,
        stakes:
          "Sable identifies the safe inscription before the chamber seals.",
        reason: "pivotal_scene_conclusion",
        eligible_roller: "seat_sable_001",
        modifier_breakdown: {
          attribute: { name: "Insight", value: 2 },
          discipline: { name: "Lore", value: 1 },
          edge: { active: false, value: 0 },
          hindrance: { active: false, value: 0 },
          situational_modifier: 0,
        },
      });
      expect(
        result.disclosure.face_to_outcome.map(({ degree }) => degree),
      ).toEqual([
        "Crisis",
        "Crisis",
        "Crisis",
        "Crisis",
        "Crisis",
        "Setback",
        "Setback",
        "Setback",
        "Setback",
        "Success",
        "Success",
        "Success",
        "Success",
        "Success",
        "Triumph",
        "Triumph",
        "Triumph",
        "Triumph",
        "Triumph",
        "Triumph",
      ]);
    }
  });

  it("rejects invalid Spark contexts", () => {
    const ineligible = { ...fixtureCheckRequest(), spark_eligible: false };
    expect(
      selectPhysicalRoll({
        attempt: ineligible,
        mandatory_reasons: [],
        invoke_spark: true,
        resolution_status: "unresolved",
      }),
    ).toMatchObject({ rejected: true, code: "spark_ineligible" });
    expect(
      selectPhysicalRoll({
        attempt: fixtureCheckRequest(),
        mandatory_reasons: [],
        invoke_spark: true,
        resolution_status: "resolved",
      }),
    ).toMatchObject({ rejected: true, code: "already_resolved" });
  });
});

describe("starting-character golden example", () => {
  it("accepts the fixed attribute and discipline allocations", () => {
    expect(validateStartingCharacter(fixtureCharacter()).success).toBe(true);
  });
});
