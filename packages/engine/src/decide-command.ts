import {
  ARCHETYPE_GUARD_MAXIMA,
  COSTLY_REST_SUPPLY_COST,
  EXERTION_MAXIMUM,
  PhysicalRollDisclosureSchema,
  SCHEMA_VERSION,
  type CharacterRank,
  type CommandRejectionCode,
  type ConditionId,
  type ContentDefinition,
  type ContentDefinitionId,
  type ContentManifestHash,
  type DieFace,
  type GameCommand,
  type GameEvent,
  type GameState,
  type LegalActionId,
  type MechanicalEffect,
  type PendingCheckId,
  type PlayableCharacterState,
  type PhysicalRollNonce,
  type RandomDrawRecord,
  type RandomPurpose,
  type ResolvedContentReference,
  type ScarId,
  type WoundId,
  validateCharacterFoundation,
  validatePlayableCharacterState,
  validateRankAdvancement,
  validateResourceTransition,
  validateSparkRecoveryEligibility,
  validateValue,
} from "@lldm/contracts";
import { selectPhysicalRoll } from "./physical-rolls.js";
import { resolveCheck } from "./resolution.js";
import {
  decideAidDeathTest,
  decideChooseHeroActivation,
  decideExecuteCombatAction,
  decideOpenReactionWindow,
  decideResolveReaction,
  decideSelectEnemyFallback,
  decideStartCombat,
  eventsForDeathTestResult,
  eventsForPendingCombatResolution,
} from "./combat-decisions.js";
import {
  decideAdvanceChallenge,
  decideAttemptSocialShift,
  decideContributeRitual,
  decideCreateLeverage,
  decideEstablishSocialState,
  decideInterruptRitual,
  decideResolveRitual,
  decideSpendLeverage,
  decideStartChallenge,
  decideStartRitual,
  eventsForChallengeResult,
  eventsForRitualResult,
  eventsForSocialResult,
} from "./subsystem-decisions.js";

export type DomainEventProposal<Event extends GameEvent = GameEvent> =
  Event extends GameEvent ? Pick<Event, "kind" | "payload"> : never;

export type CommandDecision =
  | {
      readonly accepted: true;
      readonly events: readonly DomainEventProposal[];
    }
  | {
      readonly accepted: false;
      readonly rejection_code: CommandRejectionCode;
      readonly safe_detail: string;
    };

type RejectedDecision = Extract<CommandDecision, { accepted: false }>;

export interface EngineRandomSource {
  draw(input: {
    readonly purpose: RandomPurpose;
    readonly purpose_local_index: number;
    readonly minimum: number;
    readonly maximum: number;
  }): RandomDrawRecord;
}

export interface EngineContentCatalog {
  readonly content_manifest_hash: ContentManifestHash;
  readonly definitions: readonly ContentDefinition[];
}

export interface CommandDecisionInput {
  readonly state: GameState;
  readonly command: GameCommand;
  readonly random?: EngineRandomSource;
  readonly catalog?: EngineContentCatalog;
  readonly pending_check_id?: PendingCheckId;
  readonly submission_nonce?: PhysicalRollNonce;
  readonly legal_action_id_for?: (stable_key: string) => LegalActionId;
  readonly wound_id?: WoundId;
  readonly death_pending_check_id?: PendingCheckId;
  readonly death_submission_nonce?: PhysicalRollNonce;
  readonly condition_id?: ConditionId;
  readonly scar_id?: ScarId;
}

function definitionReference(
  definition: ContentDefinition,
): ResolvedContentReference {
  return {
    content_definition_id: definition.content_definition_id,
    definition_revision: definition.definition_revision,
  };
}

function definitionByReference(
  catalog: EngineContentCatalog,
  reference: ResolvedContentReference,
): ContentDefinition | undefined {
  return catalog.definitions.find(
    (definition) =>
      definition.content_definition_id === reference.content_definition_id &&
      definition.definition_revision === reference.definition_revision,
  );
}

