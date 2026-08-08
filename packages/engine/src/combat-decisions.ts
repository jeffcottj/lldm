import {
  DEATH_TEST_AID_COST,
  DEATH_TEST_ATTRIBUTE,
  DEATH_TEST_DISCIPLINE,
  DEATH_TEST_TARGET,
  PHASE_1_DEATH_SCAR_NAME,
  SCHEMA_VERSION,
  type ActorId,
  type CheckRequest,
  type CombatState,
  type ContentDefinition,
  type GameCommand,
  type GameState,
  type LegalActionCandidate,
  type MechanicalEffect,
  type OutcomeDegree,
  type PhysicalRollDisclosure,
  type ResolvedContentReference,
  type ValidationResult,
  validateActionSlotSpend,
  validateCombatState,
  validateResourceTransition,
  validateValue,
  CheckRequestSchema,
} from "@lldm/contracts";
import type {
  CommandDecision,
  CommandDecisionInput,
  DomainEventProposal,
  EngineContentCatalog,
} from "./decide-command.js";
import {
  createPhysicalRollDisclosure,
  selectPhysicalRoll,
} from "./physical-rolls.js";
import { resolveCheck } from "./resolution.js";

type CombatParticipant = CombatState["participants"][number];
type AbilityDefinition = Extract<ContentDefinition, { kind: "ability" }>;
type EnemyDefinition = Extract<ContentDefinition, { kind: "enemy" }>;
type RejectedDecision = Extract<CommandDecision, { accepted: false }>;

function reject(detail: string): RejectedDecision {
  return {
    accepted: false,
    rejection_code: "engine_legality",
    safe_detail: detail,
  };
}

function referenceOf(definition: ContentDefinition): ResolvedContentReference {
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
  id: string,
): ContentDefinition | undefined {
  const matches = catalog.definitions.filter(
    ({ content_definition_id }) => content_definition_id === id,
  );
  return matches.length === 1 ? matches[0] : undefined;
}

function pinnedCatalog(
  input: CommandDecisionInput,
): EngineContentCatalog | RejectedDecision {
  if (input.catalog === undefined) {
    return reject("Combat decisions require the pinned content catalog.");
  }
  if (
    input.catalog.content_manifest_hash !== input.state.content_manifest_hash
  ) {
    return reject("The combat catalog is not pinned by this campaign.");
  }
  return input.catalog;
}

function combatFor(
  state: GameState,
  combatId: string,
): CombatState | RejectedDecision {
  if (state.combat === null || state.combat.combat_id !== combatId) {
    return reject("The requested combat is not active in this campaign.");
  }
  if (state.combat.status !== "active") {
    return reject("Combat cannot advance while it is paused or resolved.");
  }
  return state.combat;
}

function isRejection<T>(
  value: T | RejectedDecision,
): value is RejectedDecision {
  return typeof value === "object" && value !== null && "accepted" in value;
}

function participantAlive(
  state: GameState,
  participant: CombatParticipant,
): boolean {
  if (participant.side === "enemy") {
    const combat = state.combat;
    const reinforcementReady =
      participant.reinforcement_trigger === undefined ||
      (participant.reinforcement_trigger === "round_2" &&
        (combat?.round ?? 0) >= 2) ||
      (participant.reinforcement_trigger === "objective_progress_2" &&
        (combat?.objectives.some(({ progress }) => progress >= 2) ?? false));
    return reinforcementReady && participant.guard.current > 0;
  }
  const character = state.party.characters.find(
    ({ foundation }) => foundation.actor_id === participant.actor_id,
  );
  return (
    character !== undefined &&
    !state.permanent_deaths.includes(character.character_id)
  );
}

function unspentForSide(
  state: GameState,
  combat: CombatState,
  side: "hero" | "enemy",
): readonly CombatParticipant[] {
  return combat.participants.filter(
    (participant) =>
      participant.side === side &&
      participantAlive(state, participant) &&
      !participant.activation_spent,
  );
}

function opposite(side: "hero" | "enemy"): "hero" | "enemy" {
  return side === "hero" ? "enemy" : "hero";
}

function activationEvents(input: {
  readonly state: GameState;
  readonly combat: CombatState;
  readonly actor: CombatParticipant;
}): readonly DomainEventProposal[] | RejectedDecision {
  const { state, combat, actor } = input;
  if (!participantAlive(state, actor)) {
    return reject("The requested combat actor has no legal activation.");
  }
  if (combat.active_actor_id !== null) {
    return combat.active_actor_id === actor.actor_id
      ? []
      : reject("Another combat actor is already active.");
  }
  const currentUnspent = unspentForSide(state, combat, combat.active_side);
  const otherSide = opposite(combat.active_side);
  const otherUnspent = unspentForSide(state, combat, otherSide);
  if (currentUnspent.length === 0 && otherUnspent.length === 0) {
    if (actor.side !== "hero") {
      return reject("A new round must begin with a hero activation.");
    }
    return [
      {
        kind: "round_advanced",
        payload: {
          combat_id: combat.combat_id,
          previous_round: combat.round,
          current_round: combat.round + 1,
        },
      },
      {
        kind: "activation_started",
        payload: {
          combat_id: combat.combat_id,
          actor_id: actor.actor_id,
          side: actor.side,
        },
      },
    ];
  }
  if (actor.activation_spent) {
    return reject("The requested combat actor has no legal activation.");
  }
  const expectedSide =
    currentUnspent.length > 0 ? combat.active_side : otherSide;
  if (actor.side !== expectedSide) {
    return reject("The other combat side has the next activation.");
  }
  return [
    {
      kind: "activation_started",
      payload: {
        combat_id: combat.combat_id,
        actor_id: actor.actor_id,
        side: actor.side,
      },
    },
  ];
}

export function zoneDistance(
  combat: CombatState,
  fromZoneId: string,
  toZoneId: string,
): number | null {
  if (fromZoneId === toZoneId) return 0;
  const zones = new Map(
    combat.battlefield.zones.map((zone) => [zone.zone_id, zone]),
  );
  if (!zones.has(fromZoneId) || !zones.has(toZoneId)) return null;
  const visited = new Set<string>([fromZoneId]);
  let frontier = [fromZoneId];
  let distance = 0;
  while (frontier.length > 0) {
    distance += 1;
    const next: string[] = [];
    for (const zoneId of frontier) {
      for (const connected of zones.get(zoneId)?.connections ?? []) {
        if (connected === toZoneId) return distance;
        if (!visited.has(connected)) {
          visited.add(connected);
          next.push(connected);
        }
      }
    }
    frontier = next;
  }
  return null;
}

export function rangeBetweenActors(
  combat: CombatState,
  actorId: string,
  targetActorId: string,
): "self" | "same_zone" | "adjacent" | "distant" | null {
  if (actorId === targetActorId) return "self";
  const actor = combat.participants.find(
    ({ actor_id }) => actor_id === actorId,
  );
  const target = combat.participants.find(
    ({ actor_id }) => actor_id === targetActorId,
  );
  if (actor === undefined || target === undefined) return null;
  const distance = zoneDistance(combat, actor.zone_id, target.zone_id);
  return distance === null
    ? null
    : distance === 0
      ? "same_zone"
      : distance === 1
        ? "adjacent"
        : "distant";
}

function rangeAllows(
  maximum: "self" | "same_zone" | "adjacent" | "distant",
  actual: "self" | "same_zone" | "adjacent" | "distant",
): boolean {
  const order = { self: 0, same_zone: 1, adjacent: 2, distant: 3 } as const;
  return order[actual] <= order[maximum];
}

