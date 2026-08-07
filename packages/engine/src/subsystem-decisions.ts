import {
  PhysicalRollDisclosureSchema,
  ResolvedCheckSchema,
  type CheckAttemptInput,
  type ContentDefinition,
  type GameCommand,
  type MechanicalEffect,
  type OutcomeDegree,
  type ResolvedCheck,
  type ResolvedContentReference,
  type SocialState,
  validateChallengeState,
  validateResourceTransition,
  validateRitualStartEligibility,
  validateSocialState,
  validateValue,
} from "@lldm/contracts";
import type {
  CommandDecision,
  CommandDecisionInput,
  DomainEventProposal,
  EngineContentCatalog,
} from "./decide-command.js";
import { selectPhysicalRoll } from "./physical-rolls.js";
import { resolveCheck } from "./resolution.js";

type RejectedDecision = Extract<CommandDecision, { accepted: false }>;

function reject(safeDetail: string): RejectedDecision {
  return {
    accepted: false,
    rejection_code: "engine_legality",
    safe_detail: safeDetail,
  };
}

function isRejection<T>(
  value: T | RejectedDecision,
): value is RejectedDecision {
  return typeof value === "object" && value !== null && "accepted" in value;
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

function pinnedCatalog(
  input: CommandDecisionInput,
): EngineContentCatalog | RejectedDecision {
  if (input.catalog === undefined) {
    return reject(
      "This subsystem command requires the pinned content catalog.",
    );
  }
  return input.catalog.content_manifest_hash ===
    input.state.content_manifest_hash
    ? input.catalog
    : reject("The supplied subsystem catalog is not pinned by this campaign.");
}

function validateCheckActor(
  input: CommandDecisionInput,
  attempt: CheckAttemptInput,
): RejectedDecision | null {
  const character = input.state.party.characters.find(
    ({ foundation }) => foundation.actor_id === attempt.request.actor_id,
  );
  if (character === undefined)
    return reject("Subsystem check actor is not playable.");
  const attribute = character.foundation.attributes.find(
    ({ attribute }) => attribute === attempt.request.attribute,
  )?.rating;
  const discipline = character.foundation.disciplines.find(
    ({ discipline }) => discipline === attempt.request.discipline,
  )?.rating;
  if (
    attribute !== attempt.request.attribute_rating ||
    discipline !== attempt.request.discipline_rating
  ) {
    return reject(
      "Subsystem check ratings do not match authoritative character state.",
    );
  }
  if (attempt.invoke_spark && !character.resources.spark.available) {
    return reject("The subsystem check actor has no available Spark.");
  }
  return null;
}

function resolveSubsystemCheck(input: {
  readonly decision_input: CommandDecisionInput;
  readonly attempt: CheckAttemptInput;
  readonly pending_event: (
    pendingId: NonNullable<CommandDecisionInput["pending_check_id"]>,
  ) => DomainEventProposal;
  readonly on_resolved: (
    result: ResolvedCheck,
  ) => readonly DomainEventProposal[] | RejectedDecision;
}): CommandDecision {
  const actorFailure = validateCheckActor(input.decision_input, input.attempt);
  if (actorFailure !== null) return actorFailure;
  const selected = selectPhysicalRoll({
    attempt: input.attempt.request,
    mandatory_reasons:
      input.attempt.roll_mode === "physical"
        ? [input.attempt.physical_reason]
        : [],
    invoke_spark: input.attempt.invoke_spark,
    resolution_status: "unresolved",
  });
  if (selected.rejected) return reject(selected.message);
  if (selected.selected) {
    if (
      input.decision_input.pending_check_id === undefined ||
      input.decision_input.submission_nonce === undefined
    ) {
      return reject(
        "Physical subsystem resolution requires pending identities.",
      );
    }
    const events: DomainEventProposal[] = [];
    if (selected.spark_spent) {
      events.push({
        kind: "spark_spent",
        payload: { actor_id: input.attempt.request.actor_id },
      });
    }
    const disclosure = validateValue(
      PhysicalRollDisclosureSchema,
      selected.disclosure,
    );
    if (!disclosure.success) {
      return reject("Physical disclosure failed centralized validation.");
    }
    events.push(
      {
        kind: "physical_roll_requested",
        payload: {
          pending_check_id: input.decision_input.pending_check_id,
          submission_nonce: input.decision_input.submission_nonce,
          disclosure: disclosure.value,
        },
      },
      input.pending_event(input.decision_input.pending_check_id),
    );
    return { accepted: true, events };
  }
  if (input.decision_input.random === undefined) {
    return reject("Simulated subsystem resolution requires a random source.");
  }
  const draw = input.decision_input.random.draw({
    purpose: "check.d20",
    purpose_local_index: 0,
    minimum: 1,
    maximum: 20,
  });
  const command = input.decision_input.command;
  if (
    draw.campaign_id !== command.campaign_id ||
    draw.command_id !== command.command_id ||
    draw.purpose !== "check.d20" ||
    draw.purpose_local_index !== 0 ||
    draw.minimum !== 1 ||
    draw.maximum !== 20
  ) {
    return reject("Subsystem random evidence does not match its check.");
  }
  const result = resolveCheck({
    action_feasibility: "possible",
    request: input.attempt.request,
    die_face: draw.realized_value as 1,
    roll_mode: "simulated",
  });
  if ("action_feasibility" in result) return reject(result.reason);
  const validatedResult = validateValue(ResolvedCheckSchema, result);
  if (
    !validatedResult.success ||
    validatedResult.value.roll_mode !== "simulated"
  ) {
    return reject("Subsystem check result failed centralized validation.");
  }
  const effects = input.on_resolved(validatedResult.value);
  if (isRejection(effects)) return effects;
  return {
    accepted: true,
    events: [
      {
        kind: "check_resolved",
        payload: { result: validatedResult.value, random_draw: draw },
      },
      ...effects,
    ],
  };
}

export function decideStartChallenge(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "start_challenge" }>;
  },
): CommandDecision {
  const catalog = pinnedCatalog(input);
  if (isRejection(catalog)) return catalog;
  const challenge = input.command.payload.challenge;
  if (
    input.state.challenges.some(
      ({ challenge_id }) => challenge_id === challenge.challenge_id,
    )
  ) {
    return reject("Challenge identity is already present.");
  }
  const definition = definitionByReference(catalog, challenge.definition);
  if (
    definition?.kind !== "challenge" ||
    definition.payload.progress_maximum !== challenge.progress.maximum ||
    definition.payload.danger_maximum !== challenge.danger.maximum ||
    definition.payload.tie_rule !== challenge.tie_rule ||
    challenge.progress.current !== 0 ||
    challenge.danger.current !== 0 ||
    challenge.status !== "active" ||
    !validateChallengeState(challenge).success
  ) {
    return reject("Challenge start facts do not match pinned content.");
  }
  return {
    accepted: true,
    events: [{ kind: "challenge_started", payload: { challenge } }],
  };
}