function definitionById(
  catalog: EngineContentCatalog,
  id: ContentDefinitionId,
): ContentDefinition | undefined {
  const matches = catalog.definitions.filter(
    ({ content_definition_id }) => content_definition_id === id,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function requirePinnedCatalog(
  input: CommandDecisionInput,
): EngineContentCatalog | RejectedDecision {
  if (input.catalog === undefined) {
    return reject("This command requires the pinned content catalog.");
  }
  if (
    input.catalog.content_manifest_hash !== input.state.content_manifest_hash
  ) {
    return reject("The supplied catalog is not pinned by this campaign.");
  }
  return input.catalog;
}

function isRejectedCatalog(
  value: EngineContentCatalog | RejectedDecision,
): value is RejectedDecision {
  return "accepted" in value;
}

function effectsForDefinition(
  definition: ContentDefinition,
): readonly MechanicalEffect[] {
  switch (definition.kind) {
    case "playable_option":
      return definition.payload.tactical_effects;
    case "ability":
    case "condition":
    case "boss_overlay":
      return definition.payload.effects;
    case "objective":
      return definition.payload.completion_effects;
    case "ritual":
      return definition.payload.consequences.flatMap(({ effects }) => effects);
    case "core_term":
    case "enemy":
    case "challenge":
    case "social_profile":
      return [];
    default:
      return assertNever(definition);
  }
}

function ownedContentReferences(
  character: PlayableCharacterState,
): readonly ResolvedContentReference[] {
  return [
    ...Object.values(character.resolved_options).filter(
      (reference): reference is ResolvedContentReference => reference !== null,
    ),
    ...character.resolved_significant_gear.flatMap((gear) =>
      gear.status === "ready" ? [gear.definition] : [],
    ),
  ];
}

function prerequisiteSatisfied(
  character: PlayableCharacterState,
  requestedRank: CharacterRank,
  prerequisite: Extract<
    Extract<
      ContentDefinition,
      { kind: "playable_option" }
    >["payload"]["prerequisites"],
    readonly unknown[]
  >[number],
): boolean {
  if (prerequisite.kind === "rank") {
    return requestedRank >= prerequisite.minimum_rank;
  }
  const owned = ownedContentReferences(character);
  if (prerequisite.kind === "archetype") {
    return (
      character.resolved_options.archetype.content_definition_id ===
        prerequisite.required.content_definition_id &&
      character.resolved_options.archetype.definition_revision ===
        prerequisite.required.definition_revision
    );
  }
  return owned.some(
    (reference) =>
      reference.content_definition_id ===
        prerequisite.required.content_definition_id &&
      reference.definition_revision ===
        prerequisite.required.definition_revision,
  );
}

function playableOption(
  catalog: EngineContentCatalog,
  id: ContentDefinitionId,
  category: Extract<
    ContentDefinition,
    { kind: "playable_option" }
  >["payload"]["category"],
  rank: CharacterRank,
  availability?: "production",
): Extract<ContentDefinition, { kind: "playable_option" }> | undefined {
  const definition = definitionById(catalog, id);
  return definition?.kind === "playable_option" &&
    definition.payload.category === category &&
    definition.payload.rank === rank &&
    (availability === undefined ||
      definition.payload.availability === availability)
    ? definition
    : undefined;
}

function decideMaterializeCharacter(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "materialize_character" }>;
  },
): CommandDecision {
  const catalog = requirePinnedCatalog(input);
  if (isRejectedCatalog(catalog)) return catalog;
  const foundationResult = validateCharacterFoundation(
    input.command.payload.foundation,
  );
  if (!foundationResult.success) {
    return reject("The character foundation fails semantic validation.");
  }
  const foundation = foundationResult.value;
  if (input.state.party.characters.length >= 5) {
    return reject("The campaign already has the maximum five heroes.");
  }
  if (
    input.state.party.characters.some(
      ({ character_id, foundation: existing }) =>
        character_id === foundation.character_id ||
        existing.actor_id === foundation.actor_id,
    )
  ) {
    return reject("The character or actor identity is already materialized.");
  }
  const heritage = playableOption(
    catalog,
    foundation.heritage_gift_ref,
    "heritage_gift",
    1,
    "production",
  );
  const upbringing = playableOption(
    catalog,
    foundation.upbringing_ref,
    "upbringing",
    1,
    "production",
  );
  const archetype = playableOption(
    catalog,
    foundation.archetype_ref,
    "archetype",
    1,
    "production",
  );
  if (
    heritage === undefined ||
    upbringing === undefined ||
    archetype === undefined
  ) {
    return reject("A required rank-one production option is unavailable.");
  }
  const signatureDefinitions = archetype.payload.granted_ability_ids
    .map((id) => definitionById(catalog, id))
    .filter(
      (
        definition,
      ): definition is Extract<ContentDefinition, { kind: "ability" }> =>
        definition?.kind === "ability" &&
        definition.payload.category === "signature_technique",
    );
  if (signatureDefinitions.length !== 1) {
    return reject("The archetype must grant exactly one signature technique.");
  }
  const guardEffects = archetype.payload.tactical_effects.filter(
    (
      effect,
    ): effect is Extract<MechanicalEffect, { kind: "adjust_resource" }> =>
      effect.kind === "adjust_resource" &&
      effect.resource === "guard" &&
      effect.target === "self" &&
      effect.amount > 0,
  );
  if (guardEffects.length !== 1) {
    return reject("The archetype must declare exactly one Guard maximum.");
  }
  const guardMaximum = guardEffects[0]?.amount;
  const expectedGuardMaximum =
    ARCHETYPE_GUARD_MAXIMA[
      archetype.payload.display_name as keyof typeof ARCHETYPE_GUARD_MAXIMA
    ];
  if (
    guardMaximum === undefined ||
    expectedGuardMaximum === undefined ||
    guardMaximum !== expectedGuardMaximum
  ) {
    return reject("The archetype does not match a Phase 1 Guard maximum.");
  }
  const signature = signatureDefinitions[0];
  if (signature === undefined) {
    return reject("The signature technique is unavailable.");
  }
  const resolvedSignificantGear = input.command.payload.significant_gear.map(
    (selection, index) => {
      const narrative = foundation.significant_gear[index];
      if (narrative === undefined || narrative.item === null) {
        return selection.definition === null
          ? { slot: selection.slot, definition: null, status: "empty" as const }
          : null;
      }
      const definition =
        selection.definition === null
          ? undefined
          : definitionByReference(catalog, selection.definition);
      return definition?.kind === "ability" &&
        definition.payload.category === "significant_gear"
        ? {
            slot: selection.slot,
            definition: definitionReference(definition),
            status: "ready" as const,
          }
        : null;
    },
  );
  if (resolvedSignificantGear.some((gear) => gear === null)) {
    return reject(
      "Each occupied significant-gear slot requires a pinned gear definition, and empty slots require null.",
    );
  }
  const characterResult = validatePlayableCharacterState({
    schema_version: SCHEMA_VERSION,
    record_kind: "playable_character_state",
    character_id: foundation.character_id,
    foundation,
    rank: 1,
    resolved_options: {
      heritage_gift: definitionReference(heritage),
      upbringing: definitionReference(upbringing),
      archetype: definitionReference(archetype),
      path: null,
      talent: null,
      capstone: null,
      signature_technique: definitionReference(signature),
    },
    resources: {
      guard: { current: guardMaximum, maximum: guardMaximum },
      wounds: [
        { slot: 1, status: "empty" },
        { slot: 2, status: "empty" },
        { slot: 3, status: "empty" },
      ],
      exertion: { current: EXERTION_MAXIMUM, maximum: EXERTION_MAXIMUM },
      spark: { available: true, complication_recovery_used: false },
    },
    significant_gear: foundation.significant_gear,
    resolved_significant_gear: resolvedSignificantGear,
    scene_ability_uses: [
      { ability: definitionReference(signature), used: false },
    ],
    conditions: [],
  });
  if (!characterResult.success) {
    return reject("Resolved content did not produce a valid playable hero.");
  }
  return {
    accepted: true,
    events: [
      {
        kind: "character_materialized",
        payload: { character: characterResult.value },
      },
    ],
  };
}