function actorAbilities(input: {
  readonly state: GameState;
  readonly combat: CombatState;
  readonly actor: CombatParticipant;
  readonly catalog: EngineContentCatalog;
}): readonly AbilityDefinition[] {
  if (input.actor.side === "enemy") {
    const enemy = definitionByReference(input.catalog, input.actor.definition);
    if (enemy?.kind !== "enemy") return [];
    return enemy.payload.actions.flatMap(({ action }) => {
      const definition = definitionByReference(input.catalog, action);
      return definition?.kind === "ability" ? [definition] : [];
    });
  }
  const character = input.state.party.characters.find(
    ({ foundation }) => foundation.actor_id === input.actor.actor_id,
  );
  if (character === undefined) return [];
  const optionReferences = Object.values(character.resolved_options).filter(
    (reference): reference is ResolvedContentReference => reference !== null,
  );
  const ids = new Set<string>();
  for (const gear of character.resolved_significant_gear) {
    if (gear.status === "ready") {
      ids.add(gear.definition.content_definition_id);
    }
  }
  for (const reference of optionReferences) {
    const definition = definitionByReference(input.catalog, reference);
    if (definition?.kind === "playable_option") {
      for (const id of definition.payload.granted_ability_ids) ids.add(id);
    } else if (definition?.kind === "ability") {
      ids.add(definition.content_definition_id);
    }
  }
  return [...ids].sort().flatMap((id) => {
    const definition = definitionById(input.catalog, id);
    return definition?.kind === "ability" ? [definition] : [];
  });
}

function targetKey(target: LegalActionCandidate["target"]): string {
  switch (target.kind) {
    case "self":
    case "actor":
      return `${target.kind}:${target.actor_id}`;
    case "actor_to_zone":
      return `${target.kind}:${target.actor_id}:${target.zone_id}`;
    case "zone":
      return `${target.kind}:${target.zone_id}`;
    case "objective":
      return `${target.kind}:${target.objective_id}`;
  }
}

function enemyScore(
  actor: CombatParticipant,
  ability: AbilityDefinition | null,
  actionKind: LegalActionCandidate["action_kind"],
  catalog: EngineContentCatalog,
): { score: number; tags: string[] } {
  const base = {
    attack: 100,
    use_power: 70,
    advance_objective: 80,
    dash: 30,
    move: 25,
    change_stance: 15,
    interact: 20,
    pass: -100,
  }[actionKind];
  if (actor.side !== "enemy" || ability === null) {
    return { score: actor.side === "enemy" ? base : 0, tags: [] };
  }
  const enemy = definitionByReference(catalog, actor.definition);
  if (enemy?.kind !== "enemy") return { score: base, tags: [] };
  const action = enemy.payload.actions.find(
    ({ action }) =>
      action.content_definition_id === ability.content_definition_id &&
      action.definition_revision === ability.definition_revision,
  );
  const tags = action?.preference_tags ?? [];
  const goalMatches = tags.filter((tag) =>
    enemy.payload.goal_tags.includes(tag),
  );
  const temperamentMatches = tags.filter((tag) =>
    enemy.payload.temperament_tags.includes(tag),
  );
  return {
    score: base + goalMatches.length * 20 + temperamentMatches.length * 10,
    tags: [...tags],
  };
}

function abilityTargets(input: {
  readonly state: GameState;
  readonly combat: CombatState;
  readonly actor: CombatParticipant;
  readonly ability: AbilityDefinition;
}): readonly LegalActionCandidate["target"][] {
  const { state, combat, actor, ability } = input;
  if (ability.payload.target_mode === "self") {
    return [{ kind: "self", actor_id: actor.actor_id }];
  }
  if (ability.payload.target_mode === "objective") {
    return combat.objectives.flatMap((objective) => {
      if (objective.status !== "active") return [];
      const zone = combat.battlefield.zones.find(({ objective_ids }) =>
        objective_ids.includes(objective.objective_id),
      );
      if (zone === undefined) return [];
      const distance = zoneDistance(combat, actor.zone_id, zone.zone_id);
      const actual =
        distance === 0 ? "same_zone" : distance === 1 ? "adjacent" : "distant";
      return distance !== null && rangeAllows(ability.payload.range, actual)
        ? [{ kind: "objective" as const, objective_id: objective.objective_id }]
        : [];
    });
  }
  if (ability.payload.target_mode === "zone") {
    return combat.battlefield.zones.flatMap((zone) => {
      const distance = zoneDistance(combat, actor.zone_id, zone.zone_id);
      const actual =
        distance === 0 ? "same_zone" : distance === 1 ? "adjacent" : "distant";
      return distance !== null && rangeAllows(ability.payload.range, actual)
        ? [{ kind: "zone" as const, zone_id: zone.zone_id }]
        : [];
    });
  }

  const move = ability.payload.effects.find(
    (effect): effect is Extract<MechanicalEffect, { kind: "move" }> =>
      effect.kind === "move",
  );
  if (move !== undefined) {
    const possibleActors = combat.participants.filter((target) => {
      if (!participantAlive(state, target)) return false;
      if (move.target === "self") return target.actor_id === actor.actor_id;
      if (move.target === "ally") return target.side === actor.side;
      return target.side !== actor.side;
    });
    return possibleActors.flatMap((target) =>
      combat.battlefield.zones.flatMap((zone) => {
        const distance = zoneDistance(combat, target.zone_id, zone.zone_id);
        const allowed =
          move.distance === "adjacent"
            ? distance === 1
            : distance !== null && distance > 0;
        const occupancy = combat.participants.filter(
          ({ zone_id }) => zone_id === zone.zone_id,
        ).length;
        return allowed && occupancy < zone.capacity
          ? [
              {
                kind: "actor_to_zone" as const,
                actor_id: target.actor_id,
                zone_id: zone.zone_id,
              },
            ]
          : [];
      }),
    );
  }

  const harmful =
    ability.payload.fixed_impact !== null ||
    ability.payload.effects.some(({ kind }) => kind === "deal_impact");
  return combat.participants.flatMap((target) => {
    if (!participantAlive(state, target)) return [];
    if (harmful ? target.side === actor.side : target.side !== actor.side)
      return [];
    const actual = rangeBetweenActors(combat, actor.actor_id, target.actor_id);
    if (actual === null || !rangeAllows(ability.payload.range, actual))
      return [];
    const targetZone = combat.battlefield.zones.find(
      ({ zone_id }) => zone_id === target.zone_id,
    );
    if (
      targetZone?.visibility === "blocked" &&
      actor.zone_id !== target.zone_id
    ) {
      return [];
    }
    return [{ kind: "actor" as const, actor_id: target.actor_id }];
  });
}

