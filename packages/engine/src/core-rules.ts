export interface CoreRuleDefinition {
  readonly rule_id: string;
  readonly title: string;
  readonly text: string;
}

export const CORE_RULES = Object.freeze({
  resolution_formula: Object.freeze({
    rule_id: "rule_resolution_formula_v1",
    title: "Check formula",
    text: "Add the d20 face, attribute rating, discipline rating, and normalized situational modifier; compare the total with the target.",
  }),
  edge_and_hindrance: Object.freeze({
    rule_id: "rule_edge_hindrance_v1",
    title: "Edge and Hindrance",
    text: "One Edge adds 2 and one Hindrance subtracts 2. Each is a flag, so neither stacks; when both apply, they remain visible and cancel.",
  }),
  outcome_degrees: Object.freeze({
    rule_id: "rule_outcome_degrees_v1",
    title: "Outcome degrees",
    text: "A target delta of -5 or less is Crisis; -4 through -1 is Setback; 0 through 4 is Success; and 5 or more is Triumph.",
  }),
  natural_faces: Object.freeze({
    rule_id: "rule_natural_faces_v1",
    title: "Natural faces",
    text: "A natural 1 lowers the base outcome by one degree and a natural 20 raises it by one degree. The result cannot move below Crisis or above Triumph, and a natural face cannot make an impossible action possible.",
  }),
  physical_rolls: Object.freeze({
    rule_id: "rule_physical_rolls_v1",
    title: "Physical rolls",
    text: "Use a physical d20 for permanent death, a declared irreversible stake, a named boss transition, a pivotal scene conclusion, or an eligible Spark invocation.",
  }),
  physical_disclosure: Object.freeze({
    rule_id: "rule_physical_disclosure_v1",
    title: "Pre-roll disclosure",
    text: "Before a physical roll, reveal the target, every modifier component, the final modifier, all four outcome consequences, the concrete stakes, the reason, the eligible roller, and the outcome for every die face.",
  }),
  spark: Object.freeze({
    rule_id: "rule_spark_v1",
    title: "Spark conversion",
    text: "Spending Spark converts an eligible unresolved simulated check to a physical roll and grants Edge before Edge and Hindrance cancel.",
  }),
  simulated_randomness: Object.freeze({
    rule_id: "rule_simulated_randomness_v1",
    title: "Recorded simulated randomness",
    text: "Routine draws use domain-separated HMAC-SHA-256 with a campaign seed, campaign and command identities, a stable purpose, and a purpose-local index. Unbiased realized values are recorded with resolved events; replay applies those facts without drawing again.",
  }),
  starting_allocations: Object.freeze({
    rule_id: "rule_starting_allocations_v1",
    title: "Starting allocations",
    text: "Assign attribute ratings 2, 1, 1, and 0. Assign one discipline at 2, three at 1, and four at 0.",
  }),
  playable_resources: Object.freeze({
    rule_id: "rule_playable_resources_v1",
    title: "Playable resources",
    text: "Rank-one Guard maxima are Vanguard 8, Maverick 7, Wayfinder 6, Envoy 6, Weaver 5, and Beacon 6. Every hero has 3 Exertion, one session Spark, and exactly three Wound slots. Shared Supply cannot exceed party size plus 2.",
  }),
  significant_gear: Object.freeze({
    rule_id: "rule_significant_gear_v1",
    title: "Significant gear",
    text: "Each occupied narrative gear slot binds to one pinned significant-gear definition when the hero is materialized. Ready gear grants its declared ability. Paying a ritual gear cost changes that exact slot to spent; interruption does not restore it.",
  }),
  rank_advancement: Object.freeze({
    rule_id: "rule_rank_advancement_v1",
    title: "Ordered rank advancement",
    text: "Advancement moves exactly one rank at a time. The command's expected rank names the hero's current rank; the pinned selected feature must be an eligible path at rank 2, talent at rank 3, or capstone at rank 4 with every prerequisite met.",
  }),
  recovery: Object.freeze({
    rule_id: "rule_recovery_v1",
    title: "Scene and rest recovery",
    text: "A scene transition fully restores Guard and Exertion and resets scene abilities. A costly rest spends 1 shared Supply and gives those benefits to participating heroes. Neither transition heals Wounds or restores Spark. Session start restores one Spark and its one complication recovery; Supply persists.",
  }),
  death_test: Object.freeze({
    rule_id: "rule_death_test_v1",
    title: "Physical death test",
    text: "Filling the third Wound requests a physical target-13 Force plus Athletics test. One eligible nearby ally may spend 1 Exertion or 1 Supply to grant Edge. Success clears the newest third Wound and leaves two Wounds; Triumph also records the permanent Scar Death’s Echo; Setback or Crisis is permanent death.",
  }),
  combat_flow: Object.freeze({
    rule_id: "rule_combat_flow_v1",
    title: "Round and side flow",
    text: "Heroes begin each round. Hero and enemy sides alternate; an exhausted side yields until both sides are exhausted. Then a new hero-first round restores one action, one maneuver, and one reaction to every eligible participant.",
  }),
  reaction_priority: Object.freeze({
    rule_id: "rule_reaction_priority_v1",
    title: "Reaction priority",
    text: "The directly affected actor receives first reaction priority, followed by heroes and then enemies in stable actor-ID order. The first used reaction closes the window; the window also closes after every eligible actor passes.",
  }),
  challenges: Object.freeze({
    rule_id: "rule_challenges_v1",
    title: "Progress and Danger",
    text: "Every challenge definition declares its Progress maximum, Danger maximum, and tie rule. The Phase 1 example uses Progress 4, Danger 3, and resolves a simultaneous fill with a cost.",
  }),
  social_shifts: Object.freeze({
    rule_id: "rule_social_shifts_v1",
    title: "Social stance shifts",
    text: "Crisis and Setback do not change stance. Success moves one step toward the requested stance. Triumph moves at most two steps toward it. No outcome can cross a declared hard limit or compel impossible behavior.",
  }),
  ritual_resolution: Object.freeze({
    rule_id: "rule_ritual_resolution_v1",
    title: "Ritual resolution",
    text: "A ritual starts only after every declared requirement is established and every declared cost is payable. Costs are paid once in order. Success or Triumph completes the ritual; Setback or Crisis fails it; the matching definition consequence applies in either case.",
  }),
  ritual_interruption: Object.freeze({
    rule_id: "rule_ritual_interruption_v1",
    title: "Ritual interruption",
    text: "Interrupting a ritual closes it as interrupted. Paid costs remain spent, unpaid costs remain untouched, and another attempt starts a new ritual.",
  }),
  condition_duration: Object.freeze({
    rule_id: "rule_condition_duration_v1",
    title: "Condition duration",
    text: "A round condition expires at the next round transition, a scene condition at the next scene transition, and an until-removed condition only through an explicit removal effect.",
  }),
} satisfies Record<string, CoreRuleDefinition>);