function characterById(state: GameState, characterId: string) {
  return state.party.characters.find(
    ({ character_id }) => character_id === characterId,
  );
}

function decideSpendResource(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "spend_resource" }>;
  },
): CommandDecision {
  const { command, state } = input;
  const character = characterById(state, command.payload.character_id);
  if (character === undefined) return reject("Resource owner is not playable.");
  const current =
    command.payload.resource === "supply"
      ? state.party.supply
      : character.resources.exertion.current;
  const maximum =
    command.payload.resource === "supply"
      ? state.party.supply_maximum
      : character.resources.exertion.maximum;
  const transition = validateResourceTransition({
    resource: command.payload.resource,
    current,
    delta: -command.payload.amount,
    maximum,
  });
  if (!transition.success) return reject("The resource cost would underflow.");
  return {
    accepted: true,
    events: [
      {
        kind: "resource_changed",
        payload: {
          owner:
            command.payload.resource === "supply"
              ? { scope: "party" }
              : { scope: "character", character_id: character.character_id },
          resource: command.payload.resource,
          previous: current,
          current: transition.value,
          reason: command.payload.reason,
        },
      },
    ],
  };
}

function decideRecoverResource(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "recover_resource" }>;
  },
): CommandDecision {
  const catalog = requirePinnedCatalog(input);
  if (isRejectedCatalog(catalog)) return catalog;
  const { command, state } = input;
  const character = characterById(state, command.payload.character_id);
  if (character === undefined) return reject("Resource owner is not playable.");
  const source = definitionByReference(catalog, command.payload.source);
  if (source === undefined) return reject("Recovery source is unavailable.");
  const expectedTarget =
    command.payload.resource === "supply" ? "party" : "self";
  const authorized = effectsForDefinition(source).some(
    (effect) =>
      effect.kind === "adjust_resource" &&
      effect.resource === command.payload.resource &&
      effect.target === expectedTarget &&
      effect.amount === command.payload.amount,
  );
  if (!authorized) {
    return reject("The pinned content does not authorize this recovery.");
  }
  const current =
    command.payload.resource === "supply"
      ? state.party.supply
      : character.resources[command.payload.resource].current;
  const maximum =
    command.payload.resource === "supply"
      ? state.party.supply_maximum
      : character.resources[command.payload.resource].maximum;
  const transition = validateResourceTransition({
    resource: command.payload.resource,
    current,
    delta: command.payload.amount,
    maximum,
  });
  if (!transition.success) return reject("The recovery would overflow.");
  return {
    accepted: true,
    events: [
      {
        kind: "resource_changed",
        payload: {
          owner:
            command.payload.resource === "supply"
              ? { scope: "party" }
              : { scope: "character", character_id: character.character_id },
          resource: command.payload.resource,
          previous: current,
          current: transition.value,
          reason: `Recovery from ${source.content_definition_id}@${source.definition_revision}.`,
        },
      },
    ],
  };
}

