# Phase 2 — Room Shell, PWA, and TV

**Status:** Application, appliance, and automated acceptance complete locally; deployment and physical-device exit evidence pending

**Parent plan:** [PRIMARY_PLAN.md](../../PRIMARY_PLAN.md)

**Planned:** 2026-08-07

**Primary executor:** Autonomous coding agent

**Audience:** AI coding agents. This is an execution contract, not a human-oriented project brief.

**Outcome:** A locally authoritative living-room application in which three to five approved players join through an ephemeral Cloudflare relay, claim one starter hero each, and complete a replayable 30–45-minute guided adventure across challenge, social, ritual, combat, and physical-roll play using glanceable phones and a shared TV. A two-phone multi-hero rehearsal path supports routine development without weakening the three-to-five-device exit gate.

## 1. Completion Standard

Phase 2 is complete when a fresh appliance database can create a new randomly seeded guided run, display a room QR code on the TV, approve and reconnect players through the deployed relay, assign one hero per normal participant, and complete every supported outcome of the Floodgate guided slice without a phone connecting directly to the home network.

The exit gate must prove all of the following:

- `@lldm/engine` remains the only authority for mechanical state changes. `apps/host`, `apps/web`, the relay, fake providers, timers, and presentation templates may propose or route work but may not mutate `GameState` or fabricate legal actions.
- Untrusted `ClientCommand` values are distinct from internal `GameCommand` values. The host validates participant, seat, authority, view revision, legal candidate, and payload before deriving stable internal command and transaction identities.
- Every persisted room command and event is typed, versioned, strictly validated, transactionally stored, hash-checked, and replayable. A crash between a room command and its mechanical transaction resumes a durable idempotent workflow and cannot reroll or apply the mechanic twice.
- The existing Phase 1 campaign event stream remains canonical for mechanics. Room, seat, narration, player-authored flavor, and delivery state use a separate local room event stream and never become a second mechanical authority.
- Normal play supports three, four, and five participants with one character seat per approved participant. Six complete fixed starter heroes provide choice; selected party size uses authored roster, position, reinforcement, and objective variants without changing hero or enemy statistics.
- A clearly labeled rehearsal mode lets two approved participants control multiple explicit character seats and switch between their private views. Normal mode never silently assigns multiple heroes to one participant.
- The guided slice lasts approximately 30–45 minutes in manual rehearsal and contains an opening choice, meaningful seat-private clues, a Progress/Danger challenge, a consequential social exchange, a ritual decision, a named-zone tactical encounter, one mandatory pivotal physical roll, optional Spark conversions, and a distinct conclusion.
- Two or three meaningful branches reconverge at controlled beats. Challenge failure and combat withdrawal or defeat advance to explicit cost or retreat conclusions; no resolved check is silently reset or retried.
- The TV is the shared source of truth: it shows concise deterministic narration, public choices and state changes, a readable deterministic SVG zone map, physical-roll disclosure, active spotlight, objectives, hazards, connections, and recent outcomes. It uses no generated media and has a deterministic neutral fallback presentation.
- Phones remain glanceable. Inactive players see resources, conditions, reaction availability, signature summaries, recent public events, and activation eligibility. Detailed legal target and commit controls appear only for an owned active hero.
- Consequential input uses select, preview, and confirm. Optional short player-authored flavor is public and replayable but cannot change mechanics or assert canon. Routine simulated die faces remain hidden; every physical roll reveals target, complete modifier breakdown, face-to-outcome mapping, stakes, and concrete consequences before entry.
- Hero activations are claimed by eligible players. The first valid claim commits; competing stale claims receive a friendly typed response. Party-wide story choices are discussed aloud and recorded by the player-host rather than electronically polled.
- Reaction windows show Use and Pass with a visible ten-second deadline. A connected-player timeout produces a recorded pass command; a disconnect pauses the deadline and never selects a reaction silently.
- An active disconnect preserves the activation, choice, or physical roll for at least a 30-second reconnect grace period. After that period, only an explicit player-host release or reassignment advances play.
- Any player may request correction of the latest action, but the player-host must confirm it and the engine remains authoritative about compensating-undo eligibility. Submitted dice, permanent death, stale targets, and dependent play remain protected by Phase 1 rules.
- The player-host is also a normal hero owner. Host transfer is explicit; loss of the current host has a TV-code-confirmed recovery path. Host authority never exposes another seat's private clue or runner-internal state.
- Restart recovery presents an explicit `Resume Last Session` choice. It restores the last committed room and mechanical revisions, preserves pending physical continuations, reconnects existing clients when credentials remain valid, and produces a new QR path when the relay room has expired.
- Relay room state is ephemeral and contains no campaign state, narration, clue, flavor text, or stored payload. Room metadata expires within 24 hours; application payloads are neither persisted nor logged by relay code.
- Browser-first joining requires no PWA installation. Reconnect credentials live in IndexedDB; installation remains optional.
- Automated independent-browser flows pass for three, four, and five participants. A two-phone physical rehearsal passes during development, and at least one final room test uses three to five simultaneously connected physical phones, including one disconnect/reconnect.
- No OpenRouter, live model, speech, transcription, TTS, generated image, music, canon extraction, campaign generation, broad character creation, or rank-2-to-4 production work enters Phase 2.
- `PRIMARY_PLAN.md`, ADR-0003, generated references, package boundaries, deployment configuration, and recorded evidence describe the application that actually exists.

Passing unit tests or a localhost-only browser demo is insufficient. The phase is incomplete if a phone needs the host LAN address, a player-host can read secrets, a duplicate command can rerun, relay loss changes mechanics, a pending roll disappears on restart, only the four-hero path works, or the physical-device signoff has not occurred.

## 2. Scope Boundary

### In scope

- Three new applications:
  - `apps/host`: Fastify composition service over `@lldm/runtime`, local room coordinator, guided-run orchestration, relay client, deterministic presentation, health, and redacted diagnostics.
  - `apps/web`: React/Vite role-based PWA with TV, player, player-host, recent-events, reconnect, and recovery routes.
  - `apps/relay`: Cloudflare Worker and one Durable Object per active room, including static PWA delivery, hibernating WebSockets, room tokens, rate limits, origin enforcement, and 24-hour cleanup.
- One new private workspace package, `@lldm/providers`, containing narrow provider-facing ports and deterministic fake text adapters only. It makes no network request in Phase 2.
- Central TypeBox contracts for participants, character seats, room commands/events/state, guided presentation records, relay control records, transport messages, command results, combined view snapshots/deltas, acknowledgements, typed recovery states, and room diagnostics safe for clients.
- Separation of `ClientCommand` from `GameCommand`. Client commands carry room/view expectations and player intent; the host derives internal engine envelopes and owns mechanical revision/identity details.
- A local append-only room stream with command identity binding, room transactions, pre/post hashes, replay, derived projections, bounded local delta retention, and pending cross-stream workflow recovery.
- SQLite migration 2 for room sessions, room command/transaction/event rows, pending mechanical workflows, combined projections/deltas, relay-session metadata, and required indexes/constraints. Existing migration 1 and Phase 1 replay literals remain immutable.
- Pure combined projectors that merge current room state with existing mechanical projections while preserving public, participant-private, player-host-operational, and server-internal boundaries.
- The six-hero Phase 2 starter roster and a new immutable Phase 2 mechanical content manifest. Preserve the Phase 1 manifest and four-hero fixtures unchanged. Pin guided beats, narration, clues, and map metadata in a separate immutable presentation manifest that is never supplied to the engine.
- Authored three-, four-, and five-hero Floodgate encounter setups using unchanged actor statistics and validated roster/objective/placement differences.
- One validated guided beat graph with concise clean-room narration templates, meaningful private clues, controlled branches, fail-forward conclusions, deterministic map presentation metadata, and recent-event summaries.
- Random seeds for normal runs from the existing cryptographic path; explicit seeds remain test/fixture-only.
- Player activation claims, guided action cards, action preview and confirmation, optional bounded flavor, Spark choice, physical die entry/confirmation, reactions, correction request/host confirmation, party-choice recording, and explicit session suspend/resume.
- A normal one-seat-per-participant mode and explicit two-participant multi-seat rehearsal mode.
- Outbound host-to-relay connectivity, browser-to-relay connectivity, acknowledgement/deduplication, sequence checking, reconnect snapshot-or-delta behavior, and readable incompatible-protocol handling.
- A functional deterministic TV map and neutral visual system. Use authored SVG/layout data and CSS; do not require scene images.
- Initial Docker Compose appliance, multi-stage image/build, loopback-only local host exposure, health checks, persistent local data mount, and Chromium kiosk startup assets.
- Unit, integration, local Worker, Fastify, SQLite recovery, projection leakage, Playwright multi-context, two-phone rehearsal, and three-to-five-phone exit evidence.
- Proposed-then-accepted ADR-0003 and continuous `PRIMARY_PLAN.md` alignment.

### Explicitly deferred

- OpenRouter credentials, model routing, prompts, context retrieval, structured LLM interpretation, difficult adjudication, automatic canon, summaries, campaign frames, and episode skeletons; these begin in Phase 3.
- Speech capture, audio chunks, transcription, waiting sounds, TTS, NPC voices, audio mixing, scene-image generation, illustrated battlefield art, and provider cost accounting; these begin in Phase 4.
- Lines/Veils workflows, the private safety-pause lifecycle, consent-gated PvP, conversational correction, and general freeform typed intent; these remain Phase 3 even though the room shell must leave clear contract/UI extension points.
- Full character creation, renaming/customization workshop, rank-2 paths, rank-3 talents, rank-4 capstones, the complete Heritage/Upbringing catalogs, broad enemies, and balance certification; these remain Phase 5.
- General adventure authoring, a broad deterministic story engine, a fake natural-language parser, or a menu-driven replacement for the later LLM runner.
- Multiple simultaneous rooms or campaigns, public accounts, remote spectators, internet matchmaking, billing, public deployment, or multi-tenant storage.
- End-to-end payload encryption beyond TLS, database encryption, hardware key storage, full secret rotation, production rollback automation, and comprehensive appliance hardening; Phase 6 owns those items.
- Full accessibility certification, broad browser/device matrix automation, generated-media fallbacks, external telemetry, and final household success-metric acceptance; Phase 6 owns the complete audit. Phase 2 still implements semantic controls, keyboard reachability, non-color status, readable contrast, and text alternatives needed by its own UI.
- WebRTC, peer-to-peer traffic, inbound router ports, direct phone-to-host HTTP/WebSocket access, or campaign data in Cloudflare storage.
- Treating player flavor text as a fact, action proposal, rules permission, or mechanical command. It is bounded attributed input/presentation history only.

## 3. Fixed Product and Technical Decisions

These decisions are settled by `PRIMARY_PLAN.md`, the completed Phase 1 architecture, and the Phase 2 interview. An implementation task may refine names or file splits, but it may not change behavior or phase ownership without updating this plan and `PRIMARY_PLAN.md` first.

