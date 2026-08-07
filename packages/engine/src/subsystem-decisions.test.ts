import {
  ContentDefinitionSchema,
  GameCommandSchema,
  GameEventSchema,
  type CampaignId,
  type ChallengeState,
  type ContentDefinition,
  type ContentManifestHash,
  type GameCommand,
  type GameEvent,
  type GameState,
  type RandomDrawRecord,
  type RitualState,
  type SocialState,
  validateGameState,
  validatePlayableCharacterState,
  validateValue,
} from "@lldm/contracts";
import { describe, expect, it } from "vitest";
import { applyGameEvent } from "./apply-event.js";
import {
  type CommandDecision,
  type DomainEventProposal,
  type EngineContentCatalog,
  decideCommand,
} from "./decide-command.js";
import { createEmptyCampaignState } from "./state.js";
import { fixtureCharacter, fixtureCheckRequest } from "./test-helpers.js";

const campaignId = "campaign_subsystems_001" as CampaignId;
const manifestHash =
  "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as ContentManifestHash;

function content(input: unknown): ContentDefinition {
  const result = validateValue(ContentDefinitionSchema, input);
  if (!result.success) throw new Error("Subsystem content fixture is invalid.");
  return result.value;
}

const challengeDefinition = content({
  schema_version: 1,
  content_definition_id: "content_challenge_floodgate_001",
  definition_revision: 1,
  kind: "challenge",
  payload: {
    display_name: "The Floodgate Sequence",
    rule_text: "Restore four control seals before danger reaches three.",
    progress_maximum: 4,
    danger_maximum: 3,
    tie_rule: "resolved_with_cost",
    outcome_effects: [
      { degree: "Crisis", progress: 0, danger: 2 },
      { degree: "Setback", progress: 0, danger: 1 },
      { degree: "Success", progress: 1, danger: 0 },
      { degree: "Triumph", progress: 1, danger: 1 },
    ],
  },
});

const socialDefinition = content({
  schema_version: 1,
  content_definition_id: "content_social_gatewarden_001",
  definition_revision: 1,
  kind: "social_profile",
  payload: {
    display_name: "Gatewarden Nera",
    motives: [{ text: "Keep the lower ward safe.", visibility: "public" }],
    fears: [
      { text: "The floodgate will fail again.", visibility: "host_control" },
    ],
    initial_stance: "closed",
    leverage_capacity: 1,
    hard_limits: [
      {
        text: "Never abandon the gate while the alarm sounds.",
        visibility: "public",
      },
    ],
  },
});

const ritualDefinition = content({
  schema_version: 1,
  content_definition_id: "content_ritual_echo_lantern_001",
  definition_revision: 1,
  kind: "ritual",
  payload: {
    display_name: "Kindle the Echo Lantern",
    rule_text: "Bind a safe memory into the lantern before the passage opens.",
    scope: "One prepared lantern and the gathered party.",
    time: "One focused scene.",
    requirements: [
      { kind: "participant_count", minimum: 1 },
      { kind: "fictional_position", tag: "echo_lantern_prepared" },
    ],
    costs: [
      { kind: "exertion", amount: 1 },
      { kind: "supply", amount: 1 },
    ],
    target_mode: "place",
    consequences: [
      {
        degree: "Crisis",
        effects: [
          {
            kind: "adjust_resource",
            resource: "guard",
            amount: -1,
            target: "self",
          },
        ],
        text: "The lantern takes more than it gives.",
      },
      {
        degree: "Setback",
        effects: [
          {
            kind: "adjust_resource",
            resource: "exertion",
            amount: -1,
            target: "self",
          },
        ],
        text: "The passage stays shut and the effort lingers.",
      },
      {
        degree: "Success",
        effects: [
          {
            kind: "adjust_resource",
            resource: "supply",
            amount: 1,
            target: "party",
          },
        ],
        text: "The lantern opens a stable passage.",
      },
      {
        degree: "Triumph",
        effects: [
          {
            kind: "adjust_resource",
            resource: "supply",
            amount: 2,
            target: "party",
          },
        ],
        text: "The stable passage also reveals a useful cache.",
      },
    ],
  },
});