export function enumerateCombatActions(input: {
  readonly state: GameState;
  readonly catalog: EngineContentCatalog;
  readonly actor_id: ActorId;
  readonly legal_action_id_for: (
    stable_key: string,
  ) => LegalActionCandidate["legal_action_id"];
}): readonly LegalActionCandidate[] {
  const combat = input.state.combat;
  if (
    combat === null ||
    combat.status !== "active" ||
    input.catalog.content_manifest_hash !== input.state.content_manifest_hash
  ) {
    return [];
  }
  const actor = combat.participants.find(
    ({ actor_id }) => actor_id === input.actor_id,
  );
  if (actor === undefined || !participantAlive(input.state, actor)) return [];
  const candidates: LegalActionCandidate[] = [];
  const push = (candidate: Omit<LegalActionCandidate, "legal_action_id">) => {
    const source = candidate.source_definition;
    const key = [
      combat.combat_id,
      candidate.actor_id,
      candidate.slot,
      candidate.action_kind,
      source === null
        ? "none"
        : `${source.content_definition_id}@${source.definition_revision}`,
      targetKey(candidate.target),
    ].join("|");
    candidates.push({
      legal_action_id: input.legal_action_id_for(key),
      ...candidate,
    });
  };

  if (actor.action_available) {
    push({
      actor_id: actor.actor_id,
      slot: "action",
      action_kind: "pass",
      source_definition: null,
      target: { kind: "self", actor_id: actor.actor_id },
      range: "self",
      fallback_score: actor.side === "enemy" ? -100 : 0,
      score_tags: [],
    });
  }
  if (actor.maneuver_available) {
    push({
      actor_id: actor.actor_id,
      slot: "maneuver",
      action_kind: "pass",
      source_definition: null,
      target: { kind: "self", actor_id: actor.actor_id },
      range: "self",
      fallback_score: actor.side === "enemy" ? -100 : 0,
      score_tags: [],
    });
    const from = combat.battlefield.zones.find(
      ({ zone_id }) => zone_id === actor.zone_id,
    );
    for (const zoneId of from?.connections ?? []) {
      const zone = combat.battlefield.zones.find(
        ({ zone_id }) => zone_id === zoneId,
      );
      const occupancy = combat.participants.filter(
        ({ zone_id }) => zone_id === zoneId,
      ).length;
      if (zone !== undefined && occupancy < zone.capacity) {
        const scored = enemyScore(actor, null, "move", input.catalog);
        push({
          actor_id: actor.actor_id,
          slot: "maneuver",
          action_kind: "move",
          source_definition: null,
          target: { kind: "zone", zone_id: zone.zone_id },
          range: "adjacent",
          fallback_score: scored.score,
          score_tags: scored.tags,
        });
      }
    }
  }

  for (const ability of actorAbilities({ ...input, combat, actor })) {
    const slot = ability.payload.action_slot;
    if (
      slot === "reaction" ||
      (slot === "action" && !actor.action_available) ||
      (slot === "maneuver" && !actor.maneuver_available)
    ) {
      continue;
    }
    const sceneUse =
      actor.side === "hero"
        ? input.state.party.characters
            .find(({ foundation }) => foundation.actor_id === actor.actor_id)
            ?.scene_ability_uses.find(
              ({ ability: used }) =>
                used.content_definition_id === ability.content_definition_id &&
                used.definition_revision === ability.definition_revision,
            )
        : undefined;
    if (sceneUse?.used) continue;
    const actionKind =
      ability.payload.fixed_impact !== null ||
      ability.payload.effects.some(({ kind }) => kind === "deal_impact")
        ? "attack"
        : "use_power";
    const scored = enemyScore(actor, ability, actionKind, input.catalog);
    for (const target of abilityTargets({ ...input, combat, actor, ability })) {
      const actual =
        target.kind === "self"
          ? "self"
          : target.kind === "actor" || target.kind === "actor_to_zone"
            ? (rangeBetweenActors(combat, actor.actor_id, target.actor_id) ??
              "distant")
            : target.kind === "zone"
              ? zoneDistance(combat, actor.zone_id, target.zone_id) === 0
                ? "same_zone"
                : zoneDistance(combat, actor.zone_id, target.zone_id) === 1
                  ? "adjacent"
                  : "distant"
              : ability.payload.range;
      push({
        actor_id: actor.actor_id,
        slot,
        action_kind: actionKind,
        source_definition: referenceOf(ability),
        target,
        range: actual,
        fallback_score: scored.score,
        score_tags: scored.tags,
      });
    }
  }

  if (actor.action_available) {
    for (const objective of combat.objectives) {
      const zone = combat.battlefield.zones.find(({ objective_ids }) =>
        objective_ids.includes(objective.objective_id),
      );
      if (objective.status === "active" && zone?.zone_id === actor.zone_id) {
        const scored = enemyScore(
          actor,
          null,
          "advance_objective",
          input.catalog,
        );
        push({
          actor_id: actor.actor_id,
          slot: "action",
          action_kind: "advance_objective",
          source_definition: null,
          target: { kind: "objective", objective_id: objective.objective_id },
          range: "same_zone",
          fallback_score: scored.score,
          score_tags: scored.tags,
        });
      }
    }
  }

  return candidates.sort((left, right) =>
    left.legal_action_id.localeCompare(right.legal_action_id),
  );
}

export function decideStartCombat(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "start_combat" }>;
  },
): CommandDecision {
  const catalog = pinnedCatalog(input);
  if (isRejection(catalog)) return catalog;
  if (input.state.combat !== null) return reject("A combat already exists.");
  const validation = validateCombatState(input.command.payload.combat);
  if (!validation.success)
    return reject("The proposed combat state is invalid.");
  const combat = validation.value;
  if (
    combat.status !== "active" ||
    combat.round !== 1 ||
    combat.active_side !== "hero" ||
    combat.active_actor_id !== null ||
    combat.reaction_window !== null ||
    combat.pending_death_check_id !== null ||
    combat.pending_action_check_id !== null
  ) {
    return reject("Combat must begin as an unspent hero-first round.");
  }
  for (const participant of combat.participants) {
    const pendingReinforcement =
      participant.side === "enemy" &&
      participant.reinforcement_trigger !== undefined;
    if (
      !participant.action_available ||
      !participant.maneuver_available ||
      !participant.reaction_available ||
      participant.activation_spent !== pendingReinforcement
    ) {
      return reject("Every combat participant must begin with fresh slots.");
    }
    if (participant.side === "hero") {
      const hero = input.state.party.characters.find(
        ({ foundation }) => foundation.actor_id === participant.actor_id,
      );
      if (
        hero === undefined ||
        input.state.permanent_deaths.includes(hero.character_id)
      ) {
        return reject("Every hero participant must be a living playable hero.");
      }
    } else {
      const enemy = definitionByReference(catalog, participant.definition);
      if (
        enemy?.kind !== "enemy" ||
        enemy.payload.role !== participant.kind ||
        enemy.payload.guard !== participant.guard.maximum ||
        participant.guard.current !== participant.guard.maximum ||
        enemy.payload.armor !== participant.armor
      ) {
        return reject("Enemy participant facts do not match pinned content.");
      }
    }
  }
  for (const objective of combat.objectives) {
    const definition = definitionByReference(catalog, objective.definition);
    if (
      definition?.kind !== "objective" ||
      definition.payload.threshold !== objective.threshold ||
      objective.progress !== 0 ||
      objective.status !== "active"
    ) {
      return reject("Combat objective facts do not match pinned content.");
    }
  }
  for (const overlay of combat.boss_overlays) {
    const definition = definitionByReference(catalog, overlay.definition);
    const actor = combat.participants.find(
      ({ actor_id }) => actor_id === overlay.actor_id,
    );
    if (
      definition?.kind !== "boss_overlay" ||
      actor?.kind !== "boss" ||
      overlay.active ||
      definition.payload.objective.content_definition_id !==
        combat.objectives.find(
          ({ objective_id }) => objective_id === overlay.objective_id,
        )?.definition.content_definition_id
    ) {
      return reject("Boss overlay facts do not match pinned content.");
    }
  }
  return {
    accepted: true,
    events: [{ kind: "combat_started", payload: { combat } }],
  };
}

export function decideChooseHeroActivation(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "choose_hero_activation" }>;
  },
): CommandDecision {
  const combat = combatFor(input.state, input.command.payload.combat_id);
  if (isRejection(combat)) return combat;
  const actor = combat.participants.find(
    ({ actor_id }) => actor_id === input.command.payload.actor_id,
  );
  if (actor?.side !== "hero")
    return reject("Hero activation requires a hero actor.");
  const events = activationEvents({ state: input.state, combat, actor });
  return isRejection(events) ? events : { accepted: true, events };
}

export function decideSelectEnemyFallback(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "select_enemy_fallback" }>;
  },
): CommandDecision {
  const catalog = pinnedCatalog(input);
  if (isRejection(catalog)) return catalog;
  const combat = combatFor(input.state, input.command.payload.combat_id);
  if (isRejection(combat)) return combat;
  const actor = combat.participants.find(
    ({ actor_id }) => actor_id === input.command.payload.actor_id,
  );
  if (actor?.side !== "enemy")
    return reject("Enemy fallback requires an enemy actor.");
  const activation = activationEvents({ state: input.state, combat, actor });
  if (isRejection(activation)) return activation;
  if (input.legal_action_id_for === undefined) {
    return reject(
      "Enemy fallback requires deterministic legal-action identities.",
    );
  }
  let selectionState = input.state;
  if (activation.some(({ kind }) => kind === "round_advanced")) {
    selectionState = structuredClone(input.state);
    const selectedCombat = selectionState.combat!;
    selectedCombat.round += 1;
    selectedCombat.active_side = "hero";
    selectedCombat.active_actor_id = actor.actor_id;
    selectedCombat.participants = selectedCombat.participants.map(
      (participant) => ({
        ...participant,
        action_available: true,
        maneuver_available: true,
        reaction_available: true,
        activation_spent: false,
      }),
    );
  }
  const candidates = enumerateCombatActions({
    state: selectionState,
    catalog,
    actor_id: actor.actor_id,
    legal_action_id_for: input.legal_action_id_for,
  });
  if (candidates.length === 0)
    return reject("The enemy has no legal fallback action.");
  const bestScore = Math.max(
    ...candidates.map(({ fallback_score }) => fallback_score),
  );
  const tied = candidates.filter(
    ({ fallback_score }) => fallback_score === bestScore,
  );
  let selected = tied[0];
  let tieBreak: ReturnType<
    NonNullable<CommandDecisionInput["random"]>["draw"]
  > | null = null;
  if (tied.length > 1) {
    if (input.random === undefined)
      return reject("An exact enemy tie requires a random source.");
    const draw = input.random.draw({
      purpose: "enemy.tie_break",
      purpose_local_index: 0,
      minimum: 0,
      maximum: tied.length - 1,
    });
    if (
      draw.campaign_id !== input.command.campaign_id ||
      draw.command_id !== input.command.command_id ||
      draw.purpose !== "enemy.tie_break" ||
      draw.purpose_local_index !== 0 ||
      draw.minimum !== 0 ||
      draw.maximum !== tied.length - 1
    ) {
      return reject("Enemy tie-break evidence does not match the selection.");
    }
    tieBreak = draw;
    selected = tied[draw.realized_value];
  }
  if (selected === undefined)
    return reject("Enemy tie-break index is invalid.");
  return {
    accepted: true,
    events: [
      ...activation,
      {
        kind: "enemy_action_selected",
        payload: {
          combat_id: combat.combat_id,
          candidate: selected,
          tie_break: tieBreak,
        },
      },
    ],
  };
}

