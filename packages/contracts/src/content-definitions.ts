import { Type, type Static } from "@sinclair/typebox";
import { CoreTermContentDefinitionSchema } from "./core-content.js";
import {
  AbilityContentDefinitionSchema,
  BossOverlayContentDefinitionSchema,
  ChallengeContentDefinitionSchema,
  ConditionContentDefinitionSchema,
  EnemyContentDefinitionSchema,
  ObjectiveContentDefinitionSchema,
  PlayableOptionContentDefinitionSchema,
  RitualContentDefinitionSchema,
  SocialProfileContentDefinitionSchema,
} from "./content-mechanics.js";

export const ContentDefinitionSchema = Type.Union([
  CoreTermContentDefinitionSchema,
  PlayableOptionContentDefinitionSchema,
  AbilityContentDefinitionSchema,
  ConditionContentDefinitionSchema,
  EnemyContentDefinitionSchema,
  BossOverlayContentDefinitionSchema,
  ObjectiveContentDefinitionSchema,
  ChallengeContentDefinitionSchema,
  SocialProfileContentDefinitionSchema,
  RitualContentDefinitionSchema,
]);

export type ContentDefinition = Static<typeof ContentDefinitionSchema>;