function decideRecoverSpark(
  input: CommandDecisionInput & {
    readonly command: Extract<
      GameCommand,
      { kind: "recover_spark_complication" }
    >;
  },
): CommandDecision {
  const character = characterById(
    input.state,
    input.command.payload.character_id,
  );
  if (character === undefined) return reject("Spark owner is not playable.");
  const eligibility = validateSparkRecoveryEligibility(
    character.resources.spark,
  );
  if (!eligibility.success)
    return reject(
      eligibility.issues[0]?.message ?? "Spark recovery is illegal.",
    );
  return {
    accepted: true,
    events: [
      {
        kind: "spark_recovered",
        payload: {
          character_id: character.character_id,
          basis: input.command.payload.basis,
          complication: input.command.payload.complication,
        },
      },
    ],
  };
}

function decideCostlyRest(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "take_costly_rest" }>;
  },
): CommandDecision {
  const missing = input.command.payload.character_ids.some(
    (id) => characterById(input.state, id) === undefined,
  );
  if (missing) return reject("Every resting hero must be playable.");
  const supply = validateResourceTransition({
    resource: "supply",
    current: input.state.party.supply,
    delta: -COSTLY_REST_SUPPLY_COST,
    maximum: input.state.party.supply_maximum,
  });
  if (!supply.success)
    return reject("The party cannot pay the costly-rest Supply.");
  return {
    accepted: true,
    events: [
      {
        kind: "costly_rest_completed",
        payload: {
          character_ids: input.command.payload.character_ids,
          supply_spent: COSTLY_REST_SUPPLY_COST,
        },
      },
    ],
  };
}