export function eventsForChallengeResult(input: {
  readonly decision_input: CommandDecisionInput;
  readonly challenge_id: string;
  readonly result: ResolvedCheck;
}): readonly DomainEventProposal[] | RejectedDecision {
  const catalog = pinnedCatalog(input.decision_input);
  if (isRejection(catalog)) return catalog;
  const challenge = input.decision_input.state.challenges.find(
    ({ challenge_id }) => challenge_id === input.challenge_id,
  );
  if (challenge === undefined || challenge.status !== "active") {
    return reject("Challenge is unavailable or already closed.");
  }
  const definition = definitionByReference(catalog, challenge.definition);
  if (definition?.kind !== "challenge")
    return reject("Challenge definition is unavailable.");
  const effect = definition.payload.outcome_effects.find(
    ({ degree }) => degree === input.result.final_degree,
  );
  if (effect === undefined)
    return reject("Challenge outcome effect is missing.");
  const progressAfter = Math.min(
    challenge.progress.maximum,
    challenge.progress.current + effect.progress,
  );
  const dangerAfter = Math.min(
    challenge.danger.maximum,
    challenge.danger.current + effect.danger,
  );
  const progressFull = progressAfter === challenge.progress.maximum;
  const dangerFull = dangerAfter === challenge.danger.maximum;
  const status =
    progressFull && dangerFull
      ? challenge.tie_rule === "progress_wins"
        ? "completed"
        : challenge.tie_rule === "danger_wins"
          ? "failed"
          : "resolved_with_cost"
      : progressFull
        ? "completed"
        : dangerFull
          ? "failed"
          : "active";
  const events: DomainEventProposal[] = [
    {
      kind: "challenge_tracks_changed",
      payload: {
        challenge_id: challenge.challenge_id,
        progress_before: challenge.progress.current,
        progress_after: progressAfter,
        danger_before: challenge.danger.current,
        danger_after: dangerAfter,
        status,
        result: input.result,
      },
    },
  ];
  if (status !== "active") {
    events.push({
      kind: "challenge_resolved",
      payload: { challenge_id: challenge.challenge_id, outcome: status },
    });
  }
  return events;
}

