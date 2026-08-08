import { Type, type Static } from "@sinclair/typebox";
import { PhysicalRollDisclosureSchema } from "../checks.js";
import { RandomDrawRecordSchema } from "../randomness.js";
import { commandEnvelope, eventEnvelope, strictObject } from "../envelopes.js";
import {
  ActorIdSchema,
  CharacterIdSchema,
  ChallengeIdSchema,
  CombatIdSchema,
  LegalActionIdSchema,
  ObjectiveIdSchema,
  PendingCheckIdSchema,
  PhysicalRollNonceSchema,
  ReactionWindowIdSchema,
  RitualIdSchema,
  ScarIdSchema,
  SeatIdSchema,
  SocialLimitIdSchema,
  ZoneIdSchema,
} from "../ids.js";
import { SocialStanceSchema } from "./social.js";
import {
  ResolvedContentReferenceSchema,
  WoundSlotsSchema,
} from "./playable-characters.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "../validation.js";
import { SchemaVersionSchema } from "../versions.js";

export const RANGE_BANDS = [
  "self",
  "same_zone",
  "adjacent",
  "distant",
] as const;
export const RangeBandSchema = Type.Union(
  RANGE_BANDS.map((range) => Type.Literal(range)),
);
export const CombatSideSchema = Type.Union([
  Type.Literal("hero"),
  Type.Literal("enemy"),
]);
export const ActionSlotSchema = Type.Union([
  Type.Literal("action"),
  Type.Literal("maneuver"),
  Type.Literal("reaction"),
]);

export const ZoneSchema = strictObject({
  zone_id: ZoneIdSchema,
  name: Type.String({ minLength: 1, maxLength: 60 }),
  capacity: Type.Integer({ minimum: 1, maximum: 20 }),
  cover: Type.Union([
    Type.Literal("none"),
    Type.Literal("partial"),
    Type.Literal("fortified"),
  ]),
  hazard_tags: Type.Array(Type.String({ minLength: 1, maxLength: 40 }), {
    maxItems: 8,
    uniqueItems: true,
  }),
  objective_ids: Type.Array(ObjectiveIdSchema, {
    maxItems: 8,
    uniqueItems: true,
  }),
  elevation: Type.Union([
    Type.Literal("low"),
    Type.Literal("level"),
    Type.Literal("high"),
  ]),
  visibility: Type.Union([
    Type.Literal("open"),
    Type.Literal("obscured"),
    Type.Literal("blocked"),
  ]),
  connections: Type.Array(ZoneIdSchema, {
    minItems: 1,
    maxItems: 8,
    uniqueItems: true,
  }),
});

export const ZoneGraphSchema = strictObject({
  zones: Type.Array(ZoneSchema, { minItems: 5, maxItems: 9 }),
});

export type Zone = Static<typeof ZoneSchema>;
export type ZoneGraph = Static<typeof ZoneGraphSchema>;
export type RangeBand = Static<typeof RangeBandSchema>;

export function validateZoneGraph(input: unknown): ValidationResult<ZoneGraph> {
  const structural = validateValue(ZoneGraphSchema, input);
  if (!structural.success) return structural;
  const graph = structural.value;
  const zoneById = new Map(graph.zones.map((zone) => [zone.zone_id, zone]));
  const issues: ValidationIssue[] = [];

  graph.zones.forEach((zone, index) => {
    if (zone.connections.includes(zone.zone_id)) {
      issues.push({
        path: `$.zones[${index}].connections`,
        code: "zone.self_connection",
        message: "A zone cannot connect to itself.",
      });
    }
    zone.connections.forEach((connection) => {
      const other = zoneById.get(connection);
      if (other === undefined) {
        issues.push({
          path: `$.zones[${index}].connections`,
          code: "zone.missing_connection",
          message: `Connection ${connection} does not name a zone.`,
        });
      } else if (!other.connections.includes(zone.zone_id)) {
        issues.push({
          path: `$.zones[${index}].connections`,
          code: "zone.asymmetric_connection",
          message: `Connection to ${connection} is not symmetric.`,
        });
      }
    });
  });

  if (graph.zones.length > 0) {
    const first = graph.zones[0];
    if (first !== undefined) {
      const visited = new Set<string>();
      const pending = [first.zone_id];
      while (pending.length > 0) {
        const current = pending.pop();
        if (current === undefined || visited.has(current)) continue;
        visited.add(current);
        const zone = zoneById.get(current);
        if (zone !== undefined) pending.push(...zone.connections);
      }
      if (visited.size !== graph.zones.length) {
        issues.push({
          path: "$.zones",
          code: "zone.disconnected_graph",
          message: "Every battlefield zone must be connected.",
        });
      }
    }
  }

  return issues.length === 0
    ? { success: true, value: graph }
    : validationFailure(issues);
}