const gearDefinition = content({
  schema_version: 1,
  content_definition_id: "content_gear_slate_compass_001",
  definition_revision: 1,
  kind: "ability",
  payload: {
    category: "significant_gear",
    display_name: "Slate Compass",
    rule_text: "Move one nearby ally along a marked route.",
    action_slot: "maneuver",
    cost: [],
    target_mode: "single_actor",
    range: "adjacent",
    fixed_impact: null,
    check_profile: null,
    effects: [{ kind: "move", distance: "adjacent", target: "ally" }],
    narrative_permissions: [
      {
        scope: "exploration",
        permission: "Recall the last safe route marked on its face.",
      },
    ],
  },
});

const gearRitualDefinition = content({
  schema_version: 1,
  content_definition_id: "content_ritual_compass_offering_001",
  definition_revision: 1,
  kind: "ritual",
  payload: {
    display_name: "Offer the Last Route",
    rule_text: "Spend the compass's final route to open a remembered way.",
    scope: "One marked compass.",
    time: "One focused scene.",
    requirements: [{ kind: "fictional_position", tag: "route_marked" }],
    costs: [
      {
        kind: "significant_gear",
        definition: {
          content_definition_id: "content_gear_slate_compass_001",
          definition_revision: 1,
        },
      },
    ],
    target_mode: "place",
    consequences: [
      {
        degree: "Crisis",
        effects: [
          {
            kind: "adjust_resource",
            resource: "guard",
            amount: -1,
            target: "self",
          },
        ],
        text: "The route collapses.",
      },
      {
        degree: "Setback",
        effects: [
          {
            kind: "adjust_resource",
            resource: "exertion",
            amount: -1,
            target: "self",
          },
        ],
        text: "The route remains closed.",
      },
      {
        degree: "Success",
        effects: [
          {
            kind: "adjust_resource",
            resource: "supply",
            amount: 1,
            target: "party",
          },
        ],
        text: "The route opens.",
      },
      {
        degree: "Triumph",
        effects: [
          {
            kind: "adjust_resource",
            resource: "supply",
            amount: 2,
            target: "party",
          },
        ],
        text: "The route opens onto a cache.",
      },
    ],
  },
});

const catalog: EngineContentCatalog = {
  content_manifest_hash: manifestHash,
  definitions: [
    challengeDefinition,
    socialDefinition,
    ritualDefinition,
    gearDefinition,
    gearRitualDefinition,
  ],
};

function command(input: unknown): GameCommand {
  const result = validateValue(GameCommandSchema, input);
  if (!result.success) throw new Error("Subsystem command fixture is invalid.");
  return result.value;
}

function accepted(decision: CommandDecision) {
  if (!decision.accepted) throw new Error(decision.safe_detail);
  return decision;
}

function stateWithPlayable(): GameState {
  const foundation = fixtureCharacter();
  const playable = validatePlayableCharacterState({
    schema_version: 1,
    record_kind: "playable_character_state",
    character_id: foundation.character_id,
    foundation,
    rank: 1,
    resolved_options: {
      heritage_gift: {
        content_definition_id: foundation.heritage_gift_ref,
        definition_revision: 1,
      },
      upbringing: {
        content_definition_id: foundation.upbringing_ref,
        definition_revision: 1,
      },
      archetype: {
        content_definition_id: foundation.archetype_ref,
        definition_revision: 1,
      },
      path: null,
      talent: null,
      capstone: null,
      signature_technique: {
        content_definition_id: "content_technique_threadline_001",
        definition_revision: 1,
      },
    },
    resources: {
      guard: { current: 6, maximum: 6 },
      wounds: [
        { slot: 1, status: "empty" },
        { slot: 2, status: "empty" },
        { slot: 3, status: "empty" },
      ],
      exertion: { current: 3, maximum: 3 },
      spark: { available: true, complication_recovery_used: false },
    },
    significant_gear: foundation.significant_gear,
    resolved_significant_gear: [
      {
        slot: 1,
        definition: {
          content_definition_id: "content_gear_slate_compass_001",
          definition_revision: 1,
        },
        status: "ready",
      },
      { slot: 2, definition: null, status: "empty" },
      { slot: 3, definition: null, status: "empty" },
      { slot: 4, definition: null, status: "empty" },
    ],
    scene_ability_uses: [],
    conditions: [],
  });
  if (!playable.success) throw new Error("Subsystem hero fixture is invalid.");
  const state = createEmptyCampaignState(campaignId, manifestHash);
  state.party.characters.push(playable.value);
  state.party.supply = 1;
  state.party.supply_maximum = 3;
  const validated = validateGameState(state);
  if (!validated.success)
    throw new Error("Subsystem state fixture is invalid.");
  return validated.value;
}

