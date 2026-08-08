import {
  StarterLoadoutSchema,
  validateGuidedPresentationManifest,
  validatePhase2EncounterVariants,
  validateValue,
} from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import { PHASE_1_CONTENT_MANIFEST_HASH } from "../phase-1-catalog.js";
import {
  ALL_CONTENT_MANIFESTS_BY_HASH,
  definitionsForAnyManifest,
} from "../manifest-registry.js";
import {
  PHASE_2_CONTENT_MANIFEST,
  PHASE_2_CONTENT_MANIFEST_HASH,
} from "./manifest.js";
import {
  PHASE_2_PRESENTATION_MANIFEST,
  PHASE_2_PRESENTATION_MANIFEST_HASH,
} from "./presentation.js";
import { PHASE_2_STARTER_LOADOUTS } from "./starter-loadouts.js";
import { PHASE_2_ENCOUNTER_VARIANTS } from "./variants.js";
import { buildPhase2Encounter } from "./variants.js";

describe("Phase 2 content boundary", () => {
  it("pins distinct mechanical and presentation hashes without changing Phase 1", () => {
    expect(PHASE_1_CONTENT_MANIFEST_HASH).toBe(
      "sha256:7663c17e9a9cb83b5ec88e096c32fe735cafdabd2bf55c1127b6b288d9ab735b",
    );
    expect(PHASE_2_CONTENT_MANIFEST_HASH).toBe(
      "sha256:8231d8b34a1e531af298e87c360c7f43e47575a359e04777b6172951656300b7",
    );
    expect(PHASE_2_PRESENTATION_MANIFEST_HASH).toBe(
      "sha256:802249ccc0aa2b8997bbba7e3ab6ddc57399de8e05ba15cb5b03db74095d689e",
    );
    expect(PHASE_2_CONTENT_MANIFEST.manifest_hash).not.toBe(
      PHASE_2_PRESENTATION_MANIFEST.presentation_manifest_hash,
    );
    expect(PHASE_2_PRESENTATION_MANIFEST.mechanical_manifest_hash).toBe(
      PHASE_2_CONTENT_MANIFEST_HASH,
    );
    expect(Object.keys(ALL_CONTENT_MANIFESTS_BY_HASH)).toHaveLength(2);
    expect(
      definitionsForAnyManifest(PHASE_1_CONTENT_MANIFEST_HASH),
    ).toBeDefined();
    expect(
      definitionsForAnyManifest(PHASE_2_CONTENT_MANIFEST_HASH),
    ).toBeDefined();
  });

  it("provides six strict and mechanically distinct rank-one starters", () => {
    expect(PHASE_2_STARTER_LOADOUTS).toHaveLength(6);
    const identities = new Set<string>();
    for (const starter of PHASE_2_STARTER_LOADOUTS) {
      expect(validateValue(StarterLoadoutSchema, starter).success).toBe(true);
      expect(starter.foundation.rank).toBe(1);
      identities.add(
        JSON.stringify({
          attributes: starter.foundation.attributes,
          disciplines: starter.foundation.disciplines,
          archetype: starter.foundation.archetype_ref,
          signature: starter.foundation.signature_technique_concept,
        }),
      );
    }
    expect(identities.size).toBe(6);
  });

  it("validates authored 3/4/5 variants and stable enemy definitions", () => {
    expect(
      validatePhase2EncounterVariants(PHASE_2_ENCOUNTER_VARIANTS).success,
    ).toBe(true);
    expect(
      PHASE_2_ENCOUNTER_VARIANTS.map(({ party_size }) => party_size),
    ).toEqual([3, 4, 5]);
    const definitionByActor = new Map<string, string>();
    for (const variant of PHASE_2_ENCOUNTER_VARIANTS) {
      for (const enemy of variant.enemies) {
        const prior = definitionByActor.get(enemy.actor_id);
        const current = JSON.stringify(enemy.definition);
        if (prior !== undefined) expect(current).toBe(prior);
        definitionByActor.set(enemy.actor_id, current);
      }
    }
    expect(
      new Set(
        PHASE_2_ENCOUNTER_VARIANTS.map(
          ({ reinforcement_trigger }) => reinforcement_trigger,
        ),
      ),
    ).toHaveLength(3);
    const combinations = <T>(values: readonly T[], size: number): T[][] =>
      size === 0
        ? [[]]
        : values.flatMap((value, index) =>
            combinations(values.slice(index + 1), size - 1).map((tail) => [
              value,
              ...tail,
            ]),
          );
    for (const size of [3, 4, 5])
      for (const selected of combinations(PHASE_2_STARTER_LOADOUTS, size)) {
        const combat = buildPhase2Encounter(
          selected.map((starter, index) => ({
            starter_loadout_id: starter.starter_loadout_id,
            seat_id: `seat_variant_${size}_${index + 1}` as never,
          })),
        );
        expect(
          combat.participants.filter(({ side }) => side === "hero"),
        ).toHaveLength(size);
        expect(combat.combat_id).toBe(`combat_floodgate_party_${size}_001`);
      }
  });

  it("validates complete graph coverage and rejects a dangling transition", () => {
    expect(
      validateGuidedPresentationManifest(PHASE_2_PRESENTATION_MANIFEST).success,
    ).toBe(true);
    const broken = structuredClone(PHASE_2_PRESENTATION_MANIFEST);
    const opening = broken.beats[0];
    if (opening === undefined || opening.transitions[0] === undefined)
      throw new Error("Opening transition missing.");
    opening.transitions[0].to = "guided_beat_missing_001";
    const invalid = validateGuidedPresentationManifest(broken);
    expect(invalid.success).toBe(false);
    if (!invalid.success)
      expect(
        invalid.issues.some(
          ({ code }) => code === "guided.dangling_transition",
        ),
      ).toBe(true);
  });
});