function decideAdvanceScene(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "advance_scene" }>;
  },
): CommandDecision {
  const { payload } = input.command;
  if (payload.scene_id !== input.state.scene_id) {
    return reject("The current scene does not match the scene boundary.");
  }
  if (payload.scene_id === null && payload.boundary !== "session_start") {
    return reject("Only a session start may establish the first scene.");
  }
  if (payload.scene_id === payload.next_scene_id) {
    return reject("A scene transition requires a different next scene.");
  }
  return {
    accepted: true,
    events: [
      {
        kind: "scene_resources_reset",
        payload: {
          ...payload,
          reset_character_ids: input.state.party.characters.map(
            ({ character_id }) => character_id,
          ),
        },
      },
    ],
  };
}

function decideAdvanceRank(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "advance_rank" }>;
  },
): CommandDecision {
  const catalog = requirePinnedCatalog(input);
  if (isRejectedCatalog(catalog)) return catalog;
  const character = characterById(
    input.state,
    input.command.payload.character_id,
  );
  if (character === undefined) return reject("Rank owner is not playable.");
  if (character.rank !== input.command.payload.expected_rank) {
    return reject("The hero's current rank does not match expected_rank.");
  }
  const requestedRank = character.rank + 1;
  const category = { 2: "path", 3: "talent", 4: "capstone" }[requestedRank];
  const selected = definitionByReference(
    catalog,
    input.command.payload.selected_feature,
  );
  const option =
    selected?.kind === "playable_option" &&
    selected.payload.category === category
      ? selected
      : undefined;
  const transition = validateRankAdvancement({
    current_rank: character.rank,
    requested_rank: requestedRank,
    required_content_available: option !== undefined,
  });
  if (!transition.success || option === undefined) {
    return reject(
      transition.success
        ? "The selected rank feature is unavailable."
        : (transition.issues[0]?.message ?? "Rank advancement is illegal."),
    );
  }
  if (option.payload.rank !== transition.value) {
    return reject("The selected feature belongs to a different rank.");
  }
  if (
    ownedContentReferences(character).some(
      (reference) =>
        reference.content_definition_id === option.content_definition_id,
    )
  ) {
    return reject("The selected feature is already granted.");
  }
  if (
    !option.payload.prerequisites.every((prerequisite) =>
      prerequisiteSatisfied(character, transition.value, prerequisite),
    )
  ) {
    return reject("The selected feature prerequisites are not met.");
  }
  return {
    accepted: true,
    events: [
      {
        kind: "rank_advanced",
        payload: {
          character_id: character.character_id,
          previous_rank: character.rank,
          current_rank: transition.value,
          feature: definitionReference(option),
        },
      },
    ],
  };
}

export type LegalCharacterAction =
  | {
      readonly kind: "use_ability";
      readonly ability: ResolvedContentReference;
    }
  | {
      readonly kind: "spend_resource";
      readonly resource: "exertion" | "supply";
      readonly maximum_amount: number;
    }
  | { readonly kind: "recover_spark_complication" }
  | { readonly kind: "take_costly_rest" }
  | {
      readonly kind: "advance_rank";
      readonly selected_feature: ResolvedContentReference;
    };