export function decideWithdrawFromCombat(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "withdraw_from_combat" }>;
  },
): CommandDecision {
  const combat = combatFor(input.state, input.command.payload.combat_id);
  if (isRejection(combat)) return combat;
  if (
    combat.reaction_window !== null ||
    combat.pending_action_check_id !== null ||
    combat.pending_death_check_id !== null
  ) {
    return reject("Combat cannot be withdrawn while a resolution is pending.");
  }
  return {
    accepted: true,
    events: [
      {
        kind: "combat_resolved",
        payload: {
          combat_id: combat.combat_id,
          outcome: "heroes_withdrew",
        },
      },
    ],
  };
}

function abilityForCandidate(
  catalog: EngineContentCatalog,
  candidate: LegalActionCandidate,
): AbilityDefinition | null {
  if (candidate.source_definition === null) return null;
  const definition = definitionByReference(
    catalog,
    candidate.source_definition,
  );
  return definition?.kind === "ability" ? definition : null;
}

function baseImpactFor(ability: AbilityDefinition): number | null {
  if (ability.payload.fixed_impact !== null)
    return ability.payload.fixed_impact;
  const impacts = ability.payload.effects.filter(
    (effect): effect is Extract<MechanicalEffect, { kind: "deal_impact" }> =>
      effect.kind === "deal_impact",
  );
  return impacts.length === 1 ? impacts[0]!.impact : null;
}

function costEvents(input: {
  readonly state: GameState;
  readonly actor: CombatParticipant;
  readonly ability: AbilityDefinition;
}): readonly DomainEventProposal[] | RejectedDecision {
  const { state, actor, ability } = input;
  const adjustments = ability.payload.cost;
  if (
    adjustments.some(
      (effect) => effect.kind !== "adjust_resource" || effect.amount >= 0,
    )
  ) {
    return reject(
      "Combat ability costs must be negative resource adjustments.",
    );
  }
  if (adjustments.length === 0) return [];
  const character = state.party.characters.find(
    ({ foundation }) => foundation.actor_id === actor.actor_id,
  );
  if (character === undefined) {
    return reject("Enemy abilities cannot spend hero or party resources.");
  }
  const totals = new Map<"exertion" | "supply", number>();
  for (const effect of adjustments) {
    if (effect.kind !== "adjust_resource" || effect.resource === "guard") {
      return reject("Guard cannot be declared as a combat ability cost.");
    }
    if (
      (effect.resource === "supply" && effect.target !== "party") ||
      (effect.resource === "exertion" && effect.target !== "self")
    ) {
      return reject("Combat ability cost target does not match its resource.");
    }
    totals.set(
      effect.resource,
      (totals.get(effect.resource) ?? 0) + effect.amount,
    );
  }
  const events: DomainEventProposal[] = [];
  for (const resource of ["exertion", "supply"] as const) {
    const delta = totals.get(resource);
    if (delta === undefined) continue;
    const current =
      resource === "supply"
        ? state.party.supply
        : character.resources.exertion.current;
    const maximum =
      resource === "supply"
        ? state.party.supply_maximum
        : character.resources.exertion.maximum;
    const transition = validateResourceTransition({
      resource,
      current,
      delta,
      maximum,
    });
    if (!transition.success)
      return reject("A combat ability cost would underflow.");
    events.push({
      kind: "resource_changed",
      payload: {
        owner:
          resource === "supply"
            ? { scope: "party" }
            : { scope: "character", character_id: character.character_id },
        resource,
        previous: current,
        current: transition.value,
        reason: `Cost for ${ability.content_definition_id}@${ability.definition_revision}.`,
      },
    });
  }
  return events;
}

function ratingForHero(
  state: GameState,
  actorId: string,
  ability: AbilityDefinition,
): {
  attribute: 0 | 1 | 2;
  discipline: 0 | 1 | 2;
  eligible_roller?: string;
} | null {
  const character = state.party.characters.find(
    ({ foundation }) => foundation.actor_id === actorId,
  );
  const participant = state.combat?.participants.find(
    ({ actor_id }) => actor_id === actorId,
  );
  const profile = ability.payload.check_profile;
  if (
    character === undefined ||
    profile === null ||
    participant?.side !== "hero"
  ) {
    return null;
  }
  const attribute = character.foundation.attributes.find(
    ({ attribute }) => attribute === profile.attribute,
  )?.rating;
  const discipline = character.foundation.disciplines.find(
    ({ discipline }) => discipline === profile.discipline,
  )?.rating;
  return attribute === undefined || discipline === undefined
    ? null
    : {
        attribute,
        discipline,
        eligible_roller: participant.eligible_roller,
      };
}

function ratingForEnemy(
  actor: CombatParticipant,
  ability: AbilityDefinition,
  catalog: EngineContentCatalog,
): { attribute: 0 | 1 | 2; discipline: 0 | 1 | 2 } | null {
  if (actor.side !== "enemy" || ability.payload.check_profile === null)
    return null;
  const enemy = definitionByReference(catalog, actor.definition);
  if (enemy?.kind !== "enemy") return null;
  return {
    attribute:
      enemy.payload.attribute_ratings[ability.payload.check_profile.attribute],
    discipline:
      enemy.payload.discipline_ratings[
        ability.payload.check_profile.discipline
      ],
  };
}

function checkForCombatAction(input: {
  readonly state: GameState;
  readonly actor: CombatParticipant;
  readonly ability: AbilityDefinition;
  readonly candidate: LegalActionCandidate;
  readonly catalog: EngineContentCatalog;
}): CheckRequest | null {
  const { state, actor, ability, candidate, catalog } = input;
  const profile = ability.payload.check_profile;
  if (profile === null) return null;
  const ratings =
    actor.side === "hero"
      ? ratingForHero(state, actor.actor_id, ability)
      : ratingForEnemy(actor, ability, catalog);
  if (ratings === null) return null;
  const edge = ability.payload.effects.some(
    (effect) =>
      effect.kind === "grant_edge" &&
      (effect.context === "attack" || effect.context === "check"),
  );
  const result = validateValue(CheckRequestSchema, {
    schema_version: SCHEMA_VERSION,
    actor_id: actor.actor_id,
    attribute: profile.attribute,
    attribute_rating: ratings.attribute,
    discipline: profile.discipline,
    discipline_rating: ratings.discipline,
    target: profile.target,
    modifier_state: { edge, hindrance: false },
    visibility: "public",
    stakes: `Resolve ${ability.payload.display_name} against ${targetKey(candidate.target)}.`,
    outcome_bands: [
      {
        degree: "Crisis",
        consequence: "The action fails and leaves a dangerous opening.",
      },
      {
        degree: "Setback",
        consequence: "The action fails and the activation cost remains spent.",
      },
      {
        degree: "Success",
        consequence: "The action applies its declared base effects.",
      },
      {
        degree: "Triumph",
        consequence:
          "The action applies its effects with the declared Triumph bonus.",
      },
    ],
    action_feasibility: "possible",
    spark_eligible: actor.side === "hero",
    ...(!("eligible_roller" in ratings) || ratings.eligible_roller === undefined
      ? {}
      : { eligible_roller: ratings.eligible_roller }),
  });
  return result.success ? result.value : null;
}