| Area | Decision |
| --- | --- |
| Product boundary | Build a genuinely playable guided slice with engine-enumerated controls and deterministic text narration. Do not build broad natural-language interpretation before Phase 3. |
| Supported table | Normal play supports three to five approved participants, each owning exactly one character seat. |
| Starter choice | Add enough complete content for six fixed rank-one starter heroes. Approved participants claim unassigned heroes from concise public summaries. Character workshop/customization stays deferred. |
| Two-phone use | Provide an explicit rehearsal mode in which two participants may own multiple character seats and switch private views. Never disguise automated companions or shared ownership as normal play. |
| Scenario | Use a 30–45-minute multi-pillar Floodgate adventure: opening, private clue, challenge, social exchange, ritual, tactical encounter, pivotal physical roll, and conclusion. |
| Branching | Author two or three consequential branches that reconverge. Failed challenges, withdrawal, and defeat advance to declared cost/retreat endings rather than resetting history. |
| Party scaling | Select authored three-, four-, or five-hero roster, placement, reinforcement, and objective variants. Do not scale Guard, Impact, or other actor statistics by party size. |
| Run randomness | Each normal run receives a new cryptographic campaign seed. Replay is exact within that run; fixed seeds are available only to explicit tests and diagnostics. |
| Player-host | The player-host is a normal participant and may own a hero. Host-only controls live in a clearly separate drawer and may transfer to another approved participant. |
| Host privacy | Player-host authority grants operational controls only. It never grants runner-internal state, other-seat private clues, private physical nonces, or future adventure spoilers. |
| First host/recovery | Bootstrap the first player-host through a one-use TV-visible proof. Later transfer is explicit; unavailable-host recovery requires a short one-use code visible only on the TV and produces a recorded room event. |
| Hero activation | Eligible participants discuss aloud and claim the next hero activation. The first valid authoritative command wins; stale competitors receive a friendly typed result. |
| Consequential input | Select locally, preview exact action/target/cost publicly when appropriate, then confirm once. Do not commit mechanics on initial tap and do not require host approval for individual hero actions. |
| Player flavor | After selecting mechanics, allow an optional short public action description. Persist and replay it as attributed player text, escape it in every renderer, and never treat it as canon or mechanics. |
| Party choices | The TV presents public options and stakes. The table discusses aloud; the player-host records and confirms the agreed option. Do not add phone voting. |
| Simulated checks | Keep routine die faces and random evidence unobtrusive and absent from player projections. Present the approach, stakes, and resulting outcome band without exposing the hidden d20. |
| Physical dice | Guarantee one pivotal physical roll and allow optional Spark conversion of eligible simulated checks. Before entry, show target, modifier breakdown, all twenty face outcomes/outcome bands, reason, and stakes on TV and eligible phone. |
| Die entry | Only a participant currently authorized for the eligible character seat may select 1–20 and explicitly confirm. Before confirmation the face is editable; after commit the nonce is consumed and normal undo is forbidden. |
| Reactions | Show Use/Pass and a visible ten-second countdown. A connected timeout creates a typed recorded pass; disconnect pauses the countdown and requires recovery. |
| Disconnect | Preserve an active spotlight or roll for a 30-second grace period. After grace expiry the UI reports recovery needed; only explicit host release/reassignment proceeds. |
| Corrections | Any participant may request correction. The player-host confirms, and the existing compensating-undo rules make the final eligibility decision. The TV announces successful rewinds and readable rejections. |
| Restart | Show `Resume Last Session`; do not auto-resume or discard. Restore both streams and pending workflow state before accepting input. Reuse relay credentials when valid or create a fresh QR when expired. |
| Combat TV | Render a functional deterministic SVG map with zones, connections, occupants, cover, hazards, objectives, visibility/elevation tags, active actor, legal target highlights, and textual equivalent. Phase 4 adds art and polish. |
| Inactive phone | Show glanceable resources, conditions, reaction availability, signature summaries, recent events, and `Take the Lead` when eligible. Detailed target/commit UI appears only for an owned active hero. |
| Private play | Include meaningful hero-specific clues. A player may share them aloud; they remain absent from TV, other participants, and player-host controls until a later public event explicitly reveals them. |
| Recent history | Provide a compact drawer of recent public narration, choices, rolls, and state changes. Reconnect delivers the same bounded recap automatically; the phone does not become the primary transcript display. |
| Join friction | QR joining works in the mobile browser. PWA installation is optional and never blocks joining or reconnect. |
| Device evidence | Develop with two physical phones plus isolated browser contexts for all party sizes. Retain a final manual signoff with at least three simultaneously connected physical phones and one reconnect. |
| Relay ownership | Cloudflare stores only expiring room/auth/routing metadata. Canonical room/mechanical state, narration, player text, private clues, and payload history stay on the mini PC. |
| Presentation fallback | Phase 2 uses deterministic local templates, SVG, and CSS only. No screen waits for provider or generated media work. |

## 4. Authority, State, and Transaction Model

### 4.1 Identity model

Use separate identities for separate lifetimes:

- `RoomSessionId` identifies the durable local guided room/session and survives relay-room replacement.
- `RoomId` identifies one ephemeral relay room. A local room session has at most one current relay room and may receive a new `RoomId` after expiry.
- `ParticipantId` identifies an approved human within the local room and survives connection replacement.
- `ConnectionId` identifies one current browser or appliance WebSocket connection and is replaceable.
- `SeatId` identifies one stable character seat in the guided run. It maps to exactly one `CharacterId`; reassignment changes the participant authorized for the seat, not the seat or character identity.
- `CommandId`, `TransactionId`, `EventId`, and mechanical stream revision retain their Phase 1 meaning.
- Room commands, transactions, events, and view deliveries receive opaque IDs from dedicated schemas and use a room revision independent from the mechanical campaign revision.
- Transport `MessageId` and per-connection `seq` are delivery identities only. They never substitute for idempotent client-command identity.

Normal mode enforces at most one occupied character seat per participant. Rehearsal mode permits multiple explicit assignments, but each command names exactly one owned `SeatId`, and the phone displays only the selected seat-private view at a time. Host authority belongs to `ParticipantId`, never to a device or character.

Use “appliance host” for the mini-PC service and “player-host” for the privileged participant throughout code, schemas, logs, and UI. Do not overload `host` where the distinction affects authority.

### 4.2 Command layers

Phase 2 must end the Phase 1 `ClientCommand = GameCommand` alias.

1. `ClientCommand` is an untrusted relay-room-scoped envelope. It carries schema/protocol-compatible values, client command identity, ephemeral `RoomId`, participant/seat intent where applicable, expected combined view revision, command kind, and bounded payload.
2. `RoomCommand` is the validated local form after connection-token and authority resolution. It carries the stable `RoomSessionId` and drives only room/session state or starts a durable mechanical workflow.
3. `GameCommand` remains the engine-facing campaign command envelope. Only the appliance host constructs it, including `campaign_id`, `expected_revision`, stable `command_id`, and stable `transaction_id`.
4. `GameEvent` remains the sole input to `applyGameEvent` and the sole source of mechanical state change.
5. `RoomEvent` changes room/session state, records presentation history, or records workflow linkage. It may reference a committed mechanical transaction but may not duplicate or override its mechanical facts.
6. Ephemeral previews, cursor/highlight state, heartbeat, acknowledgement, and reconnect presence are typed transport signals, not commands or canonical events. They expire without changing play.

Central unions in `@lldm/contracts` remain authoritative. No application declares a smaller local production union.

### 4.3 Durable client-to-engine workflow

Do not attempt a distributed SQLite/relay transaction and do not hold a database transaction open across network or human input. For a client command that causes mechanics, the local room coordinator performs this recoverable sequence:

1. Strictly validate the transport message and `ClientCommand`; authenticate the connection; resolve participant and seat authority; and canonicalize the client command.
2. In one immediate SQLite room transaction, perform idempotency lookup before view-revision checks. Bind the client command permanently to canonical bytes, a room transaction, and deterministically derived internal game command/transaction IDs.
3. Revalidate that the chosen legal-action ID or guided option exists in the participant's current filtered projection. Commit a `mechanical_workflow_started` room event containing only safe linkage and move the room to an explicit pending state.
4. Submit the derived `GameCommand` through the existing `CommandCoordinator`. Never invoke an engine decider directly from `apps/host`.
5. In a second immediate room transaction, read the stored mechanical outcome, commit `mechanical_workflow_completed` or a typed failure event, advance the guided beat if appropriate, append player flavor and deterministic narration only after acceptance, rebuild combined views, and clear the pending state.
6. Return a typed client-command result. A transport acknowledgement means bytes were received; it does not claim mechanical acceptance.
7. On process restart or injected failure after step 3, scan pending workflows and repeat step 4 with the stored derived command. Phase 1 idempotency must return the exact transaction without rerunning, redrawing, or reallocating IDs; then complete step 5.

Only one mechanical workflow per room may be unresolved at once. Room-only reconnect, acknowledgement, and recovery operations may proceed, but another gameplay command receives a typed `room_busy_recovering` result. Never guess whether a side effect happened.

### 4.4 Local room stream and migration 2

Add immutable checksummed SQLite migration 2. Preserve migration 1 bytes and checksum. Migration 2 owns at least these logical records; exact table splits may vary only if all constraints remain expressible:

- `room_sessions`: stable room-session ID, current relay room ID when any, campaign ID, schema version, current room revision, current view revision, canonical room-state JSON/hash, active/completed/suspended status, mode, created/updated storage timestamps, and relay expiry metadata.
- `room_commands`: client command ID, canonical bytes/hash, participant/seat attribution, expected view revision, kind, outcome, and bound room transaction/workflow.
- `room_transactions`: contiguous room revision range, pre/post room-state hashes, outcome, committed timestamp, and optional linked mechanical transaction.
- `room_events`: canonical validated room event JSON with contiguous room revisions, causation, and transaction indexes.
- `mechanical_workflows`: stable derived game command/transaction IDs, expected mechanical revision, pending/completed status, stored safe outcome reference, and recovery-attempt metadata that is operational rather than mechanical.
- `room_projections`: latest validated full projection per public TV, participant, player-host operation view, and server-internal audience.
- `room_projection_deltas`: bounded derived delta history indexed by room/view revision and audience key; deletion of old deltas never affects canonical replay.
- `relay_sessions`: locally protected expiring relay host credentials and room endpoints needed for explicit resume. Never include these values in projections, events, snapshots, logs, diagnostic bundles, or CLI default output.

Room-state hashes use the existing canonical JSON/SHA-256 implementation with an explicit room-state schema version. Replay applies only `RoomEvent` values, verifies every room transaction boundary, and then cross-checks referenced mechanical transaction IDs/revisions. Full combined projections rebuild from replayed room state plus verified mechanical state.

Normal command execution must refuse pending/future/failed migration state and must not auto-migrate. The existing explicit CLI migration/backup path applies migration 2 after a verified sibling backup.

### 4.5 Projection and visibility model

Build combined presentation views from authoritative local inputs; never feed stored presentation data back into mechanics.

- **Public TV:** public room status, public recent events, shared choices, player display names/hero assignments, redacted mechanical public projection, map/layout metadata, public physical disclosure, and recovery state.
- **Participant private:** that participant's assignment list, selected seat, each authorized seat-private mechanical projection, private clues addressed to those seats, eligible physical nonce/input, private command results, and reconnect state.
- **Player-host operational:** pending join approvals, seat assignment/release controls, start/suspend/resume, party-choice recording, correction requests, legal undo confirmation, host transfer, and redacted health. It contains no runner-internal state or other-seat private content.
- **Server internal:** full verified room/mechanical state, pending workflow, relay metadata, and deterministic guided-run data needed by the appliance. This view is never admitted by a client-delivery schema.

Treat the existing Phase 1 full `HostControlProjection` as appliance-internal. Do not serialize it to a phone merely because that phone owns the player-host role. Add explicit transport-deliverable unions that cannot contain it, and add negative fixtures proving that server-internal, other-seat, eligible-roller, private-social, and private-clue values fail delivery validation.

Every combined view carries `view_revision`, `room_revision`, and `mechanical_revision`. Increment `view_revision` whenever any delivered audience view changes. On reconnect:

1. Authenticate the reconnect token and current participant binding.
2. If the client cursor and audience binding match a contiguous retained delta range, send ordered filtered deltas.
3. Otherwise send one complete filtered snapshot.
4. Changing seat authorization or host authority always forces a new snapshot; never apply a delta generated for a broader audience.
5. Require acknowledgement of delivery message IDs, ignore duplicates, detect `seq` gaps, and request resynchronization rather than applying out-of-order data.

### 4.6 Room authority matrix

| Operation | Authorized initiator | Authoritative result |
| --- | --- | --- |
| Request join | Valid invited connection | Typed pending join; no seat or private state |
| Approve/reject participant | Current player-host | Room event and filtered participant snapshot |
| Claim unassigned hero | Approved participant | Atomic seat claim; normal-mode one-seat limit |
| Claim additional hero | Approved participant in rehearsal mode | Atomic explicit seat assignment |
| Claim hero activation | Participant assigned to eligible unspent seat | Derived `choose_hero_activation` game command |
| Choose hero action/target | Participant assigned to active seat | Derived legal engine command after preview/confirm |
| Record party choice | Current player-host | Room event and guided-run transition |
| Submit physical die | Participant assigned to disclosed eligible seat | Derived nonce-bound `submit_die_result` game command |
| Use/pass reaction | Participant assigned to priority seat | Derived `resolve_reaction` game command |
| Expire connected reaction | Appliance timer through typed system command | Recorded pass plus derived engine command |
| Request correction | Any approved participant | Pending correction request only |
| Confirm correction | Current player-host | Derived Phase 1 compensating-undo command |
| Transfer host | Current player-host | Recorded transfer to approved participant |
| Recover missing host | Approved participant plus one-use TV proof | Recorded transfer; all participants notified |
| Reassign/release disconnected seat | Current player-host after recovery state | Recorded room reassignment; no automatic action |
| Start/suspend/resume run | Current player-host | Recorded room transition; mechanics remain at last commit |

