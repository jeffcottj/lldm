import {
  CombinedProjectionDeltaSchema,
  CombinedProjectionSnapshotSchema,
  type ClientCommandResult,
  type CombinedProjectionDelivery,
  type ClientDeliverableView,
  type GuidedPresentationManifest,
  HostControlProjectionSchema,
  type ParticipantId,
  type CombinedPublicTvView,
  type ParticipantPrivateView,
  type PlayerHostOperationalView,
  PublicTvProjectionSchema,
  SCHEMA_VERSION,
  SeatPrivateProjectionSchema,
  type SeatPrivateProjection,
  type ServerInternalCombinedView,
  canonicalJson,
  sha256Hex,
  validateCombinedProjectionDelivery,
  validateValue,
} from "@lldm/contracts";
import type { RuntimeProjectionDraft } from "../ports/index.js";

function parseDraft<
  Schema extends
    | typeof PublicTvProjectionSchema
    | typeof SeatPrivateProjectionSchema
    | typeof HostControlProjectionSchema,
>(schema: Schema, draft: RuntimeProjectionDraft | undefined) {
  if (draft === undefined)
    throw new Error("Required mechanical projection is missing.");
  const parsed = validateValue(
    schema,
    JSON.parse(draft.canonical_json) as unknown,
  );
  if (!parsed.success)
    throw new Error("Mechanical projection failed combined validation.");
  return parsed.value;
}

function deliveryId(
  roomSessionId: string,
  audience: string,
  revision: number,
  kind: string,
) {
  return `delivery_${sha256Hex(`${roomSessionId}\u0000${audience}\u0000${revision}\u0000${kind}`).slice(0, 32)}`;
}

function unmaterializedSeatProjection(input: {
  readonly campaign_id: import("@lldm/contracts").CampaignId;
  readonly revision: number;
  readonly audience_key: string;
}): SeatPrivateProjection {
  const candidate = {
    schema_version: SCHEMA_VERSION,
    projection_id: `projection_${sha256Hex(`unmaterialized\u0000${input.campaign_id}\u0000${input.audience_key}`).slice(0, 32)}`,
    campaign_id: input.campaign_id,
    revision: input.revision,
    kind: "seat_private",
    payload: {
      audience_key: input.audience_key,
      character: null,
      pending_physical_checks: [],
      legal_character_actions: [],
      legal_combat_actions: [],
    },
  };
  const parsed = validateValue(SeatPrivateProjectionSchema, candidate);
  if (!parsed.success)
    throw new Error("Unmaterialized seat projection failed validation.");
  return parsed.value;
}

export interface CombinedProjectionSet {
  readonly public_tv: CombinedPublicTvView;
  readonly participants: ReadonlyMap<ParticipantId, ParticipantPrivateView>;
  readonly player_host: PlayerHostOperationalView | null;
  readonly server_internal: ServerInternalCombinedView;
}