const CombatParticipantCommon = {
  actor_id: ActorIdSchema,
  zone_id: ZoneIdSchema,
  action_available: Type.Boolean(),
  maneuver_available: Type.Boolean(),
  reaction_available: Type.Boolean(),
  activation_spent: Type.Boolean(),
};

export const CombatParticipantSchema = Type.Union([
  strictObject({
    ...CombatParticipantCommon,
    side: Type.Literal("hero"),
    kind: Type.Literal("hero"),
    eligible_roller: SeatIdSchema,
  }),
  strictObject({
    ...CombatParticipantCommon,
    side: Type.Literal("enemy"),
    kind: Type.Union([Type.Literal("squad"), Type.Literal("boss")]),
    reinforcement_trigger: Type.Optional(
      Type.Union([
        Type.Literal("round_2"),
        Type.Literal("objective_progress_2"),
      ]),
    ),
    definition: ResolvedContentReferenceSchema,
    guard: strictObject({
      current: Type.Integer({ minimum: 0 }),
      maximum: Type.Integer({ minimum: 1 }),
    }),
    armor: Type.Integer({ minimum: 0 }),
  }),
]);

export const ObjectiveStateSchema = strictObject({
  objective_id: ObjectiveIdSchema,
  definition: ResolvedContentReferenceSchema,
  progress: Type.Integer({ minimum: 0 }),
  threshold: Type.Integer({ minimum: 1 }),
  status: Type.Union([
    Type.Literal("active"),
    Type.Literal("completed"),
    Type.Literal("failed"),
  ]),
});

export const BossOverlayStateSchema = strictObject({
  actor_id: ActorIdSchema,
  definition: ResolvedContentReferenceSchema,
  active: Type.Boolean(),
  objective_id: ObjectiveIdSchema,
});

export const ReactionWindowSchema = strictObject({
  reaction_window_id: ReactionWindowIdSchema,
  triggering_actor_id: ActorIdSchema,
  eligible_actor_ids: Type.Array(ActorIdSchema, {
    minItems: 1,
    maxItems: 10,
    uniqueItems: true,
  }),
});

export const CombatStateSchema = strictObject({
  schema_version: SchemaVersionSchema,
  record_kind: Type.Literal("combat_state"),
  combat_id: CombatIdSchema,
  status: Type.Union([
    Type.Literal("active"),
    Type.Literal("awaiting_physical_action"),
    Type.Literal("awaiting_death_test"),
    Type.Literal("resolved"),
  ]),
  round: Type.Integer({ minimum: 1 }),
  active_side: CombatSideSchema,
  active_actor_id: Type.Union([Type.Null(), ActorIdSchema]),
  battlefield: ZoneGraphSchema,
  participants: Type.Array(CombatParticipantSchema, {
    minItems: 2,
    maxItems: 20,
  }),
  objectives: Type.Array(ObjectiveStateSchema, { maxItems: 8 }),
  boss_overlays: Type.Array(BossOverlayStateSchema, { maxItems: 4 }),
  reaction_window: Type.Union([Type.Null(), ReactionWindowSchema]),
  pending_death_check_id: Type.Union([Type.Null(), PendingCheckIdSchema]),
  pending_action_check_id: Type.Union([Type.Null(), PendingCheckIdSchema]),
});

export type CombatState = Static<typeof CombatStateSchema>;