## 5. Guided Slice and Presentation Specification

### 5.1 Mechanical and presentation manifest boundary

Do not mutate the Phase 1 mechanical manifest or its four starter fixtures. Create a Phase 2 mechanical manifest that reuses immutable Phase 1 definitions by reference and adds only the clean-room mechanical content necessary for:

- one complete fixed Maverick starter and one complete fixed Beacon starter, producing six public starter summaries and six materializable loadouts;
- any missing supporting Heritage, Upbringing, gear, or signature definitions required to make those starters fully legal, tactical, and narratively permissioned;
- authored mechanical encounter composition records for three, four, and five selected heroes, with stable enemy statistics and variant rosters/positions/objective pressure.

Create a separate immutable guided presentation manifest for the beat graph, deterministic narration templates, private clues, public choices, consequence templates, map layout, starter summaries, and short recent-event summaries. It references the exact Phase 2 mechanical manifest hash but is not a `ContentDefinition` catalog and is never supplied to the engine.

Campaigns created for Phase 2 pin the new mechanical manifest; local room sessions pin the guided presentation manifest. Existing Phase 1 campaigns remain readable and replayable under the old mechanical manifest. Resolvers must support both mechanical hashes, validate the presentation-to-mechanical link, and never rewrite a pinned hash during startup.

### 5.2 Guided beat graph

Represent the slice as a validated content record, not imperative route conditionals distributed across React components. Each beat declares:

- stable beat/template identity and revision;
- visibility and addressed seat/archetype when private;
- concise public narration and optional private text;
- allowed room choice IDs and/or the exact mechanical operation template;
- prerequisites expressed in validated, bounded fields;
- transition mapping for selected option, Crisis, Setback, Success, Triumph, combat victory, withdrawal, defeat, and explicit cost outcomes as applicable;
- whether the beat is a scene/checkpoint boundary;
- recent-event summary text and TV presentation mode;
- no arbitrary executable code or LLM-authored mechanics.

Validate that the graph has one start, only declared terminal conclusions, no dangling transitions, no unintended cycle, and reachable success, cost, withdrawal/defeat, mandatory-physical, optional-Spark, private-clue, challenge, social, ritual, and combat paths. Branches may reconverge only at declared merge beats.

The normal sequence is:

1. concise Floodgate scene opening and one public party choice;
2. one or more hero-specific clues that materially inform later approaches;
3. a Progress/Danger challenge with at least two supported approaches;
4. a consequential social exchange that respects motive, leverage, and hard limits;
5. a ritual decision with visible requirements/cost and an interruption or cost branch;
6. the party-size-authored named-zone encounter and objective;
7. one guaranteed pivotal physical conclusion roll, unless a permanent-death or named-boss physical roll has already occupied that authored beat and the graph still reaches a disclosed pivotal decision;
8. a clean-success, success-with-cost, retreat, or defeat conclusion with local checkpoint.

The graph may shorten after serious failure, but every terminal path is a complete run. Do not add checkpoint retry to canonical play.

### 5.3 Mechanical orchestration

The guided runner reads the current beat and current filtered legal candidates, then constructs only bounded `RoomCommand` or `GameCommand` templates defined by contracts. It must:

- materialize only claimed starter loadouts before play begins;
- set Supply from the actual selected party size through existing invariants;
- use existing engine check, challenge, social, ritual, combat, reaction, physical continuation, scene, and undo commands rather than reproducing their rules;
- present only engine-enumerated combat actions and targets;
- use the deterministic enemy fallback selector in Phase 2, with concise template narration after the committed result;
- expose Spark as an explicit pre-confirmation choice only when the engine check request is Spark-eligible and the character has Spark;
- hide routine simulated random evidence from all client-deliverable projections;
- wait at physical continuations and resume only through the stored pending check and one-use nonce;
- convert committed outcome facts into deterministic narration briefs; templates may describe those facts but may not add mechanical facts;
- checkpoint at declared scene and terminal boundaries through existing runtime behavior.

The fake provider adapter returns validated deterministic text/template selections synchronously. Provider failure injection must fall back to a deterministic mechanical sentence and must never block or roll back an already committed game transaction.

### 5.4 TV experience

The TV route is local to the appliance and defaults to:

- room creation/resume state and QR/fallback code;
- approved participants and hero claims;
- concise narration sized for across-room reading;
- current speaker/hero, shared options, stakes, and committed state changes;
- a neutral deterministic scene backdrop;
- the functional SVG combat map during tactical play;
- exact public physical-roll disclosure and a waiting-for-entry state;
- reconnect, correction, reaction, host-recovery, and protocol-error states with explicit next actions;
- no player-host controls and no private clues.

The map uses validated authored normalized layout metadata. It must depict all named zones and connections, occupants, objectives, hazards, cover, elevation/visibility tags, active actor, and proposed/committed movement or targets. Provide an adjacent textual list/description for nonvisual access and 720p fallback. State must not depend on animation or color alone.

### 5.5 Phone experience

The player route defaults to PTT-free glanceable play:

- connection/queue placeholder, participant name, selected hero, and room status;
- Guard, Wounds, Exertion, Spark, Supply, conditions, reaction availability, and signature summary;
- `Take the Lead` only when an owned hero is eligible;
- active action/maneuver/target cards derived from legal candidates;
- local select/preview state and one explicit Confirm action;
- optional bounded public `How do you do it?` text after mechanics are selected;
- private clues and eligible-seat prompts;
- physical d20 face grid, selected-face preview, full disclosure, and explicit final confirmation;
- reaction Use/Pass and visible deadline;
- correction request and response;
- compact recent-public-events drawer;
- host-control drawer only for the current player-host;
- explicit hero switcher only when rehearsal mode assigns multiple seats.

Do not mirror the full TV transcript or full zone controller by default. Do not show stale legal action cards after a revision update. Disable submission while a prior command is unresolved, but retain safe local draft flavor through reconnect until acceptance or rejection is known.

### 5.6 Reconnect, timeout, and recovery behavior

- A dropped inactive phone may reconnect without pausing play. Its approved participant identity and assignments return through token validation plus filtered snapshot/delta.
- A dropped active phone freezes its pending spotlight. The TV shows a neutral reconnect notice and 30-second grace indicator; no other participant may claim that activation during grace.
- Grace expiry changes only the room recovery status. The player-host must explicitly wait longer, reassign the seat, or release an uncommitted activation when legal.
- A reaction countdown runs only while the eligible participant connection is healthy. Connected expiry causes a typed system pass; disconnect pauses and records why.
- A physical nonce remains pending across phone, host-process, and relay restart. Reassignment changes who may deliver the seat's pending result but never changes the nonce or disclosure.
- A host-process restart loads and verifies both streams, resumes pending cross-stream workflows idempotently, then displays `Resume Last Session`. It accepts no gameplay input before verification.
- Relay loss leaves the local room and mechanical streams untouched. The TV displays retry state. Reconnect resumes delivery by delta or snapshot; no provider or relay retry may resubmit a mechanic under a new identity.
- If the relay room expired, the appliance creates a new ephemeral room linked to the same local room/campaign after host confirmation. Participants rejoin and the host maps them to preserved seats.

## 6. Relay, Network, and Deployment Boundaries

### 6.1 Relay topology

- The appliance creates and controls a room using a locally stored relay-creation credential and outbound TLS.
- The TV bundle is served locally by `apps/host`; phone assets are served over HTTPS by the Worker.
- Phones connect only to the Worker/Durable Object WebSocket endpoint. No QR code or normal UI exposes a private LAN address.
- One Durable Object instance owns routing for one active room. Hibernation attachments retain only the minimum connection role/ID, authorization expiry, and sequence state needed to resume sockets.
- The object routes validated-size application frames between the appliance connection and authorized browser connections. It does not interpret game commands or projections.
- Durable Object storage contains only room creation/expiry, hashed or signed auth metadata, one-use invite/bootstrap state, rate-limit counters, and alarm state. It contains no message payload body.
- A cleanup alarm closes sockets and deletes room metadata no later than 24 hours after creation. Recreating a relay room never deletes the local room session.

### 6.2 Bootstrap, join, and tokens

Use Web Crypto and at least 128 bits of entropy for room, invite, bootstrap, host, and signing-sensitive secrets. Exact token encoding may be refined, but these flows are required:

1. Appliance authenticates to the Worker room-creation endpoint and receives room ID, appliance token, invite secret, expiry, QR URL, and short fallback code.
2. The first intended player-host redeems a one-use host-bootstrap proof presented by the TV. Redemption creates an unapproved participant connection, and local appliance confirmation records the first player-host without exposing appliance credentials.
3. Later players open the QR/fallback URL, choose a bounded display name, and wait. The current player-host sees the join request and explicitly approves or rejects it.
4. Approval binds a local `ParticipantId` and yields an expiring reconnect token stored in IndexedDB. Relay metadata may know participant/seat routing identifiers but never character or private content.
5. Reconnect rotates connection identity while preserving participant identity. Revocation, rejection, room expiry, host transfer, and seat changes invalidate or narrow tokens as required.
6. A short fallback code still enters the pending-approval path and never bypasses the player-host.

Validate allowed origins, token audience/room/expiry, message size, per-connection rate, connection count, and role before routing. Use generic client-safe errors and never return secrets or internal exceptions.

### 6.3 Transport behavior

Extend the protocol-version-1 central transport union rather than inventing ad hoc socket messages. Include at least:

- hello/compatibility and authenticated role binding;
- acknowledgement and typed delivery failure;
- join request/status and approval result;
- client command and command result;
- action preview/highlight with expiry;
- full combined projection snapshot and filtered delta;
- resync request/result;
- ping/pong or equivalent liveness;
- room closing/expired and readable protocol-update requirement.

Each envelope retains `message_id`, `room_id`, `connection_id`, optional `seat_id`, monotonic `seq`, optional `reply_to`, `kind`, `protocol_version`, and strict payload. Reject unknown fields and unsupported versions. Duplicated delivery may repeat a result but never repeat a room or game transaction.

### 6.4 Appliance composition

`apps/host` may depend on `@lldm/contracts`, `@lldm/content`, `@lldm/providers`, and `@lldm/runtime`. It must not import engine internals or SQLite driver types. It owns:

- Fastify HTTP/local WebSocket composition;
- typed configuration and secret redaction;
- room startup/resume and player-host bootstrap;
- relay creation/client connection behind a port with a local fake;
- durable room-command workflow orchestration through runtime APIs;
- guided-run beat selection and fake text provider calls;
- combined projection delivery and reconnect;
- health and redacted diagnostics.

Bind the local service to the appliance only. In Compose, publish it on loopback so the kiosk can load it while phones remain forced through the relay. Do not expose a mechanical command endpoint to the LAN.

### 6.5 Initial appliance

Provide:

- a pinned multi-stage container build for the host and compiled web assets;
- `compose.yaml` with one host service, loopback-only port, explicit persistent data path/volume, read-only application filesystem where practical, restart policy, health check, and secret-file/environment references that contain no checked-in value;
- a local development composition that can use a local Worker/relay without pretending it proves the no-LAN exit criterion;
- checked-in Chromium kiosk launch/systemd assets that wait for host health and open the local `/tv` route at 1080p with a 720p-supported layout;
- explicit install/uninstall/dry-run instructions. Automated tests must not modify the developer's systemd or browser configuration;
- a deterministic local fallback page when the host is starting or requires recovery.

Phase 6 will add full backup retention, rollback, update ordering, diagnostic bundles, and hardening. Phase 2 must still avoid terminal work during a running session.

## 7. Status, Dependency Order, and Evidence

