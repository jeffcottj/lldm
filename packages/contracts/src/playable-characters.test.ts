import { describe, expect, it } from "vitest";
import validFixtures from "./fixtures/valid.json" with { type: "json" };
import {
  PlayableCharacterStateSchema,
  validateRankAdvancement,
  validateResourceTransition,
  validateSparkRecoveryEligibility,
  validatePlayableCharacterState,
} from "./domains/playable-characters.js";
import { validateValue } from "./validation.js";

function playableCharacter(): Record<string, unknown> {
  return {
    schema_version: 1,
    record_kind: "playable_character_state",
    character_id: "character_sable_001",
    foundation: structuredClone(validFixtures.character_foundation),
    rank: 1,
    resolved_options: {
      heritage_gift: {
        content_definition_id: "content_heritage_echo_001",
        definition_revision: 1,
      },
      upbringing: {
        content_definition_id: "content_upbringing_roads_001",
        definition_revision: 1,
      },
      archetype: {
        content_definition_id: "content_archetype_wayfinder_001",
        definition_revision: 1,
      },
      path: null,
      talent: null,
      capstone: null,
      signature_technique: {
        content_definition_id: "content_technique_threadline_001",
        definition_revision: 1,
      },
    },
    resources: {
      guard: { current: 6, maximum: 6 },
      wounds: [
        { slot: 1, status: "empty" },
        { slot: 2, status: "empty" },
        { slot: 3, status: "empty" },
      ],
      exertion: { current: 3, maximum: 3 },
      spark: { available: true, complication_recovery_used: false },
    },
    significant_gear: structuredClone(
      validFixtures.character_foundation.significant_gear,
    ),
    resolved_significant_gear: [
      {
        slot: 1,
        definition: {
          content_definition_id: "content_gear_slate_compass_001",
          definition_revision: 1,
        },
        status: "ready",
      },
      { slot: 2, definition: null, status: "empty" },
      { slot: 3, definition: null, status: "empty" },
      { slot: 4, definition: null, status: "empty" },
    ],
    scene_ability_uses: [],
    conditions: [],
  };
}

describe("playable character contracts", () => {
  it("keeps a foundation distinct from playable state", () => {
    expect(
      validateValue(
        PlayableCharacterStateSchema,
        validFixtures.character_foundation,
      ).success,
    ).toBe(false);
    expect(validatePlayableCharacterState(playableCharacter()).success).toBe(
      true,
    );
  });

  it("rejects Guard overflow and a representational fourth Wound", () => {
    const overflow = playableCharacter();
    const resources = overflow.resources as Record<string, unknown>;
    resources.guard = { current: 7, maximum: 6 };
    const result = validatePlayableCharacterState(overflow);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(({ code }) => code === "resource.guard_overflow"),
      ).toBe(true);
    }

    const fourth = playableCharacter();
    const fourthResources = fourth.resources as Record<string, unknown>;
    fourthResources.wounds = [
      { slot: 1, status: "empty" },
      { slot: 2, status: "empty" },
      { slot: 3, status: "empty" },
      { slot: 4, status: "empty" },
    ];
    expect(validatePlayableCharacterState(fourth).success).toBe(false);
  });

  it("requires every occupied gear slot to have explicit mechanics", () => {
    const missingBinding = playableCharacter();
    const gear = missingBinding.resolved_significant_gear as unknown[];
    gear[0] = { slot: 1, definition: null, status: "empty" };
    const result = validatePlayableCharacterState(missingBinding);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(
          ({ code }) => code === "playable.gear_binding_mismatch",
        ),
      ).toBe(true);
    }
  });

  it("enforces rank feature structure through rank four", () => {
    const rankFour = playableCharacter();
    rankFour.rank = 4;
    expect(validatePlayableCharacterState(rankFour).success).toBe(false);

    const options = rankFour.resolved_options as Record<string, unknown>;
    options.path = {
      content_definition_id: "content_path_sentinel_001",
      definition_revision: 1,
    };
    options.talent = {
      content_definition_id: "content_talent_bridge_001",
      definition_revision: 1,
    };
    options.capstone = {
      content_definition_id: "content_capstone_holdfast_001",
      definition_revision: 1,
    };
    expect(validatePlayableCharacterState(rankFour).success).toBe(true);

    const skipped = playableCharacter();
    const skippedOptions = skipped.resolved_options as Record<string, unknown>;
    skippedOptions.talent = options.talent;
    const skippedResult = validatePlayableCharacterState(skipped);
    expect(skippedResult.success).toBe(false);
    if (!skippedResult.success) {
      expect(
        skippedResult.issues.some(
          ({ code }) => code === "rank.feature_too_early",
        ),
      ).toBe(true);
    }
  });

  it("reports resource boundaries and repeated Spark recovery precisely", () => {
    expect(
      validateResourceTransition({
        resource: "exertion",
        current: 0,
        delta: -1,
        maximum: 3,
      }).success,
    ).toBe(false);
    expect(
      validateResourceTransition({
        resource: "supply",
        current: 6,
        delta: 1,
        maximum: 6,
      }).success,
    ).toBe(false);
    const repeated = validateSparkRecoveryEligibility({
      available: false,
      complication_recovery_used: true,
    });
    expect(repeated.success).toBe(false);
    if (!repeated.success) {
      expect(
        repeated.issues.some(
          ({ code }) => code === "resource.spark_recovery_already_used",
        ),
      ).toBe(true);
    }
  });

  it("rejects skipped ranks and unavailable required content", () => {
    expect(
      validateRankAdvancement({
        current_rank: 1,
        requested_rank: 3,
        required_content_available: true,
      }).success,
    ).toBe(false);
    const unavailable = validateRankAdvancement({
      current_rank: 1,
      requested_rank: 2,
      required_content_available: false,
    });
    expect(unavailable.success).toBe(false);
    if (!unavailable.success) {
      expect(
        unavailable.issues.some(
          ({ code }) => code === "rank.required_content_unavailable",
        ),
      ).toBe(true);
    }
  });
});
