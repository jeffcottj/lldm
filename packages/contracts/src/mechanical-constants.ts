export const ARCHETYPE_GUARD_MAXIMA = Object.freeze({
  Vanguard: 8,
  Maverick: 7,
  Wayfinder: 6,
  Envoy: 6,
  Weaver: 5,
  Beacon: 6,
} as const);

export const EXERTION_MAXIMUM = 3 as const;
export const COSTLY_REST_SUPPLY_COST = 1 as const;
export const DEATH_TEST_TARGET = 13 as const;
export const DEATH_TEST_ATTRIBUTE = "Force" as const;
export const DEATH_TEST_DISCIPLINE = "Athletics" as const;
export const DEATH_TEST_AID_COST = 1 as const;
export const PHASE_1_DEATH_SCAR_NAME = "Death’s Echo" as const;
export const COMBAT_FIRST_SIDE = "hero" as const;
export const VERTICAL_SLICE_PROGRESS_MAXIMUM = 4 as const;
export const VERTICAL_SLICE_DANGER_MAXIMUM = 3 as const;
export const VERTICAL_SLICE_CHALLENGE_TIE_RULE = "resolved_with_cost" as const;

export const CONDITION_DURATIONS = ["round", "scene", "until_removed"] as const;

export type ArchetypeName = keyof typeof ARCHETYPE_GUARD_MAXIMA;
export type ConditionDuration = (typeof CONDITION_DURATIONS)[number];