function checkAttempt(input?: {
  readonly physical?: boolean;
  readonly reason?: "pivotal_scene_conclusion";
}) {
  const request = {
    ...fixtureCheckRequest(),
    discipline_rating: 2 as const,
  };
  return input?.physical
    ? {
        request,
        roll_mode: "physical" as const,
        physical_reason: input.reason ?? ("pivotal_scene_conclusion" as const),
        invoke_spark: false,
      }
    : { request, roll_mode: "simulated" as const, invoke_spark: false };
}

function subsystemCommand(
  id: string,
  kind: GameCommand["kind"],
  payload: unknown,
): GameCommand {
  return command({
    schema_version: 1,
    command_id: id,
    transaction_id: `transaction_${id}`,
    campaign_id: campaignId,
    expected_revision: 0,
    kind,
    payload,
  });
}

function random(commandId: string, value: number): RandomDrawRecord {
  return {
    schema_version: 1,
    algorithm_version: "hmac_sha256_v1",
    seed_fingerprint:
      "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    campaign_id: campaignId,
    command_id: commandId as RandomDrawRecord["command_id"],
    purpose: "check.d20",
    purpose_local_index: 0,
    minimum: 1,
    maximum: 20,
    realized_value: value,
    rejection_count: 0,
  };
}

let eventSequence = 0;
function envelope(proposal: DomainEventProposal): GameEvent {
  eventSequence += 1;
  const result = validateValue(GameEventSchema, {
    schema_version: 1,
    event_id: `event_subsystem_${eventSequence}`,
    transaction_id: `transaction_subsystem_${eventSequence}`,
    campaign_id: campaignId,
    caused_by_command_id: `command_subsystem_${eventSequence}`,
    transaction_index: 0,
    stream_revision: eventSequence,
    ...proposal,
  });
  if (!result.success) throw new Error("Subsystem event proposal is invalid.");
  return result.value;
}

function applyProposals(
  state: GameState,
  proposals: readonly DomainEventProposal[],
): GameState {
  return proposals.reduce((current, proposal) => {
    const applied = applyGameEvent(current, envelope(proposal));
    if (!applied.success) {
      throw new Error(applied.issues.map(({ message }) => message).join("; "));
    }
    return applied.value;
  }, state);
}

function challengeState(): ChallengeState {
  return {
    schema_version: 1,
    record_kind: "challenge_state",
    challenge_id: "challenge_floodgate_001",
    definition: {
      content_definition_id: challengeDefinition.content_definition_id,
      definition_revision: challengeDefinition.definition_revision,
    },
    progress: { current: 0, maximum: 4 },
    danger: { current: 0, maximum: 3 },
    tie_rule: "resolved_with_cost",
    status: "active",
  };
}

function socialState(): SocialState {
  return {
    schema_version: 1,
    record_kind: "social_state",
    npc_actor_id: "actor_gatewarden_001",
    definition: {
      content_definition_id: socialDefinition.content_definition_id,
      definition_revision: socialDefinition.definition_revision,
    },
    motives:
      socialDefinition.kind === "social_profile"
        ? socialDefinition.payload.motives
        : [],
    fears:
      socialDefinition.kind === "social_profile"
        ? socialDefinition.payload.fears
        : [],
    stance: "closed",
    leverage: [],
    leverage_capacity: 1,
    hard_limits: [
      {
        social_limit_id: "social_limit_gate_duty_001",
        statement:
          socialDefinition.kind === "social_profile"
            ? socialDefinition.payload.hard_limits[0]!
            : { text: "Unreachable.", visibility: "public" },
      },
    ],
  };
}

function ritualState(id = "ritual_echo_lantern_001"): RitualState {
  if (ritualDefinition.kind !== "ritual")
    throw new Error("Ritual fixture mismatch.");
  return {
    schema_version: 1,
    record_kind: "ritual_state",
    ritual_id: id,
    definition: {
      content_definition_id: ritualDefinition.content_definition_id,
      definition_revision: ritualDefinition.definition_revision,
    },
    status: "preparing",
    requirements: ritualDefinition.payload.requirements,
    costs: ritualDefinition.payload.costs,
    contributor_ids: [],
    paid_cost_count: 0,
    target: { kind: "place", place_tag: "the_lower_floodgate" },
  };
}