Use these status meanings: **Complete**, **Ready**, **Pending**, and **Blocked**. Dependency ordering alone is not a blocker. Mark a task Complete only after its validation runs and concise file/command evidence replaces `Not yet implemented`.

| Task | Summary | Depends on | Status | Evidence |
| --- | --- | --- | --- | --- |
| P2-001 | Verify the Phase 2 baseline and guardrails | Phase 1 complete | Complete | Preserved the five-workspace Phase 1 baseline, migration 1 and manifest literals; the historical exit baseline remains 217 tests. |
| P2-010 | Create package/application shells and proposed ADR-0003 | P2-001 | Complete | Ten private workspaces typecheck; package-boundary searches pass; ADR-0003 is truthfully Proposed. |
| P2-020 | Separate client, room, game, and event contract layers | P2-010 | Complete | Central strict `ClientCommand`, `RoomCommand`, `RoomEvent`, `GameCommand`, and `GameEvent` unions pass contract fixtures and exhaustive tests. |
| P2-021 | Define room state, guided presentation, and combined projections | P2-020 | Complete | Room/guided/combined projection schemas and negative visibility/delta fixtures pass the contract suite. |
| P2-022 | Define relay control and transport protocol contracts | P2-020 | Complete | Protocol v1 relay/token/control/transport schemas, bounds, and strict fixtures pass tests and Wrangler type generation. |
| P2-030 | Implement migration 2 and replayable room coordination | P2-021 | Complete | Migration 2 checksum is `sha256:38b882c242fb41685ef4004239d9a3e27211f81573a4a44f5031ddb06beafb27`; migration/reopen/replay/coordinator tests pass. |
| P2-031 | Implement privacy-safe combined projections and delta rebuild | P2-021, P2-030 | Complete | Runtime projection tests cover audience filtering, snapshots, contiguous deltas, snapshot fallback, and rebuild. |
| P2-032 | Implement durable client-to-engine workflows and recovery | P2-030, P2-031 | Complete | Runtime failure-injection tests cover crashes after room start and game commit, exact retry, and reaction deadline pause/resume/timeout. |
| P2-040 | Author the six-hero Phase 2 mechanical manifest and party-size variants | P2-021 | Complete | Six starters and authored 3/4/5 objective/reinforcement variants validate; mechanical hash is `sha256:8231d8b34a1e531af298e87c360c7f43e47575a359e04777b6172951656300b7`. |
| P2-041 | Author and execute the deterministic guided slice with fake text providers | P2-032, P2-040 | Complete | Guided graph and fake-provider tests pass; host integration reaches a replayed withdrawal conclusion through engine transactions. |
| P2-050 | Build the Fastify appliance host and local TV boundary | P2-022, P2-032, P2-041 | Complete | Host lifecycle, random-seed guard, diagnostics redaction, TV fallback, room replay, and restart smoke pass. |
| P2-051 | Build the Worker/Durable Object relay and static PWA delivery | P2-022 | Complete | Relay tests cover create/join/approval/routing/reconnect/rate/frame/origin/expiry behavior; `pnpm config:check` passes. |
| P2-052 | Integrate live relay join, approval, host transfer, and reconnect | P2-050, P2-051 | Complete | Host/relay integration tests cover bootstrap, approvals, transfer/recovery, replacement connections, and filtered resync. |
| P2-060 | Build the browser-first React PWA shell and transport client | P2-022, P2-052 | Complete | Web component/transport tests and Vite production build pass; reconnect records are room-scoped in IndexedDB. |
| P2-061 | Implement phone gameplay, rehearsal, die, reaction, and correction UX | P2-041, P2-060 | Complete | React tests cover role views and mechanical controls; phone route exposes explicit preview/confirm, Spark, die, reaction, correction, and rehearsal controls. |
| P2-062 | Implement TV narration, lobby, recovery, and deterministic zone map | P2-041, P2-060 | Complete | TV/component tests cover startup and role routing; deterministic SVG/text map, public history, disclosure, and recovery states are implemented. |
| P2-070 | Assemble Docker Compose and Chromium kiosk startup | P2-052, P2-060, P2-061, P2-062 | Complete | Compose/config and shell syntax pass; final-source image `sha256:b84cca0bcfb405b689b2f9ebec39e2c29cde03d7e0d9d45bf50263aec74ea808` builds, and test-owned Compose migrate/start/ready/restart plus appliance restart smoke pass. |
| P2-071 | Automate three-, four-, and five-participant room/recovery flows | P2-061, P2-062, P2-070 | Complete | 254 Vitest tests in 40 files pass. Ten ordered Chromium scenarios pass with TV plus isolated 3/4/5-player contexts, full UI terminal paths, rehearsal, claim races, no-LAN assertions, both host crash boundaries, relay/host restart, reaction pause/timeout, correction, physical-roll reload, explicit resume, and deterministic fail-forward coverage. |
| P2-072 | Run two-phone rehearsal and three-to-five-phone exit signoff | P2-071 | Blocked | Requires a reviewed household Cloudflare deployment, two physical rehearsal phones, and at least three simultaneous physical phones; no manual result is claimed. |
| P2-080 | Complete references, accept ADR-0003, and run the exit audit | P2-072 | Blocked | Generated Phase 2 references and primary-plan alignment are current; ADR acceptance and the final exit audit remain gated by P2-072. |

The critical path is:

```text
P2-001 -> P2-010 -> P2-020
                         |-> P2-021 -> P2-030 -> P2-031 -> P2-032 --|
                         |                    |                       |-> P2-041 -> P2-050 --|
                         |                    |-> P2-040 -------------|                    |
                         |-> P2-022 -> P2-051 ---------------------------------------------> P2-052
                                                                                                 |
                                                                                              P2-060
                                                                                              /     \
                                                                                         P2-061   P2-062
                                                                                              \     /
                                                                                               P2-070
                                                                                                  |
                                                                                               P2-071
                                                                                                  |
                                                                                               P2-072
                                                                                                  |
                                                                                               P2-080
```

P2-021 and P2-022 may proceed independently after the central command-layer split. P2-040 may proceed alongside room runtime work because it owns new Phase 2 content files and preserves the Phase 1 catalog. P2-061 and P2-062 may proceed independently after the shared PWA shell, but both consume the same combined projection contracts and must not create local view models that fork them.

## 8. Intended Deliverable Layout

File names may split when a module becomes unwieldy, but package ownership and dependency direction are fixed.

```text
.
├── apps
│   ├── cli
│   ├── host
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── config.ts
│   │   │   ├── main.ts
│   │   │   ├── server.ts
│   │   │   ├── guided
│   │   │   │   ├── runner.ts
│   │   │   │   └── narration.ts
│   │   │   ├── relay
│   │   │   │   ├── client.ts
│   │   │   │   └── fake.ts
│   │   │   └── routes
│   │   │       ├── health.ts
│   │   │       ├── room.ts
│   │   │       └── tv.ts
│   │   └── tsconfig.json
│   ├── relay
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── durable-room.ts
│   │   │   ├── tokens.ts
│   │   │   └── worker.ts
│   │   └── tsconfig.json
│   └── web
│       ├── package.json
│       ├── src
│       │   ├── app
│       │   ├── components
│       │   ├── routes
│       │   │   ├── player.tsx
│       │   │   └── tv.tsx
│       │   ├── state
│       │   ├── transport
│       │   └── views
│       ├── e2e
│       ├── tsconfig.json
│       └── vite.config.ts
├── deploy
│   └── systemd
│       └── lldm-kiosk.service
├── docs
│   ├── architecture
│   │   └── ADR-0003-room-relay-and-presentation.md
│   └── plans
│       └── PHASE_2.md
├── packages
│   ├── content
│   │   └── src
│   │       └── phase-2
│   │           ├── guided-slice.ts
│   │           ├── manifest.ts
│   │           ├── presentation.ts
│   │           ├── starter-loadouts.ts
│   │           └── variants.ts
│   ├── contracts
│   │   └── src
│   │       ├── client-commands.ts
│   │       ├── room-events.ts
│   │       ├── room-state.ts
│   │       ├── room-transactions.ts
│   │       ├── guided-presentation.ts
│   │       ├── combined-projections.ts
│   │       ├── relay.ts
│   │       └── transport.ts
│   ├── providers
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── fake-text.ts
│   │   │   ├── ports.ts
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   └── runtime
│       └── src
│           ├── application
│           │   ├── combined-projections.ts
│           │   ├── room-coordinator.ts
│           │   ├── room-replay.ts
│           │   └── room-workflows.ts
│           └── sqlite
│               └── room-store.ts
├── scripts
│   └── appliance
│       ├── install-kiosk.sh
│       └── uninstall-kiosk.sh
├── test
│   └── fixtures
│       └── phase-2
├── compose.yaml
└── wrangler.jsonc
```

Do not interpret this tree as permission to move Phase 1 mechanical reducers, SQLite internals, or content-manifest resolution into an application. `apps/host` composes public runtime APIs; `apps/relay` never imports runtime or engine; `apps/web` never imports runtime, engine, content internals, or Node APIs.

## 9. Task Specifications

### P2-001 — Verify the Phase 2 baseline and planning guardrails

**Status:** Complete

**Depends on:** Completed Phase 1

**Owns:** Baseline evidence in this plan and factual corrections in `PRIMARY_PLAN.md`; no application or rules implementation.

Read `AGENTS.md`, `PRIMARY_PLAN.md`, ADR-0002, the Phase 1 final handoff, and this plan completely. Inspect current exports rather than relying on Phase 1's intended file tree. Preserve unrelated user changes and record the initial worktree state.

Confirm the completed baseline: five existing private packages/applications (`contracts`, `engine`, `content`, `runtime`, `cli`), migration 1, immutable Phase 1 manifest, current command/event/projection unions, working CLI recovery scenario, empty Compose services, placeholder Wrangler config, and absent Phase 2 directories.

**Acceptance criteria**

- Node 24, pinned pnpm, frozen install, `pnpm verify`, configuration checks, and Phase 1 E2E pass before schema changes.
- The exact baseline test count, package graph, migration checksum/version, content manifest hash, and dirty files are recorded in this task's evidence.
- The audit explicitly records the current `ClientCommand` alias and full host-control projection as Phase 2 changes, not accidental Phase 1 defects.
- No task weakens or rewrites Phase 1 literals merely to ease application work.

**Validation**

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm verify
pnpm config:check
pnpm test -- phase-1-e2e
pnpm list --recursive --depth 0
git status --short
```

### P2-010 — Create package/application shells and proposed ADR-0003

**Status:** Complete

**Depends on:** P2-001

**Owns:** `apps/host`, `apps/web`, `apps/relay`, `packages/providers`, root manifests/project references/scripts, initial application configs, and proposed ADR-0003.

Create buildable private ESM units with these dependency edges:

```text
engine -> contracts
content -> contracts
providers -> contracts
web -> contracts
relay -> contracts
runtime -> contracts, engine, content
host -> contracts, content, providers, runtime
cli -> contracts, runtime
```

`apps/web` and `apps/relay` may depend on contract types/validators only. `packages/providers` may depend on contracts only and exposes a deterministic fake text adapter plus a narrow port; do not add an OpenRouter dependency. `apps/host` must not import `@lldm/engine`, Kysely, or `better-sqlite3` directly.

Add truthful help/start placeholders, React/Vite and Fastify build shells, Worker type/config shell, root project references, and scripts that fail explicitly for unimplemented runtime operations. Pin dependencies and update the lockfile deliberately. Create ADR-0003 with Proposed status and document the local canonical streams, durable workflow, ephemeral relay, participant/seat distinction, and privacy boundary without claiming implementation.

**Strict boundary**

- Do not add a room schema, SQL migration, WebSocket handler, UI that claims to join, or deployable success path.
- Keep Compose and Wrangler validation truthful; a placeholder class or route must return an explicit not-ready result.

**Acceptance criteria**

- All four new units typecheck under root project references with no dependency cycle.
- Recursive dependency output and repository searches match the allowed edges.
- Existing engine purity and Phase 1 tests remain unchanged.
- ADR-0003 is Proposed and distinguishes player-host from appliance host.

**Validation**

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm list --recursive --depth 0
pnpm --filter @lldm/host test
pnpm --filter @lldm/web build
pnpm --filter @lldm/relay typecheck
pnpm --filter @lldm/providers test
if rg -n "@lldm/(engine|runtime|content)|node:" apps/web/src apps/relay/src; then exit 1; fi
if rg -n "@lldm/engine|better-sqlite3|kysely" apps/host/src; then exit 1; fi
```

