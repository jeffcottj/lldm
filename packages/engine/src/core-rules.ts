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
  starting_allocations: Object.freeze({
    rule_id: "rule_starting_allocations_v1",
    title: "Starting allocations",
    text: "Assign attribute ratings 2, 1, 1, and 0. Assign one discipline at 2, three at 1, and four at 0.",
  }),
} satisfies Record<string, CoreRuleDefinition>);
