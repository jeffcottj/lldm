import {
  ATTRIBUTES,
  CoreTermContentDefinitionSchema,
  DISCIPLINES,
  OUTCOME_DEGREES,
  SCHEMA_VERSION,
  STANDARD_TARGETS,
  type Attribute,
  type CoreTermContentDefinition,
  type Discipline,
  type OutcomeDegree,
  type StandardTarget,
  validateValue,
} from "@lldm/contracts";

interface DisplayMetadata {
  readonly display_name: string;
  readonly description: string;
}

export const ATTRIBUTE_METADATA = Object.freeze({
  Force: {
    display_name: "Force",
    description: "Direct strength, endurance, and physical commitment.",
  },
  Finesse: {
    display_name: "Finesse",
    description: "Precision, balance, speed, and careful handling.",
  },
  Insight: {
    display_name: "Insight",
    description: "Perception, analysis, memory, and measured judgment.",
  },
  Presence: {
    display_name: "Presence",
    description: "Conviction, empathy, expression, and social bearing.",
  },
} satisfies Record<Attribute, DisplayMetadata>);

export const DISCIPLINE_METADATA = Object.freeze({
  Athletics: {
    display_name: "Athletics",
    description: "Traverse obstacles and apply practiced physical effort.",
  },
  Subterfuge: {
    display_name: "Subterfuge",
    description: "Move unnoticed, misdirect attention, and handle covert work.",
  },
  Craft: {
    display_name: "Craft",
    description: "Build, mend, inspect, and operate made things.",
  },
  Lore: {
    display_name: "Lore",
    description: "Recall studied history, cultures, creatures, and places.",
  },
  Vigilance: {
    display_name: "Vigilance",
    description: "Notice danger, hidden detail, and sudden change.",
  },
  Influence: {
    display_name: "Influence",
    description: "Negotiate, reassure, command attention, and read a room.",
  },
  Survival: {
    display_name: "Survival",
    description: "Navigate wild places, track signs, and endure exposure.",
  },
  Mysticism: {
    display_name: "Mysticism",
    description: "Recognize and carefully engage supernatural forces.",
  },
} satisfies Record<Discipline, DisplayMetadata>);

export const TARGET_METADATA = Object.freeze({
  10: {
    display_name: "Target 10",
    description: "A consequential test with generous footing.",
  },
  13: {
    display_name: "Target 13",
    description: "A demanding test suited to prepared adventurers.",
  },
  16: {
    display_name: "Target 16",
    description: "A severe test that rewards strong capability.",
  },
  19: {
    display_name: "Target 19",
    description: "An exceptional test with little room for error.",
  },
  22: {
    display_name: "Target 22",
    description: "An extraordinary test near the edge of mortal skill.",
  },
} satisfies Record<StandardTarget, DisplayMetadata>);

export const OUTCOME_METADATA = Object.freeze({
  Crisis: {
    display_name: "Crisis",
    description:
      "The attempt fails and the disclosed worst consequence follows.",
  },
  Setback: {
    display_name: "Setback",
    description:
      "The attempt falls short and the situation changes against the actor.",
  },
  Success: {
    display_name: "Success",
    description: "The attempt achieves its disclosed aim.",
  },
  Triumph: {
    display_name: "Triumph",
    description: "The attempt excels and earns its disclosed added benefit.",
  },
} satisfies Record<OutcomeDegree, DisplayMetadata>);

function defineCoreTerm(input: unknown): CoreTermContentDefinition {
  const validated = validateValue(CoreTermContentDefinitionSchema, input);
  if (!validated.success) {
    const detail = validated.issues
      .map(({ path, message }) => `${path}: ${message}`)
      .join("; ");
    throw new Error(`Invalid built-in core term: ${detail}`);
  }
  return Object.freeze(validated.value);
}

const attributeTerms = ATTRIBUTES.map((identifier) =>
  defineCoreTerm({
    schema_version: SCHEMA_VERSION,
    content_definition_id: `content_core_attribute_${identifier.toLowerCase()}`,
    kind: "core_term",
    payload: {
      category: "attribute",
      identifier,
      ...ATTRIBUTE_METADATA[identifier],
    },
  }),
);
const disciplineTerms = DISCIPLINES.map((identifier) =>
  defineCoreTerm({
    schema_version: SCHEMA_VERSION,
    content_definition_id: `content_core_discipline_${identifier.toLowerCase()}`,
    kind: "core_term",
    payload: {
      category: "discipline",
      identifier,
      ...DISCIPLINE_METADATA[identifier],
    },
  }),
);
const targetTerms = STANDARD_TARGETS.map((identifier) =>
  defineCoreTerm({
    schema_version: SCHEMA_VERSION,
    content_definition_id: `content_core_target_${identifier}`,
    kind: "core_term",
    payload: {
      category: "target",
      identifier,
      ...TARGET_METADATA[identifier],
    },
  }),
);
const outcomeTerms = OUTCOME_DEGREES.map((identifier) =>
  defineCoreTerm({
    schema_version: SCHEMA_VERSION,
    content_definition_id: `content_core_outcome_${identifier.toLowerCase()}`,
    kind: "core_term",
    payload: {
      category: "outcome_degree",
      identifier,
      ...OUTCOME_METADATA[identifier],
    },
  }),
);

export const CORE_TERM_CATALOG: readonly CoreTermContentDefinition[] =
  Object.freeze([
    ...attributeTerms,
    ...disciplineTerms,
    ...targetTerms,
    ...outcomeTerms,
  ]);

export interface UnavailableRegistry {
  readonly availability: "unavailable_in_phase_0";
  readonly definitions: readonly never[];
}

const unavailableRegistry = (): UnavailableRegistry =>
  Object.freeze({
    availability: "unavailable_in_phase_0",
    definitions: Object.freeze([]),
  });

export const FUTURE_CONTENT_REGISTRIES = Object.freeze({
  heritage_gifts: unavailableRegistry(),
  upbringings: unavailableRegistry(),
  archetypes: unavailableRegistry(),
  paths: unavailableRegistry(),
  talents: unavailableRegistry(),
  powers: unavailableRegistry(),
  enemies: unavailableRegistry(),
});
