import {
  PHASE_1_CONTENT_MANIFEST_HASH,
  PHASE_1_DEFINITIONS,
  PHASE_1_STARTER_LOADOUTS,
} from "@lldm/content";
import {
  canonicalJson,
  type GameCommand,
  GameCommandSchema,
  GameEventSchema,
  type Phase1ScenarioFixture,
  Phase1ScenarioFixtureSchema,
  type RandomDrawRecord,
  sha256Hex,
  taggedSha256,
  validateValue,
} from "@lldm/contracts";
import {
  applyGameEvent,
  type CommandDecisionInput,
  createEmptyCampaignState,
  type DomainEventProposal,
  decideCommand,
  enumerateCombatActions,
  enumerateCombatReactions,
} from "@lldm/engine";
import { describe, expect, it } from "vitest";
import fixtureJson from "./fixtures/phase-1/floodgate-scenario.json" with {
  type: "json",
};

function fixture(): Phase1ScenarioFixture {
  const result = validateValue(Phase1ScenarioFixtureSchema, fixtureJson);
  if (!result.success) {
    throw new Error(
      `Scenario fixture is invalid: ${result.issues
        .map(({ path, message }) => `${path}: ${message}`)
        .join("; ")}`,
    );
  }
  return result.value;
}

function legalActionId(stableKey: string) {
  return `legal_action_${sha256Hex(stableKey).slice(0, 24)}` as never;
}

