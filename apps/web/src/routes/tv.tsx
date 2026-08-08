import {
  CombinedProjectionDeliverySchema,
  type CombinedPublicTvView,
  validateValue,
} from "@lldm/contracts";
import { useEffect, useState } from "react";
import { PhysicalDisclosure } from "../components/PhysicalDisclosure.js";
import { ZoneMap } from "../components/ZoneMap.js";

interface Startup {
  readonly status: string;
  readonly resumable_rooms?: readonly { readonly room_session_id: string }[];
}

export function TvRoute() {
  const [startup, setStartup] = useState<Startup | null>(null);
  const [roomSessionId, setRoomSessionId] = useState<string | null>(
    sessionStorage.getItem("lldm-tv-room"),
  );
  const [view, setView] = useState<CombinedPublicTvView | null>(null);
  const [creating, setCreating] = useState(false);
  const [join, setJoin] = useState<{
    join_url: string;
    fallback_code: string;
    host_bootstrap_proof: string | null;
    qr_svg: string;
  } | null>(null);
  const [recoveryProof, setRecoveryProof] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/tv/startup")
      .then(async (response) => setStartup((await response.json()) as Startup))
      .catch(() => setStartup({ status: "starting" }));
  }, []);
  useEffect(() => {
    if (roomSessionId === null) return;
    void fetch(`/api/tv/rooms/${encodeURIComponent(roomSessionId)}/join`).then(
      async (response) => {
        if (!response.ok) return;
        const details = (await response.json()) as typeof join;
        if (details !== null) setJoin(details);
      },
    );
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(
          `/api/tv/rooms/${encodeURIComponent(roomSessionId)}/view?cursor=${view?.view_revision ?? 0}`,
        );
        const body = (await response.json()) as { deliveries?: unknown[] };
        for (const raw of body.deliveries ?? []) {
          const delivery = validateValue(CombinedProjectionDeliverySchema, raw);
          if (!delivery.success) continue;
          const next =
            delivery.value.delivery_kind === "snapshot"
              ? delivery.value.view
              : delivery.value.operations[0].value;
          if (next.view_kind === "public_tv" && !cancelled) setView(next);
        }
      } finally {
        if (!cancelled) window.setTimeout(poll, 750);
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [roomSessionId, view?.view_revision]);

  const create = async (mode: "normal" | "rehearsal") => {
    setCreating(true);
    const response = await fetch("/api/tv/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const body = (await response.json()) as typeof join & {
      room_session_id?: string;
    };
    if (response.ok && body?.room_session_id !== undefined) {
      sessionStorage.setItem("lldm-tv-room", body.room_session_id);
      setRoomSessionId(body.room_session_id);
      setJoin(body);
    }
    setCreating(false);
  };

  if (startup === null)
    return (
      <main className="tv-shell">
        <h1>LLDM is starting</h1>
        <p>Checking the local canonical store…</p>
      </main>
    );
  if (startup.status !== "ready")
    return (
      <main className="tv-shell">
        <h1>Recovery required</h1>
        <p>
          Run the explicit database migration, then restart the appliance host.
          No saved room was changed.
        </p>
      </main>
    );
  if (roomSessionId === null)
    return (
      <main className="tv-shell startup-screen">
        <p className="eyebrow">Floodgate guided adventure</p>
        <h1>Begin or resume at the TV</h1>
        <div className="startup-actions">
          <button
            type="button"
            disabled={creating}
            onClick={() => void create("normal")}
          >
            New room · 3–5 players
          </button>
          <button
            type="button"
            disabled={creating}
            onClick={() => void create("rehearsal")}
          >
            Two-player rehearsal
          </button>
          {(startup.resumable_rooms ?? []).map((room) => (
            <button
              type="button"
              key={room.room_session_id}
              onClick={() => {
                sessionStorage.setItem("lldm-tv-room", room.room_session_id);
                setRoomSessionId(room.room_session_id);
                void fetch(`/api/tv/rooms/${room.room_session_id}/resume`, {
                  method: "POST",
                });
              }}
            >
              Resume Last Session
            </button>
          ))}
        </div>
      </main>
    );
  if (view === null)
    return (
      <main className="tv-shell">
        <h1>Restoring the room</h1>
        <p>Verifying room and mechanical history before accepting play…</p>
      </main>
    );
  const disclosure = view.mechanical.payload.pending_rolls[0];
  return (
    <main className={`tv-shell mode-${view.presentation.tv_mode}`}>
      <header className="tv-header">
        <span>Floodgate</span>
        <strong>{view.room_status}</strong>
        <span>
          room {view.room_revision} · mechanics {view.mechanical_revision}
        </span>
      </header>
      {join !== null && view.room_status === "lobby" && (
        <section className="join-panel">
          <div>
            <h1>Join on your phone</h1>
            <p>{join.join_url}</p>
            <p>
              Fallback code <strong>{join.fallback_code}</strong>
            </p>
            {join.host_bootstrap_proof !== null && (
              <p>
                First player-host proof{" "}
                <strong>{join.host_bootstrap_proof}</strong>
              </p>
            )}
          </div>
          <img
            alt="QR code for the HTTPS relay room"
            src={`data:image/svg+xml,${encodeURIComponent(join.qr_svg)}`}
          />
        </section>
      )}
      <section className="narration" aria-live="polite">
        <p className="eyebrow">
          {view.presentation.beat_id.replaceAll("_", " ")}
        </p>
        <h1>{view.presentation.text}</h1>
        {view.presentation.options.length > 0 && (
          <div className="public-options">
            {view.presentation.options.map((option) => (
              <article key={option.option_id}>
                <h2>{option.label}</h2>
                <p>{option.stakes}</p>
              </article>
            ))}
          </div>
        )}
      </section>
      {disclosure !== undefined && (
        <PhysicalDisclosure disclosure={disclosure} />
      )}
      <ZoneMap view={view} />
      <section className="room-roster">
        <h2>At the table</h2>
        <div>
          {view.participants
            .filter(({ approved }) => approved)
            .map((participant) => (
              <span key={participant.participant_id}>
                {participant.is_player_host ? "★ " : ""}
                {participant.display_name}
                {participant.starter_loadout_id === null
                  ? " · choosing"
                  : ` · ${participant.starter_loadout_id.replace("starter_loadout_", "")}`}
              </span>
            ))}
        </div>
      </section>
      {view.recovery_message !== null && (
        <aside className="recovery-banner" role="status">
          {view.recovery_message}
        </aside>
      )}
      <section className="local-recovery">
        <button
          type="button"
          onClick={() =>
            void fetch(
              `/api/tv/rooms/${encodeURIComponent(roomSessionId)}/host-recovery`,
              { method: "POST" },
            ).then(async (response) => {
              const result = (await response.json()) as { proof?: string };
              if (result.proof !== undefined) setRecoveryProof(result.proof);
            })
          }
        >
          Show one-use host recovery code
        </button>
        {recoveryProof !== null && (
          <p>
            Host recovery proof <strong>{recoveryProof}</strong> · expires in
            five minutes
          </p>
        )}
      </section>
      <details className="recent-events">
        <summary>Recent public events</summary>
        <ol>
          {view.recent_public_events.map((event) => (
            <li key={event.room_revision}>{event.text}</li>
          ))}
        </ol>
      </details>
    </main>
  );
}