function overlayActivationEvents(input: {
  readonly combat: CombatState;
  readonly catalog: EngineContentCatalog;
  readonly boss: Extract<CombatParticipant, { side: "enemy" }>;
  readonly trigger: "guard_depleted" | "objective_changed" | "round_started";
  readonly objective_id?: string;
  readonly guard_before: number;
}): readonly DomainEventProposal[] | RejectedDecision {
  const overlay = input.combat.boss_overlays.find(
    (candidate) =>
      !candidate.active &&
      candidate.actor_id === input.boss.actor_id &&
      (input.objective_id === undefined ||
        candidate.objective_id === input.objective_id),
  );
  if (overlay === undefined) return [];
  const definition = definitionByReference(input.catalog, overlay.definition);
  if (
    definition?.kind !== "boss_overlay" ||
    definition.payload.trigger !== input.trigger
  ) {
    return [];
  }
  const guardAdjustments = definition.payload.effects.filter(
    (
      effect,
    ): effect is Extract<MechanicalEffect, { kind: "adjust_resource" }> =>
      effect.kind === "adjust_resource" &&
      effect.resource === "guard" &&
      effect.target === "self",
  );
  const guardAfter =
    input.guard_before +
    guardAdjustments.reduce((sum, effect) => sum + effect.amount, 0);
  if (guardAfter < 0 || guardAfter > input.boss.guard.maximum) {
    return reject("Boss overlay would produce invalid Guard.");
  }
  return [
    {
      kind: "boss_overlay_activated",
      payload: {
        combat_id: input.combat.combat_id,
        overlay: { ...overlay, active: true },
        guard_before: input.guard_before,
        guard_after: guardAfter,
      },
    },
  ];
}

function deathDisclosure(input: {
  readonly state: GameState;
  readonly combat: CombatState;
  readonly character_id: string;
}): PhysicalRollDisclosure | RejectedDecision {
  const character = input.state.party.characters.find(
    ({ character_id }) => character_id === input.character_id,
  );
  const participant = input.combat.participants.find(
    ({ actor_id }) => actor_id === character?.foundation.actor_id,
  );
  if (character === undefined || participant?.side !== "hero") {
    return reject("Death-test hero or eligible roller is unavailable.");
  }
  const attribute = character.foundation.attributes.find(
    ({ attribute }) => attribute === DEATH_TEST_ATTRIBUTE,
  )?.rating;
  const discipline = character.foundation.disciplines.find(
    ({ discipline }) => discipline === DEATH_TEST_DISCIPLINE,
  )?.rating;
  if (attribute === undefined || discipline === undefined) {
    return reject("Death-test ratings are unavailable.");
  }
  const requestResult = validateValue(CheckRequestSchema, {
    schema_version: SCHEMA_VERSION,
    actor_id: character.foundation.actor_id,
    attribute: DEATH_TEST_ATTRIBUTE,
    attribute_rating: attribute,
    discipline: DEATH_TEST_DISCIPLINE,
    discipline_rating: discipline,
    target: DEATH_TEST_TARGET,
    modifier_state: { edge: false, hindrance: false },
    visibility: "eligible_roller",
    stakes: `${character.foundation.display_name} faces permanent death.`,
    outcome_bands: [
      {
        degree: "Crisis",
        consequence: `${character.foundation.display_name} dies permanently.`,
      },
      {
        degree: "Setback",
        consequence: `${character.foundation.display_name} dies permanently.`,
      },
      {
        degree: "Success",
        consequence: `${character.foundation.display_name} stabilizes with two Wounds.`,
      },
      {
        degree: "Triumph",
        consequence: `${character.foundation.display_name} stabilizes with two Wounds and gains ${PHASE_1_DEATH_SCAR_NAME}.`,
      },
    ],
    action_feasibility: "possible",
    spark_eligible: false,
    eligible_roller: participant.eligible_roller,
  });
  if (!requestResult.success) return reject("Death-test request is invalid.");
  const disclosure = createPhysicalRollDisclosure(
    requestResult.value,
    "permanent_death",
  );
  return "rejected" in disclosure
    ? reject(disclosure.message)
    : (disclosure as PhysicalRollDisclosure);
}

function combatResolutionIfFinished(input: {
  readonly state: GameState;
  readonly combat: CombatState;
  readonly defeated_enemy_actor_id?: string;
  readonly dead_character_id?: string;
  readonly overlay_restored_actor_id?: string;
}): readonly DomainEventProposal[] {
  const livingEnemies = input.combat.participants.filter(
    (participant) =>
      participant.side === "enemy" &&
      (participant.actor_id === input.overlay_restored_actor_id ||
        (participant.actor_id !== input.defeated_enemy_actor_id &&
          participant.guard.current > 0)),
  );
  if (livingEnemies.length === 0) {
    return [
      {
        kind: "combat_resolved",
        payload: {
          combat_id: input.combat.combat_id,
          outcome: "heroes_prevailed",
        },
      },
    ];
  }
  const livingHeroes = input.state.party.characters.filter(
    ({ character_id }) =>
      character_id !== input.dead_character_id &&
      !input.state.permanent_deaths.includes(character_id),
  );
  return livingHeroes.length === 0
    ? [
        {
          kind: "combat_resolved",
          payload: {
            combat_id: input.combat.combat_id,
            outcome: "heroes_defeated",
          },
        },
      ]
    : [];
}