export function buildCombinedProjections(input: {
  readonly room: import("@lldm/contracts").RoomState;
  readonly mechanical: readonly RuntimeProjectionDraft[];
  readonly presentation: GuidedPresentationManifest;
  readonly command_results?: ReadonlyMap<
    ParticipantId,
    readonly ClientCommandResult[]
  >;
}): CombinedProjectionSet {
  if (
    input.presentation.presentation_manifest_hash !==
      input.room.presentation_manifest_hash ||
    input.presentation.mechanical_manifest_hash !==
      input.room.mechanical_manifest_hash
  )
    throw new Error("Room and presentation manifest linkage does not match.");
  const publicMechanical = parseDraft(
    PublicTvProjectionSchema,
    input.mechanical.find(({ audience_kind }) => audience_kind === "public"),
  );
  const hostMechanical = parseDraft(
    HostControlProjectionSchema,
    input.mechanical.find(
      ({ audience_kind }) => audience_kind === "host_control",
    ),
  );
  const privateMechanical = new Map(
    input.mechanical
      .filter(({ audience_kind }) => audience_kind === "seat_private")
      .map((draft) => [
        draft.audience_key,
        parseDraft(SeatPrivateProjectionSchema, draft),
      ]),
  );
  const currentBeat = input.presentation.beats.find(
    ({ beat_id }) => beat_id === input.room.current_beat_id,
  );
  if (currentBeat === undefined)
    throw new Error("Current guided presentation beat is unavailable.");
  const prompt = {
    beat_id: currentBeat.beat_id,
    text: currentBeat.public_text,
    options: currentBeat.options,
    tv_mode: currentBeat.tv_mode,
  };
  const publicView: CombinedPublicTvView = {
    schema_version: SCHEMA_VERSION,
    room_session_id: input.room.room_session_id,
    view_revision: input.room.view_revision,
    room_revision: input.room.room_revision,
    mechanical_revision: input.room.mechanical_revision,
    view_kind: "public_tv",
    room_status: input.room.status,
    room_mode: input.room.mode,
    current_beat_id: input.room.current_beat_id,
    participants: input.room.participants.map((participant) => {
      const seat = input.room.seats.find(
        ({ participant_id }) => participant_id === participant.participant_id,
      );
      return {
        participant_id: participant.participant_id,
        display_name: participant.display_name,
        approved: participant.status === "approved",
        seat_id: seat?.seat_id ?? null,
        starter_loadout_id: seat?.starter_loadout_id ?? null,
        is_player_host:
          participant.participant_id === input.room.player_host_participant_id,
      };
    }),
    starter_roster: input.presentation.starter_summaries.map((summary) => {
      const seat = input.room.seats.find(
        ({ starter_loadout_id }) =>
          starter_loadout_id === summary.starter_loadout_id,
      );
      if (seat === undefined)
        throw new Error("Starter summary is not linked to a room seat.");
      return {
        ...summary,
        seat_id: seat.seat_id,
        available: seat.participant_id === null,
      };
    }),
    presentation: prompt,
    recent_public_events: input.room.recent_public_history.slice(-20),
    mechanical: publicMechanical,
    map_layout:
      publicMechanical.payload.combat === null
        ? null
        : input.presentation.map_layout,
    recovery_message:
      input.room.pending_workflow !== null
        ? "Recovering the last committed mechanic. No action will be rerolled."
        : input.room.recoveries.length > 0
          ? "An active player is reconnecting; their spotlight remains reserved."
          : null,
  };
  const participants = new Map<ParticipantId, ParticipantPrivateView>();
  for (const participant of input.room.participants) {
    if (participant.status !== "approved") continue;
    const assigned = input.room.seats.filter(
      ({ participant_id }) => participant_id === participant.participant_id,
    );
    participants.set(participant.participant_id, {
      schema_version: SCHEMA_VERSION,
      room_session_id: input.room.room_session_id,
      view_revision: input.room.view_revision,
      room_revision: input.room.room_revision,
      mechanical_revision: input.room.mechanical_revision,
      view_kind: "participant_private",
      participant_id: participant.participant_id,
      display_name: participant.display_name,
      approved: true,
      is_player_host:
        participant.participant_id === input.room.player_host_participant_id,
      room_status: input.room.status,
      room_mode: input.room.mode,
      supply: publicMechanical.payload.supply,
      supply_maximum: publicMechanical.payload.supply_maximum,
      assigned_seats: assigned.map((seat) => {
        const byCharacter = privateMechanical.get(seat.character_id);
        const bySeat = privateMechanical.get(seat.seat_id);
        const base =
          byCharacter ??
          bySeat ??
          unmaterializedSeatProjection({
            campaign_id: input.room.campaign_id,
            revision: input.room.mechanical_revision,
            audience_key: seat.seat_id,
          });
        return {
          seat_id: seat.seat_id,
          starter_loadout_id: seat.starter_loadout_id,
          selected: participant.selected_seat_id === seat.seat_id,
          activation_eligible: (() => {
            const combat = hostMechanical.payload.state.combat;
            if (
              combat === null ||
              combat.active_actor_id !== null ||
              combat.reaction_window !== null
            )
              return false;
            const living = combat.participants.filter((actor) =>
              actor.side === "enemy"
                ? actor.guard.current > 0
                : !hostMechanical.payload.state.permanent_deaths.some(
                    (characterId) =>
                      hostMechanical.payload.state.party.characters.some(
                        (character) =>
                          character.character_id === characterId &&
                          character.foundation.actor_id === actor.actor_id,
                      ),
                  ),
            );
            const newRoundReady = living.every(
              ({ activation_spent }) => activation_spent,
            );
            const currentSideHasUnspent = living.some(
              (actor) =>
                actor.side === combat.active_side && !actor.activation_spent,
            );
            const expectedSide = newRoundReady
              ? "hero"
              : currentSideHasUnspent
                ? combat.active_side
                : combat.active_side === "hero"
                  ? "enemy"
                  : "hero";
            if (expectedSide !== "hero") return false;
            return living.some(
              (actor) =>
                actor.side === "hero" &&
                actor.actor_id ===
                  base.payload.character?.foundation.actor_id &&
                (!actor.activation_spent || newRoundReady),
            );
          })(),
          reaction_prompt: (() => {
            const window = hostMechanical.payload.state.combat?.reaction_window;
            if (
              window === null ||
              window === undefined ||
              base.payload.character === null ||
              window.eligible_actor_ids[0] !==
                base.payload.character.foundation.actor_id
            )
              return null;
            return {
              reaction_window_id: window.reaction_window_id,
              deadline_at: input.room.reaction_deadline?.deadline_at ?? null,
              paused: input.room.reaction_deadline?.paused ?? false,
            };
          })(),
          mechanical: {
            ...base,
            payload: {
              ...base.payload,
              audience_key: seat.seat_id,
              pending_physical_checks:
                bySeat?.payload.pending_physical_checks ?? [],
            },
          },
          private_clues: input.room.private_clues
            .filter(({ seat_id }) => seat_id === seat.seat_id)
            .map(({ clue_id, text }) => ({ clue_id, text })),
        };
      }),
      available_starters: input.presentation.starter_summaries
        .map((summary) => {
          const seat = input.room.seats.find(
            ({ starter_loadout_id }) =>
              starter_loadout_id === summary.starter_loadout_id,
          );
          if (seat === undefined)
            throw new Error("Starter summary is not linked to a room seat.");
          return {
            ...summary,
            seat_id: seat.seat_id,
            available: seat.participant_id === null,
          };
        })
        .filter(({ available }) => available),
      public_prompt: prompt,
      recent_public_events: input.room.recent_public_history.slice(-20),
      command_results: [
        ...(input.command_results?.get(participant.participant_id) ?? []),
      ].slice(-16),
      reconnect_state: input.room.recoveries.some(
        ({ seat_id, status }) =>
          assigned.some((seat) => seat.seat_id === seat_id) &&
          status === "recovery_required",
      )
        ? "recovery_required"
        : input.room.recoveries.some(({ seat_id }) =>
              assigned.some((seat) => seat.seat_id === seat_id),
            )
          ? "grace"
          : "ready",
    });
  }
  const playerHost: PlayerHostOperationalView | null =
    input.room.player_host_participant_id === null
      ? null
      : {
          schema_version: SCHEMA_VERSION,
          room_session_id: input.room.room_session_id,
          view_revision: input.room.view_revision,
          room_revision: input.room.room_revision,
          mechanical_revision: input.room.mechanical_revision,
          view_kind: "player_host_operational" as const,
          participant_id: input.room.player_host_participant_id,
          pending_joins: input.room.participants
            .filter(({ status }) => status === "pending")
            .map(({ participant_id, display_name }) => ({
              participant_id,
              display_name,
            })),
          approved_participants: input.room.participants
            .filter(({ status }) => status === "approved")
            .map(({ participant_id, display_name }) => ({
              participant_id,
              display_name,
              is_player_host:
                participant_id === input.room.player_host_participant_id,
            })),
          seat_controls: input.room.seats.map(
            ({ seat_id, participant_id }) => ({
              seat_id,
              participant_id,
              disconnected: input.room.recoveries.some(
                (recovery) => recovery.seat_id === seat_id,
              ),
            }),
          ),
          correction_request:
            input.room.correction_request === null
              ? null
              : {
                  correction_request_id:
                    input.room.correction_request.correction_request_id,
                  target_transaction_id:
                    input.room.correction_request.target_transaction_id,
                },
          workflow_recovery_required: input.room.pending_workflow !== null,
          relay_status:
            input.room.current_relay_room_id === null
              ? ("expired" as const)
              : ("connected" as const),
          health: {
            storage: "verified" as const,
            mechanics: "verified" as const,
          },
        };
  const serverInternal: ServerInternalCombinedView = {
    schema_version: SCHEMA_VERSION,
    room_session_id: input.room.room_session_id,
    view_revision: input.room.view_revision,
    room_revision: input.room.room_revision,
    mechanical_revision: input.room.mechanical_revision,
    view_kind: "server_internal",
    room: input.room,
    mechanical: hostMechanical,
    relay_metadata_present: input.room.current_relay_room_id !== null,
  };
  return {
    public_tv: publicView,
    participants,
    player_host: playerHost,
    server_internal: serverInternal,
  };
}