function gearRitualState(id = "ritual_compass_offering_001"): RitualState {
  if (gearRitualDefinition.kind !== "ritual") {
    throw new Error("Gear ritual fixture mismatch.");
  }
  return {
    schema_version: 1,
    record_kind: "ritual_state",
    ritual_id: id,
    definition: {
      content_definition_id: gearRitualDefinition.content_definition_id,
      definition_revision: gearRitualDefinition.definition_revision,
    },
    status: "preparing",
    requirements: gearRitualDefinition.payload.requirements,
    costs: gearRitualDefinition.payload.costs,
    contributor_ids: [],
    paid_cost_count: 0,
    target: { kind: "place", place_tag: "the_remembered_way" },
  };
}

describe("challenge decisions", () => {
  it("uses pinned outcome effects and closes a simultaneous threshold as resolved_with_cost", () => {
    let state = stateWithPlayable();
    const start = accepted(
      decideCommand({
        state,
        catalog,
        command: subsystemCommand(
          "command_start_challenge_001",
          "start_challenge",
          {
            challenge: challengeState(),
          },
        ),
      }),
    );
    state = applyProposals(state, start.events);
    const nearTie = structuredClone(state);
    nearTie.challenges[0]!.progress.current = 3;
    nearTie.challenges[0]!.danger.current = 2;
    const validated = validateGameState(nearTie);
    if (!validated.success) throw new Error("Near-tie state is invalid.");
    state = validated.value;

    const advance = subsystemCommand(
      "command_advance_challenge_001",
      "advance_challenge",
      {
        challenge_id: "challenge_floodgate_001",
        check: checkAttempt(),
      },
    );
    const decision = accepted(
      decideCommand({
        state,
        catalog,
        command: advance,
        random: { draw: () => random(advance.command_id, 14) },
      }),
    );
    expect(decision.events.map(({ kind }) => kind)).toEqual([
      "check_resolved",
      "challenge_tracks_changed",
      "challenge_resolved",
    ]);
    state = applyProposals(state, decision.events);
    expect(state.challenges[0]).toMatchObject({
      progress: { current: 4, maximum: 4 },
      danger: { current: 3, maximum: 3 },
      status: "resolved_with_cost",
    });
  });

  it("continues a disclosed physical check exactly once", () => {
    let state = stateWithPlayable();
    state = applyProposals(
      state,
      accepted(
        decideCommand({
          state,
          catalog,
          command: subsystemCommand(
            "command_start_challenge_002",
            "start_challenge",
            {
              challenge: challengeState(),
            },
          ),
        }),
      ).events,
    );
    const advance = subsystemCommand(
      "command_advance_challenge_002",
      "advance_challenge",
      {
        challenge_id: "challenge_floodgate_001",
        check: checkAttempt({ physical: true }),
      },
    );
    const pending = accepted(
      decideCommand({
        state,
        catalog,
        command: advance,
        pending_check_id: "pending_check_challenge_001",
        submission_nonce: "physical_nonce_challenge_001",
      }),
    );
    expect(pending.events.map(({ kind }) => kind)).toEqual([
      "physical_roll_requested",
      "challenge_check_pending",
    ]);
    state = applyProposals(state, pending.events);
    expect(decideCommand({ state, catalog, command: advance })).toMatchObject({
      accepted: false,
    });

    const submit = subsystemCommand(
      "command_submit_challenge_001",
      "submit_die_result",
      {
        pending_check_id: "pending_check_challenge_001",
        physical_submission_id: "physical_submission_challenge_001",
        submission_nonce: "physical_nonce_challenge_001",
        die_face: 9,
      },
    );
    const resolved = accepted(
      decideCommand({ state, catalog, command: submit }),
    );
    expect(resolved.events.map(({ kind }) => kind)).toEqual([
      "check_resolved",
      "challenge_tracks_changed",
    ]);
    state = applyProposals(state, resolved.events);
    expect(state.pending_physical_checks).toHaveLength(0);
    expect(state.challenges[0]?.progress.current).toBe(1);
    expect(decideCommand({ state, catalog, command: submit })).toMatchObject({
      accepted: false,
    });
  });
});