export function eventsForResolvedCombatAction(input: {
  readonly decision_input: CommandDecisionInput;
  readonly candidate: LegalActionCandidate;
  readonly ability: AbilityDefinition | null;
  readonly degree: OutcomeDegree;
  readonly base_impact: number | null;
}): readonly DomainEventProposal[] | RejectedDecision {
  const state = input.decision_input.state;
  const combat = state.combat;
  const catalog = input.decision_input.catalog;
  if (combat === null || catalog === undefined)
    return reject("Combat continuation context is unavailable.");
  if (input.degree === "Crisis" || input.degree === "Setback") return [];
  const events: DomainEventProposal[] = [];
  const target = input.candidate.target;
  if (input.base_impact !== null) {
    if (target.kind !== "actor")
      return reject("Impact requires an actor target.");
    const targetParticipant = combat.participants.find(
      ({ actor_id }) => actor_id === target.actor_id,
    );
    if (targetParticipant === undefined)
      return reject("Impact target is unavailable.");
    const hero = state.party.characters.find(
      ({ foundation }) => foundation.actor_id === target.actor_id,
    );
    const guardBefore =
      targetParticipant.side === "enemy"
        ? targetParticipant.guard.current
        : hero?.resources.guard.current;
    if (guardBefore === undefined)
      return reject("Impact target Guard is unavailable.");
    const armor =
      targetParticipant.side === "enemy" ? targetParticipant.armor : 0;
    const triumphBonus = input.degree === "Triumph" ? 2 : 0;
    const appliedImpact = Math.max(1, input.base_impact + triumphBonus - armor);
    const guardAfter = Math.max(0, guardBefore - appliedImpact);
    events.push({
      kind: "impact_applied",
      payload: {
        combat_id: combat.combat_id,
        source_actor_id: input.candidate.actor_id,
        target_actor_id: target.actor_id,
        base_impact: input.base_impact,
        triumph_bonus: triumphBonus,
        armor_reduction: armor,
        applied_impact: appliedImpact,
        guard_before: guardBefore,
        guard_after: guardAfter,
      },
    });
    if (targetParticipant.side === "hero") {
      const woundRequired =
        (guardBefore > 0 && appliedImpact > guardBefore) || guardBefore === 0;
      if (woundRequired) {
        if (hero === undefined || input.decision_input.wound_id === undefined) {
          return reject(
            "A harmful hero impact requires an allocated Wound identity.",
          );
        }
        const emptyIndex = hero.resources.wounds.findIndex(
          ({ status }) => status === "empty",
        );
        if (emptyIndex < 0) return reject("The hero has no empty Wound slot.");
        const wounds = structuredClone(hero.resources.wounds);
        const slot = (emptyIndex + 1) as 1 | 2 | 3;
        wounds[emptyIndex] = {
          slot,
          status: "filled",
          wound_id: input.decision_input.wound_id,
          name: "Combat wound",
        };
        events.push({
          kind: "wound_marked",
          payload: {
            combat_id: combat.combat_id,
            character_id: hero.character_id,
            wounds,
          },
        });
        if (emptyIndex === 2) {
          if (
            input.decision_input.death_pending_check_id === undefined ||
            input.decision_input.death_submission_nonce === undefined
          ) {
            return reject(
              "A third Wound requires allocated death-test identities.",
            );
          }
          const disclosure = deathDisclosure({
            state,
            combat,
            character_id: hero.character_id,
          });
          if (isRejection(disclosure)) return disclosure;
          events.push(
            {
              kind: "physical_roll_requested",
              payload: {
                pending_check_id: input.decision_input.death_pending_check_id,
                submission_nonce: input.decision_input.death_submission_nonce,
                disclosure,
              },
            },
            {
              kind: "death_test_pending",
              payload: {
                combat_id: combat.combat_id,
                pending_check_id: input.decision_input.death_pending_check_id,
                character_id: hero.character_id,
              },
            },
          );
        }
      }
    } else if (guardAfter === 0 && targetParticipant.kind === "boss") {
      const overlay = overlayActivationEvents({
        combat,
        catalog,
        boss: targetParticipant,
        trigger: "guard_depleted",
        guard_before: guardAfter,
      });
      if (isRejection(overlay)) return overlay;
      events.push(...overlay);
      events.push(
        ...combatResolutionIfFinished({
          state,
          combat,
          defeated_enemy_actor_id: targetParticipant.actor_id,
          ...(overlay.length > 0
            ? { overlay_restored_actor_id: targetParticipant.actor_id }
            : {}),
        }),
      );
    } else if (guardAfter === 0 && targetParticipant.side === "enemy") {
      events.push(
        ...combatResolutionIfFinished({
          state,
          combat,
          defeated_enemy_actor_id: targetParticipant.actor_id,
        }),
      );
    }
  }

  if (input.ability !== null) {
    for (const effect of input.ability.payload.effects) {
      switch (effect.kind) {
        case "deal_impact":
        case "grant_edge":
        case "mark_scene_use":
          break;
        case "move":
          if (target.kind !== "actor_to_zone") {
            return reject("Movement effect requires an actor-to-zone target.");
          }
          {
            const participant = combat.participants.find(
              ({ actor_id }) => actor_id === target.actor_id,
            );
            if (participant === undefined)
              return reject("Moving actor is unavailable.");
            events.push({
              kind: "actor_moved",
              payload: {
                combat_id: combat.combat_id,
                actor_id: participant.actor_id,
                from_zone_id: participant.zone_id,
                to_zone_id: target.zone_id,
              },
            });
          }
          break;
        case "advance_track":
          if (effect.track !== "objective" || target.kind !== "objective") {
            return reject("Combat track effect requires an objective target.");
          }
          {
            const objective = combat.objectives.find(
              ({ objective_id }) => objective_id === target.objective_id,
            );
            if (objective === undefined || objective.status !== "active") {
              return reject("Objective is unavailable.");
            }
            const current = Math.min(
              objective.threshold,
              objective.progress + effect.amount,
            );
            events.push({
              kind: "objective_advanced",
              payload: {
                combat_id: combat.combat_id,
                objective_id: objective.objective_id,
                previous: objective.progress,
                current,
                status:
                  current === objective.threshold ? "completed" : "active",
              },
            });
          }
          break;
        case "apply_condition":
          if (
            target.kind !== "actor" ||
            input.decision_input.condition_id === undefined
          ) {
            return reject(
              "Condition effect requires an actor target and identity.",
            );
          }
          {
            const character = state.party.characters.find(
              ({ foundation }) => foundation.actor_id === target.actor_id,
            );
            const definition = definitionByReference(catalog, effect.condition);
            if (character === undefined || definition?.kind !== "condition") {
              return reject("Only a playable hero can receive this condition.");
            }
            events.push({
              kind: "condition_applied",
              payload: {
                character_id: character.character_id,
                condition: {
                  condition_id: input.decision_input.condition_id,
                  definition: effect.condition,
                  source: `${input.ability.content_definition_id}@${input.ability.definition_revision}`,
                  duration: effect.duration,
                },
              },
            });
          }
          break;
        case "restore_reaction":
          if (target.kind !== "actor" && target.kind !== "self") {
            return reject("Reaction restoration requires an actor target.");
          }
          events.push({
            kind: "reaction_restored",
            payload: {
              combat_id: combat.combat_id,
              actor_id: target.actor_id,
            },
          });
          break;
        case "adjust_resource":
        case "reduce_impact":
        case "shift_stance":
        case "create_leverage":
          return reject(
            `Effect ${effect.kind} is not legal in this combat action context.`,
          );
      }
    }
  }
  if (
    input.candidate.action_kind === "advance_objective" &&
    input.ability === null
  ) {
    if (target.kind !== "objective")
      return reject("Objective action has the wrong target.");
    const objective = combat.objectives.find(
      ({ objective_id }) => objective_id === target.objective_id,
    );
    if (objective === undefined || objective.status !== "active")
      return reject("Objective is unavailable.");
    const current = Math.min(objective.threshold, objective.progress + 1);
    events.push({
      kind: "objective_advanced",
      payload: {
        combat_id: combat.combat_id,
        objective_id: objective.objective_id,
        previous: objective.progress,
        current,
        status: current === objective.threshold ? "completed" : "active",
      },
    });
  }
  return events;
}

