import type {
  ClientCommandIntent,
  ClientCommandResult,
  ParticipantPrivateView,
  PlayerHostOperationalView,
} from "@lldm/contracts";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { PhysicalDisclosure } from "../components/PhysicalDisclosure.js";
import {
  INITIAL_CLIENT_STATE,
  reduceClientState,
} from "../state/connection.js";
import { RoomTransportClient } from "../transport/client.js";

function label(value: string): string {
  return value
    .replace(/^(content|starter_loadout|actor|seat)_/, "")
    .replace(/_\d+$/, "")
    .replaceAll("_", " ");
}

function actionTargetLabel(
  target: ParticipantPrivateView["assigned_seats"][number]["mechanical"]["payload"]["legal_combat_actions"][number]["target"],
): string {
  if ("actor_id" in target) return label(target.actor_id);
  if ("zone_id" in target) return label(target.zone_id);
  if ("objective_id" in target) return label(target.objective_id);
  return "";
}

export function PlayerRoute({ roomId }: { readonly roomId: string }) {
  const [state, dispatch] = useReducer(reduceClientState, INITIAL_CLIENT_STATE);
  const [name, setName] = useState("");
  const [proof, setProof] = useState("");
  const [fallbackCode, setFallbackCode] = useState("");
  const [joinError, setJoinError] = useState<string | null>(null);
  const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null);
  const [selectedActionId, setSelectedActionId] = useState<string | null>(null);
  const [flavor, setFlavor] = useState("");
  const [dieFace, setDieFace] = useState<number | null>(null);
  const [hostRecoveryProof, setHostRecoveryProof] = useState("");
  const [lastResult, setLastResult] = useState<ClientCommandResult | null>(
    null,
  );
  const client = useMemo(
    () =>
      new RoomTransportClient(roomId, window.location.origin, {
        onPhase: (phase, message) =>
          dispatch({ kind: "phase", phase, message }),
        onView: (view) => dispatch({ kind: "view", view }),
        onCommandResult: (result, intentKind) => {
          setLastResult(result);
          setSelectedActionId(null);
          setFlavor("");
          dispatch({
            kind: "phase",
            phase:
              intentKind === "request_join" && result.status === "accepted"
                ? "pending_approval"
                : "ready",
            message:
              intentKind === "request_join" && result.status === "accepted"
                ? "Waiting for the player-host to approve this device."
                : result.safe_detail,
          });
        },
      }),
    [roomId],
  );
  const previousRevision = useRef(0);

  useEffect(() => {
    void client.reconnectIfAvailable().catch(() => {
      dispatch({
        kind: "phase",
        phase: "recovery_required",
        message:
          "Stored reconnect authorization expired. Rejoin from the TV code.",
      });
    });
    return () => client.close();
  }, [client]);

  const participant = state.participant_view;
  const selectedSeat =
    participant?.assigned_seats.find(
      ({ seat_id }) => seat_id === selectedSeatId,
    ) ??
    participant?.assigned_seats.find(({ selected }) => selected) ??
    participant?.assigned_seats[0];
  const selectedAction =
    selectedSeat?.mechanical.payload.legal_combat_actions.find(
      ({ legal_action_id }) => legal_action_id === selectedActionId,
    );
  const pendingPhysical =
    selectedSeat?.mechanical.payload.pending_physical_checks[0];

  useEffect(() => {
    if (participant === null) return;
    if (
      previousRevision.current !== 0 &&
      previousRevision.current !== participant.view_revision &&
      selectedActionId !== null
    ) {
      setSelectedActionId(null);
      dispatch({
        kind: "phase",
        phase: "ready",
        message:
          "The room changed, so the unconfirmed action selection was cleared.",
      });
    }
    previousRevision.current = participant.view_revision;
  }, [participant, selectedActionId]);

  const send = (intent: ClientCommandIntent, seatId?: string) => {
    setLastResult(null);
    client.sendIntent(intent, seatId);
  };

  const join = async () => {
    setJoinError(null);
    const invite =
      new URLSearchParams(window.location.hash.slice(1)).get("invite") ?? "";
    try {
      await client.join(
        name.trim(),
        invite,
        proof.trim() || undefined,
        fallbackCode.trim().toUpperCase() || undefined,
      );
    } catch {
      setJoinError(
        "The invite, name, or first-host proof was not accepted. Check the TV and try again.",
      );
    }
  };

  if (
    participant === null &&
    (state.phase === "reconnecting" ||
      state.phase === "approved_syncing" ||
      state.phase === "recovery_required" ||
      state.phase === "incompatible_protocol" ||
      state.phase === "expired_room")
  )
    return (
      <main className="phone-shell join-screen">
        <p className="eyebrow">Floodgate room</p>
        <h1>
          {state.phase === "reconnecting" || state.phase === "approved_syncing"
            ? "Restoring your room"
            : "Reconnect needs attention"}
        </h1>
        <p role="status" className={`connection phase-${state.phase}`}>
          {state.safe_message}
        </p>
        <p className="fine-print">
          Private choices remain hidden until a fresh filtered room snapshot is
          verified.
        </p>
      </main>
    );

  if (participant === null) {
    return (
      <main className="phone-shell join-screen">
        <p className="eyebrow">Floodgate room</p>
        <h1>Join the table</h1>
        <p role="status" className={`connection phase-${state.phase}`}>
          {state.safe_message}
        </p>
        <label>
          Your table name
          <input
            autoComplete="nickname"
            maxLength={40}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          First player-host proof <span>(only when shown on TV)</span>
          <input
            autoComplete="off"
            maxLength={256}
            value={proof}
            onChange={(event) => setProof(event.target.value.trim())}
          />
        </label>
        {window.location.hash.length === 0 && (
          <label>
            TV fallback code
            <input
              inputMode="text"
              autoCapitalize="characters"
              maxLength={8}
              value={fallbackCode}
              onChange={(event) =>
                setFallbackCode(
                  event.target.value.toUpperCase().replaceAll(/[^A-Z0-9]/g, ""),
                )
              }
            />
          </label>
        )}
        <button
          type="button"
          disabled={
            name.trim().length === 0 || state.phase === "command_pending"
          }
          onClick={() => void join()}
        >
          Join and wait for approval
        </button>
        {state.phase === "pending_approval" && proof.trim().length > 0 && (
          <button
            type="button"
            className="primary-action"
            onClick={() =>
              send({
                kind: "recover_player_host",
                payload: { proof: proof.trim() },
              })
            }
          >
            Redeem first player-host proof
          </button>
        )}
        {joinError !== null && (
          <p className="error" role="alert">
            {joinError}
          </p>
        )}
        <p className="fine-print">
          Phones use the HTTPS relay only. A disconnected screen never presents
          cached game state as current.
        </p>
      </main>
    );
  }

  return (
    <main className="phone-shell">
      <header className="phone-header">
        <div>
          <p className="eyebrow">
            {participant.room_mode === "rehearsal"
              ? "Rehearsal · multiple heroes"
              : "Player view"}
          </p>
          <h1>{participant.display_name}</h1>
        </div>
        <span className={`connection phase-${state.phase}`} role="status">
          {state.safe_message}
        </span>
      </header>

      {(participant.assigned_seats.length === 0 ||
        participant.room_mode === "rehearsal") && (
        <section aria-labelledby="choose-hero">
          <h2 id="choose-hero">Choose a hero</h2>
          <div className="card-grid">
            {participant.available_starters.map((starter) => (
              <article className="hero-card" key={starter.seat_id}>
                <h3>{starter.display_name}</h3>
                <p>{label(starter.archetype_ref)}</p>
                <p>{starter.signature}</p>
                <button
                  type="button"
                  onClick={() =>
                    send(
                      {
                        kind: "claim_hero",
                        payload: {
                          seat_id: starter.seat_id,
                          starter_loadout_id: starter.starter_loadout_id,
                        },
                      },
                      starter.seat_id,
                    )
                  }
                >
                  Claim {starter.display_name}
                </button>
              </article>
            ))}
          </div>
        </section>
      )}

      {participant.room_mode === "rehearsal" &&
        participant.assigned_seats.length > 1 && (
          <nav className="seat-switcher" aria-label="Your rehearsal heroes">
            {participant.assigned_seats.map((seat) => (
              <button
                type="button"
                aria-pressed={seat.seat_id === selectedSeat?.seat_id}
                key={seat.seat_id}
                onClick={() => {
                  setSelectedSeatId(seat.seat_id);
                  send(
                    { kind: "select_seat", payload: { seat_id: seat.seat_id } },
                    seat.seat_id,
                  );
                }}
              >
                {seat.mechanical.payload.character?.foundation.display_name ??
                  label(seat.starter_loadout_id)}
              </button>
            ))}
          </nav>
        )}

      {selectedSeat !== undefined && (
        <SeatPanel view={participant} seat={selectedSeat} send={send} />
      )}

      {selectedSeat?.activation_eligible === true && (
        <button
          type="button"
          className="primary-action"
          onClick={() =>
            send(
              {
                kind: "claim_activation",
                payload: { seat_id: selectedSeat.seat_id },
              },
              selectedSeat.seat_id,
            )
          }
        >
          Take the Lead
        </button>
      )}

      {(selectedSeat?.mechanical.payload.legal_combat_actions.length ?? 0) >
        0 &&
        selectedSeat?.reaction_prompt === null && (
          <section aria-labelledby="actions">
            <h2 id="actions">Your legal choices</h2>
            <div className="action-list">
              {selectedSeat?.mechanical.payload.legal_combat_actions.map(
                (action) => (
                  <button
                    type="button"
                    className={
                      action.legal_action_id === selectedActionId
                        ? "selected"
                        : ""
                    }
                    aria-pressed={action.legal_action_id === selectedActionId}
                    key={action.legal_action_id}
                    onClick={() => setSelectedActionId(action.legal_action_id)}
                  >
                    <strong>{label(action.action_kind)}</strong>
                    <span>
                      {action.slot} · {label(action.range)} ·{" "}
                      {label(action.target.kind)} ·{" "}
                      {actionTargetLabel(action.target)}
                    </span>
                  </button>
                ),
              )}
            </div>
          </section>
        )}

      {selectedAction !== undefined && selectedSeat !== undefined && (
        <section className="confirmation" aria-labelledby="confirm-action">
          <h2 id="confirm-action">
            Confirm {label(selectedAction.action_kind)}
          </h2>
          <p>
            Target:{" "}
            {"actor_id" in selectedAction.target
              ? label(selectedAction.target.actor_id)
              : "zone_id" in selectedAction.target
                ? label(selectedAction.target.zone_id)
                : label(selectedAction.target.kind)}{" "}
            · Range: {label(selectedAction.range)}
          </p>
          <label>
            How do you do it? <span>{160 - flavor.length} characters</span>
            <textarea
              maxLength={160}
              value={flavor}
              onChange={(event) => setFlavor(event.target.value)}
            />
          </label>
          <div className="button-row">
            <button type="button" onClick={() => setSelectedActionId(null)}>
              Cancel
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={() =>
                send(
                  {
                    kind: "commit_legal_action",
                    payload: {
                      seat_id: selectedSeat.seat_id,
                      legal_action_id: selectedAction.legal_action_id,
                      ...(flavor.trim() === ""
                        ? {}
                        : { player_flavor: flavor.trim() }),
                    },
                  },
                  selectedSeat.seat_id,
                )
              }
            >
              Confirm action
            </button>
          </div>
        </section>
      )}

      {pendingPhysical !== undefined && selectedSeat !== undefined && (
        <section className="die-entry">
          <PhysicalDisclosure disclosure={pendingPhysical.disclosure} />
          <h2>Enter the physical die</h2>
          <div className="die-grid">
            {Array.from({ length: 20 }, (_, index) => index + 1).map((face) => (
              <button
                type="button"
                aria-pressed={dieFace === face}
                className={dieFace === face ? "selected" : ""}
                key={face}
                onClick={() => setDieFace(face)}
              >
                {face}
              </button>
            ))}
          </div>
          {dieFace !== null && (
            <div className="confirmation">
              <p>
                You selected <strong>{dieFace}</strong>. You may edit or cancel
                before final submission.
              </p>
              <div className="button-row">
                <button type="button" onClick={() => setDieFace(null)}>
                  Edit / cancel
                </button>
                <button
                  type="button"
                  className="primary-action"
                  onClick={() =>
                    send(
                      {
                        kind: "submit_die",
                        payload: {
                          seat_id: selectedSeat.seat_id,
                          pending_check_id: pendingPhysical.pending_check_id,
                          submission_nonce: pendingPhysical.submission_nonce,
                          die_face: dieFace,
                        },
                      },
                      selectedSeat.seat_id,
                    )
                  }
                >
                  Submit final die
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {selectedSeat?.reaction_prompt !== null &&
        selectedSeat?.reaction_prompt !== undefined && (
          <section className="reaction" aria-labelledby="reaction-title">
            <h2 id="reaction-title">Reaction window</h2>
            <p>
              {selectedSeat.reaction_prompt.paused
                ? "Countdown paused while the connection recovers."
                : `Deadline ${selectedSeat.reaction_prompt.deadline_at ?? "held by the server"}`}
            </p>
            <div className="button-row">
              <button
                type="button"
                onClick={() =>
                  send(
                    {
                      kind: "resolve_reaction",
                      payload: {
                        seat_id: selectedSeat.seat_id,
                        reaction_window_id: selectedSeat.reaction_prompt
                          ?.reaction_window_id as never,
                        response: "pass",
                      },
                    },
                    selectedSeat.seat_id,
                  )
                }
              >
                Pass
              </button>
              <button
                type="button"
                className="primary-action"
                disabled={
                  selectedSeat.mechanical.payload.legal_combat_actions[0] ===
                  undefined
                }
                onClick={() => {
                  const reaction =
                    selectedSeat.mechanical.payload.legal_combat_actions[0];
                  if (reaction !== undefined)
                    send(
                      {
                        kind: "resolve_reaction",
                        payload: {
                          seat_id: selectedSeat.seat_id,
                          reaction_window_id: selectedSeat.reaction_prompt
                            ?.reaction_window_id as never,
                          response: "use",
                          legal_action_id: reaction.legal_action_id,
                        },
                      },
                      selectedSeat.seat_id,
                    );
                }}
              >
                Use reaction
              </button>
            </div>
          </section>
        )}

      {participant.public_prompt.beat_id === "guided_beat_optional_spark_001" &&
        selectedSeat !== undefined && (
          <section aria-labelledby="spark-choice">
            <h2 id="spark-choice">Choose the approach</h2>
            <p>
              Continue with a quiet simulated check, or spend this hero’s Spark
              to make the disclosed roll in hand.
            </p>
            <div className="button-row">
              <button
                type="button"
                onClick={() =>
                  send(
                    {
                      kind: "choose_spark",
                      payload: {
                        seat_id: selectedSeat.seat_id,
                        invoke_spark: false,
                      },
                    },
                    selectedSeat.seat_id,
                  )
                }
              >
                Keep it simulated
              </button>
              <button
                type="button"
                className="primary-action"
                disabled={
                  selectedSeat.mechanical.payload.character?.resources.spark
                    .available !== true
                }
                onClick={() =>
                  send(
                    {
                      kind: "choose_spark",
                      payload: {
                        seat_id: selectedSeat.seat_id,
                        invoke_spark: true,
                      },
                    },
                    selectedSeat.seat_id,
                  )
                }
              >
                Spend Spark and roll
              </button>
            </div>
          </section>
        )}

      {participant.public_prompt.options.length > 0 &&
        participant.public_prompt.beat_id === "guided_beat_opening_001" &&
        participant.is_player_host && (
          <section aria-labelledby="party-choice">
            <h2 id="party-choice">Record the table’s choice</h2>
            {participant.public_prompt.options.map((option) => (
              <button
                type="button"
                key={option.option_id}
                onClick={() =>
                  send({
                    kind: "record_party_choice",
                    payload: { option_id: option.option_id as never },
                  })
                }
              >
                <strong>{option.label}</strong>
                <span>{option.stakes}</span>
              </button>
            ))}
          </section>
        )}

      {participant.public_prompt.options.length > 0 &&
        participant.public_prompt.beat_id !== "guided_beat_opening_001" &&
        selectedSeat !== undefined && (
          <section aria-labelledby="guided-action">
            <h2 id="guided-action">Choose your hero’s approach</h2>
            {participant.public_prompt.options.map((option) => (
              <button
                type="button"
                key={option.option_id}
                onClick={() =>
                  send(
                    {
                      kind: "choose_guided_option",
                      payload: {
                        seat_id: selectedSeat.seat_id,
                        option_id: option.option_id as never,
                      },
                    },
                    selectedSeat.seat_id,
                  )
                }
              >
                <strong>{option.label}</strong>
                <span>{option.stakes}</span>
              </button>
            ))}
          </section>
        )}

      {lastResult !== null && (
        <p
          className={
            lastResult.status === "accepted"
              ? "result accepted"
              : "result rejected"
          }
          role="status"
        >
          {lastResult.safe_detail}
        </p>
      )}
      <button
        type="button"
        className="quiet"
        onClick={() =>
          send({
            kind: "request_correction",
            payload: { target_transaction_id: null },
          })
        }
      >
        Request a correction
      </button>
      <details className="host-recovery">
        <summary>Recover player-host from TV code</summary>
        <label>
          One-use recovery proof
          <input
            autoComplete="off"
            maxLength={256}
            value={hostRecoveryProof}
            onChange={(event) =>
              setHostRecoveryProof(event.target.value.trim())
            }
          />
        </label>
        <button
          type="button"
          disabled={hostRecoveryProof.length < 6}
          onClick={() =>
            send({
              kind: "recover_player_host",
              payload: { proof: hostRecoveryProof },
            })
          }
        >
          Confirm host recovery
        </button>
      </details>
      {state.player_host_view !== null && (
        <HostDrawer
          view={state.player_host_view}
          allowWithdrawal={
            participant.public_prompt.beat_id === "guided_beat_combat_001"
          }
          send={send}
        />
      )}
      <details className="recent-events">
        <summary>Recent public events</summary>
        <ol>
          {participant.recent_public_events.map((event) => (
            <li key={event.room_revision}>{event.text}</li>
          ))}
        </ol>
      </details>
    </main>
  );
}

function SeatPanel({
  view,
  seat,
  send,
}: {
  readonly view: ParticipantPrivateView;
  readonly seat: ParticipantPrivateView["assigned_seats"][number];
  readonly send: (intent: ClientCommandIntent, seatId?: string) => void;
}) {
  const character = seat.mechanical.payload.character;
  if (character === null)
    return (
      <section>
        <h2>{label(seat.starter_loadout_id)}</h2>
        <p>
          Your hero is claimed and will materialize when the player-host starts
          the run.
        </p>
        {view.room_mode === "rehearsal" && (
          <button
            type="button"
            onClick={() =>
              send(
                { kind: "release_seat", payload: { seat_id: seat.seat_id } },
                seat.seat_id,
              )
            }
          >
            Release hero
          </button>
        )}
      </section>
    );
  const resources = character.resources;
  return (
    <section className="character-card" aria-labelledby="character-name">
      <p className="eyebrow">{label(character.foundation.archetype_ref)}</p>
      <h2 id="character-name">{character.foundation.display_name}</h2>
      <p>{character.foundation.signature_technique_concept}</p>
      <dl>
        <div>
          <dt>Guard</dt>
          <dd>
            {resources.guard.current}/{resources.guard.maximum}
          </dd>
        </div>
        <div>
          <dt>Wounds</dt>
          <dd>
            {resources.wounds.filter(({ status }) => status !== "empty").length}
            /3
          </dd>
        </div>
        <div>
          <dt>Exertion</dt>
          <dd>
            {resources.exertion.current}/{resources.exertion.maximum}
          </dd>
        </div>
        <div>
          <dt>Spark</dt>
          <dd>{resources.spark.available ? "Ready" : "Spent"}</dd>
        </div>
        <div>
          <dt>Supply</dt>
          <dd>
            {view.supply}/{view.supply_maximum}
          </dd>
        </div>
      </dl>
      {character.conditions.length > 0 && (
        <p>
          <strong>Conditions:</strong>{" "}
          {character.conditions
            .map(({ condition_id }) => label(condition_id))
            .join(", ")}
        </p>
      )}
      {seat.private_clues.map((clue) => (
        <aside className="private-clue" key={clue.clue_id}>
          <strong>Private clue</strong>
          <p>{clue.text}</p>
        </aside>
      ))}
    </section>
  );
}

function HostDrawer({
  view,
  allowWithdrawal,
  send,
}: {
  readonly view: PlayerHostOperationalView;
  readonly allowWithdrawal: boolean;
  readonly send: (intent: ClientCommandIntent, seatId?: string) => void;
}) {
  return (
    <details className="host-drawer">
      <summary>Player-host controls</summary>
      <h2>Pending players</h2>
      {view.pending_joins.length === 0 ? (
        <p>No one is waiting.</p>
      ) : (
        view.pending_joins.map((pending) => (
          <div className="host-row" key={pending.participant_id}>
            <span>{pending.display_name}</span>
            <button
              type="button"
              onClick={() =>
                send({
                  kind: "reject_participant",
                  payload: { participant_id: pending.participant_id },
                })
              }
            >
              Reject
            </button>
            <button
              type="button"
              onClick={() =>
                send({
                  kind: "approve_participant",
                  payload: { participant_id: pending.participant_id },
                })
              }
            >
              Approve
            </button>
          </div>
        ))
      )}
      <h2>Transfer player-host</h2>
      {view.approved_participants
        .filter(({ is_player_host }) => !is_player_host)
        .map((participant) => (
          <button
            type="button"
            key={participant.participant_id}
            onClick={() =>
              send({
                kind: "transfer_player_host",
                payload: { participant_id: participant.participant_id },
              })
            }
          >
            Transfer host to {participant.display_name}
          </button>
        ))}
      <div className="button-row">
        <button
          type="button"
          onClick={() => send({ kind: "suspend_run", payload: {} })}
        >
          Suspend
        </button>
        <button
          type="button"
          onClick={() => send({ kind: "resume_run", payload: {} })}
        >
          Resume
        </button>
        <button
          type="button"
          className="primary-action"
          onClick={() => send({ kind: "start_run", payload: {} })}
        >
          Start run
        </button>
        {allowWithdrawal && (
          <button
            type="button"
            onClick={() => send({ kind: "withdraw_combat", payload: {} })}
          >
            Confirm party withdrawal
          </button>
        )}
      </div>
      {view.correction_request !== null && (
        <div className="correction-review">
          <p>A player requested a correction.</p>
          <button
            type="button"
            onClick={() =>
              send({
                kind: "cancel_correction",
                payload: {
                  correction_request_id: view.correction_request
                    ?.correction_request_id as never,
                },
              })
            }
          >
            Keep current state
          </button>
          <button
            type="button"
            onClick={() =>
              send({
                kind: "confirm_correction",
                payload: {
                  correction_request_id: view.correction_request
                    ?.correction_request_id as never,
                },
              })
            }
          >
            Confirm eligible undo
          </button>
        </div>
      )}
    </details>
  );
}
