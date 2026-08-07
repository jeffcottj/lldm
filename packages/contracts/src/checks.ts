import { Type, type Static } from "@sinclair/typebox";
import {
  commandEnvelope,
  eventEnvelope,
  projectionEnvelope,
  proposalEnvelope,
  strictObject,
  transportEnvelope,
} from "./envelopes.js";
import { ActorIdSchema, SeatIdSchema } from "./ids.js";
import { SchemaVersionSchema } from "./versions.js";

export const ATTRIBUTES = ["Force", "Finesse", "Insight", "Presence"] as const;
export const DISCIPLINES = [
  "Athletics",
  "Subterfuge",
  "Craft",
  "Lore",
  "Vigilance",
  "Influence",
  "Survival",
  "Mysticism",
] as const;
export const STANDARD_TARGETS = [10, 13, 16, 19, 22] as const;
export const OUTCOME_DEGREES = [
  "Crisis",
  "Setback",
  "Success",
  "Triumph",
] as const;
export const PHYSICAL_ROLL_REASONS = [
  "permanent_death",
  "declared_irreversible_stake",
  "named_boss_transition",
  "pivotal_scene_conclusion",
  "spark_invocation",
] as const;

export const AttributeSchema = Type.Union(
  ATTRIBUTES.map((attribute) => Type.Literal(attribute)),
);
export const DisciplineSchema = Type.Union(
  DISCIPLINES.map((discipline) => Type.Literal(discipline)),
);
export const StandardTargetSchema = Type.Union(
  STANDARD_TARGETS.map((target) => Type.Literal(target)),
);
export const OutcomeDegreeSchema = Type.Union(
  OUTCOME_DEGREES.map((degree) => Type.Literal(degree)),
);
export const PhysicalRollReasonSchema = Type.Union(
  PHYSICAL_ROLL_REASONS.map((reason) => Type.Literal(reason)),
);
export const DieFaceSchema = Type.Integer({ minimum: 1, maximum: 20 });
export const AttributeRatingSchema = Type.Union([
  Type.Literal(0),
  Type.Literal(1),
  Type.Literal(2),
]);
export const DisciplineRatingSchema = Type.Union([
  Type.Literal(0),
  Type.Literal(1),
  Type.Literal(2),
]);
export const ModifierStateSchema = strictObject({
  edge: Type.Boolean(),
  hindrance: Type.Boolean(),
});

const ConcreteTextSchema = Type.String({ minLength: 1, maxLength: 240 });

function consequenceSchema<Degree extends (typeof OUTCOME_DEGREES)[number]>(
  degree: Degree,
) {
  return strictObject({
    degree: Type.Literal(degree),
    consequence: ConcreteTextSchema,
  });
}

export const OutcomeConsequencesSchema = Type.Tuple([
  consequenceSchema("Crisis"),
  consequenceSchema("Setback"),
  consequenceSchema("Success"),
  consequenceSchema("Triumph"),
]);

export const CheckRequestSchema = strictObject({
  schema_version: SchemaVersionSchema,
  actor_id: ActorIdSchema,
  attribute: AttributeSchema,
  attribute_rating: AttributeRatingSchema,
  discipline: DisciplineSchema,
  discipline_rating: DisciplineRatingSchema,
  target: StandardTargetSchema,
  modifier_state: ModifierStateSchema,
  visibility: Type.Union([
    Type.Literal("public"),
    Type.Literal("eligible_roller"),
  ]),
  stakes: ConcreteTextSchema,
  outcome_bands: OutcomeConsequencesSchema,
  action_feasibility: Type.Literal("possible"),
  spark_eligible: Type.Boolean(),
  eligible_roller: Type.Optional(SeatIdSchema),
});

export const ImpossibleCheckRejectionSchema = strictObject({
  schema_version: SchemaVersionSchema,
  actor_id: ActorIdSchema,
  action_feasibility: Type.Literal("impossible"),
  code: Type.Literal("action_impossible"),
  reason: ConcreteTextSchema,
});

export const ModifierBreakdownSchema = strictObject({
  attribute: strictObject({
    name: AttributeSchema,
    value: AttributeRatingSchema,
  }),
  discipline: strictObject({
    name: DisciplineSchema,
    value: DisciplineRatingSchema,
  }),
  edge: strictObject({
    active: Type.Boolean(),
    value: Type.Union([Type.Literal(0), Type.Literal(2)]),
  }),
  hindrance: strictObject({
    active: Type.Boolean(),
    value: Type.Union([Type.Literal(-2), Type.Literal(0)]),
  }),
  situational_modifier: Type.Union([
    Type.Literal(-2),
    Type.Literal(0),
    Type.Literal(2),
  ]),
});

const ResolvedCheckCommon = {
  schema_version: SchemaVersionSchema,
  actor_id: ActorIdSchema,
  die_face: DieFaceSchema,
  modifier_breakdown: ModifierBreakdownSchema,
  final_modifier: Type.Integer({ minimum: -2, maximum: 6 }),
  total: Type.Integer({ minimum: -1, maximum: 26 }),
  target: StandardTargetSchema,
  target_delta: Type.Integer({ minimum: -23, maximum: 16 }),
  base_degree: OutcomeDegreeSchema,
  natural_face_adjustment: Type.Union([
    Type.Literal(-1),
    Type.Literal(0),
    Type.Literal(1),
  ]),
  final_degree: OutcomeDegreeSchema,
};