export function decideExecuteCombatAction(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "execute_combat_action" }>;
  },
): CommandDecision {
  const catalog = pinnedCatalog(input);
  if (isRejection(catalog)) return catalog;
  const combat = combatFor(input.state, input.command.payload.combat_id);
  if (isRejection(combat)) return combat;
  if (combat.active_actor_id === null)
    return reject("No combat actor is active.");
  if (input.legal_action_id_for === undefined) {
    return reject(
      "Combat execution requires deterministic legal-action identities.",
    );
  }
  const candidates = enumerateCombatActions({
    state: input.state,
    catalog,
    actor_id: combat.active_actor_id,
    legal_action_id_for: input.legal_action_id_for,
  });
  const candidate = candidates.find(
    ({ legal_action_id }) =>
      legal_action_id === input.command.payload.legal_action_id,
  );
  if (candidate === undefined)
    return reject("The selected combat action is not legal.");
  const actor = combat.participants.find(
    ({ actor_id }) => actor_id === candidate.actor_id,
  );
  if (actor === undefined)
    return reject("The active combat actor is unavailable.");
  const slot = validateActionSlotSpend(actor, candidate.slot);
  if (!slot.success)
    return reject(slot.issues[0]?.message ?? "Action slot is unavailable.");
  const ability = abilityForCandidate(catalog, candidate);
  if (candidate.source_definition !== null && ability === null) {
    return reject("The selected combat ability is unavailable.");
  }
  const costs =
    ability === null ? [] : costEvents({ state: input.state, actor, ability });
  if (isRejection(costs)) return costs;
  const events: DomainEventProposal[] = [...costs];
  if (ability !== null && actor.side === "hero") {
    const character = input.state.party.characters.find(
      ({ foundation }) => foundation.actor_id === actor.actor_id,
    );
    const sceneUse = character?.scene_ability_uses.find(
      ({ ability: used }) =>
        used.content_definition_id === ability.content_definition_id &&
        used.definition_revision === ability.definition_revision,
    );
    if (sceneUse !== undefined) {
      if (sceneUse.used) return reject("The scene ability is already spent.");
      events.push({
        kind: "scene_ability_used",
        payload: {
          character_id: character!.character_id,
          ability: referenceOf(ability),
        },
      });
    }
  }
  events.push({
    kind: "action_slot_spent",
    payload: {
      combat_id: combat.combat_id,
      actor_id: actor.actor_id,
      slot: candidate.slot,
    },
  });
  if (candidate.action_kind === "pass") {
    if (input.command.payload.invoke_spark)
      return reject("Passing cannot invoke Spark.");
    return { accepted: true, events };
  }
  if (
    (candidate.action_kind === "move" || candidate.action_kind === "dash") &&
    ability === null
  ) {
    if (
      input.command.payload.invoke_spark ||
      candidate.target.kind !== "zone"
    ) {
      return reject("Basic movement cannot invoke Spark and requires a zone.");
    }
    events.push({
      kind: "actor_moved",
      payload: {
        combat_id: combat.combat_id,
        actor_id: actor.actor_id,
        from_zone_id: actor.zone_id,
        to_zone_id: candidate.target.zone_id,
      },
    });
    return { accepted: true, events };
  }
  if (ability === null) {
    if (input.command.payload.invoke_spark)
      return reject("This deterministic action cannot invoke Spark.");
    const effects = eventsForResolvedCombatAction({
      decision_input: input,
      candidate,
      ability: null,
      degree: "Success",
      base_impact: null,
    });
    return isRejection(effects)
      ? effects
      : { accepted: true, events: [...events, ...effects] };
  }
  const check = checkForCombatAction({
    state: input.state,
    actor,
    ability,
    candidate,
    catalog,
  });
  const baseImpact = baseImpactFor(ability);
  if (check === null) {
    if (input.command.payload.invoke_spark)
      return reject("A deterministic ability cannot invoke Spark.");
    const effects = eventsForResolvedCombatAction({
      decision_input: input,
      candidate,
      ability,
      degree: "Success",
      base_impact: baseImpact,
    });
    return isRejection(effects)
      ? effects
      : { accepted: true, events: [...events, ...effects] };
  }

  const targetActorId =
    candidate.target.kind === "actor" ? candidate.target.actor_id : undefined;
  const targetParticipant =
    targetActorId !== undefined
      ? combat.participants.find(({ actor_id }) => actor_id === targetActorId)
      : undefined;
  const bossTransition =
    baseImpact !== null &&
    targetParticipant?.side === "enemy" &&
    targetParticipant.kind === "boss" &&
    combat.boss_overlays.some(
      (overlay) =>
        !overlay.active && overlay.actor_id === targetParticipant.actor_id,
    ) &&
    targetParticipant.guard.current <= baseImpact + 2;
  const physical = selectPhysicalRoll({
    attempt: check,
    mandatory_reasons: bossTransition ? ["named_boss_transition"] : [],
    invoke_spark: input.command.payload.invoke_spark,
    resolution_status: "unresolved",
  });
  if (physical.rejected) return reject(physical.message);
  if (physical.selected) {
    if (
      input.pending_check_id === undefined ||
      input.submission_nonce === undefined
    ) {
      return reject("Physical combat resolution requires pending identities.");
    }
    if (physical.spark_spent) {
      events.push({
        kind: "spark_spent",
        payload: { actor_id: actor.actor_id },
      });
    }
    events.push(
      {
        kind: "physical_roll_requested",
        payload: {
          pending_check_id: input.pending_check_id,
          submission_nonce: input.submission_nonce,
          disclosure: physical.disclosure as PhysicalRollDisclosure,
        },
      },
      {
        kind: "combat_action_pending",
        payload: {
          combat_id: combat.combat_id,
          pending_check_id: input.pending_check_id,
          candidate,
          base_impact: baseImpact,
        },
      },
    );
    return { accepted: true, events };
  }
  if (input.random === undefined)
    return reject("Simulated combat resolution requires a random source.");
  const draw = input.random.draw({
    purpose: "check.d20",
    purpose_local_index: 0,
    minimum: 1,
    maximum: 20,
  });
  if (
    draw.campaign_id !== input.command.campaign_id ||
    draw.command_id !== input.command.command_id ||
    draw.purpose !== "check.d20" ||
    draw.purpose_local_index !== 0 ||
    draw.minimum !== 1 ||
    draw.maximum !== 20
  ) {
    return reject("Combat random evidence does not match the action check.");
  }
  const result = resolveCheck({
    action_feasibility: "possible",
    request: check,
    die_face: draw.realized_value as 1,
    roll_mode: "simulated",
  });
  if ("action_feasibility" in result || result.roll_mode !== "simulated") {
    return reject("Combat action check did not resolve.");
  }
  events.push({
    kind: "check_resolved",
    payload: { result, random_draw: draw },
  });
  const effects = eventsForResolvedCombatAction({
    decision_input: input,
    candidate,
    ability,
    degree: result.final_degree,
    base_impact: baseImpact,
  });
  return isRejection(effects)
    ? effects
    : { accepted: true, events: [...events, ...effects] };
}

export function enumerateCombatReactions(input: {
  readonly state: GameState;
  readonly catalog: EngineContentCatalog;
  readonly actor_id: ActorId;
  readonly legal_action_id_for: (
    stable_key: string,
  ) => LegalActionCandidate["legal_action_id"];
}): readonly LegalActionCandidate[] {
  const combat = input.state.combat;
  const actor = combat?.participants.find(
    ({ actor_id }) => actor_id === input.actor_id,
  );
  if (
    combat === null ||
    combat === undefined ||
    combat.status !== "active" ||
    actor === undefined ||
    !actor.reaction_available ||
    !participantAlive(input.state, actor)
  ) {
    return [];
  }
  const candidates: LegalActionCandidate[] = [];
  for (const ability of actorAbilities({ ...input, combat, actor })) {
    if (ability.payload.action_slot !== "reaction") continue;
    for (const target of abilityTargets({
      state: input.state,
      combat,
      actor,
      ability,
    })) {
      const source = referenceOf(ability);
      const stableKey = [
        combat.combat_id,
        actor.actor_id,
        "reaction",
        `${source.content_definition_id}@${source.definition_revision}`,
        targetKey(target),
      ].join("|");
      candidates.push({
        legal_action_id: input.legal_action_id_for(stableKey),
        actor_id: actor.actor_id,
        slot: "reaction",
        action_kind: "use_power",
        source_definition: source,
        target,
        range:
          target.kind === "self"
            ? "self"
            : target.kind === "actor" || target.kind === "actor_to_zone"
              ? (rangeBetweenActors(combat, actor.actor_id, target.actor_id) ??
                "distant")
              : ability.payload.range,
        fallback_score: 0,
        score_tags: [],
      });
    }
  }
  return candidates.sort((left, right) =>
    left.legal_action_id.localeCompare(right.legal_action_id),
  );
}

export function decideOpenReactionWindow(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "open_reaction_window" }>;
  },
): CommandDecision {
  const combat = combatFor(input.state, input.command.payload.combat_id);
  if (isRejection(combat)) return combat;
  if (combat.reaction_window !== null) {
    return reject("A reaction window is already open.");
  }
  const affected = combat.participants.find(
    ({ actor_id }) => actor_id === input.command.payload.triggering_actor_id,
  );
  if (affected === undefined)
    return reject("The affected reaction actor was not found.");
  const available = combat.participants.filter(
    (participant) =>
      participant.reaction_available &&
      participantAlive(input.state, participant),
  );
  const remainder = available
    .filter(({ actor_id }) => actor_id !== affected.actor_id)
    .sort((left, right) => {
      if (left.side !== right.side) return left.side === "hero" ? -1 : 1;
      return left.actor_id.localeCompare(right.actor_id);
    });
  const ordered = [
    ...(affected.reaction_available && participantAlive(input.state, affected)
      ? [affected.actor_id]
      : []),
    ...remainder.map(({ actor_id }) => actor_id),
  ];
  if (ordered.length === 0)
    return reject("No actor has an available reaction.");
  return {
    accepted: true,
    events: [
      {
        kind: "reaction_window_opened",
        payload: {
          combat_id: combat.combat_id,
          window: {
            reaction_window_id: input.command.payload.reaction_window_id,
            triggering_actor_id: affected.actor_id,
            eligible_actor_ids: ordered,
          },
        },
      },
    ],
  };
}

