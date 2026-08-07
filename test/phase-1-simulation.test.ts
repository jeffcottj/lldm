import {
  CheckRequestSchema,
  type OutcomeDegree,
  type ResolvedCheck,
  validateValue,
} from "@lldm/contracts";
import { resolveCheck } from "@lldm/engine";
import { drawHmacSha256V1 } from "@lldm/runtime";
import { describe, expect, it } from "vitest";

const simulationRequestResult = validateValue(CheckRequestSchema, {
  schema_version: 1,
  actor_id: "actor_simulation_001",
  attribute: "Insight",
  attribute_rating: 2,
  discipline: "Mysticism",
  discipline_rating: 2,
  target: 13,
  modifier_state: { edge: false, hindrance: false },
  visibility: "public",
  stakes: "The floodgate opens before the echo pressure breaks its seals.",
  outcome_bands: [
    { degree: "Crisis", consequence: "The seal ruptures." },
    { degree: "Setback", consequence: "The seal remains closed." },
    { degree: "Success", consequence: "The seal opens." },
    { degree: "Triumph", consequence: "The seal opens without pressure loss." },
  ],
  action_feasibility: "possible",
  spark_eligible: true,
});

if (!simulationRequestResult.success) {
  throw new Error("The bounded simulation request is invalid.");
}
const simulationRequest = simulationRequestResult.value;

function runFixedSeedSimulation() {
  const observations: Record<OutcomeDegree, number> = {
    Crisis: 0,
    Setback: 0,
    Success: 0,
    Triumph: 0,
  };
  const faces: number[] = [];
  for (let seedIndex = 0; seedIndex < 64; seedIndex += 1) {
    const seed = Uint8Array.from(
      { length: 32 },
      (_, byteIndex) => (seedIndex * 37 + byteIndex * 11) & 0xff,
    );
    for (let checkIndex = 0; checkIndex < 8; checkIndex += 1) {
      const draw = drawHmacSha256V1({
        seed,
        campaign_id: `campaign_simulation_${seedIndex}_001`,
        command_id: `command_simulation_${seedIndex}_${checkIndex}_001`,
        purpose: "check.d20",
        purpose_local_index: 0,
        minimum: 1,
        maximum: 20,
      });
      const result = resolveCheck({
        action_feasibility: "possible",
        request: simulationRequest,
        die_face: draw.realized_value as ResolvedCheck["die_face"],
        roll_mode: "simulated",
      });
      if (!("final_degree" in result)) {
        throw new Error("A possible simulation check was rejected.");
      }
      faces.push(draw.realized_value);
      observations[result.final_degree] += 1;
    }
  }
  return { faces, observations };
}

describe("Phase 1 fixed-seed bounded sanity simulation", () => {
  it("is deterministic, bounded, and samples every outcome without a win-rate gate", () => {
    const first = runFixedSeedSimulation();
    const second = runFixedSeedSimulation();

    expect(second).toEqual(first);
    expect(first.faces).toHaveLength(512);
    expect(first.faces.every((face) => face >= 1 && face <= 20)).toBe(true);
    expect(first.observations).toEqual({
      Crisis: 101,
      Setback: 110,
      Success: 122,
      Triumph: 179,
    });
  });
});