export function decideAdvanceChallenge(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "advance_challenge" }>;
  },
): CommandDecision {
  const catalog = pinnedCatalog(input);
  if (isRejection(catalog)) return catalog;
  const challenge = input.state.challenges.find(
    ({ challenge_id }) => challenge_id === input.command.payload.challenge_id,
  );
  if (challenge === undefined || challenge.status !== "active") {
    return reject("Challenge is unavailable or already closed.");
  }
  if (
    input.state.pending_physical_checks.some(
      ({ continuation }) =>
        continuation?.kind === "challenge" &&
        continuation.challenge_id === challenge.challenge_id,
    )
  ) {
    return reject("Challenge already has a pending physical check.");
  }
  return resolveSubsystemCheck({
    decision_input: input,
    attempt: input.command.payload.check,
    pending_event: (pendingId) => ({
      kind: "challenge_check_pending",
      payload: {
        challenge_id: challenge.challenge_id,
        pending_check_id: pendingId,
      },
    }),
    on_resolved: (result) =>
      eventsForChallengeResult({
        decision_input: input,
        challenge_id: challenge.challenge_id,
        result,
      }),
  });
}

function statementsMatch(
  left: readonly { text: string; visibility: string }[],
  right: readonly { text: string; visibility: string }[],
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function decideEstablishSocialState(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "establish_social_state" }>;
  },
): CommandDecision {
  const catalog = pinnedCatalog(input);
  if (isRejection(catalog)) return catalog;
  const social = input.command.payload.social_state;
  if (
    input.state.social_states.some(
      ({ npc_actor_id }) => npc_actor_id === social.npc_actor_id,
    )
  ) {
    return reject("Social state is already established for this actor.");
  }
  const definition = definitionByReference(catalog, social.definition);
  if (
    definition?.kind !== "social_profile" ||
    !validateSocialState(social).success ||
    !statementsMatch(definition.payload.motives, social.motives) ||
    !statementsMatch(definition.payload.fears, social.fears) ||
    !statementsMatch(
      definition.payload.hard_limits,
      social.hard_limits.map(({ statement }) => statement),
    ) ||
    definition.payload.initial_stance !== social.stance ||
    definition.payload.leverage_capacity !== social.leverage_capacity ||
    social.leverage.length !== 0
  ) {
    return reject("Social state facts do not match pinned content.");
  }
  return {
    accepted: true,
    events: [
      { kind: "social_state_established", payload: { social_state: social } },
    ],
  };
}

const STANCES = ["closed", "guarded", "receptive", "aligned"] as const;