### P2-020 — Separate client, room, game, and event contract layers

**Status:** Complete

**Depends on:** P2-010

**Owns:** Phase 2 opaque IDs/envelopes, `ClientCommand`, `RoomCommand`, `RoomEvent`, room transaction/outcome records, central union registration, and strict fixtures in `@lldm/contracts`.

Remove the exported `ClientCommand = GameCommand` alias. Preserve `GameCommand`/`GameEvent` meanings and Phase 1 fixture validation. Add `RoomSessionId`, `ParticipantId`, room command/transaction/event/workflow identities, room revision and view revision schemas, client-safe rejection codes, room command hash/state hash types, and strict envelopes.

Define concrete client/room variants for join/approval, hero claim/release, selected-seat switch, activation claim, guided option, legal action commit with optional bounded flavor, Spark choice, die submission, reaction use/pass, reaction timeout, correction request/confirm/cancel, party-choice recording, host transfer/recovery, seat reassignment, and run start/suspend/resume. System-generated timeout/recovery commands must be distinguished from player commands but pass through the same validation and room transaction rules.

Room events must express approved/rejected participants, seat assignment, host authority, run/beat status, pending workflow linkage/completion, private clue presentation, public/player narration, reaction deadlines, recovery status, correction requests/results, relay-room replacement, and terminal outcome without copying mechanical state. Add exhaustive type-narrowing tests and unknown/future/extra-property fixtures.

**Strict boundary**

- Shapes and semantic validators only; do not implement reducers, storage, auth, or UI.
- Do not add a client variant that accepts a raw `GameCommand`, arbitrary event, campaign revision, transaction ID, physical nonce belonging to another seat, or unrestricted mechanical payload.
- Do not change Phase 1 event schemas to encode room behavior.

**Acceptance criteria**

- Repository search finds one authoritative `ClientCommandSchema`, `RoomCommandSchema`, `RoomEventSchema`, `GameCommandSchema`, and `GameEventSchema`.
- Client fixtures cannot validate as engine commands and vice versa except through explicit host mapping functions added later.
- Every variant has strict payload bounds, integer schema version, and exhaustive union coverage.
- Phase 1 valid/invalid fixtures and event replay remain byte-compatible.

**Validation**

```sh
pnpm --filter @lldm/contracts test -- client room envelope union fixture
pnpm --filter @lldm/contracts typecheck
pnpm test -- phase-1
rg -n "export (const|type) (ClientCommand|RoomCommand|RoomEvent|GameCommand|GameEvent)" packages/contracts/src
```

### P2-021 — Define room state, guided presentation, and combined projections

**Status:** Complete

**Depends on:** P2-020

**Owns:** Room-state, guided-content, map-presentation, recent-event, combined-projection, snapshot/delta, and visibility-delivery schemas/validators in `@lldm/contracts`.

Define a versioned `RoomState` with stable room-session identity, current relay room identity when any, campaign and mechanical-manifest linkage, guided-presentation-manifest linkage, mode, participant approvals, seat-to-character/participant mapping, player-host participant, guided run/beat status, pending workflow, reaction/reconnect recovery, correction request, public/private presentation history references, and completion status. Do not embed `GameState`; store only identity/revision linkage required to verify it.

Define validated guided beat graph/content records from Section 5.2, deterministic narration/presentation records, bounded player flavor, seat-private clues, public recent events, and normalized map layout. Semantic validation must reject duplicate IDs, dangling/unreachable transitions, unauthorized visibility, layout references to absent zones, unsupported mechanical operation templates, and graphs missing required Phase 2 coverage.

Define complete combined public-TV, participant-private, and player-host-operational projections plus filtered snapshot/delta delivery records. Define a server-internal view separately and make it impossible to place in the client-delivery union. Carry view, room, and mechanical revisions on every delivered view.

**Acceptance criteria**

- Normal-mode invariants enforce zero/one seat per participant; rehearsal mode allows multiple explicit assignments; each seat maps to one character.
- No deliverable public or player-host schema contains full `GameState`, server-internal state, another seat's clue, another seat's nonce, or unfiltered social secrets.
- Valid graphs prove all required beats/outcomes; focused invalid fixtures fail with stable path-specific codes.
- Snapshot/delta validators reject audience mismatch, revision gaps, wrong base revision, duplicate operations, and server-internal content.

**Validation**

```sh
pnpm --filter @lldm/contracts test -- room-state guided projection visibility delta
pnpm --filter @lldm/contracts typecheck
pnpm typecheck
```

### P2-022 — Define relay control and transport protocol contracts

**Status:** Complete

**Depends on:** P2-020

**Owns:** Relay control HTTP records, token claims, application transport variants, acknowledgements, resync/error contracts, size constants, and protocol fixtures in `@lldm/contracts`.

Extend the existing central `TransportMessageSchema` with the Section 6.3 variants. Keep `protocol_version: 1` only if all Phase 1 messages remain compatible; otherwise make an explicit additive/version migration decision in this task and update both plans before implementation. Do not silently repurpose an existing kind.

Define room-creation request/result, invite redemption, host bootstrap, pending join, token refresh/revoke, and room-expiry records. Token claims include only routing identity/role/audience/expiry data. Define safe relay/host error codes that never contain secret, payload, SQL, stack, or provider detail.

Publish bounded constants for display names, flavor, transport frames, pending joins, room connections, command rate, and retained delivery acknowledgements. Keep future audio/media framing out of the Phase 2 union.

**Acceptance criteria**

- Every transport variant round-trips through strict TypeBox validation and rejects unknown fields/versions.
- Delivery identity (`message_id`, `seq`) is demonstrably distinct from client command identity.
- Token/relay records cannot carry campaign state, narration, player flavor, private clues, or a game command.
- Fixtures cover duplicate message, sequence gap, stale view, audience mismatch, expired room/token, rate limit, payload limit, and incompatible protocol.

**Validation**

```sh
pnpm --filter @lldm/contracts test -- transport relay protocol token
pnpm --filter @lldm/contracts typecheck
pnpm config:check
```

### P2-030 — Implement migration 2 and replayable room coordination

**Status:** Complete

**Depends on:** P2-021

**Owns:** Room reducer/coordinator ports, in-memory tests, SQLite migration 2, room store, room replay/hash verification, and CLI migration/status compatibility in `@lldm/runtime`.

Implement a pure exhaustive `RoomEvent` applier and semantic invariant validator. Implement command coordination against SQLite-independent ports first: validate, canonicalize, idempotency lookup, authority/context decision input, room event allocation, pre/post hash, projection hook, and atomic commit. Duplicate identical commands return stored room transactions without reading clock or allocating IDs; collisions append nothing.

Add immutable migration 2 with the logical storage in Section 4.4. Use strict tables, foreign keys, contiguous revisions, transaction indexes, causation constraints, unique identity bindings, canonical JSON validation on read/write, and verified backup-before-migrate. Extend the current migration registry; never edit migration 1 SQL.

Implement full room replay with transaction-boundary hash verification and cross-link verification to the associated campaign/mechanical revisions. Room projections/deltas remain derived. Add explicit recovery errors for missing campaign, future room schema, incomplete workflow, mismatched mechanical link, and corrupted room event.

**Strict boundary**

- Room reducers never call the engine or infer mechanical results.
- Do not expose Kysely or `better-sqlite3` types outside `runtime/src/sqlite`.
- Do not store relay payload bodies or browser connection presence as canonical room history.

**Acceptance criteria**

- Room command idempotency, collision, stale revision, invariant rejection, atomic failure injection, and exhaustive event application pass with fake ports.
- Migration 2 fresh apply, migration-1 upgrade with verified backup, reopen, rollback on failure, checksum mismatch, and future version pass.
- Full room replay reproduces canonical bytes/hash at every transaction and reports the first divergence.
- Every Phase 1 SQLite/replay/CLI test remains green against both migration states where applicable.

**Validation**

```sh
pnpm --filter @lldm/runtime test -- room coordinator replay migration backup sqlite
pnpm --filter @lldm/runtime typecheck
pnpm --filter @lldm/cli test -- db migration
pnpm test -- phase-1-e2e
```

### P2-031 — Implement privacy-safe combined projections and delta rebuild

**Status:** Complete

**Depends on:** P2-021, P2-030

**Owns:** Combined projectors, room projection/delta storage, rebuild/compare APIs, audience fixtures, and projection tests in `@lldm/runtime`.

Project Section 4.5 views from replay-verified room state plus the current Phase 1 public/seat-private mechanical projections. Use explicit participant-to-seat authorization when selecting private rows. A rehearsal participant may receive several authorized seat-private subviews but the view records each source seat and never merges secrets into public/host sections.

Increment a monotonic view revision on any deliverable change. Store validated latest full views plus bounded derived deltas. Define a deterministic diff vocabulary or event-derived delta scheme; never use arbitrary executable JSON Patch. Rebuild all full views and retained deltas from canonical streams where possible, compare canonical bytes, then replace derived rows transactionally.

Treat the existing full Phase 1 host-control projection as server-internal input. Add a repository test that attempts to deliver it to a player-host and must fail schema validation.

**Acceptance criteria**

- Public, participant, player-host, and server-internal golden fixtures contain exactly their allowed data.
- Planted private clues, social facts, physical nonces, other-seat actions, relay secrets, seed material, and diagnostics never appear outside their audiences.
- Seat or host-authority changes force a full snapshot and cannot reuse a broader delta cursor.
- Projection rebuild is byte-identical and leaves both canonical streams and mechanical hashes unchanged.

**Validation**

```sh
pnpm --filter @lldm/runtime test -- combined-projection visibility delta rebuild
pnpm --filter @lldm/contracts test -- projection delivery
pnpm test -- projection
```

### P2-032 — Implement durable client-to-engine workflows and recovery

**Status:** Complete

**Depends on:** P2-030, P2-031

**Owns:** Runtime workflow mapper/coordinator, stable internal identity derivation, recovery scan, reaction deadline service port, and injected-crash tests.

Implement Section 4.3 as a reusable runtime application service. Map only validated legal client choices to existing `GameCommand` variants. Derive game command/transaction identities from a versioned domain-separated function of room/client command identity so restart and replay cannot choose new IDs. Store the complete derived command before submitting it.

Implement room-only workflows for approval, seat claim/release, host transfer/recovery, party choice, correction request, suspend/resume, and private clue delivery. Implement mechanical workflows for materialization/start, activation, legal combat action, checks/Spark, challenge/social/ritual operations, reaction, die submission, scene transition, and confirmed undo.

Use an injected scheduler/clock only to request a typed reaction-timeout command. The engine never reads time. Disconnect status pauses deadlines; restart reconstructs deadline state and emits no timeout until authoritative connected status is known.

Inject failure before and after every room/game commit boundary. Recovery must settle every stored pending workflow through exact engine retry and final room transaction. Do not acknowledge command success before finalization.

**Acceptance criteria**

- A crash at each boundary yields either no room command or one recoverable workflow and at most one mechanical transaction.
- Retrying the client command before/after restart returns the same final room/game linkage and draw evidence.
- Unauthorized seat, stale view, absent legal candidate, wrong physical nonce, expired reaction, and unconfirmed undo fail with typed safe results and no unintended engine call.
- Concurrent activation claims serialize; exactly one succeeds and the loser receives the friendly stale-spotlight result.
- Reaction timeout is a visible recorded pass, while disconnected reactions remain pending.

**Validation**

```sh
pnpm --filter @lldm/runtime test -- room-workflow crash idempotency recovery reaction authorization
pnpm --filter @lldm/engine test
pnpm typecheck
```

### P2-040 — Author the six-hero Phase 2 mechanical manifest and party-size encounter variants

**Status:** Complete

**Depends on:** P2-021

**Owns:** New Phase 2 mechanical definitions/loadouts/manifest, encounter composition/layout records, clean-room content tests, and generated playable-content reference updates.