export const SimulatedResolvedCheckSchema = strictObject({
  ...ResolvedCheckCommon,
  roll_mode: Type.Literal("simulated"),
});
export const PhysicalResolvedCheckSchema = strictObject({
  ...ResolvedCheckCommon,
  roll_mode: Type.Literal("physical"),
  physical_reason: PhysicalRollReasonSchema,
});
export const ResolvedCheckSchema = Type.Union([
  SimulatedResolvedCheckSchema,
  PhysicalResolvedCheckSchema,
]);

export const FaceOutcomeSchema = strictObject({
  face: DieFaceSchema,
  degree: OutcomeDegreeSchema,
  consequence: ConcreteTextSchema,
});

function faceOutcomeFor<Face extends number>(face: Face) {
  return strictObject({
    face: Type.Literal(face),
    degree: OutcomeDegreeSchema,
    consequence: ConcreteTextSchema,
  });
}

export const PhysicalRollDisclosureSchema = strictObject({
  schema_version: SchemaVersionSchema,
  actor_id: ActorIdSchema,
  target: StandardTargetSchema,
  modifier_breakdown: ModifierBreakdownSchema,
  final_modifier: Type.Integer({ minimum: -2, maximum: 6 }),
  outcome_bands: OutcomeConsequencesSchema,
  stakes: ConcreteTextSchema,
  reason: PhysicalRollReasonSchema,
  eligible_roller: SeatIdSchema,
  face_to_outcome: Type.Tuple([
    faceOutcomeFor(1),
    faceOutcomeFor(2),
    faceOutcomeFor(3),
    faceOutcomeFor(4),
    faceOutcomeFor(5),
    faceOutcomeFor(6),
    faceOutcomeFor(7),
    faceOutcomeFor(8),
    faceOutcomeFor(9),
    faceOutcomeFor(10),
    faceOutcomeFor(11),
    faceOutcomeFor(12),
    faceOutcomeFor(13),
    faceOutcomeFor(14),
    faceOutcomeFor(15),
    faceOutcomeFor(16),
    faceOutcomeFor(17),
    faceOutcomeFor(18),
    faceOutcomeFor(19),
    faceOutcomeFor(20),
  ]),
});

const SimulatedResolutionPayloadSchema = strictObject({
  request: CheckRequestSchema,
  die_face: DieFaceSchema,
  roll_mode: Type.Literal("simulated"),
});
const PhysicalResolutionPayloadSchema = strictObject({
  request: CheckRequestSchema,
  die_face: DieFaceSchema,
  roll_mode: Type.Literal("physical"),
  physical_reason: PhysicalRollReasonSchema,
});

export const ResolveCheckCommandSchema = commandEnvelope(
  Type.Literal("resolve_check"),
  Type.Union([
    SimulatedResolutionPayloadSchema,
    PhysicalResolutionPayloadSchema,
  ]),
);
export const CheckResolvedEventSchema = eventEnvelope(
  Type.Literal("check_resolved"),
  strictObject({ result: ResolvedCheckSchema }),
);
export const PhysicalRollRequestedEventSchema = eventEnvelope(
  Type.Literal("physical_roll_requested"),
  strictObject({ disclosure: PhysicalRollDisclosureSchema }),
);
export const ProposeCheckProposalSchema = proposalEnvelope(
  Type.Literal("propose_check"),
  strictObject({ request: CheckRequestSchema }),
);
export const CheckPreviewProjectionSchema = projectionEnvelope(
  Type.Literal("check_preview"),
  strictObject({ request: CheckRequestSchema }),
);
export const CheckPreviewTransportMessageSchema = transportEnvelope(
  Type.Literal("check_preview"),
  CheckPreviewProjectionSchema,
);

export const ClientCommandSchema = Type.Union([ResolveCheckCommandSchema]);
export const GameEventSchema = Type.Union([
  CheckResolvedEventSchema,
  PhysicalRollRequestedEventSchema,
]);
export const BoundedProposalSchema = Type.Union([ProposeCheckProposalSchema]);
export const ProjectionSchema = Type.Union([CheckPreviewProjectionSchema]);
export const TransportMessageSchema = Type.Union([
  CheckPreviewTransportMessageSchema,
]);

export type Attribute = Static<typeof AttributeSchema>;
export type Discipline = Static<typeof DisciplineSchema>;
export type StandardTarget = Static<typeof StandardTargetSchema>;
export type OutcomeDegree = Static<typeof OutcomeDegreeSchema>;
export type PhysicalRollReason = Static<typeof PhysicalRollReasonSchema>;
export type DieFace = Static<typeof DieFaceSchema>;
export type AttributeRating = Static<typeof AttributeRatingSchema>;
export type DisciplineRating = Static<typeof DisciplineRatingSchema>;
export type ModifierState = Static<typeof ModifierStateSchema>;
export type OutcomeConsequences = Static<typeof OutcomeConsequencesSchema>;
export type CheckRequest = Static<typeof CheckRequestSchema>;
export type ImpossibleCheckRejection = Static<
  typeof ImpossibleCheckRejectionSchema
>;
export type ModifierBreakdown = Static<typeof ModifierBreakdownSchema>;
export type ResolvedCheck = Static<typeof ResolvedCheckSchema>;
export type PhysicalRollDisclosure = Static<
  typeof PhysicalRollDisclosureSchema
>;
export type ClientCommand = Static<typeof ClientCommandSchema>;
export type GameEvent = Static<typeof GameEventSchema>;
export type BoundedProposal = Static<typeof BoundedProposalSchema>;
export type Projection = Static<typeof ProjectionSchema>;
export type TransportMessage = Static<typeof TransportMessageSchema>;