export function eventsForSocialResult(input: {
  readonly decision_input: CommandDecisionInput;
  readonly npc_actor_id: string;
  readonly requested_stance: SocialState["stance"];
  readonly challenged_limit_id: string | null;
  readonly result: ResolvedCheck;
}): readonly DomainEventProposal[] | RejectedDecision {
  const social = input.decision_input.state.social_states.find(
    ({ npc_actor_id }) => npc_actor_id === input.npc_actor_id,
  );
  if (social === undefined) return reject("Social state is unavailable.");
  if (
    input.challenged_limit_id !== null &&
    social.hard_limits.some(
      ({ social_limit_id }) => social_limit_id === input.challenged_limit_id,
    )
  ) {
    return reject("A social check cannot cross a hard limit.");
  }
  const currentIndex = STANCES.indexOf(social.stance);
  const requestedIndex = STANCES.indexOf(input.requested_stance);
  const steps =
    input.result.final_degree === "Triumph"
      ? 2
      : input.result.final_degree === "Success"
        ? 1
        : 0;
  if (steps === 0 || currentIndex === requestedIndex) return [];
  const direction = requestedIndex > currentIndex ? 1 : -1;
  const nextIndex = Math.max(
    0,
    Math.min(
      STANCES.length - 1,
      currentIndex +
        direction * Math.min(steps, Math.abs(requestedIndex - currentIndex)),
    ),
  );
  const current = STANCES[nextIndex];
  if (current === undefined) return reject("Social stance calculation failed.");
  return [
    {
      kind: "social_stance_changed",
      payload: {
        npc_actor_id: social.npc_actor_id,
        previous: social.stance,
        current,
        result: input.result,
      },
    },
  ];
}

export function decideAttemptSocialShift(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "attempt_social_shift" }>;
  },
): CommandDecision {
  const social = input.state.social_states.find(
    ({ npc_actor_id }) => npc_actor_id === input.command.payload.npc_actor_id,
  );
  if (social === undefined) return reject("Social state is unavailable.");
  if (
    input.state.pending_physical_checks.some(
      ({ continuation }) =>
        continuation?.kind === "social" &&
        continuation.npc_actor_id === social.npc_actor_id,
    )
  ) {
    return reject("Social state already has a pending physical check.");
  }
  if (
    input.command.payload.challenged_limit_id !== null &&
    social.hard_limits.some(
      ({ social_limit_id }) =>
        social_limit_id === input.command.payload.challenged_limit_id,
    )
  ) {
    return reject("A hard limit blocks this social shift before any draw.");
  }
  return resolveSubsystemCheck({
    decision_input: input,
    attempt: input.command.payload.check,
    pending_event: (pendingId) => ({
      kind: "social_check_pending",
      payload: {
        npc_actor_id: social.npc_actor_id,
        pending_check_id: pendingId,
        requested_stance: input.command.payload.requested_stance,
        challenged_limit_id: input.command.payload.challenged_limit_id,
      },
    }),
    on_resolved: (result) =>
      eventsForSocialResult({
        decision_input: input,
        npc_actor_id: social.npc_actor_id,
        requested_stance: input.command.payload.requested_stance,
        challenged_limit_id: input.command.payload.challenged_limit_id,
        result,
      }),
  });
}

export function decideCreateLeverage(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "create_leverage" }>;
  },
): CommandDecision {
  const social = input.state.social_states.find(
    ({ npc_actor_id }) => npc_actor_id === input.command.payload.npc_actor_id,
  );
  if (social === undefined) return reject("Social state is unavailable.");
  if (
    social.leverage.length >= social.leverage_capacity ||
    social.leverage.some(
      ({ leverage_id }) =>
        leverage_id === input.command.payload.leverage.leverage_id,
    )
  ) {
    return reject("Leverage capacity or identity prevents creation.");
  }
  return {
    accepted: true,
    events: [
      {
        kind: "leverage_created",
        payload: {
          npc_actor_id: social.npc_actor_id,
          leverage: input.command.payload.leverage,
        },
      },
    ],
  };
}

export function decideSpendLeverage(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "spend_leverage" }>;
  },
): CommandDecision {
  const social = input.state.social_states.find(
    ({ npc_actor_id }) => npc_actor_id === input.command.payload.npc_actor_id,
  );
  if (
    social === undefined ||
    !social.leverage.some(
      ({ leverage_id }) => leverage_id === input.command.payload.leverage_id,
    )
  ) {
    return reject("Leverage token is unavailable.");
  }
  return {
    accepted: true,
    events: [
      {
        kind: "leverage_spent",
        payload: {
          npc_actor_id: social.npc_actor_id,
          leverage_id: input.command.payload.leverage_id,
        },
      },
    ],
  };
}