Preserve all Phase 1 exported constants, definitions, fixtures, hashes, and tests. Create a separately named Phase 2 mechanical catalog/manifest. Add one complete fixed Maverick and one complete fixed Beacon starter; reuse existing immutable options when they genuinely fit, and add only missing supporting definitions. Every added character option retains both a meaningful tactical effect and narrative permission.

Create validated encounter composition records for three, four, and five selected heroes. Keep every actor definition unchanged across variants. Vary enemy/squad roster, starting zones, reinforcement trigger, and/or objective pressure in authored data. Build composition from claimed starter actors and reject duplicate/unclaimed actors.

Add deterministic map layout metadata for the existing five-zone Floodgate battlefield and any new presentation-only identifiers. Do not put pixel/SVG layout into mechanical zone state.

**Acceptance criteria**

- Six loadouts materialize against the Phase 2 mechanical manifest with no dangling or revision-mismatched reference and have mechanically distinct rank-one identities.
- The old Phase 1 manifest hash and fixture output remain literal and replayable.
- Every 3/4/5 composition validates for all legal selected-starter subsets; actor statistics are identical across variants.
- Small fixed-seed sanity runs terminate within a bounded action count, but no win-rate target blocks the task.
- Generated playable content distinguishes the Phase 1 and Phase 2 mechanical manifests and deferrals.

**Validation**

```sh
pnpm --filter @lldm/content test -- phase-2 manifest starter encounter variant
pnpm test -- phase-1-content-engine phase-1-scenario
pnpm docs:generate
pnpm docs:check
```

### P2-041 — Author and execute the deterministic guided slice with fake text providers

**Status:** Complete

**Depends on:** P2-032, P2-040

**Owns:** Guided beat content and immutable presentation manifest, fake text provider, guided-run application service, narration briefs/templates, path fixtures, and deterministic scenario tests.

Author the Section 5 guided graph with clean-room concise text and pin it in a separately hashed presentation manifest linked to the Phase 2 mechanical manifest. Ensure private clues create useful player conversation rather than private mechanical bonuses unknown to the engine. Add optional flavor as an attributed line before outcome narration only after the associated command commits.

Implement a guided runner that selects the current declared operation, queries verified legal projections, and submits room workflows. It may select deterministic template IDs and enemy fallback actions; it may not branch on hidden random evidence or modify mechanics. The fake text provider validates request/response records, can inject delay/failure in tests, and always has a local deterministic sentence fallback.

Test every graph edge and terminal path, including Crisis/Setback, social hard-limit rejection, ritual interruption/cost, combat victory/withdrawal/defeat, mandatory physical pause/restart/submit, optional Spark, private clue, reaction timeout/disconnect, and 3/4/5 composition. Use a new seed for normal application runs and fixed explicit seeds in fixtures.

**Acceptance criteria**

- Every supported path reaches a declared conclusion without arbitrary route code or database edit.
- The mandatory physical disclosure appears before entry on every relevant path; optional Spark creates the existing physical continuation and consumes Spark only through engine events.
- Failed challenge/combat paths continue to authored consequences without retry/reset.
- Fake provider failure after mechanical commit yields fallback narration and unchanged game/room mechanics.
- Player flavor persists/replays as public attributed input and never appears in `GameState`, content facts, or action legality.
- The guided presentation manifest validates and hashes independently and is never admitted by the engine content-catalog port.

**Validation**

```sh
pnpm --filter @lldm/providers test -- fake text failure
pnpm --filter @lldm/host test -- guided narration
pnpm test -- phase-2-guided phase-2-paths
pnpm docs:check
```

### P2-050 — Build the Fastify appliance host and local TV boundary

**Status:** Complete

**Depends on:** P2-022, P2-032, P2-041

**Owns:** `apps/host` configuration, Fastify server, local TV/static boundary, room lifecycle composition, relay-client port/fake, health/diagnostics, and host integration tests.

Compose public `@lldm/runtime` APIs without importing engine/SQLite internals. Add strict startup configuration for data/database path, local bind/port, public PWA URL, relay URL/credential file, room expiry, rehearsal enablement, and test-only fixture controls. Fail startup with a safe actionable error when migration, content, secret, or relay configuration is incompatible. Never auto-migrate.

Implement local endpoints for health/readiness, the TV application shell, and a local TV WebSocket or equivalent validated stream. Bind to loopback in normal appliance configuration. Add no phone gameplay API on the LAN. The TV connection is a public audience and cannot request a participant projection.

Implement create-run, resume-last-run, suspend, fresh-relay-room, and explicit new-run flows. A new run receives a cryptographic seed through the existing runtime campaign path, pins the Phase 2 mechanical and guided presentation manifests, and stores a new room/campaign rather than deleting or resetting prior history. Completed runs remain locally inspectable through diagnostics/CLI but do not clutter normal TV startup.

Provide a fake in-memory relay-client port for deterministic Fastify tests. Add redacted structured logs for room/connection IDs, revisions, stage latency, typed failures, and recovery state; exclude payload, flavor, narration, clue, seed, token, nonce, and private projection content.

**Acceptance criteria**

- Fastify injection tests create/resume/suspend a room and deliver only public TV views.
- Startup refuses missing/outdated/future storage and bad config with readable recovery instructions.
- New runs use random seeds; fixture seeds require an explicit test-only adapter unavailable in normal routes.
- Local host routes contain no generic raw command submission, SQL, filesystem, or server-internal projection endpoint.
- Fake relay disconnect/reconnect leaves both canonical streams unchanged.

**Validation**

```sh
pnpm --filter @lldm/host test -- config server room health redaction
pnpm --filter @lldm/host typecheck
pnpm --filter @lldm/host build
if rg -n "@lldm/engine|better-sqlite3|kysely" apps/host/src; then exit 1; fi
```

### P2-051 — Build the Worker/Durable Object relay and static PWA delivery

**Status:** Complete

**Depends on:** P2-022

**Owns:** `apps/relay`, Worker routes, Durable Object, Web Crypto token handling, hibernating WebSocket routing, alarms, static assets binding, local Worker tests, and Wrangler configuration.

Implement Section 6 with one Durable Object per opaque room ID. Use the installed Wrangler/Workers runtime and Web Crypto APIs; do not introduce Node-only APIs into Worker code. Authenticate room creation with a Worker secret and return only the typed creation record. Store token hashes/claims or signed claims, never raw application payload.

Accept appliance, TV-external if ever needed, pending-player, and approved-player socket roles only through validated token flows. Attach the minimum role/connection/participant/expiry/sequence metadata needed for hibernation. On wake, reconstruct routing state from attachments and room metadata rather than payload history.

Enforce origin allowlist, room/connection cap, frame size, command/message rate, monotonic sequence policy, token room/audience/expiry, one-use invite/bootstrap proofs, and generic failure responses. Route application envelopes only between the appliance and authorized participant connection; players never route directly to other players. Do not log frame bodies.

Set an alarm at room expiry, close active sockets with a typed closing reason, and delete room/auth/rate metadata within 24 hours. Serve the built PWA assets with cache headers that allow an old loaded client to receive a readable protocol-update response.

**Acceptance criteria**

- Local Worker tests prove create, bootstrap, join pending, approval routing, reconnect, hibernation wake, duplicate frame, rate/size/origin rejection, expiry alarm, and deletion.
- Durable Object storage inspection after routed gameplay frames contains no payload, narration, flavor, clue, projection, campaign, command, or event JSON.
- Invalid/expired/cross-room tokens and direct player-to-player routing fail.
- `wrangler types --check`, local dev startup, and syntax/config validation pass without live Cloudflare credentials.

**Validation**

```sh
pnpm --filter @lldm/relay test
pnpm --filter @lldm/relay typecheck
pnpm --filter @lldm/relay build
pnpm config:check
pnpm relay:dev -- --test-scheduled
```

The final command may be represented by an automated local Worker smoke script rather than an indefinitely running process. Do not require a live deployment in CI.

### P2-052 — Integrate live relay join, approval, host transfer, and reconnect

**Status:** Complete

**Depends on:** P2-050, P2-051

**Owns:** Appliance relay WebSocket client, join/approval/token binding, message sequencing/acknowledgement, reconnect snapshot/delta orchestration, first-host bootstrap, host transfer/recovery, and cross-service tests.

Implement the outbound appliance client with exponential retry bounded by room expiry, message ID acknowledgement, monotonic per-connection sequence, duplicate suppression, and explicit resync on gaps. Do not reissue gameplay commands because a delivery acknowledgement was lost; replay the stored typed command result under the original client command ID.

Implement the complete bootstrap/approval flow. The first player-host proof is one-use and TV-visible; later joiners remain pending until approved. Reconnect tokens in browser storage identify a participant, while the local room stream remains authoritative for approved status, seat ownership, and player-host authority.

Implement explicit host transfer and unavailable-host recovery. Recovery proof is short-lived, single-use, shown only on the local TV, and produces a room event plus full audience snapshots. Announce transfer publicly. Never transfer automatically based on connection age.

Implement delta/snapshot selection and force snapshots after participant approval, seat change, host change, relay-room replacement, or audience mismatch. Replace an expired relay room only after local host confirmation; preserve the local room/campaign.

**Acceptance criteria**

- End-to-end local relay tests cover bootstrap, approve/reject, hero claim, reconnect token, socket replacement, host transfer, TV-code recovery, expired room replacement, duplicate/out-of-order frames, and snapshot fallback.
- Loss at each relay/host boundary changes no mechanic and cannot duplicate a client or game transaction.
- Unapproved clients receive no room projection, roster-private state, command ability, or host controls.
- Player-host delivery validation proves no server-internal or other-seat data is serialized.

**Validation**

```sh
pnpm --filter @lldm/host test -- relay join reconnect transfer resync
pnpm --filter @lldm/relay test -- integration
pnpm test -- phase-2-relay-host
```

### P2-060 — Build the browser-first React PWA shell and transport client

**Status:** Complete

**Depends on:** P2-022, P2-052

**Owns:** `apps/web` application shell, role routes, IndexedDB reconnect storage, transport state machine, service worker/app manifest, shared accessible components, and component/transport tests.

Build one React/Vite application with explicit `/tv` and player-room routes. The TV route connects to the loopback host stream and refuses participant-private delivery. Player routes load from the Worker HTTPS origin and connect only to relay URLs from validated bootstrap configuration.

Implement a transport state machine for connecting, pending approval, approved/syncing, ready, command pending, reconnecting, recovery required, incompatible protocol, expired room, and closed. Keep reconnect token and last acknowledged filtered view cursor in IndexedDB; never store relay creation credential, physical nonce beyond the current projection, other-seat view, or server-internal data.

Apply filtered snapshots/deltas only after central contract validation and audience/revision checks. A gap or failed delta discards derived client state and requests a full snapshot. Keep one in-flight consequential command per selected seat; exact retry reuses client command identity.

Add PWA manifest and shell caching so installation is optional. Do not promise offline gameplay: if relay/internet is unavailable, show explicit last-committed/reconnecting state. Handle service-worker/protocol mismatch with a readable refresh/update route.

Use semantic controls, visible focus, non-color status, reduced-motion support, responsive 720p/1080p TV and current mobile widths, and touch targets suitable for phone use. Full accessibility/device certification remains Phase 6.

**Acceptance criteria**

- QR browser entry works without installation and returns through stored reconnect identity after reload.
- Component/transport tests reject invalid audience, gap, stale delta, wrong protocol, duplicate result, and server-internal payload.
- No React component imports engine/runtime/content internals or decides action legality.
- Cached shell never displays stale state as current while disconnected.

**Validation**

```sh
pnpm --filter @lldm/web test
pnpm --filter @lldm/web typecheck
pnpm --filter @lldm/web build
pnpm playwright:check
if rg -n "@lldm/(engine|runtime|content)|node:" apps/web/src; then exit 1; fi
```

### P2-061 — Implement phone gameplay, rehearsal, die, reaction, and correction UX

**Status:** Complete

**Depends on:** P2-041, P2-060

**Owns:** Player/host phone views and interactions, selection preview/confirm, hero claims, multi-seat rehearsal switcher, physical roll, reaction, recent events, correction, and phone-focused browser tests.

