import type { ClientDeliverableView } from "@lldm/contracts";

export type ConnectionPhase =
  | "connecting"
  | "pending_approval"
  | "approved_syncing"
  | "ready"
  | "command_pending"
  | "reconnecting"
  | "recovery_required"
  | "incompatible_protocol"
  | "expired_room"
  | "closed";

export interface ClientState {
  readonly phase: ConnectionPhase;
  readonly participant_view: Extract<
    ClientDeliverableView,
    { view_kind: "participant_private" }
  > | null;
  readonly player_host_view: Extract<
    ClientDeliverableView,
    { view_kind: "player_host_operational" }
  > | null;
  readonly safe_message: string;
}

export const INITIAL_CLIENT_STATE: ClientState = {
  phase: "connecting",
  participant_view: null,
  player_host_view: null,
  safe_message: "Connecting to the room…",
};

export type ClientStateAction =
  | {
      readonly kind: "phase";
      readonly phase: ConnectionPhase;
      readonly message: string;
    }
  | { readonly kind: "view"; readonly view: ClientDeliverableView }
  | { readonly kind: "clear_for_resync"; readonly message: string };

export function reduceClientState(
  state: ClientState,
  action: ClientStateAction,
): ClientState {
  switch (action.kind) {
    case "phase":
      if (
        action.phase === "reconnecting" ||
        action.phase === "recovery_required" ||
        action.phase === "incompatible_protocol" ||
        action.phase === "expired_room"
      )
        return {
          phase: action.phase,
          participant_view: null,
          player_host_view: null,
          safe_message: action.message,
        };
      return { ...state, phase: action.phase, safe_message: action.message };
    case "clear_for_resync":
      return {
        phase: "approved_syncing",
        participant_view: null,
        player_host_view: null,
        safe_message: action.message,
      };
    case "view":
      if (action.view.view_kind === "public_tv") return state;
      if (action.view.view_kind === "participant_private")
        return {
          ...state,
          participant_view: action.view,
          player_host_view: action.view.is_player_host
            ? state.player_host_view
            : null,
          phase: "ready",
          safe_message: "Room state is current.",
        };
      return {
        ...state,
        player_host_view: action.view,
        phase: "ready",
        safe_message: "Room state is current.",
      };
  }
}
