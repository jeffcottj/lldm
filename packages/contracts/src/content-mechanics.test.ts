import { describe, expect, it } from "vitest";
import {
  ContentDefinitionSchema,
  HashedContentDefinitionSchema,
  buildSortedManifestEntries,
  type HashedContentDefinition,
  validateContentCatalog,
  validateContentManifest,
  validateValue,
} from "./index.js";

const ability = {
  schema_version: 1,
  content_definition_id: "content_ability_pathlight_001",
  definition_revision: 1,
  kind: "ability",
  payload: {
    category: "signature_technique",
    display_name: "Pathlight",
    rule_text: "Mark a safe route and pull an ally one adjacent zone.",
    action_slot: "maneuver",
    cost: [],
    target_mode: "single_actor",
    range: "adjacent",
    fixed_impact: null,
    check_profile: null,
    effects: [{ kind: "move", distance: "adjacent", target: "ally" }],
    narrative_permissions: [
      {
        scope: "exploration",
        permission: "Identify a traversable route through unstable ground.",
      },
    ],
  },
} as const;

const archetype = {
  schema_version: 1,
  content_definition_id: "content_archetype_wayfinder_001",
  definition_revision: 1,
  kind: "playable_option",
  payload: {
    category: "archetype",
    display_name: "Wayfinder",
    rule_text: "Create openings by reading terrain and movement.",
    rank: 1,
    availability: "production",
    prerequisites: [],
    granted_ability_ids: ["content_ability_pathlight_001"],
    tactical_effects: [{ kind: "grant_edge", context: "check" }],
    narrative_permissions: [
      {
        scope: "exploration",
        permission: "Recognize signs of traveled and forgotten routes.",
      },
    ],
  },
} as const;

function contentRecord(
  definition: unknown,
  definitionHash: string,
): HashedContentDefinition {
  const result = validateValue(HashedContentDefinitionSchema, {
    definition,
    definition_hash: definitionHash,
  });
  if (!result.success) throw new Error("Content test fixture is invalid.");
  return result.value;
}

const abilityRecord = contentRecord(
  ability,
  "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
);
const archetypeRecord = contentRecord(
  archetype,
  "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
);

describe("generic content mechanics", () => {
  it("requires tactical meaning and a narrative permission", () => {
    expect(validateValue(ContentDefinitionSchema, archetype).success).toBe(
      true,
    );
    expect(validateValue(ContentDefinitionSchema, ability).success).toBe(true);
    expect(
      validateValue(ContentDefinitionSchema, {
        ...archetype,
        payload: { ...archetype.payload, tactical_effects: [] },
      }).success,
    ).toBe(false);
    expect(
      validateValue(ContentDefinitionSchema, {
        ...archetype,
        payload: { ...archetype.payload, narrative_permissions: [] },
      }).success,
    ).toBe(false);
  });

  it("validates whole-catalog references independently of source order", () => {
    expect(
      validateContentCatalog([archetypeRecord, abilityRecord]).success,
    ).toBe(true);
    const forward = buildSortedManifestEntries([
      abilityRecord,
      archetypeRecord,
    ]);
    const reverse = buildSortedManifestEntries([
      archetypeRecord,
      abilityRecord,
    ]);
    expect(reverse).toEqual(forward);
    expect(JSON.stringify(reverse)).toBe(JSON.stringify(forward));

    const missing = validateContentCatalog([archetypeRecord]);
    expect(missing.success).toBe(false);
    if (!missing.success) {
      expect(
        missing.issues.some(({ code }) => code === "content.missing_reference"),
      ).toBe(true);
    }
  });

  it("detects immutable revision changes", () => {
    const changed = {
      definition: {
        ...ability,
        payload: { ...ability.payload, display_name: "Changed Pathlight" },
      },
      definition_hash:
        "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    } as const;
    const result = validateContentCatalog([abilityRecord, changed]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(
          ({ code }) => code === "content.immutable_revision_changed",
        ),
      ).toBe(true);
    }
  });

  it("rejects cyclic playable prerequisites", () => {
    const path = (id: string, requiredId: string) => ({
      ...archetype,
      content_definition_id: id,
      payload: {
        ...archetype.payload,
        category: "path",
        rank: 2,
        availability: "test_only",
        prerequisites: [
          {
            kind: "content",
            required: {
              content_definition_id: requiredId,
              definition_revision: 1,
            },
          },
        ],
        granted_ability_ids: [],
      },
    });
    const first = contentRecord(
      path("content_path_first_001", "content_path_second_001"),
      "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    );
    const second = contentRecord(
      path("content_path_second_001", "content_path_first_001"),
      "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    );
    const result = validateContentCatalog([first, second]);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(({ code }) => code === "content.prerequisite_cycle"),
      ).toBe(true);
    }
  });

  it("enforces canonical manifest ordering and one revision per ID", () => {
    const entries = buildSortedManifestEntries([
      archetypeRecord,
      abilityRecord,
    ]);
    const manifest = {
      schema_version: 1,
      content_manifest_id: "content_manifest_phase1_001",
      manifest_hash:
        "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      entries,
    };
    expect(validateContentManifest(manifest).success).toBe(true);
    expect(
      validateContentManifest({ ...manifest, entries: [...entries].reverse() })
        .success,
    ).toBe(false);
  });

  it("rejects category/rank mismatches and zero resource effects", () => {
    const wrongRank = {
      ...archetypeRecord,
      definition: {
        ...archetype,
        payload: { ...archetype.payload, rank: 2 },
      },
    };
    const rankResult = validateContentCatalog([wrongRank, abilityRecord]);
    expect(rankResult.success).toBe(false);
    if (!rankResult.success) {
      expect(
        rankResult.issues.some(
          ({ code }) => code === "content.invalid_rank_availability",
        ),
      ).toBe(true);
    }

    const zeroEffect = {
      ...archetypeRecord,
      definition: {
        ...archetype,
        payload: {
          ...archetype.payload,
          tactical_effects: [
            {
              kind: "adjust_resource",
              resource: "guard",
              amount: 0,
              target: "self",
            },
          ],
        },
      },
    };
    const zeroResult = validateContentCatalog([zeroEffect, abilityRecord]);
    expect(zeroResult.success).toBe(false);
    if (!zeroResult.success) {
      expect(
        zeroResult.issues.some(
          ({ code }) => code === "content.zero_resource_effect",
        ),
      ).toBe(true);
    }
  });
});