Implement the phone experience in Section 5.5 entirely from combined projections and typed command results. Claiming a hero is atomic and removes it from other rosters after the authoritative update. Normal mode hides multi-seat controls; rehearsal mode labels them and keeps each hero's private view separate.

For hero activations, show `Take the Lead` to eligible assigned seats. After success, present only engine-enumerated action, maneuver, reaction, target, range, cost, and objective candidates. First tap creates local selection plus an expiring public preview; Confirm creates the client command. Clear stale selection on revision change and explain the change rather than submitting it.

Allow optional bounded flavor only after mechanics/target are selected. Escape text, show remaining length, preserve the draft across transport reconnect, and clear it only after final accepted/rejected result. Do not offer freeform interpretation.

Physical roll UI shows exact disclosure, 1–20 grid, selected face, edit/cancel-before-submit, and final confirmation. It never auto-submits or offers undo after acceptance. Spark choice visibly converts the eligible check to physical and shows Edge before confirmation.

Reaction UI shows trigger, cost, Use, Pass, and deadline. Disconnect freezes the countdown state from the server. Correction UI allows request, host review, engine-eligible confirmation, and typed blocked reasons. The compact recent-events drawer shows only bounded public history.

**Acceptance criteria**

- Component/E2E tests cover hero claim conflict, normal/rehearsal assignment, activation conflict, stale selection, action preview/confirm, flavor replay, Spark, die edit/confirm/nonce reuse, reaction use/pass/timeout/disconnect, correction success/block, and host drawer visibility.
- Inactive phones remain usable for status/reference without exposing active commit controls.
- No phone reveals another participant's private clue or nonce, including on back navigation, IndexedDB inspection, or host transfer.
- Every user-visible rejection is specific and offers a safe next step.

**Validation**

```sh
pnpm --filter @lldm/web test -- player rehearsal action die reaction correction privacy
pnpm playwright test --project=chromium --grep @phone
pnpm --filter @lldm/web typecheck
```

### P2-062 — Implement TV narration, lobby, recovery, and deterministic zone map

**Status:** Complete

**Depends on:** P2-041, P2-060

**Owns:** TV route/views, QR/bootstrap/recovery screens, narration presentation, public choices, deterministic SVG map, physical disclosure, textual map alternative, and TV browser tests.

Implement lobby and startup states for new run, resume-last, host bootstrap, pending/approved participants, hero roster/claims, rehearsal label, and start readiness. Do not display private clues or host controls.

Render deterministic narration and attributed player flavor as separate semantic elements. Keep normal beat text concise; retain current state until the next committed beat rather than auto-advancing on a timer. Party choices show option text and concrete stakes; only the host phone records the result.

Build the SVG map from validated presentation layout plus public mechanical combat projection. Show named zones, connections, capacity/occupants, cover, hazard, objective, elevation/visibility tags, active actor, proposed target/movement highlight, and committed change. Include a synchronized textual zone/connection/occupant description. Use deterministic neutral CSS/SVG backgrounds and no remote/generated asset dependency.

Render physical disclosure from its contract: eligible hero, target, complete modifier breakdown, stakes, reason, all outcome bands/face mapping, and awaiting-entry state. Hide nonce/input controls. Render reaction, reconnect grace, recovery-needed, correction/rewind, host transfer, relay retry, and incompatible protocol states clearly.

**Acceptance criteria**

- 1080p and 720p screenshots are readable with no clipped critical state; reduced-motion/high-contrast smoke states pass.
- Map golden tests contain every zone/connection/objective/actor exactly once and update active/highlight state only from projections.
- Public screenshot/DOM leakage tests find no private clue, nonce, runner data, secret motive, relay secret, or future branch.
- TV remains functional with fake provider delay/failure and with every optional image/media facility absent.

**Validation**

```sh
pnpm --filter @lldm/web test -- tv lobby map disclosure recovery privacy
pnpm playwright test --project=chromium --grep @tv
pnpm --filter @lldm/web build
```

### P2-070 — Assemble Docker Compose and Chromium kiosk startup

**Status:** Complete

**Depends on:** P2-052, P2-060, P2-061, P2-062

**Owns:** Container build, `compose.yaml`, runtime health/startup wiring, persistent-data/secret configuration examples, kiosk service/scripts, operational instructions, and config smoke tests.

Build the web assets, host, runtime native dependency, and production Node image in explicit pinned stages. Copy the web TV build into the host image without creating an application dependency edge. Run the service as a non-root user where native SQLite/data permissions permit. Keep application files read-only and canonical data in one explicit mounted directory.

Replace the empty Compose file with one initial host service. Publish only a loopback port, mount the data path deliberately, reference relay credentials through a secret file or root-readable environment file, add restart policy and health check, and avoid checked-in secret/default production credential. Normal startup checks migration and tells the TV what recovery is required; it does not mutate schema automatically.

Provide kiosk systemd/launch assets that wait for health and start installed Chromium in kiosk mode on the local TV URL. Installation/removal scripts must support dry-run, print exact target files, avoid broad deletion, and require explicit human execution for system changes. Tests validate scripts/config but never install services.

Add concise appliance instructions for migrate, start, stop, logs, first room, explicit resume, and safe data path. Full upgrade/rollback/backup retention remains Phase 6.

**Acceptance criteria**

- A clean local build starts the host, serves `/tv`, reports healthy after explicit migration, and survives container restart with room/campaign data intact.
- Compose publishes no phone-facing LAN port and includes no OpenRouter/provider secret.
- Kiosk waits for readiness and lands on new/resume UI without terminal interaction.
- Compose, Docker build, shell lint/syntax, and startup/restart smoke pass.

**Validation**

```sh
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml build
pnpm appliance:smoke
bash -n scripts/appliance/install-kiosk.sh scripts/appliance/uninstall-kiosk.sh
pnpm config:check
```

Use test-owned temporary data/secrets. Do not point smoke tests at a household database or install system services.

### P2-071 — Automate three-, four-, and five-participant room/recovery flows

**Status:** Complete

**Depends on:** P2-061, P2-062, P2-070

**Owns:** Phase 2 cross-package fixtures, local relay/host process harness, Playwright multi-context tests, failure injection, privacy assertions, and deterministic exit scenario.

Automate isolated browser contexts with separate IndexedDB for one TV, one player-host, and enough players for three-, four-, and five-participant variants. Use local Worker/relay and test-owned temporary SQLite/data directories. The main path must use UI controls rather than direct database or raw game-command injection.

At minimum automate:

1. explicit migration and new random-seed run creation (record fingerprint only);
2. first-host bootstrap, two or more approvals, and atomic claims from six starters;
3. normal one-seat limit and two-participant rehearsal multi-seat assignment in a separate run;
4. private clue delivery with negative DOM/network/IndexedDB checks on TV, other player, and player-host;
5. one challenge, party choice, social, ritual, combat, reaction, mandatory physical roll, optional Spark, and terminal outcome;
6. simultaneous activation claims with exactly one accepted;
7. action select/preview/confirm with optional flavor and stale-selection rejection;
8. active phone disconnect/reconnect during an activation and during a physical roll;
9. connected reaction timeout and disconnected reaction pause;
10. correction request, eligible host-confirmed undo, and prohibited submitted-die undo;
11. player-host transfer and TV-code recovery;
12. host-process crash after room workflow start but before/after mechanical commit, exact recovery, and no reroll;
13. relay restart/gap causing delta recovery or full snapshot without game change;
14. container restart and explicit `Resume Last Session`;
15. combat defeat/withdrawal and challenge failure reaching fail-forward conclusions;
16. final verification of both streams, workflow linkage, snapshots, projections, and secret-free logs/relay storage.

Use fixed seeds/clocks only in automated fixtures. Add one separate test proving the normal UI cannot request a fixed seed.

**Evidence:** `apps/web/e2e/phase-2.spec.ts` runs ten ordered Chromium scenarios against a real local Worker, host process, and test-owned temporary SQLite database. The scenarios cover the sixteen minimum cases across full 3/4/5-player UI runs and focused startup, isolation, rehearsal, claim-race, and explicit-resume checks. Test-only controls inject crashes after room-workflow start and after game commit, then restart the host and verify exact recovery; the same harness restarts the relay and proves a filtered snapshot restores presentation without changing the mechanical revision. The three-player fixed-seed run reaches challenge fail-forward and clean success, while four- and five-player runs reach recorded withdrawal; focused engine/guided tests retain combat-defeat and every outcome-band coverage. On 2026-08-08, `pnpm playwright test --project=chromium` passed 10 tests in 1.4 minutes, and `pnpm verify` plus `pnpm test -- phase-2` passed 254 tests in 40 files.

**Acceptance criteria**

- All three party sizes complete through independent contexts and their correct authored encounter variant.
- Browser tests observe no direct request to the host LAN from a phone context.
- Failure injection proves at-most-one game transaction per client command and exact pending-workflow recovery.
- Projection privacy, relay ephemerality, physical disclosure, no-reroll retry, and room/mechanical replay checks pass.
- Tests finish within a CI-suitable bound without live cloud, model, speech, or generated media services.

**Validation**

```sh
pnpm test -- phase-2
pnpm playwright test --project=chromium
pnpm verify
pnpm config:check
```

### P2-072 — Run two-phone rehearsal and three-to-five-phone exit signoff

**Status:** Blocked

**Depends on:** P2-071

**Owns:** Manual test checklist and recorded device/session evidence only; fixes discovered here belong to their owning implementation task.

Run the two-person rehearsal first using two physical phones. Each participant claims multiple heroes through the labeled rehearsal flow, completes the full guided slice, enters the mandatory die, attempts optional Spark, switches private views, reconnects one phone, requests one correction, and resumes after one host/container restart.

After automated/local evidence passes, deploy the reviewed Worker/Durable Object and PWA assets to the household Cloudflare account using secrets outside the repository. Record only the safe deployment identifier and compatibility date. Then obtain at least one additional Wi-Fi-capable phone and run the formal room signoff against that deployed relay with three to five simultaneous physical phones. Each normal participant owns one hero. Include at least one current iOS Safari or Android Chrome device when available; record actual device/browser/OS rather than claiming an untested matrix. Phones must load the HTTPS PWA and relay path, not a LAN URL.

Record setup time, join/approval/reconnect results, scenario duration, command/recovery failures, accidental correction count, whether TV remained primary, and any intervention. Do not collect raw audio because Phase 2 has none; do not put private clue or player flavor text in the evidence document.

**Acceptance criteria**

- Two-phone rehearsal completes and proves explicit multi-seat/private-view switching.
- Formal signoff uses at least three simultaneous real phones, one hero per participant, one disconnect/reconnect under five seconds when infrastructure permits, and no direct LAN access.
- The deployed relay serves the PWA, routes the room, hibernates/reconnects, and expires test-room metadata without retaining payload.
- The group completes a supported conclusion with one mandatory physical roll and no code/database/container/Cloudflare intervention during active play.
- Any failed criterion returns the owning task to Ready/Pending; do not waive it in prose.

**Validation**

```sh
pnpm verify
pnpm playwright test --project=chromium
pnpm lldm -- replay verify --database <test-owned-manual-database> --campaign <recorded-campaign-id>
pnpm lldm -- projection rebuild --database <test-owned-manual-database> --campaign <recorded-campaign-id>
```

The manual database path and campaign ID must be resolved explicitly. Never use a glob, repository root, or household campaign not created for this signoff.

### P2-080 — Complete references, accept ADR-0003, and run the exit audit

**Status:** Blocked

**Depends on:** P2-072

**Owns:** Generated reference completeness, ADR-0003 status, plan evidence/status, factual `PRIMARY_PLAN.md`/README alignment, and final audit notes.

Audit every claim in ADR-0003 against implemented code and tests, then mark it Accepted. Extend generated references with the distinct client/room/game boundaries, room/storage versions, migration 2 checksum, six-starter Phase 2 mechanical manifest/hash, guided presentation manifest/hash, party-size variants, view audiences, transport/protocol constants, reconnect/delta behavior, and guided-slice content. Keep mechanical rules generated from authoritative definitions.

Run the complete phase from a clean-checkout-equivalent state. Confirm no OpenRouter/model/media/speech or broad Phase 5 content entered the graph. Audit the P2-072 household deployment and no-LAN signoff; do not substitute local infrastructure at the exit audit.