export function validateActionSlotSpend(
  participant: Static<typeof CombatParticipantSchema>,
  slot: Static<typeof ActionSlotSchema>,
): ValidationResult<true> {
  const available =
    slot === "action"
      ? participant.action_available
      : slot === "maneuver"
        ? participant.maneuver_available
        : participant.reaction_available;
  return available
    ? { success: true, value: true }
    : validationFailure([
        {
          path: `$.${slot}_available`,
          code: "combat.action_slot_already_spent",
          message: `${slot} has already been spent this round.`,
        },
      ]);
}

export function validateCombatState(
  input: unknown,
): ValidationResult<CombatState> {
  const structural = validateValue(CombatStateSchema, input);
  if (!structural.success) return structural;
  const combat = structural.value;
  const graph = validateZoneGraph(combat.battlefield);
  const issues: ValidationIssue[] = graph.success ? [] : [...graph.issues];
  const zoneById = new Map(
    combat.battlefield.zones.map((zone) => [zone.zone_id, zone]),
  );
  const actorIds = new Set<string>();
  const occupancy = new Map<string, number>();
  combat.participants.forEach((participant, index) => {
    if (actorIds.has(participant.actor_id)) {
      issues.push({
        path: `$.participants[${index}].actor_id`,
        code: "combat.duplicate_actor",
        message: "An actor can participate only once.",
      });
    }
    actorIds.add(participant.actor_id);
    if (!zoneById.has(participant.zone_id)) {
      issues.push({
        path: `$.participants[${index}].zone_id`,
        code: "combat.unknown_zone",
        message: "Participant position must name a battlefield zone.",
      });
    }
    occupancy.set(
      participant.zone_id,
      (occupancy.get(participant.zone_id) ?? 0) + 1,
    );
    if (
      participant.side === "enemy" &&
      participant.guard.current > participant.guard.maximum
    ) {
      issues.push({
        path: `$.participants[${index}].guard.current`,
        code: "combat.enemy_guard_overflow",
        message: "Enemy Guard cannot exceed its resolved maximum.",
      });
    }
    if (
      participant.side === "enemy" &&
      participant.reinforcement_trigger !== undefined &&
      combat.round === 1 &&
      combat.objectives.every(({ progress }) => progress < 2) &&
      !participant.activation_spent
    ) {
      issues.push({
        path: `$.participants[${index}].activation_spent`,
        code: "combat.reinforcement_entered_early",
        message: "A reinforcement must remain spent until its trigger.",
      });
    }
  });
  if (combat.active_actor_id !== null) {
    const active = combat.participants.find(
      ({ actor_id }) => actor_id === combat.active_actor_id,
    );
    if (active === undefined || active.side !== combat.active_side) {
      issues.push({
        path: "$.active_actor_id",
        code: "combat.invalid_active_actor",
        message: "The active actor must belong to the active side.",
      });
    } else if (active.activation_spent) {
      issues.push({
        path: "$.active_actor_id",
        code: "combat.spent_active_actor",
        message: "A spent participant cannot remain active.",
      });
    }
  }
  for (const [zoneId, count] of occupancy) {
    const zone = zoneById.get(zoneId);
    if (zone !== undefined && count > zone.capacity) {
      issues.push({
        path: "$.participants",
        code: "combat.zone_over_capacity",
        message: `${zoneId} contains ${count} actors but allows ${zone.capacity}.`,
      });
    }
  }
  combat.objectives.forEach((objective, index) => {
    if (objective.progress > objective.threshold) {
      issues.push({
        path: `$.objectives[${index}].progress`,
        code: "objective.progress_overflow",
        message: "Objective progress cannot exceed its threshold.",
      });
    }
  });
  combat.boss_overlays.forEach((overlay, index) => {
    if (
      !combat.objectives.some(
        ({ objective_id }) => objective_id === overlay.objective_id,
      )
    ) {
      issues.push({
        path: `$.boss_overlays[${index}].objective_id`,
        code: "boss.missing_objective",
        message: "A boss overlay must reference an encounter objective.",
      });
    }
  });
  const awaitsDeath = combat.status === "awaiting_death_test";
  if (awaitsDeath !== (combat.pending_death_check_id !== null)) {
    issues.push({
      path: "$.pending_death_check_id",
      code: "death.pending_state_mismatch",
      message: "Awaiting-death status and pending check identity must agree.",
    });
  }
  const awaitsAction = combat.status === "awaiting_physical_action";
  if (awaitsAction !== (combat.pending_action_check_id !== null)) {
    issues.push({
      path: "$.pending_action_check_id",
      code: "combat.pending_action_state_mismatch",
      message: "Awaiting-action status and pending check identity must agree.",
    });
  }
  if (
    combat.pending_action_check_id !== null &&
    combat.pending_death_check_id !== null
  ) {
    issues.push({
      path: "$.pending_action_check_id",
      code: "combat.multiple_pending_checks",
      message: "Combat can await only one physical continuation.",
    });
  }

  return issues.length === 0
    ? { success: true, value: combat }
    : validationFailure(issues);
}