export function enumerateLegalCharacterActions(input: {
  readonly state: GameState;
  readonly catalog: EngineContentCatalog;
  readonly character_id: string;
}): readonly LegalCharacterAction[] {
  const character = characterById(input.state, input.character_id);
  if (
    character === undefined ||
    input.catalog.content_manifest_hash !== input.state.content_manifest_hash
  ) {
    return [];
  }
  const actions: LegalCharacterAction[] = [];
  const ownedOptions = ownedContentReferences(character)
    .map((reference) => definitionByReference(input.catalog, reference))
    .filter(
      (
        definition,
      ): definition is Extract<
        ContentDefinition,
        { kind: "playable_option" }
      > => definition?.kind === "playable_option",
    );
  const abilityIds = new Set(
    ownedOptions.flatMap(({ payload }) => payload.granted_ability_ids),
  );
  for (const id of [...abilityIds].sort()) {
    const ability = definitionById(input.catalog, id);
    if (ability?.kind !== "ability") continue;
    const sceneUse = character.scene_ability_uses.find(
      ({ ability: usedAbility }) =>
        usedAbility.content_definition_id === ability.content_definition_id &&
        usedAbility.definition_revision === ability.definition_revision,
    );
    if (sceneUse?.used) continue;
    actions.push({
      kind: "use_ability",
      ability: definitionReference(ability),
    });
  }
  if (character.resources.exertion.current > 0) {
    actions.push({
      kind: "spend_resource",
      resource: "exertion",
      maximum_amount: character.resources.exertion.current,
    });
  }
  if (input.state.party.supply > 0) {
    actions.push({
      kind: "spend_resource",
      resource: "supply",
      maximum_amount: input.state.party.supply,
    });
    actions.push({ kind: "take_costly_rest" });
  }
  if (
    !character.resources.spark.available &&
    !character.resources.spark.complication_recovery_used
  ) {
    actions.push({ kind: "recover_spark_complication" });
  }
  const requestedRank = character.rank + 1;
  const category = { 2: "path", 3: "talent", 4: "capstone" }[requestedRank];
  if (category !== undefined) {
    const candidates = input.catalog.definitions
      .filter(
        (
          definition,
        ): definition is Extract<
          ContentDefinition,
          { kind: "playable_option" }
        > =>
          definition.kind === "playable_option" &&
          definition.payload.category === category &&
          definition.payload.rank === requestedRank &&
          definition.payload.prerequisites.every((prerequisite) =>
            prerequisiteSatisfied(
              character,
              requestedRank as CharacterRank,
              prerequisite,
            ),
          ),
      )
      .sort((left, right) =>
        left.content_definition_id.localeCompare(right.content_definition_id),
      );
    actions.push(
      ...candidates.map((definition) => ({
        kind: "advance_rank" as const,
        selected_feature: definitionReference(definition),
      })),
    );
  }
  return actions;
}

function reject(safeDetail: string): RejectedDecision {
  return {
    accepted: false,
    rejection_code: "engine_legality",
    safe_detail: safeDetail,
  };
}

function assertNever(value: never): never {
  throw new Error(`Unhandled command variant: ${JSON.stringify(value)}`);
}