Update task status/evidence with exact commands, test counts, package versions, migration/content hashes, browser contexts, manual devices, room/campaign IDs safe to record, final revisions/hashes, recovery events, and deployment identifier. Update `PRIMARY_PLAN.md` from “planned” to the actual completed state only after every gate passes.

**Acceptance criteria**

- Every P2 task is Complete with evidence and no executable-scope TODO or waived exit criterion remains.
- Frozen install, formatting, lint, typecheck, unit/integration tests, generated drift, Worker config/tests, Docker build/config, Playwright, stream replay, and physical signoff pass.
- Relay storage/log inspection remains payload-free; host logs remain secret/private-text-free.
- `@lldm/engine` purity and all Phase 1 replay/hash/manifests remain intact.
- `PRIMARY_PLAN.md`, README, ADR-0003, detailed plan, package graph, and deployment files agree.

**Validation**

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm verify
pnpm config:check
pnpm playwright test --project=chromium
docker compose -f compose.yaml config --quiet
docker compose -f compose.yaml build
pnpm docs:generate
git diff --exit-code -- docs/generated
pnpm docs:generate
git diff --exit-code -- docs/generated
pnpm list --recursive --depth 0
git status --short
```

Live deployment and manual device steps use the documented explicit commands for the configured household environment and must not print credentials.

### 9.1 Recorded implementation deviations

Repository evidence exposed three narrow contradictions between the locked guided slice and the Phase 1 content/command surface. The implementation resolves them inside the authoritative typed engine rather than mutating state in the host:

- The Phase 1 example ritual requires a specific Phase 1 hero's gear and only two participants, so it cannot satisfy the Phase 2 requirement that a selected three-to-five-hero party perform the Floodgate ritual. Phase 2 adds a clean-room Floodgate Relief ritual definition requiring three participants, one fictional requirement tag, and one Supply. The separate Phase 1 manifest and ritual remain unchanged.
- Fresh Phase 1 campaigns start with zero Supply, while the locked Phase 2 ritual must spend one Supply and the host may not manufacture a resource event. A one-use `provision_starting_supply` `GameCommand` now materializes Supply equal to the fully selected party size through the existing `resource_changed` event before guided play starts.
- The Phase 1 event union already models `combat_resolved` with `heroes_withdrew`, but no legal command could produce it. A `withdraw_from_combat` `GameCommand`, reached only through the bounded `withdraw_combat` client intent, validates active combat and emits that existing canonical outcome.
- The Phase 1 start-combat rule requires every present actor to begin fresh, while the locked four- and five-hero variants require reinforcements that are not yet present. Enemy combat participants now carry an optional typed `reinforcement_trigger`; the reducer admits them only from the recorded round-advance or objective-advance event, and public projections omit them before that trigger.
- The Phase 1 spillway objective is pinned to threshold 3, while the locked authored four- and five-hero variants require distinct objective pressure without changing actor statistics. Phase 2 adds threshold-4 and threshold-5 objective definitions plus matching boss overlays and pins each variant to the appropriate references. The Phase 1 objective and overlay remain unchanged.

All five changes are versioned, strictly validated, transaction-coordinated, replayable engine paths. They add no host-side mechanical mutation and do not rewrite Phase 1 manifest or migration literals.

## 10. Automated and Manual Test Matrix

### 10.1 Contract and reducer tests

- Strict validation for every client/room/event/transport/projection variant, extra field, unknown kind, future version, bounded string/list, opaque ID, and audience.
- Exhaustive room reducer application, state invariants, command identity collision, stale room/view revision, transaction causation, contiguous revisions, and pre/post hash.
- Guided graph reachability, transition completeness, visibility, mechanical-template whitelist, map references, and required-path coverage.
- Client-to-game mapping rejects every authority mismatch and never accepts arbitrary game payloads.
- Combined projection golden/leakage fixtures for public TV, participant private, multi-seat rehearsal, player-host operation, and server internal.

### 10.2 Persistence and recovery tests

- Migration-1-to-2 verified backup, failure rollback, checksum/future detection, reopen, and no auto-migration.
- Room replay and combined rebuild after corrupted derived rows.
- Crash before workflow start, after start, before game submit, after game commit, and before final room commit.
- Exact retry after process reopen, including simulated draw and pending physical continuation.
- Relay session expiry/replacement with unchanged local stream.
- Bounded delta pruning followed by snapshot fallback.

### 10.3 Relay and transport tests

- Origin/token/room/audience/expiry validation, invite/bootstrap one-use behavior, pending approval, token reconnect, revocation, rate/frame limits, connection cap, sequence gap, duplicate message, acknowledgement loss, hibernation wake, alarm cleanup, and no payload persistence/logging.
- Appliance and browser reconnect through a replacement `ConnectionId` with stable `ParticipantId`.
- Protocol mismatch produces readable update UI and no partial command.
- Phones make no request to local/private host addresses.

### 10.4 Guided gameplay tests

- Three-, four-, and five-hero composition using varied legal starter subsets.
- Opening/public choice, private clues, Challenge Crisis/Setback/Success/Triumph, social hard limit/leverage, ritual cost/interruption, combat objective/boss/defeat/withdrawal, reaction paths, mandatory physical roll, optional Spark, and every conclusion.
- One normal run proves a new random seed fingerprint differs; deterministic fixtures use explicit seeds and replay byte-for-byte.
- Player flavor appears only after accepted command, is safely rendered, survives reconnect, replays, and never affects mechanics/canon.
- Routine random evidence remains absent from all delivered browser data.

### 10.5 UI and device tests

- Chromium Playwright contexts for TV plus 3/4/5 independent players with separate IndexedDB.
- 720p/1080p TV screenshots, mobile portrait widths, keyboard/focus, reduced motion, high contrast, non-color status, recent-event drawer, and textual map.
- Hero claim/activation races, selection preview/confirm, stale candidate, inactive status, rehearsal switcher, host drawer/transfer, die grid, reaction deadline, correction, reconnect grace, explicit resume, and room expiry.
- Manual two-phone rehearsal and final at-least-three-phone deployed-relay room check. Record actual iOS Safari/Android Chrome coverage without overstating it.

## 11. Representative Failure Cases and Required Outcomes

| Failure | Required player-visible outcome | Canonical requirement |
| --- | --- | --- |
| Two players claim one hero | One claim succeeds; the other sees that the hero was just taken and returns to roster | One seat-assignment event only |
| Two heroes claim activation | One valid engine transaction; loser sees another hero took the lead | No duplicate activation or generic error |
| Action becomes stale during preview | Selection clears with changed-state explanation | No client/game transaction for unconfirmed stale draft |
| Duplicate confirmed command | Original result returns | No new room/game transaction, IDs, time, or draw |
| Host crashes after game commit | TV shows recovery, then resumes exact outcome | Pending workflow exact-retries stored game command and finalizes once |
| Phone disconnects while active | TV shows reconnect grace; action remains reserved | No fallback command or reassignment without host action |
| Phone disconnects during reaction | Deadline pauses and recovery state appears | No timeout/pass until connected or explicit recovery path |
| Connected reaction expires | TV shows that the opportunity passed | Typed timeout command and recorded engine pass |
| Relay drops/hibernates | TV/phones show reconnect; snapshot/delta restores view | Both local streams unchanged |
| Delta is unavailable or audience changed | Client receives full filtered snapshot | No broader cached view survives |
| Relay room expired | Host confirms new QR; participants rejoin preserved run | New relay metadata only; local history unchanged |
| Wrong/used physical nonce | Eligible phone sees readable rejection | No event or reroll; pending state remains as appropriate |
| Submitted die correction requested | Host sees engine-protected reason | No compensating transaction |
| Fake text provider fails | Concise deterministic mechanical narration appears | Committed mechanics unchanged; no blocking retry |
| Player-host requests another clue | Control is absent/rejected | No secret delivered through host authority |
| Incompatible protocol | Readable update/refresh screen | No command accepted under unknown semantics |
| Migration required | TV shows operational recovery instruction before room start | No automatic migration or partial session |

## 12. Security, Privacy, and Logging Checklist

- Treat every browser string and frame as untrusted; validate before authorization and canonicalization.
- Escape player display names and flavor in text, SVG, attributes, accessibility labels, and logs. Do not use raw HTML injection.
- Use constant-time-capable Web Crypto verification for signed claims and at least 128 bits of entropy for secrets.
- Keep relay creation credentials and appliance tokens out of browser bundles, QR invite claims, SQLite events, projections, logs, errors, and diagnostic pages.
- Store locally required relay resume credentials only in protected operational storage; delete them after expiry/replacement.
- Store phone reconnect tokens in IndexedDB with room scoping; clear on revoke/expiry and never broaden audience after seat/host transfer.
- Do not log message payloads, projection JSON, narration, flavor, clues, physical nonces, campaign seeds, or raw SQLite errors.
- Keep operational diagnostics to safe IDs, revisions, typed failure codes, latency, connection state, and expiry.
- Ensure Worker analytics/logs contain no body and Durable Object storage contains no routed frame body.
- Apply strict origin, frame, rate, connection, and display/flavor length limits before routing.
- Do not expose filesystem, database, arbitrary HTTP, engine, or command-construction tools to the fake provider.
- Keep phones off the host LAN API; verify this in browser request logs and Compose binding.

## 13. Continuous Documentation and Change Protocol

Every implementation task follows this protocol:

1. Read dependency evidence and inspect current public exports before editing.
2. Preserve unrelated worktree changes and touch only owned paths plus explicitly named central registries/config/docs.
3. Add/update TypeBox schema, inferred type, semantic validator, strict fixture, exhaustive union handling, and delivery/privacy tests together.
4. Map player input through client/room contracts; never let convenience UI submit a raw `GameCommand`.
5. When a workflow touches mechanics, add crash/retry/no-reroll evidence before calling it complete.
6. When visibility changes, add a negative leakage fixture for TV, other participant, and player-host.
7. When content/mechanics/manifests change, regenerate references in the same task and preserve old immutable manifest fixtures.
8. When package shape, migration, delivered capability, device evidence, or phase boundary changes, update `PRIMARY_PLAN.md` immediately.
9. Run focused validation plus upstream Phase 1 regression tests.
10. Replace `Not yet implemented` with concise literal evidence and update task status. Record a deliberate deviation and rationale rather than silently following stale prose.

`PRIMARY_PLAN.md` remains high-level product/architecture truth. This file owns Phase 2 execution detail. Contracts and reducers remain authoritative; generated references remain derived. ADR-0003 explains durable rationale and becomes Accepted only when code matches it.

## 14. Final Handoff

The Phase 2 handoff must state:

- Which tasks became Complete and the concise evidence for each.
- Final package dependency graph and confirmation of engine/relay/web/host boundaries.
- Node, pnpm, Fastify, React/Vite, Wrangler/Workers, SQLite library, migration, schema/protocol, room-state, and content-manifest versions actually used.
- Migration 1 and 2 checksums and evidence that a migration-1 database upgraded through verified backup while the Phase 1 fixture still replayed.
- Phase 2 mechanical and guided presentation manifest hashes, six starter loadouts, and the three authored encounter variants.
- Automated test counts and Playwright 3/4/5 context results.
- Two-phone rehearsal and final physical device inventory/browser results, including reconnect and no-LAN evidence.
- One representative room/campaign ID, room/mechanical final revisions and hashes, pending-workflow crash recovery evidence, snapshot/delta behavior, physical nonce/retry evidence, and terminal scenario outcome.
- Evidence that player-host/public/relay storage and logs contain no prohibited private or payload data.
- Deployed Worker identifier/compatibility date and room cleanup evidence without credentials.
- Docker image/config and kiosk startup/restart evidence.
- Generated-reference drift result, ADR-0003 Accepted status, and `PRIMARY_PLAN.md` alignment.
- Every plan deviation and its corresponding contract/ADR/primary-plan update.
- The next ready Phase 3 task: add text-first OpenRouter-backed bounded interpretation and narration over the existing client/room/game workflow without allowing model output to mutate mechanics directly.

Do not describe Phase 2 as an LLM game runner. It is a real multi-device living-room shell and a deterministic guided adventure using fake text providers. Freeform text adjudication, campaign generation, voice, and generated media remain later phases.
