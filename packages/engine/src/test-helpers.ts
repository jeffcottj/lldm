import {
  CheckRequestSchema,
  CharacterFoundationSchema,
  type CheckRequest,
  type CharacterFoundation,
  validateValue,
} from "@lldm/contracts";
import type { LegalTotalModifier } from "./resolution.js";

export function fixtureCheckRequest(): CheckRequest {
  const result = validateValue(CheckRequestSchema, {
    schema_version: 1,
    actor_id: "actor_sable_001",
    attribute: "Insight",
    attribute_rating: 2,
    discipline: "Lore",
    discipline_rating: 1,
    target: 13,
    modifier_state: { edge: false, hindrance: false },
    visibility: "public",
    stakes: "Sable identifies the safe inscription before the chamber seals.",
    outcome_bands: [
      { degree: "Crisis", consequence: "The seal closes and marks Sable." },
      {
        degree: "Setback",
        consequence: "The clue is lost as the seal closes.",
      },
      {
        degree: "Success",
        consequence: "Sable identifies the safe inscription.",
      },
      {
        degree: "Triumph",
        consequence: "Sable also learns who carved the seal.",
      },
    ],
    action_feasibility: "possible",
    spark_eligible: true,
    eligible_roller: "seat_sable_001",
  });
  if (!result.success) throw new Error("The valid check fixture is invalid.");
  return result.value;
}

export function fixtureCharacter(): CharacterFoundation {
  const result = validateValue(CharacterFoundationSchema, {
    schema_version: 1,
    record_kind: "character_foundation",
    character_id: "character_sable_001",
    actor_id: "actor_sable_001",
    display_name: "Sable Reed",
    rank: 1,
    attributes: [
      { attribute: "Force", rating: 0 },
      { attribute: "Finesse", rating: 1 },
      { attribute: "Insight", rating: 2 },
      { attribute: "Presence", rating: 1 },
    ],
    disciplines: [
      { discipline: "Athletics", rating: 0 },
      { discipline: "Subterfuge", rating: 1 },
      { discipline: "Craft", rating: 0 },
      { discipline: "Lore", rating: 2 },
      { discipline: "Vigilance", rating: 1 },
      { discipline: "Influence", rating: 0 },
      { discipline: "Survival", rating: 1 },
      { discipline: "Mysticism", rating: 0 },
    ],
    drive: "Recover the songs erased from the valley stones.",
    bond: "I trust Rowan to notice the danger I overlook.",
    significant_gear: [
      {
        slot: 1,
        item: {
          label: "Slate compass",
          note: "Its needle follows old roads.",
        },
      },
      { slot: 2, item: null },
      { slot: 3, item: null },
      { slot: 4, item: null },
    ],
    signature_technique_concept:
      "Trace a forgotten route through a place that seems impassable.",
    heritage_gift_ref: "content_heritage_echo_001",
    upbringing_ref: "content_upbringing_roads_001",
    archetype_ref: "content_archetype_wayfinder_001",
  });
  if (!result.success)
    throw new Error("The valid character fixture is invalid.");
  return result.value;
}

export function requestForModifier(
  modifier: LegalTotalModifier,
  target: CheckRequest["target"] = 13,
): CheckRequest {
  const components: Record<
    LegalTotalModifier,
    {
      attribute_rating: 0 | 1 | 2;
      discipline_rating: 0 | 1 | 2;
      edge: boolean;
      hindrance: boolean;
    }
  > = {
    [-2]: {
      attribute_rating: 0,
      discipline_rating: 0,
      edge: false,
      hindrance: true,
    },
    [-1]: {
      attribute_rating: 1,
      discipline_rating: 0,
      edge: false,
      hindrance: true,
    },
    0: {
      attribute_rating: 0,
      discipline_rating: 0,
      edge: false,
      hindrance: false,
    },
    1: {
      attribute_rating: 1,
      discipline_rating: 0,
      edge: false,
      hindrance: false,
    },
    2: {
      attribute_rating: 2,
      discipline_rating: 0,
      edge: false,
      hindrance: false,
    },
    3: {
      attribute_rating: 2,
      discipline_rating: 1,
      edge: false,
      hindrance: false,
    },
    4: {
      attribute_rating: 2,
      discipline_rating: 2,
      edge: false,
      hindrance: false,
    },
    5: {
      attribute_rating: 2,
      discipline_rating: 1,
      edge: true,
      hindrance: false,
    },
    6: {
      attribute_rating: 2,
      discipline_rating: 2,
      edge: true,
      hindrance: false,
    },
  };
  const selected = components[modifier];
  const source = fixtureCheckRequest();
  const result = validateValue(CheckRequestSchema, {
    ...source,
    attribute_rating: selected.attribute_rating,
    discipline_rating: selected.discipline_rating,
    target,
    modifier_state: {
      edge: selected.edge,
      hindrance: selected.hindrance,
    },
  });
  if (!result.success) throw new Error(`Could not build modifier ${modifier}.`);
  return result.value;
}