export const LegalActionTargetSchema = Type.Union([
  strictObject({ kind: Type.Literal("self"), actor_id: ActorIdSchema }),
  strictObject({ kind: Type.Literal("actor"), actor_id: ActorIdSchema }),
  strictObject({
    kind: Type.Literal("actor_to_zone"),
    actor_id: ActorIdSchema,
    zone_id: ZoneIdSchema,
  }),
  strictObject({ kind: Type.Literal("zone"), zone_id: ZoneIdSchema }),
  strictObject({
    kind: Type.Literal("objective"),
    objective_id: ObjectiveIdSchema,
  }),
]);

export const LegalActionCandidateSchema = strictObject({
  legal_action_id: LegalActionIdSchema,
  actor_id: ActorIdSchema,
  slot: ActionSlotSchema,
  action_kind: Type.Union([
    Type.Literal("attack"),
    Type.Literal("use_power"),
    Type.Literal("dash"),
    Type.Literal("move"),
    Type.Literal("change_stance"),
    Type.Literal("interact"),
    Type.Literal("advance_objective"),
    Type.Literal("pass"),
  ]),
  source_definition: Type.Union([Type.Null(), ResolvedContentReferenceSchema]),
  target: LegalActionTargetSchema,
  range: RangeBandSchema,
  fallback_score: Type.Integer({ minimum: -1000, maximum: 1000 }),
  score_tags: Type.Array(Type.String({ minLength: 1, maxLength: 40 }), {
    maxItems: 8,
    uniqueItems: true,
  }),
});

export const PendingPhysicalCheckStateSchema = strictObject({
  schema_version: SchemaVersionSchema,
  record_kind: Type.Literal("pending_physical_check_state"),
  pending_check_id: PendingCheckIdSchema,
  submission_nonce: PhysicalRollNonceSchema,
  disclosure: PhysicalRollDisclosureSchema,
  status: Type.Literal("awaiting_submission"),
  continuation: Type.Union([
    Type.Null(),
    strictObject({
      kind: Type.Literal("combat_action"),
      candidate: LegalActionCandidateSchema,
      base_impact: Type.Union([
        Type.Null(),
        Type.Integer({ minimum: 1, maximum: 20 }),
      ]),
    }),
    strictObject({
      kind: Type.Literal("death_test"),
      combat_id: CombatIdSchema,
      character_id: CharacterIdSchema,
    }),
    strictObject({
      kind: Type.Literal("challenge"),
      challenge_id: ChallengeIdSchema,
    }),
    strictObject({
      kind: Type.Literal("social"),
      npc_actor_id: ActorIdSchema,
      requested_stance: SocialStanceSchema,
      challenged_limit_id: Type.Union([Type.Null(), SocialLimitIdSchema]),
    }),
    strictObject({
      kind: Type.Literal("ritual"),
      ritual_id: RitualIdSchema,
    }),
  ]),
});

const CombatCommandCommon = { combat_id: CombatIdSchema };