describe("social decisions", () => {
  it("blocks hard limits before drawing and bounds success and Triumph shifts", () => {
    let state = stateWithPlayable();
    state = applyProposals(
      state,
      accepted(
        decideCommand({
          state,
          catalog,
          command: subsystemCommand(
            "command_social_start_001",
            "establish_social_state",
            {
              social_state: socialState(),
            },
          ),
        }),
      ).events,
    );
    let draws = 0;
    const blocked = subsystemCommand(
      "command_social_blocked_001",
      "attempt_social_shift",
      {
        npc_actor_id: "actor_gatewarden_001",
        check: checkAttempt(),
        requested_stance: "aligned",
        challenged_limit_id: "social_limit_gate_duty_001",
      },
    );
    expect(
      decideCommand({
        state,
        command: blocked,
        random: {
          draw: () => {
            draws += 1;
            return random(blocked.command_id, 20);
          },
        },
      }),
    ).toMatchObject({ accepted: false });
    expect(draws).toBe(0);

    const success = subsystemCommand(
      "command_social_success_001",
      "attempt_social_shift",
      {
        npc_actor_id: "actor_gatewarden_001",
        check: checkAttempt(),
        requested_stance: "aligned",
        challenged_limit_id: null,
      },
    );
    state = applyProposals(
      state,
      accepted(
        decideCommand({
          state,
          command: success,
          random: { draw: () => random(success.command_id, 9) },
        }),
      ).events,
    );
    expect(state.social_states[0]?.stance).toBe("guarded");

    const triumph = subsystemCommand(
      "command_social_triumph_001",
      "attempt_social_shift",
      {
        npc_actor_id: "actor_gatewarden_001",
        check: checkAttempt(),
        requested_stance: "aligned",
        challenged_limit_id: null,
      },
    );
    state = applyProposals(
      state,
      accepted(
        decideCommand({
          state,
          command: triumph,
          random: { draw: () => random(triumph.command_id, 14) },
        }),
      ).events,
    );
    expect(state.social_states[0]?.stance).toBe("aligned");
  });

  it("enforces leverage identity and capacity through command and replay", () => {
    let state = stateWithPlayable();
    state = applyProposals(
      state,
      accepted(
        decideCommand({
          state,
          catalog,
          command: subsystemCommand(
            "command_social_start_002",
            "establish_social_state",
            {
              social_state: socialState(),
            },
          ),
        }),
      ).events,
    );
    const create = subsystemCommand(
      "command_leverage_create_001",
      "create_leverage",
      {
        npc_actor_id: "actor_gatewarden_001",
        leverage: {
          leverage_id: "leverage_flood_report_001",
          label: "The concealed flood report",
          visibility: "public",
        },
      },
    );
    state = applyProposals(
      state,
      accepted(decideCommand({ state, command: create })).events,
    );
    expect(decideCommand({ state, command: create })).toMatchObject({
      accepted: false,
    });
    const spend = subsystemCommand(
      "command_leverage_spend_001",
      "spend_leverage",
      {
        npc_actor_id: "actor_gatewarden_001",
        leverage_id: "leverage_flood_report_001",
      },
    );
    state = applyProposals(
      state,
      accepted(decideCommand({ state, command: spend })).events,
    );
    expect(state.social_states[0]?.leverage).toHaveLength(0);
    expect(decideCommand({ state, command: spend })).toMatchObject({
      accepted: false,
    });
  });
});