export function decideResolveReaction(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "resolve_reaction" }>;
  },
): CommandDecision {
  const catalog = pinnedCatalog(input);
  if (isRejection(catalog)) return catalog;
  const combat = combatFor(input.state, input.command.payload.combat_id);
  if (isRejection(combat)) return combat;
  const window = combat.reaction_window;
  if (
    window === null ||
    window.reaction_window_id !== input.command.payload.reaction_window_id
  ) {
    return reject("The reaction window is unavailable.");
  }
  if (window.eligible_actor_ids[0] !== input.command.payload.actor_id) {
    return reject("Reaction priority belongs to another actor.");
  }
  if (input.command.payload.legal_action_id === null) {
    const remaining = window.eligible_actor_ids.slice(1);
    return {
      accepted: true,
      events:
        remaining.length === 0
          ? [
              {
                kind: "reaction_window_closed",
                payload: {
                  combat_id: combat.combat_id,
                  reaction_window_id: window.reaction_window_id,
                  used_by_actor_id: null,
                },
              },
            ]
          : [
              {
                kind: "reaction_window_opened",
                payload: {
                  combat_id: combat.combat_id,
                  window: { ...window, eligible_actor_ids: remaining },
                },
              },
            ],
    };
  }
  if (input.legal_action_id_for === undefined) {
    return reject("Reaction resolution requires legal-action identities.");
  }
  const candidate = enumerateCombatReactions({
    state: input.state,
    catalog,
    actor_id: input.command.payload.actor_id,
    legal_action_id_for: input.legal_action_id_for,
  }).find(
    ({ legal_action_id }) =>
      legal_action_id === input.command.payload.legal_action_id,
  );
  if (candidate === undefined)
    return reject("The selected reaction is not legal.");
  const actor = combat.participants.find(
    ({ actor_id }) => actor_id === candidate.actor_id,
  );
  const ability = abilityForCandidate(catalog, candidate);
  if (actor === undefined || ability === null)
    return reject("Reaction ability is unavailable.");
  if (ability.payload.check_profile !== null) {
    return reject("Phase 1 reactions must resolve deterministically.");
  }
  const costs = costEvents({ state: input.state, actor, ability });
  if (isRejection(costs)) return costs;
  const effects = eventsForResolvedCombatAction({
    decision_input: input,
    candidate,
    ability,
    degree: "Success",
    base_impact: baseImpactFor(ability),
  });
  if (isRejection(effects)) return effects;
  return {
    accepted: true,
    events: [
      ...costs,
      {
        kind: "action_slot_spent",
        payload: {
          combat_id: combat.combat_id,
          actor_id: actor.actor_id,
          slot: "reaction",
        },
      },
      ...effects,
      {
        kind: "reaction_window_closed",
        payload: {
          combat_id: combat.combat_id,
          reaction_window_id: window.reaction_window_id,
          used_by_actor_id: actor.actor_id,
        },
      },
    ],
  };
}

export function decideAidDeathTest(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "aid_death_test" }>;
  },
): CommandDecision {
  const combat = input.state.combat;
  if (
    combat === null ||
    combat.combat_id !== input.command.payload.combat_id ||
    combat.status !== "awaiting_death_test"
  ) {
    return reject("No death test is awaiting aid.");
  }
  const pending = input.state.pending_physical_checks.find(
    ({ pending_check_id }) =>
      pending_check_id === input.command.payload.pending_check_id,
  );
  if (
    pending?.continuation?.kind !== "death_test" ||
    pending.continuation.combat_id !== combat.combat_id
  ) {
    return reject("The pending check is not this combat's death test.");
  }
  const deathContinuation = pending.continuation;
  if (pending.disclosure.modifier_breakdown.edge.active) {
    return reject("This death test has already received aid.");
  }
  const target = input.state.party.characters.find(
    ({ character_id }) => character_id === deathContinuation.character_id,
  );
  const aider = input.state.party.characters.find(
    ({ character_id }) =>
      character_id === input.command.payload.aiding_character_id,
  );
  if (target === undefined || aider === undefined || target === aider) {
    return reject("Death-test aid requires another playable hero.");
  }
  const distance = rangeBetweenActors(
    combat,
    aider.foundation.actor_id,
    target.foundation.actor_id,
  );
  if (distance !== "same_zone" && distance !== "adjacent") {
    return reject("The aiding hero is not nearby.");
  }
  const resource = input.command.payload.resource;
  const current =
    resource === "supply"
      ? input.state.party.supply
      : aider.resources.exertion.current;
  const maximum =
    resource === "supply"
      ? input.state.party.supply_maximum
      : aider.resources.exertion.maximum;
  const transition = validateResourceTransition({
    resource,
    current,
    delta: -DEATH_TEST_AID_COST,
    maximum,
  });
  if (!transition.success)
    return reject("The aiding resource cannot pay the cost.");
  const disclosure = pending.disclosure;
  const request = validateValue(CheckRequestSchema, {
    schema_version: SCHEMA_VERSION,
    actor_id: disclosure.actor_id,
    attribute: disclosure.modifier_breakdown.attribute.name,
    attribute_rating: disclosure.modifier_breakdown.attribute.value,
    discipline: disclosure.modifier_breakdown.discipline.name,
    discipline_rating: disclosure.modifier_breakdown.discipline.value,
    target: disclosure.target,
    modifier_state: {
      edge: true,
      hindrance: disclosure.modifier_breakdown.hindrance.active,
    },
    visibility: "eligible_roller",
    stakes: disclosure.stakes,
    outcome_bands: disclosure.outcome_bands,
    action_feasibility: "possible",
    spark_eligible: false,
    eligible_roller: disclosure.eligible_roller,
  });
  if (!request.success) return reject("Aided death-test request is invalid.");
  const updated = createPhysicalRollDisclosure(
    request.value,
    "permanent_death",
  );
  if ("rejected" in updated) return reject(updated.message);
  return {
    accepted: true,
    events: [
      {
        kind: "resource_changed",
        payload: {
          owner:
            resource === "supply"
              ? { scope: "party" }
              : { scope: "character", character_id: aider.character_id },
          resource,
          previous: current,
          current: transition.value,
          reason: `Aid for ${pending.pending_check_id}.`,
        },
      },
      {
        kind: "death_test_aid_applied",
        payload: {
          combat_id: combat.combat_id,
          pending_check_id: pending.pending_check_id,
          aiding_character_id: aider.character_id,
          resource,
          updated_disclosure: updated as PhysicalRollDisclosure,
        },
      },
    ],
  };
}

export function eventsForPendingCombatResolution(input: {
  readonly decision_input: CommandDecisionInput;
  readonly candidate: LegalActionCandidate;
  readonly base_impact: number | null;
  readonly degree: OutcomeDegree;
}): readonly DomainEventProposal[] | RejectedDecision {
  const catalog = input.decision_input.catalog;
  if (catalog === undefined)
    return reject("Combat continuation requires its pinned catalog.");
  const ability = abilityForCandidate(catalog, input.candidate);
  if (input.candidate.source_definition !== null && ability === null) {
    return reject("Pending combat ability is unavailable.");
  }
  return eventsForResolvedCombatAction({
    decision_input: input.decision_input,
    candidate: input.candidate,
    ability,
    degree: input.degree,
    base_impact: input.base_impact,
  });
}

export function eventsForDeathTestResult(input: {
  readonly decision_input: CommandDecisionInput;
  readonly character_id: string;
  readonly degree: OutcomeDegree;
}): readonly DomainEventProposal[] | RejectedDecision {
  const state = input.decision_input.state;
  const combat = state.combat;
  const character = state.party.characters.find(
    ({ character_id }) => character_id === input.character_id,
  );
  if (combat === null || character === undefined)
    return reject("Death-test state is unavailable.");
  if (input.degree === "Success" || input.degree === "Triumph") {
    const wounds = structuredClone(character.resources.wounds);
    if (wounds[2].status !== "filled")
      return reject("Death-test hero does not have a third Wound.");
    wounds[2] = { slot: 3, status: "empty" };
    const events: DomainEventProposal[] = [
      {
        kind: "hero_stabilized",
        payload: {
          combat_id: combat.combat_id,
          character_id: character.character_id,
          wounds_remaining: 2,
          wounds,
        },
      },
    ];
    if (input.degree === "Triumph") {
      if (input.decision_input.scar_id === undefined) {
        return reject(
          "A triumphant death test requires an allocated Scar identity.",
        );
      }
      events.push({
        kind: "permanent_scar_gained",
        payload: {
          combat_id: combat.combat_id,
          character_id: character.character_id,
          scar_id: input.decision_input.scar_id,
          name: PHASE_1_DEATH_SCAR_NAME,
        },
      });
    }
    return events;
  }
  return [
    {
      kind: "character_died",
      payload: {
        combat_id: combat.combat_id,
        character_id: character.character_id,
        permanent: true,
      },
    },
    ...combatResolutionIfFinished({
      state,
      combat,
      dead_character_id: character.character_id,
    }),
  ];
}