describe("deterministic Floodgate and Echo Lantern scenario", () => {
  it("reaches a valid conclusion through a recoverable physical continuation", () => {
    const scenario = fixture();
    expect(scenario.content_manifest_hash).toBe(PHASE_1_CONTENT_MANIFEST_HASH);
    const catalog = {
      content_manifest_hash: PHASE_1_CONTENT_MANIFEST_HASH,
      definitions: PHASE_1_DEFINITIONS,
    };
    let state = createEmptyCampaignState(
      scenario.campaign_id,
      scenario.content_manifest_hash,
    );
    let revision = 0;
    let commandSequence = 0;
    const eventKinds: string[] = [];
    const usedDraws: RandomDrawRecord[] = [];
    let pendingStateHash: string | null = null;

    const parseCommand = (input: unknown): GameCommand => {
      const result = validateValue(GameCommandSchema, input);
      if (!result.success) {
        throw new Error(
          `Scenario command is invalid: ${result.issues
            .map(({ path, message }) => `${path}: ${message}`)
            .join("; ")}`,
        );
      }
      return result.value;
    };
    const makeCommand = (
      commandId: string,
      kind: GameCommand["kind"],
      payload: unknown,
    ) =>
      parseCommand({
        schema_version: 1,
        command_id: commandId,
        transaction_id: `transaction_${commandId}`,
        campaign_id: scenario.campaign_id,
        expected_revision: revision,
        kind,
        payload,
      });
    const randomFor = (commandId: string) => ({
      draw: (request: {
        readonly purpose: RandomDrawRecord["purpose"];
        readonly purpose_local_index: number;
        readonly minimum: number;
        readonly maximum: number;
      }): RandomDrawRecord => {
        const record = scenario.random_draws.find(
          (candidate) =>
            candidate.command_id === commandId &&
            candidate.purpose === request.purpose &&
            candidate.purpose_local_index === request.purpose_local_index &&
            candidate.minimum === request.minimum &&
            candidate.maximum === request.maximum,
        );
        if (record === undefined) {
          throw new Error(
            `No literal draw for ${commandId}:${request.purpose}:${request.minimum}-${request.maximum}.`,
          );
        }
        usedDraws.push(record);
        return record;
      },
    });
    const applyProposals = (
      command: GameCommand,
      proposals: readonly DomainEventProposal[],
    ) => {
      proposals.forEach((proposal, transactionIndex) => {
        revision += 1;
        const parsed = validateValue(GameEventSchema, {
          schema_version: 1,
          event_id: `event_scenario_${revision}`,
          transaction_id: command.transaction_id,
          campaign_id: scenario.campaign_id,
          caused_by_command_id: command.command_id,
          transaction_index: transactionIndex,
          stream_revision: revision,
          ...proposal,
        });
        if (!parsed.success) {
          throw new Error(
            `Scenario event is invalid: ${parsed.issues
              .map(({ path, message }) => `${path}: ${message}`)
              .join("; ")}`,
          );
        }
        const applied = applyGameEvent(state, parsed.value);
        if (!applied.success) {
          throw new Error(
            `Scenario replay failed: ${applied.issues
              .map(({ message }) => message)
              .join("; ")}`,
          );
        }
        eventKinds.push(proposal.kind);
        state = applied.value;
      });
    };
    const run = (
      command: GameCommand,
      extra: Omit<CommandDecisionInput, "state" | "command"> = {},
    ): readonly DomainEventProposal[] => {
      const decision = decideCommand({ state, command, ...extra });
      if (!decision.accepted) {
        throw new Error(`${command.kind} rejected: ${decision.safe_detail}`);
      }
      applyProposals(command, decision.events);
      return decision.events;
    };
    const nextCommandId = (label: string) => {
      commandSequence += 1;
      return `command_scenario_${label}_${commandSequence}`;
    };
    const activateHero = (actorId: string, label: string) =>
      run(
        makeCommand(
          nextCommandId(`${label}_activate`),
          "choose_hero_activation",
          { combat_id: scenario.combat.combat_id, actor_id: actorId },
        ),
      );
    const candidate = (
      predicate: ReturnType<
        typeof enumerateCombatActions
      >[number] extends infer Candidate
        ? (candidate: Candidate) => boolean
        : never,
    ) => {
      const actorId = state.combat?.active_actor_id;
      if (actorId === null || actorId === undefined) {
        throw new Error("Scenario has no active combat actor.");
      }
      const selected = enumerateCombatActions({
        state,
        catalog,
        actor_id: actorId,
        legal_action_id_for: legalActionId,
      }).find(predicate as never);
      if (selected === undefined)
        throw new Error("Scenario action is not legal.");
      return selected;
    };
    const execute = (input: {
      readonly commandId: string;
      readonly candidate: ReturnType<typeof enumerateCombatActions>[number];
      readonly pendingCheckId?: string;
      readonly submissionNonce?: string;
    }) =>
      run(
        makeCommand(input.commandId, "execute_combat_action", {
          combat_id: scenario.combat.combat_id,
          legal_action_id: input.candidate.legal_action_id,
          invoke_spark: false,
        }),
        {
          catalog,
          legal_action_id_for: legalActionId,
          random: randomFor(input.commandId),
          ...(input.pendingCheckId === undefined
            ? {}
            : { pending_check_id: input.pendingCheckId as never }),
          ...(input.submissionNonce === undefined
            ? {}
            : { submission_nonce: input.submissionNonce as never }),
        },
      );
    const pass = (slot: "action" | "maneuver", label: string) => {
      const selected = candidate(
        (action) => action.action_kind === "pass" && action.slot === slot,
      );
      execute({
        commandId: nextCommandId(`${label}_pass_${slot}`),
        candidate: selected,
      });
    };
    const enemyTurn = (input: {
      readonly actorId: string;
      readonly selectCommandId: string;
      readonly attackCommandId: string;
      readonly reactionAfter?: boolean;
    }) => {
      const select = makeCommand(
        input.selectCommandId,
        "select_enemy_fallback",
        {
          combat_id: scenario.combat.combat_id,
          actor_id: input.actorId,
        },
      );
      const selectionEvents = run(select, {
        catalog,
        legal_action_id_for: legalActionId,
        random: randomFor(input.selectCommandId),
      });
      const selection = selectionEvents.find(
        (proposal) => proposal.kind === "enemy_action_selected",
      );
      if (selection?.kind !== "enemy_action_selected") {
        throw new Error("Enemy fallback did not select an action.");
      }
      execute({
        commandId: input.attackCommandId,
        candidate: selection.payload.candidate,
      });

      if (input.reactionAfter) {
        run(
          makeCommand(
            "command_scenario_open_reaction_r1",
            "open_reaction_window",
            {
              combat_id: scenario.combat.combat_id,
              reaction_window_id: "reaction_window_boss_toll_r1",
              triggering_actor_id: "actor_mara_venn_001",
            },
          ),
        );
        run(
          makeCommand(
            "command_scenario_mara_pass_reaction_r1",
            "resolve_reaction",
            {
              combat_id: scenario.combat.combat_id,
              reaction_window_id: "reaction_window_boss_toll_r1",
              actor_id: "actor_mara_venn_001",
              legal_action_id: null,
            },
          ),
          { catalog, legal_action_id_for: legalActionId },
        );
        const reaction = enumerateCombatReactions({
          state,
          catalog,
          actor_id: "actor_ilyra_quill_001",
          legal_action_id_for: legalActionId,
        }).find(
          (action) =>
            action.source_definition?.content_definition_id ===
              "content_signature_answering_call_001" &&
            action.target.kind === "actor" &&
            action.target.actor_id === "actor_ilyra_quill_001",
        );
        if (reaction === undefined)
          throw new Error("Scenario reaction is unavailable.");
        run(
          makeCommand(
            "command_scenario_ilyra_reaction_r1",
            "resolve_reaction",
            {
              combat_id: scenario.combat.combat_id,
              reaction_window_id: "reaction_window_boss_toll_r1",
              actor_id: "actor_ilyra_quill_001",
              legal_action_id: reaction.legal_action_id,
            },
          ),
          { catalog, legal_action_id_for: legalActionId },
        );
      }
      pass("maneuver", `${input.actorId}_enemy`);
    };
    const submitPhysical = (input: {
      readonly commandId: string;
      readonly pendingCheckId: string;
      readonly submissionNonce: string;
      readonly submissionId: string;
      readonly face: number;
    }) =>
      run(
        makeCommand(input.commandId, "submit_die_result", {
          pending_check_id: input.pendingCheckId,
          physical_submission_id: input.submissionId,
          submission_nonce: input.submissionNonce,
          die_face: input.face,
        }),
        { catalog },
      );

    for (const starter of PHASE_1_STARTER_LOADOUTS) {
      run(
        makeCommand(
          `command_scenario_materialize_${starter.foundation.display_name
            .toLowerCase()
            .replaceAll(" ", "_")}`,
          "materialize_character",
          {
            foundation: starter.foundation,
            significant_gear: starter.significant_gear,
          },
        ),
        { catalog },
      );
    }
    run(
      makeCommand("command_scenario_start_combat", "start_combat", {
        combat: scenario.combat,
      }),
      { catalog },
    );

    activateHero("actor_mara_venn_001", "mara_r1");
    execute({
      commandId: "command_scenario_mara_strike_r1",
      candidate: candidate(
        (action) =>
          action.source_definition?.content_definition_id ===
            "content_signature_brace_breach_001" &&
          action.target.kind === "actor" &&
          action.target.actor_id === "actor_bellmaw_custodian_001",
      ),
    });
    pass("maneuver", "mara_r1");
    enemyTurn({
      actorId: "actor_bellmaw_custodian_001",
      selectCommandId: "command_scenario_boss_select_r1",
      attackCommandId: "command_scenario_boss_attack_r1",
      reactionAfter: true,
    });
    activateHero("actor_ilyra_quill_001", "ilyra_r1");
    execute({
      commandId: nextCommandId("ilyra_objective_r1"),
      candidate: candidate(
        (action) =>
          action.source_definition?.content_definition_id ===
            "content_gear_accord_chime_001" &&
          action.target.kind === "objective",
      ),
    });
    pass("maneuver", "ilyra_r1");
    enemyTurn({
      actorId: "actor_floodworn_crew_001",
      selectCommandId: nextCommandId("squad_select_r1"),
      attackCommandId: "command_scenario_squad_attack_r1",
    });
    activateHero("actor_sable_reed_001", "sable_r1");
    execute({
      commandId: nextCommandId("sable_threadline_r1"),
      candidate: candidate(
        (action) =>
          action.source_definition?.content_definition_id ===
            "content_signature_threadline_001" &&
          action.target.kind === "actor_to_zone" &&
          action.target.actor_id === "actor_sable_reed_001" &&
          action.target.zone_id === "zone_gate_controls_001",
      ),
    });
    execute({
      commandId: nextCommandId("sable_objective_r1"),
      candidate: candidate(
        (action) =>
          action.action_kind === "advance_objective" &&
          action.source_definition === null,
      ),
    });
    activateHero("actor_oren_ash_001", "oren_r1");
    execute({
      commandId: "command_scenario_oren_attack_r1",
      candidate: candidate(
        (action) =>
          action.source_definition?.content_definition_id ===
            "content_gear_resonant_wick_case_001" &&
          action.target.kind === "actor" &&
          action.target.actor_id === "actor_floodworn_crew_001",
      ),
    });
    pass("maneuver", "oren_r1");

    activateHero("actor_mara_venn_001", "mara_r2");
    execute({
      commandId: nextCommandId("mara_gear_strike_r2"),
      candidate: candidate(
        (action) =>
          action.source_definition?.content_definition_id ===
            "content_gear_ironroot_hook_001" &&
          action.target.kind === "actor" &&
          action.target.actor_id === "actor_bellmaw_custodian_001",
      ),
      pendingCheckId: "pending_check_boss_transition_r2",
      submissionNonce: "physical_nonce_boss_transition_r2",
    });
    expect(state.pending_physical_checks[0]?.pending_check_id).toBe(
      scenario.expected.pending_physical_check_id,
    );
    pendingStateHash = taggedSha256(canonicalJson(state));
    submitPhysical({
      commandId: "command_scenario_submit_boss_r2",
      pendingCheckId: "pending_check_boss_transition_r2",
      submissionNonce: "physical_nonce_boss_transition_r2",
      submissionId: "physical_submission_boss_transition_r2",
      face: 14,
    });
    pass("maneuver", "mara_r2");
    enemyTurn({
      actorId: "actor_bellmaw_custodian_001",
      selectCommandId: "command_scenario_boss_select_r2",
      attackCommandId: "command_scenario_boss_attack_r2",
    });
    activateHero("actor_ilyra_quill_001", "ilyra_r2");
    execute({
      commandId: nextCommandId("ilyra_objective_r2"),
      candidate: candidate(
        (action) =>
          action.source_definition?.content_definition_id ===
            "content_gear_accord_chime_001" &&
          action.target.kind === "objective",
      ),
    });
    pass("maneuver", "ilyra_r2");
    enemyTurn({
      actorId: "actor_floodworn_crew_001",
      selectCommandId: nextCommandId("squad_select_r2"),
      attackCommandId: "command_scenario_squad_attack_r2",
    });
    activateHero("actor_sable_reed_001", "sable_r2");
    pass("action", "sable_r2");
    pass("maneuver", "sable_r2");
    activateHero("actor_oren_ash_001", "oren_r2");
    execute({
      commandId: "command_scenario_oren_attack_r2",
      candidate: candidate(
        (action) =>
          action.source_definition?.content_definition_id ===
            "content_gear_resonant_wick_case_001" &&
          action.target.kind === "actor" &&
          action.target.actor_id === "actor_floodworn_crew_001",
      ),
    });
    pass("maneuver", "oren_r2");

    activateHero("actor_mara_venn_001", "mara_r3");
    execute({
      commandId: nextCommandId("mara_gear_strike_r3"),
      candidate: candidate(
        (action) =>
          action.source_definition?.content_definition_id ===
            "content_gear_ironroot_hook_001" &&
          action.target.kind === "actor" &&
          action.target.actor_id === "actor_bellmaw_custodian_001",
      ),
      pendingCheckId: "pending_check_boss_transition_r3",
      submissionNonce: "physical_nonce_boss_transition_r3",
    });
    submitPhysical({
      commandId: "command_scenario_submit_boss_r3",
      pendingCheckId: "pending_check_boss_transition_r3",
      submissionNonce: "physical_nonce_boss_transition_r3",
      submissionId: "physical_submission_boss_transition_r3",
      face: 14,
    });
    pass("maneuver", "mara_r3");
    enemyTurn({
      actorId: "actor_bellmaw_custodian_001",
      selectCommandId: "command_scenario_boss_select_r3",
      attackCommandId: "command_scenario_boss_attack_r3",
    });
    activateHero("actor_ilyra_quill_001", "ilyra_r3");
    pass("action", "ilyra_r3");
    pass("maneuver", "ilyra_r3");
    activateHero("actor_sable_reed_001", "sable_r3");
    pass("action", "sable_r3");
    pass("maneuver", "sable_r3");
    activateHero("actor_oren_ash_001", "oren_r3");
    execute({
      commandId: "command_scenario_oren_attack_r3",
      candidate: candidate(
        (action) =>
          action.source_definition?.content_definition_id ===
            "content_gear_resonant_wick_case_001" &&
          action.target.kind === "actor" &&
          action.target.actor_id === "actor_bellmaw_custodian_001",
      ),
    });
    pass("maneuver", "oren_r3");

    activateHero("actor_mara_venn_001", "mara_r4");
    execute({
      commandId: "command_scenario_mara_strike_r4",
      candidate: candidate(
        (action) =>
          action.source_definition?.content_definition_id ===
            "content_gear_ironroot_hook_001" &&
          action.target.kind === "actor" &&
          action.target.actor_id === "actor_bellmaw_custodian_001",
      ),
    });
    expect(state.combat?.status).toBe("resolved");

    const check = (input: {
      readonly actorId: string;
      readonly attribute: "Insight" | "Presence";
      readonly discipline: "Mysticism" | "Influence";
      readonly stakes: string;
    }) => {
      const character = state.party.characters.find(
        ({ foundation }) => foundation.actor_id === input.actorId,
      );
      if (character === undefined)
        throw new Error("Scenario check actor is missing.");
      const attributeRating = character.foundation.attributes.find(
        ({ attribute }) => attribute === input.attribute,
      )?.rating;
      const disciplineRating = character.foundation.disciplines.find(
        ({ discipline }) => discipline === input.discipline,
      )?.rating;
      if (attributeRating === undefined || disciplineRating === undefined) {
        throw new Error("Scenario check ratings are missing.");
      }
      return {
        request: {
          schema_version: 1 as const,
          actor_id: input.actorId,
          attribute: input.attribute,
          attribute_rating: attributeRating,
          discipline: input.discipline,
          discipline_rating: disciplineRating,
          target: 13 as const,
          modifier_state: { edge: false, hindrance: false },
          visibility: "public" as const,
          stakes: input.stakes,
          outcome_bands: [
            {
              degree: "Crisis" as const,
              consequence: "Danger escalates sharply.",
            },
            {
              degree: "Setback" as const,
              consequence: "The attempt changes the situation.",
            },
            {
              degree: "Success" as const,
              consequence: "The requested opening is made.",
            },
            {
              degree: "Triumph" as const,
              consequence: "The opening is made with added benefit.",
            },
          ],
          action_feasibility: "possible" as const,
          spark_eligible: true,
        },
        roll_mode: "simulated" as const,
        invoke_spark: false,
      };
    };
    run(
      makeCommand("command_scenario_start_challenge", "start_challenge", {
        challenge: scenario.challenge,
      }),
      { catalog },
    );
    for (const commandId of [
      "command_scenario_challenge_1",
      "command_scenario_challenge_2",
    ]) {
      run(
        makeCommand(commandId, "advance_challenge", {
          challenge_id: scenario.challenge.challenge_id,
          check: check({
            actorId: "actor_oren_ash_001",
            attribute: "Insight",
            discipline: "Mysticism",
            stakes: "The next control seal either holds or raises Danger.",
          }),
        }),
        { catalog, random: randomFor(commandId) },
      );
    }
    run(
      makeCommand("command_scenario_social_start", "establish_social_state", {
        social_state: scenario.social_state,
      }),
      { catalog },
    );
    for (const commandId of [
      "command_scenario_social_1",
      "command_scenario_social_2",
    ]) {
      run(
        makeCommand(commandId, "attempt_social_shift", {
          npc_actor_id: scenario.social_state.npc_actor_id,
          requested_stance: "aligned",
          challenged_limit_id: null,
          check: check({
            actorId: "actor_ilyra_quill_001",
            attribute: "Presence",
            discipline: "Influence",
            stakes: "Nera either supports the repair plan or remains cautious.",
          }),
        }),
        { random: randomFor(commandId) },
      );
    }
    run(
      makeCommand("command_scenario_recover_supply", "recover_resource", {
        character_id: "character_oren_ash_001",
        resource: "supply",
        amount: 1,
        source: {
          content_definition_id: "content_upbringing_rooftop_garden_001",
          definition_revision: 1,
        },
      }),
      { catalog },
    );
    run(
      makeCommand("command_scenario_start_ritual", "start_ritual", {
        ritual: scenario.ritual,
        established_fictional_position_tags:
          scenario.established_fictional_position_tags,
      }),
      { catalog },
    );
    for (const paidCostIndex of [0, 1]) {
      run(
        makeCommand(
          `command_scenario_ritual_cost_${paidCostIndex}`,
          "contribute_ritual",
          {
            ritual_id: scenario.ritual.ritual_id,
            character_id: "character_oren_ash_001",
            paid_cost_index: paidCostIndex,
          },
        ),
      );
    }
    run(
      makeCommand("command_scenario_ritual_resolve", "resolve_ritual", {
        ritual_id: scenario.ritual.ritual_id,
        check: check({
          actorId: "actor_oren_ash_001",
          attribute: "Insight",
          discipline: "Mysticism",
          stakes:
            "The remembered passage either opens or consumes the offering in failure.",
        }),
      }),
      {
        catalog,
        random: randomFor("command_scenario_ritual_resolve"),
      },
    );

    const keyKinds = new Set(scenario.expected.key_event_kinds);
    const observedKeyKinds: string[] = [];
    for (const kind of eventKinds) {
      if (keyKinds.has(kind) && !observedKeyKinds.includes(kind)) {
        observedKeyKinds.push(kind);
      }
    }
    expect(observedKeyKinds).toEqual(scenario.expected.key_event_kinds);
    expect(usedDraws).toEqual(scenario.random_draws);
    expect(pendingStateHash).toBe(scenario.expected.pending_state_hash);
    expect(taggedSha256(canonicalJson(state))).toBe(
      scenario.expected.final_state_hash,
    );
    expect(state.pending_physical_checks).toEqual([]);
    expect(state.combat?.status).toBe("resolved");
    expect(state.challenges[0]?.status).toBe(
      scenario.expected.challenge_outcome,
    );
    expect(state.social_states[0]?.stance).toBe(
      scenario.expected.social_stance,
    );
    expect(state.rituals[0]?.status).toBe(scenario.expected.ritual_outcome);
    expect(
      state.party.characters.find(
        ({ character_id }) => character_id === "character_oren_ash_001",
      )?.resolved_significant_gear[0]?.status,
    ).toBe("spent");
    expect(validateValue(Phase1ScenarioFixtureSchema, scenario).success).toBe(
      true,
    );
  });
});