function decideResolveCheck(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "resolve_check" }>;
  },
): CommandDecision {
  const { command, state } = input;
  if (command.campaign_id !== state.campaign_id) {
    return reject("Command campaign does not match the mechanical state.");
  }

  const actorCharacter = state.party.characters.find(
    ({ foundation }) =>
      foundation.actor_id === command.payload.request.actor_id,
  );
  if (actorCharacter === undefined) {
    return reject("Check actor is not a playable character.");
  }

  if (
    command.payload.roll_mode === "simulated" &&
    !command.payload.invoke_spark
  ) {
    if (input.random === undefined) {
      return reject("Simulated resolution requires an explicit random source.");
    }
    const draw = input.random.draw({
      purpose: "check.d20",
      purpose_local_index: 0,
      minimum: 1,
      maximum: 20,
    });
    if (
      draw.campaign_id !== command.campaign_id ||
      draw.command_id !== command.command_id ||
      draw.purpose !== "check.d20" ||
      draw.purpose_local_index !== 0 ||
      draw.minimum !== 1 ||
      draw.maximum !== 20
    ) {
      return reject("Random evidence does not match the requested check draw.");
    }
    const result = resolveCheck({
      action_feasibility: "possible",
      request: command.payload.request,
      die_face: draw.realized_value as DieFace,
      roll_mode: "simulated",
    });
    if ("action_feasibility" in result) {
      return reject(result.reason);
    }
    if (result.roll_mode !== "simulated") {
      return reject("Simulated resolution produced the wrong roll mode.");
    }
    return {
      accepted: true,
      events: [
        {
          kind: "check_resolved",
          payload: { result, random_draw: draw },
        },
      ],
    };
  }

  if (
    command.payload.invoke_spark &&
    !actorCharacter.resources.spark.available
  ) {
    return reject("The check actor has no available Spark.");
  }
  if (
    input.pending_check_id === undefined ||
    input.submission_nonce === undefined
  ) {
    return reject("Physical resolution requires explicit pending identities.");
  }

  const mandatoryReasons =
    command.payload.roll_mode === "physical"
      ? [command.payload.physical_reason]
      : [];
  const selected = selectPhysicalRoll({
    attempt: command.payload.request,
    mandatory_reasons: mandatoryReasons,
    invoke_spark: command.payload.invoke_spark,
    resolution_status: "unresolved",
  });
  if (selected.rejected) return reject(selected.message);
  if (!selected.selected) {
    return reject("The check did not select a physical-roll reason.");
  }

  const events: DomainEventProposal[] = [];
  if (selected.spark_spent) {
    events.push({
      kind: "spark_spent",
      payload: { actor_id: command.payload.request.actor_id },
    });
  }
  const disclosure = validateValue(
    PhysicalRollDisclosureSchema,
    selected.disclosure,
  );
  if (!disclosure.success) {
    return reject("Physical disclosure failed centralized validation.");
  }
  events.push({
    kind: "physical_roll_requested",
    payload: {
      pending_check_id: input.pending_check_id,
      submission_nonce: input.submission_nonce,
      disclosure: disclosure.value,
    },
  });
  return { accepted: true, events };
}

function decideSubmitDieResult(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "submit_die_result" }>;
  },
): CommandDecision {
  const { command, state } = input;
  const pending = state.pending_physical_checks.find(
    ({ pending_check_id }) =>
      pending_check_id === command.payload.pending_check_id,
  );
  if (pending === undefined) {
    return reject(
      "The pending physical check does not exist or is already resolved.",
    );
  }
  if (pending.submission_nonce !== command.payload.submission_nonce) {
    return reject(
      "The physical submission nonce does not match the pending check.",
    );
  }

  const disclosure = pending.disclosure;
  const request = {
    schema_version: SCHEMA_VERSION,
    actor_id: disclosure.actor_id,
    attribute: disclosure.modifier_breakdown.attribute.name,
    attribute_rating: disclosure.modifier_breakdown.attribute.value,
    discipline: disclosure.modifier_breakdown.discipline.name,
    discipline_rating: disclosure.modifier_breakdown.discipline.value,
    target: disclosure.target,
    modifier_state: {
      edge: disclosure.modifier_breakdown.edge.active,
      hindrance: disclosure.modifier_breakdown.hindrance.active,
    },
    visibility: "eligible_roller" as const,
    stakes: disclosure.stakes,
    outcome_bands: disclosure.outcome_bands,
    action_feasibility: "possible" as const,
    spark_eligible: false,
    eligible_roller: disclosure.eligible_roller,
  };
  const result = resolveCheck({
    action_feasibility: "possible",
    request,
    die_face: command.payload.die_face,
    roll_mode: "physical",
    physical_reason: disclosure.reason,
  });
  if ("action_feasibility" in result) return reject(result.reason);
  if (result.roll_mode !== "physical") {
    return reject("Physical submission produced the wrong roll mode.");
  }
  const disclosed = disclosure.face_to_outcome[command.payload.die_face - 1];
  if (disclosed?.degree !== result.final_degree) {
    return reject(
      "Stored physical disclosure does not match the submitted result.",
    );
  }
  const resolvedEvent: DomainEventProposal = {
    kind: "check_resolved",
    payload: {
      pending_check_id: pending.pending_check_id,
      physical_submission_id: command.payload.physical_submission_id,
      result,
    },
  };
  if (pending.continuation === null) {
    return { accepted: true, events: [resolvedEvent] };
  }
  let continuationEvents: readonly DomainEventProposal[] | RejectedDecision;
  switch (pending.continuation.kind) {
    case "combat_action":
      continuationEvents = eventsForPendingCombatResolution({
        decision_input: input,
        candidate: pending.continuation.candidate,
        base_impact: pending.continuation.base_impact,
        degree: result.final_degree,
      });
      break;
    case "death_test":
      continuationEvents = eventsForDeathTestResult({
        decision_input: input,
        character_id: pending.continuation.character_id,
        degree: result.final_degree,
      });
      break;
    case "challenge":
      continuationEvents = eventsForChallengeResult({
        decision_input: input,
        challenge_id: pending.continuation.challenge_id,
        result,
      });
      break;
    case "social":
      continuationEvents = eventsForSocialResult({
        decision_input: input,
        npc_actor_id: pending.continuation.npc_actor_id,
        requested_stance: pending.continuation.requested_stance,
        challenged_limit_id: pending.continuation.challenged_limit_id,
        result,
      });
      break;
    case "ritual":
      continuationEvents = eventsForRitualResult({
        decision_input: input,
        ritual_id: pending.continuation.ritual_id,
        result,
      });
      break;
    default:
      return assertNever(pending.continuation);
  }
  if ("accepted" in continuationEvents) return continuationEvents;
  return { accepted: true, events: [resolvedEvent, ...continuationEvents] };
}

