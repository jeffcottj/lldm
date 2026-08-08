import type {
  GuidedOutcome,
  GuidedPresentationManifest,
  RoomCommand,
} from "@lldm/contracts";
import type { TextProviderPort } from "@lldm/providers";
import {
  RoomCoordinator,
  type RoomDecision,
  type RoomStorePort,
} from "@lldm/runtime";
import { selectNarration } from "./narration.js";

export interface GuidedAdvanceResult {
  readonly room_revision: number;
  readonly view_revision: number;
  readonly beat_id: string;
  readonly fallback_narration_used: boolean;
}

export class GuidedRunner {
  readonly #manifest: GuidedPresentationManifest;
  readonly #provider: TextProviderPort;
  readonly #store: RoomStorePort;
  readonly #coordinator: RoomCoordinator;

  constructor(input: {
    readonly manifest: GuidedPresentationManifest;
    readonly provider: TextProviderPort;
    readonly store: RoomStorePort;
  }) {
    this.#manifest = input.manifest;
    this.#provider = input.provider;
    this.#store = input.store;
    this.#coordinator = new RoomCoordinator({ store: input.store });
  }

  operationFor(roomSessionId: RoomCommand["room_session_id"]) {
    const room = this.#store.loadRoom(roomSessionId);
    if (room === null) throw new Error("Guided room is unavailable.");
    const beat = this.#manifest.beats.find(
      ({ beat_id }) => beat_id === room.current_beat_id,
    );
    if (beat === undefined) throw new Error("Guided beat is unavailable.");
    return beat.operation;
  }

  async advance(
    command: RoomCommand,
    outcome: GuidedOutcome,
    optionId?: string,
  ): Promise<GuidedAdvanceResult> {
    const room = this.#store.loadRoom(command.room_session_id);
    if (room === null) throw new Error("Guided room is unavailable.");
    const current = this.#manifest.beats.find(
      ({ beat_id }) => beat_id === room.current_beat_id,
    );
    if (current === undefined)
      throw new Error("Current guided beat is missing.");
    const transition = current.transitions.find(
      (candidate) =>
        candidate.on === outcome &&
        (candidate.on !== "selected_option" ||
          candidate.option_id === optionId),
    );
    if (transition === undefined)
      throw new Error(
        "The outcome is not a declared transition for this beat.",
      );
    const entered = [];
    let next = this.#manifest.beats.find(
      ({ beat_id }) => beat_id === transition.to,
    );
    while (next !== undefined) {
      entered.push(next);
      if (next.kind !== "private_clue") break;
      const continuation = next.transitions.find(({ on }) => on === "continue");
      next =
        continuation === undefined
          ? undefined
          : this.#manifest.beats.find(
              ({ beat_id }) => beat_id === continuation.to,
            );
    }
    if (entered.length === 0)
      throw new Error("Guided transition target is missing.");
    const proposals: NonNullable<
      Extract<RoomDecision, { accepted: true }>["events"]
    >[number][] = [];
    let fallbackUsed = false;
    for (const beat of entered) {
      proposals.push({
        visibility: "public",
        body: {
          kind: "guided_beat_changed",
          payload: {
            beat_id: beat.beat_id,
            ...(optionId === undefined ? {} : { selected_option_id: optionId }),
          },
        },
      });
      if (
        beat.kind === "private_clue" &&
        beat.addressed_seat_id !== undefined &&
        beat.private_text !== undefined
      )
        proposals.push({
          visibility: "participant_private",
          addressed_seat_id: beat.addressed_seat_id,
          body: {
            kind: "private_clue_presented",
            payload: {
              clue_id:
                `private_clue_${beat.beat_id.replace("guided_beat_", "")}` as never,
              seat_id: beat.addressed_seat_id,
              text: beat.private_text,
            },
          },
        });
      const narration = await selectNarration({
        provider: this.#provider,
        manifest: this.#manifest,
        beat,
        committed_fact_codes: [`guided.${outcome}`],
      });
      fallbackUsed ||= narration.fallback_used;
      proposals.push({
        visibility: "public",
        body: {
          kind: "public_narration_recorded",
          payload: {
            template_id: narration.template_id,
            text: narration.text.slice(0, 240),
          },
        },
      });
      if (beat.terminal_conclusion !== null)
        proposals.push({
          visibility: "public",
          body: {
            kind: "room_conclusion_recorded",
            payload: {
              conclusion: beat.terminal_conclusion,
              summary: beat.recent_summary,
            },
          },
        });
    }
    const submitted = this.#coordinator.submit(command, () => ({
      accepted: true,
      events: proposals,
    }));
    if (
      !("commit" in submitted) ||
      submitted.commit.transaction.outcome !== "accepted"
    )
      throw new Error("Guided room transition was rejected.");
    return {
      room_revision: submitted.commit.post_state.room_revision,
      view_revision: submitted.commit.post_state.view_revision,
      beat_id: submitted.commit.post_state.current_beat_id,
      fallback_narration_used: fallbackUsed,
    };
  }
}