function ownsReference(
  input: CommandDecisionInput,
  reference: ResolvedContentReference,
): boolean {
  return input.state.party.characters.some(
    (character) =>
      Object.values(character.resolved_options).some(
        (owned) =>
          owned !== null &&
          owned.content_definition_id === reference.content_definition_id &&
          owned.definition_revision === reference.definition_revision,
      ) ||
      character.resolved_significant_gear.some(
        (gear) =>
          gear.status === "ready" &&
          gear.definition.content_definition_id ===
            reference.content_definition_id &&
          gear.definition.definition_revision === reference.definition_revision,
      ),
  );
}

function significantGearCostsPayable(input: {
  readonly state: CommandDecisionInput["state"];
  readonly costs: readonly Extract<
    Extract<
      GameCommand,
      { kind: "start_ritual" }
    >["payload"]["ritual"]["costs"][number],
    { kind: "significant_gear" }
  >[];
}): boolean {
  const available = input.state.party.characters.flatMap((character) =>
    character.resolved_significant_gear.flatMap((gear) =>
      gear.status === "ready" ? [gear.definition] : [],
    ),
  );
  return input.costs.every((cost) => {
    const index = available.findIndex(
      (definition) =>
        definition.content_definition_id ===
          cost.definition.content_definition_id &&
        definition.definition_revision === cost.definition.definition_revision,
    );
    if (index < 0) return false;
    available.splice(index, 1);
    return true;
  });
}

export function decideStartRitual(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "start_ritual" }>;
  },
): CommandDecision {
  const catalog = pinnedCatalog(input);
  if (isRejection(catalog)) return catalog;
  const ritual = input.command.payload.ritual;
  if (
    input.state.rituals.some(({ ritual_id }) => ritual_id === ritual.ritual_id)
  ) {
    return reject(
      "Ritual identity is already present; restart with a new identity.",
    );
  }
  const definition = definitionByReference(catalog, ritual.definition);
  if (
    definition?.kind !== "ritual" ||
    ritual.status !== "preparing" ||
    ritual.paid_cost_count !== 0 ||
    ritual.contributor_ids.length !== 0 ||
    JSON.stringify(definition.payload.requirements) !==
      JSON.stringify(ritual.requirements) ||
    JSON.stringify(definition.payload.costs) !== JSON.stringify(ritual.costs) ||
    definition.payload.target_mode !== ritual.target.kind
  ) {
    return reject("Ritual start facts do not match pinned content.");
  }
  const requirementsMet = ritual.requirements.every((requirement) => {
    if (requirement.kind === "participant_count") {
      return input.state.party.characters.length >= requirement.minimum;
    }
    if (requirement.kind === "content")
      return ownsReference(input, requirement.definition);
    return input.command.payload.established_fictional_position_tags.includes(
      requirement.tag,
    );
  });
  const supplyCost = ritual.costs.reduce(
    (sum, cost) => sum + (cost.kind === "supply" ? cost.amount : 0),
    0,
  );
  const exertionCost = ritual.costs.reduce(
    (sum, cost) => sum + (cost.kind === "exertion" ? cost.amount : 0),
    0,
  );
  const costsPayable =
    significantGearCostsPayable({
      state: input.state,
      costs: ritual.costs.filter(
        (cost): cost is Extract<typeof cost, { kind: "significant_gear" }> =>
          cost.kind === "significant_gear",
      ),
    }) &&
    input.state.party.supply >= supplyCost &&
    input.state.party.characters.reduce(
      (sum, character) => sum + character.resources.exertion.current,
      0,
    ) >= exertionCost;
  const eligibility = validateRitualStartEligibility({
    requirements_met: requirementsMet,
    costs_payable: costsPayable,
  });
  if (!eligibility.success)
    return reject(eligibility.issues[0]?.message ?? "Ritual cannot start.");
  return {
    accepted: true,
    events: [{ kind: "ritual_started", payload: { ritual } }],
  };
}

