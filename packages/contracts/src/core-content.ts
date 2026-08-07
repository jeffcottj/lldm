import { Type, type Static } from "@sinclair/typebox";
import {
  AttributeSchema,
  DisciplineSchema,
  OutcomeDegreeSchema,
  StandardTargetSchema,
} from "./checks.js";
import { contentDefinitionEnvelope, strictObject } from "./envelopes.js";

const CoreTermTextSchema = Type.String({ minLength: 1, maxLength: 160 });

export const CoreTermPayloadSchema = Type.Union([
  strictObject({
    category: Type.Literal("attribute"),
    identifier: AttributeSchema,
    display_name: CoreTermTextSchema,
    description: CoreTermTextSchema,
  }),
  strictObject({
    category: Type.Literal("discipline"),
    identifier: DisciplineSchema,
    display_name: CoreTermTextSchema,
    description: CoreTermTextSchema,
  }),
  strictObject({
    category: Type.Literal("target"),
    identifier: StandardTargetSchema,
    display_name: CoreTermTextSchema,
    description: CoreTermTextSchema,
  }),
  strictObject({
    category: Type.Literal("outcome_degree"),
    identifier: OutcomeDegreeSchema,
    display_name: CoreTermTextSchema,
    description: CoreTermTextSchema,
  }),
]);

export const CoreTermContentDefinitionSchema = contentDefinitionEnvelope(
  Type.Literal("core_term"),
  CoreTermPayloadSchema,
);
export type CoreTermPayload = Static<typeof CoreTermPayloadSchema>;
export type CoreTermContentDefinition = Static<
  typeof CoreTermContentDefinitionSchema
>;