export const StartCombatCommandSchema = commandEnvelope(
  Type.Literal("start_combat"),
  strictObject({ combat: CombatStateSchema }),
);
export const ChooseHeroActivationCommandSchema = commandEnvelope(
  Type.Literal("choose_hero_activation"),
  strictObject({ ...CombatCommandCommon, actor_id: ActorIdSchema }),
);
export const ExecuteCombatActionCommandSchema = commandEnvelope(
  Type.Literal("execute_combat_action"),
  strictObject({
    ...CombatCommandCommon,
    legal_action_id: LegalActionIdSchema,
    invoke_spark: Type.Boolean(),
  }),
);
export const SelectEnemyFallbackCommandSchema = commandEnvelope(
  Type.Literal("select_enemy_fallback"),
  strictObject({ ...CombatCommandCommon, actor_id: ActorIdSchema }),
);
export const WithdrawFromCombatCommandSchema = commandEnvelope(
  Type.Literal("withdraw_from_combat"),
  strictObject({ ...CombatCommandCommon }),
);
export const OpenReactionWindowCommandSchema = commandEnvelope(
  Type.Literal("open_reaction_window"),
  strictObject({
    ...CombatCommandCommon,
    reaction_window_id: ReactionWindowIdSchema,
    triggering_actor_id: ActorIdSchema,
  }),
);
export const ResolveReactionCommandSchema = commandEnvelope(
  Type.Literal("resolve_reaction"),
  strictObject({
    ...CombatCommandCommon,
    reaction_window_id: ReactionWindowIdSchema,
    actor_id: ActorIdSchema,
    legal_action_id: Type.Union([Type.Null(), LegalActionIdSchema]),
  }),
);
export const AidDeathTestCommandSchema = commandEnvelope(
  Type.Literal("aid_death_test"),
  strictObject({
    ...CombatCommandCommon,
    pending_check_id: PendingCheckIdSchema,
    aiding_character_id: CharacterIdSchema,
    resource: Type.Union([Type.Literal("exertion"), Type.Literal("supply")]),
  }),
);