export function snapshotFor(
  view: ClientDeliverableView,
  audienceKey: string,
): CombinedProjectionDelivery {
  const candidate = {
    schema_version: SCHEMA_VERSION,
    delivery_id: deliveryId(
      view.room_session_id,
      audienceKey,
      view.view_revision,
      "snapshot",
    ),
    delivery_kind: "snapshot" as const,
    audience_key: audienceKey,
    view,
  };
  const result = validateValue(CombinedProjectionSnapshotSchema, candidate);
  if (!result.success) throw new Error("Combined snapshot failed validation.");
  return result.value;
}

export function deltaFor(
  previous: ClientDeliverableView,
  next: ClientDeliverableView,
  audienceKey: string,
): CombinedProjectionDelivery {
  if (
    previous.view_kind !== next.view_kind ||
    previous.room_session_id !== next.room_session_id ||
    next.view_revision !== previous.view_revision + 1
  )
    throw new Error(
      "Combined delta requires the same audience and a contiguous revision.",
    );
  const candidate = {
    schema_version: SCHEMA_VERSION,
    delivery_id: deliveryId(
      next.room_session_id,
      audienceKey,
      next.view_revision,
      "delta",
    ),
    delivery_kind: "delta" as const,
    audience_key: audienceKey,
    base_view_revision: previous.view_revision,
    target_view_revision: next.view_revision,
    operations: [{ operation: "replace_view" as const, value: next }],
  };
  const result = validateCombinedProjectionDelivery(candidate);
  if (!result.success) throw new Error("Combined delta failed validation.");
  return result.value;
}

export function combinedProjectionCanonicalJson(
  view: ClientDeliverableView,
): string {
  return canonicalJson(view);
}
