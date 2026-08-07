import {
  GameCommandSchema,
  type GameCommand,
  validateValue,
} from "@lldm/contracts";
import {
  PHASE_1_ARCHETYPES,
  PHASE_1_CONTENT_MANIFEST_HASH,
  PHASE_1_DEFINITIONS,
  PHASE_1_STARTER_LOADOUTS,
} from "@lldm/content";
import { createEmptyCampaignState, decideCommand } from "@lldm/engine";
import { describe, expect, it } from "vitest";

function command(input: unknown): GameCommand {
  const result = validateValue(GameCommandSchema, input);
  if (!result.success)
    throw new Error("Production materialization command is invalid.");
  return result.value;
}

const catalog = {
  content_manifest_hash: PHASE_1_CONTENT_MANIFEST_HASH,
  definitions: PHASE_1_DEFINITIONS,
};

describe("production content and authoritative engine", () => {
  it("materializes all four committed starters", () => {
    for (const starter of PHASE_1_STARTER_LOADOUTS) {
      const state = createEmptyCampaignState(
        "campaign_starter_materialization_001",
        PHASE_1_CONTENT_MANIFEST_HASH,
      );
      const decision = decideCommand({
        state,
        catalog,
        command: command({
          schema_version: 1,
          command_id: `command_${starter.starter_loadout_id}`,
          transaction_id: `transaction_${starter.starter_loadout_id}`,
          campaign_id: state.campaign_id,
          expected_revision: 0,
          kind: "materialize_character",
          payload: {
            foundation: starter.foundation,
            significant_gear: starter.significant_gear,
          },
        }),
      });
      expect(decision).toMatchObject({ accepted: true });
    }
  });

  it("materializes every production archetype with its exact Guard maximum", () => {
    const base = PHASE_1_STARTER_LOADOUTS[0]!;
    const expectedGuard = new Map([
      ["Vanguard", 8],
      ["Maverick", 7],
      ["Wayfinder", 6],
      ["Envoy", 6],
      ["Weaver", 5],
      ["Beacon", 6],
    ]);
    PHASE_1_ARCHETYPES.forEach((archetype, index) => {
      if (archetype.kind !== "playable_option") {
        throw new Error("Production archetype has the wrong kind.");
      }
      const state = createEmptyCampaignState(
        `campaign_archetype_${index}_001`,
        PHASE_1_CONTENT_MANIFEST_HASH,
      );
      const foundation = {
        ...base.foundation,
        character_id: `character_archetype_${index}_001`,
        actor_id: `actor_archetype_${index}_001`,
        display_name: `Archetype Tester ${index + 1}`,
        archetype_ref: archetype.content_definition_id,
      };
      const decision = decideCommand({
        state,
        catalog,
        command: command({
          schema_version: 1,
          command_id: `command_archetype_${index}_001`,
          transaction_id: `transaction_archetype_${index}_001`,
          campaign_id: state.campaign_id,
          expected_revision: 0,
          kind: "materialize_character",
          payload: {
            foundation,
            significant_gear: base.significant_gear,
          },
        }),
      });
      if (!decision.accepted) throw new Error(decision.safe_detail);
      expect(decision.events[0]).toMatchObject({
        kind: "character_materialized",
        payload: {
          character: {
            resources: {
              guard: {
                current: expectedGuard.get(archetype.payload.display_name),
                maximum: expectedGuard.get(archetype.payload.display_name),
              },
            },
          },
        },
      });
    });
  });
});
