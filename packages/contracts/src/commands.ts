import { Type, type Static } from "@sinclair/typebox";
import {
  ResolveCheckCommandSchema,
  SubmitDieResultCommandSchema,
} from "./checks.js";
import {
  AidDeathTestCommandSchema,
  ChooseHeroActivationCommandSchema,
  ExecuteCombatActionCommandSchema,
  OpenReactionWindowCommandSchema,
  ResolveReactionCommandSchema,
  SelectEnemyFallbackCommandSchema,
  StartCombatCommandSchema,
} from "./domains/combat.js";
import {
  AdvanceChallengeCommandSchema,
  StartChallengeCommandSchema,
} from "./domains/challenges.js";
import {
  AdvanceRankCommandSchema,
  AdvanceSceneCommandSchema,
  MaterializeCharacterCommandSchema,
  RecoverResourceCommandSchema,
  RecoverSparkComplicationCommandSchema,
  SpendResourceCommandSchema,
  TakeCostlyRestCommandSchema,
} from "./domains/playable-characters.js";
import {
  ContributeRitualCommandSchema,
  InterruptRitualCommandSchema,
  ResolveRitualCommandSchema,
  StartRitualCommandSchema,
} from "./domains/rituals.js";
import {
  AttemptSocialShiftCommandSchema,
  CreateLeverageCommandSchema,
  EstablishSocialStateCommandSchema,
  SpendLeverageCommandSchema,
} from "./domains/social.js";

export const GameCommandSchema = Type.Union([
  ResolveCheckCommandSchema,
  SubmitDieResultCommandSchema,
  MaterializeCharacterCommandSchema,
  SpendResourceCommandSchema,
  RecoverResourceCommandSchema,
  RecoverSparkComplicationCommandSchema,
  TakeCostlyRestCommandSchema,
  AdvanceSceneCommandSchema,
  AdvanceRankCommandSchema,
  StartCombatCommandSchema,
  ChooseHeroActivationCommandSchema,
  ExecuteCombatActionCommandSchema,
  SelectEnemyFallbackCommandSchema,
  OpenReactionWindowCommandSchema,
  ResolveReactionCommandSchema,
  AidDeathTestCommandSchema,
  StartChallengeCommandSchema,
  AdvanceChallengeCommandSchema,
  EstablishSocialStateCommandSchema,
  AttemptSocialShiftCommandSchema,
  CreateLeverageCommandSchema,
  SpendLeverageCommandSchema,
  StartRitualCommandSchema,
  ContributeRitualCommandSchema,
  ResolveRitualCommandSchema,
  InterruptRitualCommandSchema,
]);
export { GameCommandSchema as ClientCommandSchema };

export type GameCommand = Static<typeof GameCommandSchema>;
export type ClientCommand = GameCommand;