export const CombatStartedEventSchema = eventEnvelope(
  Type.Literal("combat_started"),
  strictObject({ combat: CombatStateSchema }),
);
export const ActivationStartedEventSchema = eventEnvelope(
  Type.Literal("activation_started"),
  strictObject({
    ...CombatCommandCommon,
    actor_id: ActorIdSchema,
    side: CombatSideSchema,
  }),
);
export const ActionSlotSpentEventSchema = eventEnvelope(
  Type.Literal("action_slot_spent"),
  strictObject({
    ...CombatCommandCommon,
    actor_id: ActorIdSchema,
    slot: ActionSlotSchema,
  }),
);
export const ActionSlotRestoredEventSchema = eventEnvelope(
  Type.Literal("action_slot_restored"),
  strictObject({
    ...CombatCommandCommon,
    actor_id: ActorIdSchema,
    slot: ActionSlotSchema,
  }),
);
export const ActorMovedEventSchema = eventEnvelope(
  Type.Literal("actor_moved"),
  strictObject({
    ...CombatCommandCommon,
    actor_id: ActorIdSchema,
    from_zone_id: ZoneIdSchema,
    to_zone_id: ZoneIdSchema,
  }),
);
export const EnemyActionSelectedEventSchema = eventEnvelope(
  Type.Literal("enemy_action_selected"),
  strictObject({
    ...CombatCommandCommon,
    candidate: LegalActionCandidateSchema,
    tie_break: Type.Union([Type.Null(), RandomDrawRecordSchema]),
  }),
);
export const CombatActionPendingEventSchema = eventEnvelope(
  Type.Literal("combat_action_pending"),
  strictObject({
    ...CombatCommandCommon,
    pending_check_id: PendingCheckIdSchema,
    candidate: LegalActionCandidateSchema,
    base_impact: Type.Union([
      Type.Null(),
      Type.Integer({ minimum: 1, maximum: 20 }),
    ]),
  }),
);
export const DeathTestPendingEventSchema = eventEnvelope(
  Type.Literal("death_test_pending"),
  strictObject({
    ...CombatCommandCommon,
    pending_check_id: PendingCheckIdSchema,
    character_id: CharacterIdSchema,
  }),
);
export const ImpactAppliedEventSchema = eventEnvelope(
  Type.Literal("impact_applied"),
  strictObject({
    ...CombatCommandCommon,
    source_actor_id: ActorIdSchema,
    target_actor_id: ActorIdSchema,
    base_impact: Type.Integer({ minimum: 1 }),
    triumph_bonus: Type.Union([Type.Literal(0), Type.Literal(2)]),
    armor_reduction: Type.Integer({ minimum: 0 }),
    applied_impact: Type.Integer({ minimum: 1 }),
    guard_before: Type.Integer({ minimum: 0 }),
    guard_after: Type.Integer({ minimum: 0 }),
  }),
);
export const WoundMarkedEventSchema = eventEnvelope(
  Type.Literal("wound_marked"),
  strictObject({
    ...CombatCommandCommon,
    character_id: CharacterIdSchema,
    wounds: WoundSlotsSchema,
  }),
);
export const ReactionWindowOpenedEventSchema = eventEnvelope(
  Type.Literal("reaction_window_opened"),
  strictObject({ ...CombatCommandCommon, window: ReactionWindowSchema }),
);
export const ReactionWindowClosedEventSchema = eventEnvelope(
  Type.Literal("reaction_window_closed"),
  strictObject({
    ...CombatCommandCommon,
    reaction_window_id: ReactionWindowIdSchema,
    used_by_actor_id: Type.Union([Type.Null(), ActorIdSchema]),
  }),
);
export const ReactionRestoredEventSchema = eventEnvelope(
  Type.Literal("reaction_restored"),
  strictObject({
    ...CombatCommandCommon,
    actor_id: ActorIdSchema,
  }),
);
export const RoundAdvancedEventSchema = eventEnvelope(
  Type.Literal("round_advanced"),
  strictObject({
    ...CombatCommandCommon,
    previous_round: Type.Integer({ minimum: 1 }),
    current_round: Type.Integer({ minimum: 2 }),
  }),
);
export const BossOverlayActivatedEventSchema = eventEnvelope(
  Type.Literal("boss_overlay_activated"),
  strictObject({
    ...CombatCommandCommon,
    overlay: BossOverlayStateSchema,
    guard_before: Type.Integer({ minimum: 0 }),
    guard_after: Type.Integer({ minimum: 0 }),
  }),
);
export const ObjectiveAdvancedEventSchema = eventEnvelope(
  Type.Literal("objective_advanced"),
  strictObject({
    ...CombatCommandCommon,
    objective_id: ObjectiveIdSchema,
    previous: Type.Integer({ minimum: 0 }),
    current: Type.Integer({ minimum: 0 }),
    status: Type.Union([Type.Literal("active"), Type.Literal("completed")]),
  }),
);
export const DeathTestAidAppliedEventSchema = eventEnvelope(
  Type.Literal("death_test_aid_applied"),
  strictObject({
    ...CombatCommandCommon,
    pending_check_id: PendingCheckIdSchema,
    aiding_character_id: CharacterIdSchema,
    resource: Type.Union([Type.Literal("exertion"), Type.Literal("supply")]),
    updated_disclosure: PhysicalRollDisclosureSchema,
  }),
);
export const HeroStabilizedEventSchema = eventEnvelope(
  Type.Literal("hero_stabilized"),
  strictObject({
    ...CombatCommandCommon,
    character_id: CharacterIdSchema,
    wounds_remaining: Type.Literal(2),
    wounds: WoundSlotsSchema,
  }),
);
export const PermanentScarGainedEventSchema = eventEnvelope(
  Type.Literal("permanent_scar_gained"),
  strictObject({
    ...CombatCommandCommon,
    character_id: CharacterIdSchema,
    scar_id: ScarIdSchema,
    name: Type.String({ minLength: 1, maxLength: 80 }),
  }),
);
export const CharacterDiedEventSchema = eventEnvelope(
  Type.Literal("character_died"),
  strictObject({
    ...CombatCommandCommon,
    character_id: CharacterIdSchema,
    permanent: Type.Literal(true),
  }),
);
export const CombatResolvedEventSchema = eventEnvelope(
  Type.Literal("combat_resolved"),
  strictObject({
    ...CombatCommandCommon,
    outcome: Type.Union([
      Type.Literal("heroes_prevailed"),
      Type.Literal("heroes_withdrew"),
      Type.Literal("heroes_defeated"),
    ]),
  }),
);

export type LegalActionCandidate = Static<typeof LegalActionCandidateSchema>;
