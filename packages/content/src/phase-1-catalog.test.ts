import {
  GameCommandSchema,
  OUTCOME_DEGREES,
  StarterLoadoutSchema,
  buildSortedManifestEntries,
  canonicalJson,
  hashContentDefinition,
  hashContentManifestEntries,
  validateContentCatalog,
  validateContentManifest,
  validateValue,
} from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import {
  CONTENT_MANIFESTS_BY_HASH,
  DEFERRED_CONTENT_REGISTRIES,
  PHASE_1_ARCHETYPES,
  PHASE_1_CONTENT_MANIFEST,
  PHASE_1_CONTENT_MANIFEST_HASH,
  PHASE_1_DEFINITIONS,
  PHASE_1_HASHED_DEFINITIONS,
  PHASE_1_NONCOMBAT_DEFINITIONS,
  PHASE_1_SIGNATURE_TECHNIQUES,
  definitionsForManifest,
} from "./phase-1-catalog.js";
import { PHASE_1_STARTER_LOADOUTS } from "./starter-loadouts.js";

describe("Phase 1 pinned content catalog", () => {
  it("validates every definition, reference, hash, and manifest entry", () => {
    expect(PHASE_1_CONTENT_MANIFEST_HASH).toBe(
      "sha256:7663c17e9a9cb83b5ec88e096c32fe735cafdabd2bf55c1127b6b288d9ab735b",
    );
    expect(validateContentCatalog(PHASE_1_HASHED_DEFINITIONS).success).toBe(
      true,
    );
    expect(validateContentManifest(PHASE_1_CONTENT_MANIFEST).success).toBe(
      true,
    );
    expect(PHASE_1_CONTENT_MANIFEST.entries).toHaveLength(
      PHASE_1_DEFINITIONS.length,
    );
    for (const record of PHASE_1_HASHED_DEFINITIONS) {
      expect(record.definition_hash).toBe(
        hashContentDefinition(record.definition),
      );
    }
    expect(definitionsForManifest(PHASE_1_CONTENT_MANIFEST_HASH)).toBe(
      PHASE_1_DEFINITIONS,
    );
    expect(CONTENT_MANIFESTS_BY_HASH[PHASE_1_CONTENT_MANIFEST_HASH]).toBe(
      PHASE_1_CONTENT_MANIFEST,
    );
  });

  it("produces identical manifest bytes when source definitions are reordered", () => {
    const reversed = [...PHASE_1_HASHED_DEFINITIONS].reverse();
    const entries = buildSortedManifestEntries(reversed);
    const identity = {
      schema_version: 1,
      content_manifest_id: "content_manifest_phase1_001",
      entries,
    };
    expect(canonicalJson(identity)).toBe(
      canonicalJson({
        schema_version: PHASE_1_CONTENT_MANIFEST.schema_version,
        content_manifest_id: PHASE_1_CONTENT_MANIFEST.content_manifest_id,
        entries: PHASE_1_CONTENT_MANIFEST.entries,
      }),
    );
    expect(
      hashContentManifestEntries({
        canonicalization_version: 1,
        manifest: identity,
      }),
    ).toBe(PHASE_1_CONTENT_MANIFEST_HASH);
  });

  it("ships six mechanically distinct rank-one archetypes", () => {
    expect(PHASE_1_ARCHETYPES).toHaveLength(6);
    const signatures = new Set(
      PHASE_1_SIGNATURE_TECHNIQUES.map(
        ({ content_definition_id }) => content_definition_id,
      ),
    );
    const signatureMechanics = new Set<string>();
    for (const definition of PHASE_1_ARCHETYPES) {
      if (definition.kind !== "playable_option") {
        throw new Error("Archetype fixture has the wrong kind.");
      }
      expect(definition.payload.rank).toBe(1);
      expect(definition.payload.availability).toBe("production");
      expect(definition.payload.narrative_permissions.length).toBeGreaterThan(
        0,
      );
      const grantedSignatures = definition.payload.granted_ability_ids.filter(
        (id) => signatures.has(id),
      );
      expect(grantedSignatures).toHaveLength(1);
      const signature = PHASE_1_SIGNATURE_TECHNIQUES.find(
        ({ content_definition_id }) =>
          content_definition_id === grantedSignatures[0],
      );
      if (signature?.kind !== "ability") {
        throw new Error("Archetype signature is unavailable.");
      }
      signatureMechanics.add(
        canonicalJson({
          slot: signature.payload.action_slot,
          target: signature.payload.target_mode,
          impact: signature.payload.fixed_impact,
          effects: signature.payload.effects,
        }),
      );
    }
    expect(signatureMechanics.size).toBe(6);
  });

  it("provides four complete distinct starter loadouts with no dangling reference", () => {
    expect(PHASE_1_STARTER_LOADOUTS).toHaveLength(4);
    const definitionIds = new Set(
      PHASE_1_DEFINITIONS.map(
        ({ content_definition_id }) => content_definition_id,
      ),
    );
    const archetypes = new Set<string>();
    for (const starter of PHASE_1_STARTER_LOADOUTS) {
      expect(validateValue(StarterLoadoutSchema, starter).success).toBe(true);
      archetypes.add(starter.foundation.archetype_ref);
      expect(definitionIds.has(starter.foundation.heritage_gift_ref)).toBe(
        true,
      );
      expect(definitionIds.has(starter.foundation.upbringing_ref)).toBe(true);
      expect(definitionIds.has(starter.foundation.archetype_ref)).toBe(true);
      starter.significant_gear.forEach(({ definition }) => {
        if (definition !== null) {
          expect(definitionIds.has(definition.content_definition_id)).toBe(
            true,
          );
        }
      });
      expect(
        validateValue(GameCommandSchema, {
          schema_version: 1,
          command_id: `command_${starter.starter_loadout_id}`,
          transaction_id: `transaction_${starter.starter_loadout_id}`,
          campaign_id: "campaign_content_validation_001",
          expected_revision: 0,
          kind: "materialize_character",
          payload: {
            foundation: starter.foundation,
            significant_gear: starter.significant_gear,
          },
        }).success,
      ).toBe(true);
    }
    expect(archetypes.size).toBe(4);
  });

  it("contains exact outcome bands and keeps future ranks unavailable", () => {
    for (const definition of PHASE_1_NONCOMBAT_DEFINITIONS) {
      const degrees =
        definition.kind === "challenge"
          ? definition.payload.outcome_effects.map(({ degree }) => degree)
          : definition.kind === "ritual"
            ? definition.payload.consequences.map(({ degree }) => degree)
            : [];
      if (degrees.length > 0) {
        expect(new Set(degrees)).toEqual(new Set(OUTCOME_DEGREES));
      }
    }
    expect(
      PHASE_1_DEFINITIONS.filter(
        (definition) =>
          definition.kind === "playable_option" &&
          ["path", "talent", "capstone"].includes(definition.payload.category),
      ),
    ).toEqual([]);
    for (const registry of Object.values(DEFERRED_CONTENT_REGISTRIES)) {
      expect(registry.availability).toBe("unavailable_in_phase_1");
      expect(registry.definitions).toEqual([]);
    }
  });

  it("contains original self-contained text without external rule references", () => {
    const text = canonicalJson(PHASE_1_DEFINITIONS).toLowerCase();
    expect(text).not.toMatch(/https?:\/\//);
    expect(text).not.toMatch(
      /forgotten realms|pathfinder|dungeons\s*&\s*dragons|d&d|beholder|mind flayer/,
    );
  });
});