export function decideCommand(input: CommandDecisionInput): CommandDecision {
  if (input.command.campaign_id !== input.state.campaign_id) {
    return reject("Command campaign does not match the mechanical state.");
  }
  switch (input.command.kind) {
    case "resolve_check":
      return decideResolveCheck({ ...input, command: input.command });
    case "submit_die_result":
      return decideSubmitDieResult({ ...input, command: input.command });
    case "materialize_character":
      return decideMaterializeCharacter({ ...input, command: input.command });
    case "spend_resource":
      return decideSpendResource({ ...input, command: input.command });
    case "recover_resource":
      return decideRecoverResource({ ...input, command: input.command });
    case "recover_spark_complication":
      return decideRecoverSpark({ ...input, command: input.command });
    case "take_costly_rest":
      return decideCostlyRest({ ...input, command: input.command });
    case "advance_scene":
      return decideAdvanceScene({ ...input, command: input.command });
    case "advance_rank":
      return decideAdvanceRank({ ...input, command: input.command });
    case "start_combat":
      return decideStartCombat({ ...input, command: input.command });
    case "choose_hero_activation":
      return decideChooseHeroActivation({ ...input, command: input.command });
    case "execute_combat_action":
      return decideExecuteCombatAction({ ...input, command: input.command });
    case "select_enemy_fallback":
      return decideSelectEnemyFallback({ ...input, command: input.command });
    case "open_reaction_window":
      return decideOpenReactionWindow({ ...input, command: input.command });
    case "resolve_reaction":
      return decideResolveReaction({ ...input, command: input.command });
    case "aid_death_test":
      return decideAidDeathTest({ ...input, command: input.command });
    case "start_challenge":
      return decideStartChallenge({ ...input, command: input.command });
    case "advance_challenge":
      return decideAdvanceChallenge({ ...input, command: input.command });
    case "establish_social_state":
      return decideEstablishSocialState({ ...input, command: input.command });
    case "attempt_social_shift":
      return decideAttemptSocialShift({ ...input, command: input.command });
    case "create_leverage":
      return decideCreateLeverage({ ...input, command: input.command });
    case "spend_leverage":
      return decideSpendLeverage({ ...input, command: input.command });
    case "start_ritual":
      return decideStartRitual({ ...input, command: input.command });
    case "contribute_ritual":
      return decideContributeRitual({ ...input, command: input.command });
    case "resolve_ritual":
      return decideResolveRitual({ ...input, command: input.command });
    case "interrupt_ritual":
      return decideInterruptRitual({ ...input, command: input.command });
    default:
      return assertNever(input.command);
  }
}