export function decideContributeRitual(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "contribute_ritual" }>;
  },
): CommandDecision {
  const ritual = input.state.rituals.find(
    ({ ritual_id }) => ritual_id === input.command.payload.ritual_id,
  );
  const character = input.state.party.characters.find(
    ({ character_id }) => character_id === input.command.payload.character_id,
  );
  if (
    ritual === undefined ||
    ritual.status !== "preparing" ||
    character === undefined
  ) {
    return reject("Ritual or contributor is unavailable.");
  }
  if (input.command.payload.paid_cost_index !== ritual.paid_cost_count) {
    return reject("Ritual costs must be paid once in declared order.");
  }
  const cost = ritual.costs[ritual.paid_cost_count];
  if (cost === undefined) {
    return reject("The ritual has no unpaid cost at the declared index.");
  }
  if (cost.kind === "significant_gear") {
    const gear = character.resolved_significant_gear.find(
      (candidate) =>
        candidate.status === "ready" &&
        candidate.definition.content_definition_id ===
          cost.definition.content_definition_id &&
        candidate.definition.definition_revision ===
          cost.definition.definition_revision,
    );
    if (gear === undefined || gear.definition === null) {
      return reject(
        "The selected contributor does not have the required ready gear.",
      );
    }
    const events: DomainEventProposal[] = [
      {
        kind: "significant_gear_spent",
        payload: {
          character_id: character.character_id,
          slot: gear.slot,
          definition: gear.definition,
          ritual_id: ritual.ritual_id,
        },
      },
      {
        kind: "ritual_contribution",
        payload: {
          ritual_id: ritual.ritual_id,
          character_id: character.character_id,
          paid_cost_index: ritual.paid_cost_count,
        },
      },
    ];
    if (ritual.paid_cost_count + 1 === ritual.costs.length) {
      events.push({
        kind: "ritual_ready",
        payload: { ritual_id: ritual.ritual_id },
      });
    }
    return { accepted: true, events };
  }
  const current =
    cost.kind === "supply"
      ? input.state.party.supply
      : character.resources.exertion.current;
  const maximum =
    cost.kind === "supply"
      ? input.state.party.supply_maximum
      : character.resources.exertion.maximum;
  const transition = validateResourceTransition({
    resource: cost.kind,
    current,
    delta: -cost.amount,
    maximum,
  });
  if (!transition.success)
    return reject("The declared ritual cost cannot be paid.");
  const events: DomainEventProposal[] = [
    {
      kind: "resource_changed",
      payload: {
        owner:
          cost.kind === "supply"
            ? { scope: "party" }
            : { scope: "character", character_id: character.character_id },
        resource: cost.kind,
        previous: current,
        current: transition.value,
        reason: `Ritual cost ${ritual.paid_cost_count}.`,
      },
    },
    {
      kind: "ritual_contribution",
      payload: {
        ritual_id: ritual.ritual_id,
        character_id: character.character_id,
        paid_cost_index: ritual.paid_cost_count,
      },
    },
  ];
  if (ritual.paid_cost_count + 1 === ritual.costs.length) {
    events.push({
      kind: "ritual_ready",
      payload: { ritual_id: ritual.ritual_id },
    });
  }
  return { accepted: true, events };
}