describe("ritual decisions", () => {
  it("spends an exact ready gear binding and keeps it spent after interruption", () => {
    let state = stateWithPlayable();
    const start = subsystemCommand(
      "command_gear_ritual_start_001",
      "start_ritual",
      {
        ritual: gearRitualState(),
        established_fictional_position_tags: ["route_marked"],
      },
    );
    state = applyProposals(
      state,
      accepted(decideCommand({ state, catalog, command: start })).events,
    );
    const pay = subsystemCommand(
      "command_gear_ritual_pay_001",
      "contribute_ritual",
      {
        ritual_id: "ritual_compass_offering_001",
        character_id: "character_sable_001",
        paid_cost_index: 0,
      },
    );
    const paid = accepted(decideCommand({ state, command: pay }));
    expect(paid.events.map(({ kind }) => kind)).toEqual([
      "significant_gear_spent",
      "ritual_contribution",
      "ritual_ready",
    ]);
    state = applyProposals(state, paid.events);
    expect(
      state.party.characters[0]?.resolved_significant_gear[0]?.status,
    ).toBe("spent");
    const interrupt = subsystemCommand(
      "command_gear_ritual_interrupt_001",
      "interrupt_ritual",
      {
        ritual_id: "ritual_compass_offering_001",
        reason: "The marked route is deliberately broken.",
      },
    );
    state = applyProposals(
      state,
      accepted(decideCommand({ state, command: interrupt })).events,
    );
    expect(
      state.party.characters[0]?.resolved_significant_gear[0]?.status,
    ).toBe("spent");
    const restart = subsystemCommand(
      "command_gear_ritual_restart_001",
      "start_ritual",
      {
        ritual: gearRitualState("ritual_compass_offering_002"),
        established_fictional_position_tags: ["route_marked"],
      },
    );
    expect(decideCommand({ state, catalog, command: restart })).toMatchObject({
      accepted: false,
    });
  });

  it("requires explicit fictional position and preserves paid costs on interruption", () => {
    let state = stateWithPlayable();
    const missing = subsystemCommand(
      "command_ritual_missing_001",
      "start_ritual",
      {
        ritual: ritualState(),
        established_fictional_position_tags: [],
      },
    );
    expect(decideCommand({ state, catalog, command: missing })).toMatchObject({
      accepted: false,
    });
    const start = subsystemCommand("command_ritual_start_001", "start_ritual", {
      ritual: ritualState(),
      established_fictional_position_tags: ["echo_lantern_prepared"],
    });
    state = applyProposals(
      state,
      accepted(decideCommand({ state, catalog, command: start })).events,
    );
    const contribute = subsystemCommand(
      "command_ritual_pay_001",
      "contribute_ritual",
      {
        ritual_id: "ritual_echo_lantern_001",
        character_id: "character_sable_001",
        paid_cost_index: 0,
      },
    );
    state = applyProposals(
      state,
      accepted(decideCommand({ state, command: contribute })).events,
    );
    const interrupt = subsystemCommand(
      "command_ritual_interrupt_001",
      "interrupt_ritual",
      {
        ritual_id: "ritual_echo_lantern_001",
        reason: "The lantern is moved before the binding finishes.",
      },
    );
    state = applyProposals(
      state,
      accepted(decideCommand({ state, command: interrupt })).events,
    );
    expect(state.rituals[0]).toMatchObject({
      status: "interrupted",
      paid_cost_count: 1,
    });
    expect(state.party.characters[0]?.resources.exertion.current).toBe(2);
    expect(state.party.supply).toBe(1);

    const restart = subsystemCommand(
      "command_ritual_restart_001",
      "start_ritual",
      {
        ritual: ritualState("ritual_echo_lantern_002"),
        established_fictional_position_tags: ["echo_lantern_prepared"],
      },
    );
    expect(decideCommand({ state, catalog, command: restart })).toMatchObject({
      accepted: true,
    });
  });

  it("pays declared costs in order and applies degree-specific completion effects", () => {
    let state = stateWithPlayable();
    const start = subsystemCommand("command_ritual_start_002", "start_ritual", {
      ritual: ritualState(),
      established_fictional_position_tags: ["echo_lantern_prepared"],
    });
    state = applyProposals(
      state,
      accepted(decideCommand({ state, catalog, command: start })).events,
    );
    for (const index of [0, 1] as const) {
      const contribution = subsystemCommand(
        `command_ritual_contribution_${index}`,
        "contribute_ritual",
        {
          ritual_id: "ritual_echo_lantern_001",
          character_id: "character_sable_001",
          paid_cost_index: index,
        },
      );
      state = applyProposals(
        state,
        accepted(decideCommand({ state, command: contribution })).events,
      );
    }
    expect(state.rituals[0]?.status).toBe("ready");
    expect(state.party.supply).toBe(0);

    const resolve = subsystemCommand(
      "command_ritual_resolve_001",
      "resolve_ritual",
      {
        ritual_id: "ritual_echo_lantern_001",
        check: checkAttempt(),
      },
    );
    const decision = accepted(
      decideCommand({
        state,
        catalog,
        command: resolve,
        random: { draw: () => random(resolve.command_id, 9) },
      }),
    );
    expect(decision.events.map(({ kind }) => kind)).toEqual([
      "check_resolved",
      "resource_changed",
      "ritual_resolved",
    ]);
    state = applyProposals(state, decision.events);
    expect(state.party.supply).toBe(1);
    expect(state.rituals[0]?.status).toBe("completed");
  });
});

it("does not accept a caller-forged resolved subsystem result", () => {
  const forged = validateValue(GameCommandSchema, {
    schema_version: 1,
    command_id: "command_forged_challenge_001",
    transaction_id: "transaction_forged_challenge_001",
    campaign_id: campaignId,
    expected_revision: 0,
    kind: "advance_challenge",
    payload: {
      challenge_id: "challenge_floodgate_001",
      result: {
        schema_version: 1,
        actor_id: "actor_sable_001",
        die_face: 20,
        final_degree: "Triumph",
      },
    },
  });
  expect(forged.success).toBe(false);
});