function ritualEffectEvents(input: {
  readonly decision_input: CommandDecisionInput;
  readonly effects: readonly MechanicalEffect[];
  readonly result_actor_id: string;
  readonly ritual_id: string;
}): readonly DomainEventProposal[] | RejectedDecision {
  const character = input.decision_input.state.party.characters.find(
    ({ foundation }) => foundation.actor_id === input.result_actor_id,
  );
  const events: DomainEventProposal[] = [];
  const projected = new Map<string, number>();
  for (const effect of input.effects) {
    if (effect.kind !== "adjust_resource") {
      return reject(
        `Ritual effect ${effect.kind} is not supported by this Phase 1 kernel.`,
      );
    }
    if (effect.target === "self" && character === undefined) {
      return reject("Ritual self-resource target is unavailable.");
    }
    if (effect.resource === "supply" && effect.target !== "party") {
      return reject("Ritual Supply adjustment must target the party.");
    }
    if (effect.resource !== "supply" && effect.target !== "self") {
      return reject("Ritual hero resource adjustment must target self.");
    }
    const stateCurrent =
      effect.resource === "supply"
        ? input.decision_input.state.party.supply
        : character!.resources[effect.resource].current;
    const maximum =
      effect.resource === "supply"
        ? input.decision_input.state.party.supply_maximum
        : character!.resources[effect.resource].maximum;
    const ownerKey =
      effect.resource === "supply"
        ? "party:supply"
        : `${character!.character_id}:${effect.resource}`;
    const current = projected.get(ownerKey) ?? stateCurrent;
    const next = Math.max(0, Math.min(maximum, current + effect.amount));
    projected.set(ownerKey, next);
    events.push({
      kind: "resource_changed",
      payload: {
        owner:
          effect.resource === "supply"
            ? { scope: "party" }
            : { scope: "character", character_id: character!.character_id },
        resource: effect.resource,
        previous: current,
        current: next,
        reason: `Resolved ritual ${input.ritual_id}.`,
      },
    });
  }
  return events;
}

export function eventsForRitualResult(input: {
  readonly decision_input: CommandDecisionInput;
  readonly ritual_id: string;
  readonly result: ResolvedCheck;
}): readonly DomainEventProposal[] | RejectedDecision {
  const ritual = input.decision_input.state.rituals.find(
    ({ ritual_id }) => ritual_id === input.ritual_id,
  );
  const catalog = pinnedCatalog(input.decision_input);
  if (isRejection(catalog)) return catalog;
  if (
    ritual === undefined ||
    (ritual.status !== "ready" && ritual.status !== "awaiting_resolution")
  ) {
    return reject("Ritual is not ready for resolution.");
  }
  const definition = definitionByReference(catalog, ritual.definition);
  if (definition?.kind !== "ritual")
    return reject("Ritual definition is unavailable.");
  const consequence = definition.payload.consequences.find(
    ({ degree }) => degree === input.result.final_degree,
  );
  if (consequence === undefined)
    return reject("Ritual consequence is missing.");
  const effects = ritualEffectEvents({
    decision_input: input.decision_input,
    effects: consequence.effects,
    result_actor_id: input.result.actor_id,
    ritual_id: ritual.ritual_id,
  });
  if (isRejection(effects)) return effects;
  const outcome =
    input.result.final_degree === "Success" ||
    input.result.final_degree === "Triumph"
      ? "completed"
      : "failed";
  return [
    ...effects,
    {
      kind: "ritual_resolved",
      payload: { ritual_id: ritual.ritual_id, result: input.result, outcome },
    },
  ];
}

export function decideResolveRitual(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "resolve_ritual" }>;
  },
): CommandDecision {
  const ritual = input.state.rituals.find(
    ({ ritual_id }) => ritual_id === input.command.payload.ritual_id,
  );
  if (ritual === undefined || ritual.status !== "ready") {
    return reject("Ritual is not ready for resolution.");
  }
  return resolveSubsystemCheck({
    decision_input: input,
    attempt: input.command.payload.check,
    pending_event: (pendingId) => ({
      kind: "ritual_check_pending",
      payload: { ritual_id: ritual.ritual_id, pending_check_id: pendingId },
    }),
    on_resolved: (result) =>
      eventsForRitualResult({
        decision_input: input,
        ritual_id: ritual.ritual_id,
        result,
      }),
  });
}

export function decideInterruptRitual(
  input: CommandDecisionInput & {
    readonly command: Extract<GameCommand, { kind: "interrupt_ritual" }>;
  },
): CommandDecision {
  const ritual = input.state.rituals.find(
    ({ ritual_id }) => ritual_id === input.command.payload.ritual_id,
  );
  if (
    ritual === undefined ||
    ritual.status === "completed" ||
    ritual.status === "failed" ||
    ritual.status === "interrupted"
  ) {
    return reject("Ritual is unavailable or already closed.");
  }
  return {
    accepted: true,
    events: [
      {
        kind: "ritual_interrupted",
        payload: {
          ritual_id: ritual.ritual_id,
          reason: input.command.payload.reason,
        },
      },
    ],
  };
}
