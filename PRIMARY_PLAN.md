# AIDM2 Living-Room RPG

**Status:** Ready for implementation  
**Date:** 2026-08-07  
**Outcome:** A one-household living-room RPG prototype for 3–5 adult players, with a deterministic TypeScript rules engine and an LLM-powered game runner delivering voice-first, persistent heroic-fantasy play.

## 1. Current State, Goals, and Constraints

### Repository findings

The repository at `/home/john/repos/aidm2` was empty when planning began. It was not initialized as a Git repository and contained no source, configuration, tests, documentation, or prior `AGENTS.md`.

Useful host capabilities already available are Node.js 24, npm, pnpm, Docker, Git, GitHub CLI, Playwright CLI, ffmpeg, curl, jq, and OpenSSL. Rust is not installed and is no longer required because the selected stack is TypeScript throughout. Cloudflare Wrangler should be added as a pinned project development dependency rather than installed globally.

### Goals

- Recreate the shared social rhythm of tabletop role-playing without requiring a human dungeon master.
- Make uninterrupted table flow the primary success criterion.
- Preserve consequential physical dice moments while resolving routine randomness unobtrusively.
- Give characters meaningful build depth with substantially fewer, more consequential options than a traditional high-complexity fantasy RPG.
- Make all mechanical state authoritative, deterministic, auditable, recoverable, and independent from LLM judgment.
- Support persistent, generated heroic-fantasy campaigns in self-contained 2–4-hour episodes.
- Deliver a complete first campaign tier spanning character ranks 1–4.

### Non-goals

- Public commercial distribution, billing, customer support, or multi-tenant campaign hosting.
- Native iOS or Android applications.
- Remote-first video or voice sessions.
- Local/offline LLM, speech, or image generation.
- Detailed weight, currency, ammunition, ration, or crafting simulation.
- Copying or adapting prose, stat blocks, examples, terminology sets, or lore from an existing ruleset.

### Assumptions and constraints

- The initial audience is a known group of adult players in one living room.
- The host is an Ubuntu-class x86-64 mini PC with 8–16 GB RAM and no required GPU.
- The mini PC and phones have reliable internet access during play.
- The mini PC owns canonical state; the cloud relay owns no campaign data.
- OpenRouter is the sole runtime AI gateway, accessed through a replaceable adapter.
- A typical three-hour session has a soft cloud-AI budget of $15.
- Routine spoken turns may take up to six seconds before runner speech begins when that improves quality.
- Model-dependent behavior is checked with brief manual smoke tests and household play rather than live-model CI or a semantic evaluation suite.

### Success metrics

The household prototype is accepted after one complete 2–4-hour session with 3–5 players meets all of the following:

- No code, database, container, or Cloudflare intervention is required during a session.
- No canonical state is lost and no invalid state transition is committed.
- System-caused correction or rewind occurs no more than once per 20 accepted player turns.
- A feedback sound begins within 500 ms of push-to-talk release.
- Runner speech begins within six seconds at p95 for routine turns.
- Phone reconnection takes no more than five seconds and host-process recovery no more than 60 seconds.
- Tactical setpieces finish in 25–40 minutes.
- Physical-roll cadence averages 10–20 party-wide per session, and every physical roll exposes its stakes first.
- Average OpenRouter usage is no more than $15 per three-hour session.
- Raw player audio is absent after transcription completes.
- The group rates table flow at least 4/5 after the acceptance session.

## 2. Product and Rules Specification

### Core experience

The dominant rhythm is freeform exploration, conversation, and problem-solving punctuated by visually structured setpieces. The runner speaks through the TV, which also shows captions, scene art, public choices, and state changes. Phones remain glanceable companions for push-to-talk, character resources, legal signature actions, private information, choices, corrections, consent, and physical-die entry.

Routine narration stays below about 15 seconds, combat beats below 10 seconds, and major scene openings or climaxes below 45 seconds. Stock thinking sounds, tension stings, and short musical cues mask processing delays without implying that an action has already resolved.

### Core resolution

- Use one d20 for every uncertain mechanical test.
- Characters have four attributes: Force, Finesse, Insight, and Presence.
- Starting attribute ratings are assigned as `+2, +1, +1, 0`.
- Eight disciplines are Athletics, Subterfuge, Craft, Lore, Vigilance, Influence, Survival, and Mysticism.
- Disciplines are rated `+2 trained`, `+1 familiar`, or `0 untrained`.
- Resolve `d20 + attribute + discipline + situational modifier` against targets `10, 13, 16, 19, 22`.
- Permit at most one Edge (`+2`) and one Hindrance (`-2`). They cancel and never stack.
- A result at least five below the target is a Crisis.
- A result one to four below is a Setback.
- A result from the target through four above is a Success.
- A result at least five above is a Triumph.
- A natural 1 lowers the outcome by one degree and a natural 20 raises it by one degree, but neither makes an impossible action possible.
- Do not roll unless the outcome is uncertain and both outcomes materially change play.
- A failed attempt changes the situation and closes an identical retry until the approach or fiction changes.
- Routine engine rolls remain hidden from players but are recorded for replay and diagnostics.

### Physical dice

Physical d20 rolls trigger for permanent-death tests, declared irreversible stakes, named boss transitions, pivotal scene conclusions, or a player’s Spark invocation. The target of 10–20 physical rolls per session is a pacing goal, not a hard cap on lethal events.

Before a physical roll, show the eligible player the die, modifier, target, all outcome bands, and the concrete consequences. The player rolls a real d20 and enters and confirms the face value on their phone. When a player ability forces a boss resistance test, the originating player rolls on the boss’s behalf.

Each player starts a session with one Spark. Spending Spark converts an eligible simulated check into a physical roll and grants Edge. A player may recover Spark once per session when their Drive or Bond creates a meaningful complication.

### Character creation and advancement

Character creation is a shared, runner-led session-zero workshop with individual decisions made on phones:

1. Assign the attribute array and discipline training.
2. Select one of eight Heritage Gifts.
3. Select one of eight Upbringings.
4. Select one of six archetypes.
5. Define a Drive, Bond, significant gear, and signature technique.
6. Select one of two archetype paths at rank 2.

Every Heritage, Upbringing, archetype, path, and talent must grant both a tactical capability and an exploration, social, or narrative permission. Do not ship minor numerical-only choices.

The six initial archetypes and paths are:

- Vanguard: Sentinel or Marshal.
- Maverick: Duelist or Breaker.
- Wayfinder: Hunter or Shadow.
- Envoy: Captain or Trickster.
- Weaver: Elementalist or Shaper.
- Beacon: Lifebinder or Oracle.

Rank 1 establishes the core identity and signature. Rank 2 selects a path. Rank 3 grants a cross-pillar talent. Rank 4 grants the first-tier capstone. The eventual system has ten ranks in three power tiers, but this plan implements and balances only ranks 1–4.

Powerful techniques consume a three-point Exertion pool; signature moves are usable once per scene. Exertion and scene-limited abilities recover through explicit scene transitions or costly rests rather than individual cooldown counters.

Track four significant gear slots per hero and a shared Supply pool capped at `party size + 2`. Mundane money, ammunition, and incidental gear remain narrative unless an episode makes a specific item consequential.

### Combat

- Represent every tactical battlefield as 5–9 named zones joined by explicit connections.
- Zones carry capacity, cover, hazard, objective, elevation, and visibility tags.
- Range is self, same zone, adjacent zone, or distant zone.
- Display deterministic SVG regions, connections, objectives, conditions, and tokens over a subdued scene image.
- Alternate hero and enemy activations. Players select which unspent hero takes each hero activation; related enemies act as squads.
- Give each activation one action, one maneuver, and at most one reaction per round.
- A maneuver moves one adjacent zone, changes stance, or interacts with the environment.
- An action attacks, uses a power, dashes, or advances an objective.
- Weapons and powers have fixed Impact. Success deals base Impact; Triumph adds two Impact and its listed rider.
- Armor reduces Impact only as explicitly defined and never below one.
- Heroes have renewable Guard and three Wound slots.
- Impact depletes Guard. Overflow marks one named Wound and leaves Guard at zero.
- Further harmful hits at zero Guard mark additional Wounds.
- Filling the third Wound immediately triggers a transparent physical death test.
- Death-test Success leaves the hero stable with two Wounds.
- Triumph returns the hero conscious with a permanent Scar.
- Setback or Crisis means permanent death.
- One nearby ally may spend Exertion or Supply before the death roll to grant Edge.
- Bosses use validated phase overlays and objectives rather than inflated health alone.
- Lesser fights use progress/danger challenges rather than opening the tactical display.

The engine enumerates every legal enemy action and target. The LLM selects among these candidates using the enemy’s goals and temperament. A deterministic scoring policy handles timeout or invalid output.

### Narrative systems

- Social play is conversation-first. NPCs have motives, fears, stance, leverage, and hard limits.
- Social checks occur only at consequential turning points and cannot operate as mind control.
- Travel, investigation, social, ritual, and environmental challenges use paired Progress and Danger tracks.
- Combat magic uses typed, engine-validated powers.
- Broader magic uses rituals with explicit scope, time, requirements, costs, target, and consequences.
- Enemies are assembled from validated role chassis, tiers, powers, traits, and encounter budgets.
- The LLM may create an enemy’s identity and fiction but may not create unvalidated mechanics.
- Harmful player-versus-player mechanics require explicit consent from the affected player’s phone.
- Any player may privately pause play. Only that player can release the safety pause, and no explanation is required.

Each campaign begins with a generated frame containing a home region, six setting truths, factions, threats, tone, and boundaries. Before each episode, the system privately generates a structured skeleton containing cast, locations, clues, threat clocks, likely setpieces, contingency hooks, art briefs, and major-NPC voice profiles. No player-host receives adventure spoilers.

Campaign canon updates automatically. Corrections made during ordinary conversation create superseding events; prior history is never silently rewritten.

### Primary journeys

#### Start a campaign

The player-host launches the appliance and displays a QR code. Players join, receive approved seats, establish Lines and Veils, seed the desired premise and tone, and complete the guided character workshop. The system privately generates the campaign frame and opening episode, then begins with a voiced scene introduction.

#### Take a normal turn

A player requests the push-to-talk floor, speaks, and releases. The TV immediately plays an appropriate waiting cue. The host transcribes and interprets the intent, clarifies only if confidence or legality is low, commits the validated outcome, and then presents bounded voiced narration and relevant visual/private updates.

#### Resolve a physical roll

The game presents the exact stakes and outcome bands on the TV and eligible phone. The player rolls a physical d20, enters and confirms the face, and the engine commits and narrates the result. A result submission nonce prevents double entry.

#### Enter combat

The TV transitions to the zone diagram. Phones show resources and legal signature actions without becoming the primary tactical controller. Hero and enemy activations alternate until the objective or defeat state resolves, then the system checkpoints the scene and returns to narrative presentation.

#### Resume or recover

Returning devices reconnect to their approved seats and receive filtered deltas or a snapshot. After a host crash, the appliance reconstructs state from the latest snapshot plus events. Provider or internet failure pauses play at the last committed event and retries idempotently without rerolling.

## 3. Architecture and Interface Contracts

### Repository shape

Create a strict TypeScript pnpm workspace using Node 24:

- `packages/contracts`: TypeBox/JSON Schema definitions for commands, events, content, AI proposals, and projections.
- `packages/engine`: pure deterministic reducer with no database, network, wall clock, or global randomness.
- `packages/content`: versioned character modules, powers, enemy components, encounter budgets, and generated reference data.
- `packages/providers`: OpenRouter and fake provider adapters.
- `apps/host`: Fastify orchestration service, SQLite event store, context builder, media pipeline, cost meter, and diagnostics.
- `apps/web`: React/Vite PWA with TV, player, host-control, character-workshop, and recovery routes.
- `apps/relay`: Cloudflare Worker, static PWA assets, and one Durable Object per active room.

Use pnpm workspaces without an additional build orchestrator. Use strict TypeScript, Biome, Vitest, Playwright, Kysely with `better-sqlite3`, versioned SQL migrations, and a committed lockfile.

### Authoritative engine and storage

The pure engine implements:

`current state + validated command + deterministic random stream -> events or typed rejection`

- Seed simulated randomness from the command ID and campaign seed.
- Store each result and seed reference in its event.
- Use append-only, versioned events with periodic projections and snapshots.
- Represent undo as a compensating event, permitted only for the latest transaction before dependent play advances.
- Store events, transcripts, summaries, facts, projections, migrations, and asset metadata in local SQLite WAL mode.
- Store generated images and reusable synthesized media in a content-addressed local asset directory.
- Use SQLite FTS5 and explicit entity links for memory retrieval; do not add a vector database.
- Snapshot after each scene and session.
- Back up the database and asset manifest before every schema or container upgrade.

Canonical public unions include:

- `ClientCommand`: speech clip, typed fallback, die result, choice, undo, safety pause, host control, and seat approval.
- `GameCommand`: attempt action, use technique, move, interact, assist, rest, advance scene, apply narrative proposal, and resolve check.
- `GameEvent`: command accepted/rejected, roll requested/resolved, resources changed, movement, wound, death, fact asserted/superseded, scene transition, narration, asset, undo, and checkpoint.
- `CheckRequest`: actor, attribute, discipline, target, modifiers, outcome bands, stakes, visibility, physical-roll reason, and eligible roller.
- `ContentDefinition`: prerequisites, action slot, cost, target mode, range, Impact, conditions, narrative permissions, and rule text.
- `Projection`: revisioned public-TV, private-player, and host-control views.

All IDs are opaque branded strings. Every schema carries `schema_version`, and every transport message carries `protocol_version`.

### Relay and identity

Use Cloudflare Workers and Durable Objects because each room maps naturally to one WebSocket coordinator and hibernation keeps idle sockets connected without active compute charges. Durable Objects currently support hibernating WebSocket servers and are available on the Workers free plan. [Cloudflare WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) · [Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

- The host creates a room using a locally stored relay credential and receives an opaque room ID, host token, invite secret, and QR URL.
- Players scan the HTTPS PWA URL, provide a display name, and wait for the player-host to approve a campaign seat.
- Use 128-bit room and invite secrets, expiring signed connection tokens, origin checks, payload limits, rate limits, and host approval.
- A short fallback code still requires host approval.
- Persist reconnect tokens in IndexedDB on the player device; do not create global accounts.
- The Durable Object routes opaque, revisioned messages and retains no campaign state, transcript, or audio.
- Delete room metadata after 24 hours.
- Both phones and the mini PC initiate outbound TLS connections; the home router needs no inbound port.
- Reconnecting clients submit their latest projection revision, and the host returns a filtered delta or snapshot.

Each transport envelope carries `message_id`, `room_id`, `connection_id`, optional `seat_id`, monotonic `seq`, optional `reply_to`, `kind`, and payload. Receivers acknowledge message IDs and ignore duplicates.

### Spoken-turn transaction

1. The room coordinator grants one phone the floor and queues other PTT requests FIFO.
2. The PWA records compressed audio in 250 ms chunks, capped at 30 seconds, and forwards it through the relay.
3. The host assembles audio only in memory or tmpfs and starts a local waiting cue within 500 ms of release.
4. The configured OpenRouter transcription model returns text.
5. A structured interpretation call returns intent, references, confidence, and either a proposal or a clarification request.
6. The engine validates and resolves the proposal. Physical checks pause at `CheckRequest`; simulated checks commit their recorded result.
7. The engine builds a narration brief from committed facts. The narration model returns bounded speech and captions only; it cannot change mechanics or canonical state.
8. A separate structured call extracts any proposed canon facts from the narration. The host validates those proposals, synthesizes the selected runner or NPC voice, and sends captions and audio to the TV.
9. Raw audio buffers are destroyed after transcription; only transcripts and committed results persist.
10. Invalid structured output may make one configured fallback call with the validation error when time permits. Otherwise, or after a second failure, use deterministic clarification or mechanical narration without committing invented state.
11. Provider or network failure preserves the pending command and may use the explicit fallback idempotently without rerolling.

### AI adapters and initial models

Define narrow `transcribe`, `completeStructured`, `completeNarrative`, `synthesize`, and `generateImage` interfaces over one OpenRouter adapter. Keep model assignments in validated configuration. Record role, requested and effective reasoning, model ID, upstream provider, prompt version, latency, request ID, token or media usage, and estimated cost for every request.

Initial OpenRouter-routed defaults are:

| Responsibility | Primary model | Reasoning | Explicit fallback | Fallback reasoning |
| --- | --- | --- | --- | --- |
| PTT transcription | `qwen/qwen3-asr-flash-2026-02-10` | N/A | `openai/gpt-transcribe` | N/A |
| Intent and entity extraction | `deepseek/deepseek-v4-flash-0731` | Disabled | `openai/gpt-5.6-luna` | Low |
| Routine adjudication and enemy tactics | `deepseek/deepseek-v4-flash-0731` | Disabled | `openai/gpt-5.6-luna` | Low |
| Canon extraction and session summaries | `deepseek/deepseek-v4-flash-0731` | Disabled | `openai/gpt-5.6-luna` | Low |
| Difficult adjudication and contradiction repair | `deepseek/deepseek-v4-flash-0731` | High | `openai/gpt-5.6-luna` | High |
| Campaign and session preparation | `openai/gpt-5.6-terra` | Max | `qwen/qwen3.8-max` | Xhigh |
| Narration and ordinary NPC dialogue | `aion-labs/aion-3.0-mini-20260707` | N/A | `minimax/minimax-m2-her` | N/A |
| Speech synthesis | `mistralai/voxtral-mini-tts-2603` | N/A | `microsoft/mai-voice-2-flash` | N/A |
| Scene and location images | `google/gemini-3.1-flash-image` | N/A | `google/gemini-3.1-flash-lite-image` | N/A |

Use one OpenRouter credential and explicit cross-model fallbacks; do not use an automatic cross-model router. Permit same-model upstream failover only across routes that honor `data_collection: deny`, and set `require_parameters: true`. Normalize reasoning to `disabled`, `low`, `medium`, `high`, `xhigh`, `max`, or not applicable, then validate each model's effective setting. In particular, Qwen 3.8 Max uses `xhigh` as its effective maximum.

Difficult live adjudication has a four-second deadline. Invoke its fallback only when an immediate transport, provider, or schema failure leaves time within the spoken-turn budget. On timeout, make a conservative provisional ruling and preserve the unresolved issue for later repair rather than chaining slow calls.

Set a soft $15 three-hour-session budget. At 80%, privately notify the player-host and switch optional images to the cheaper fallback before suppressing further optional images. Narration and recovery calls never hard-stop. Before changing a household default, run a few representative prompts or audio clips and one short play session; do not build a comprehensive model benchmark suite.

### Presentation

- The TV defaults to runner audio, synchronized captions, current speaker or character, public choices, state changes, and scene art.
- Combat switches to the illustrated zone diagram and emphasizes the active character, legal targets, objectives, and conditions.
- The PWA shows PTT state and queue, resources, legal signature actions, private perceptions, die entry, consent prompts, corrections, and safety controls.
- Typed input is a complete alternative to speech.
- Private prompts are brief and return quickly to shared play.
- Generated images run asynchronously and never block play.
- Preserve the prior image or a deterministic campaign backdrop until replacement art is ready.
- Preload original or CC0 thinking sounds, tension stings, transitions, roll suspense, error cues, and ambience with a machine-readable attribution manifest.

## 4. Security, Privacy, Accessibility, and Operations

### Security and privacy

- Keep the OpenRouter key and relay credential only on the mini PC through Docker secrets or a root-readable environment file.
- Treat player speech as untrusted game content, never as system instructions.
- Give models only the schemas and context needed for their current stage.
- Do not expose database, filesystem, shell, or arbitrary network tools to models.
- Filter events, projections, and prompt context by public, seat-private, runner-secret, and host-control visibility.
- Request microphone access only after an explicit action and capture only while PTT is active.
- Show a persistent visual recording indicator.
- Store events and transcripts locally but no raw audio.
- Explain during session zero that OpenRouter and its selected upstream providers process submitted audio and generated content.
- Use campaign Lines and Veils as hard generation constraints.
- An any-player safety pause immediately stops TTS, music, recording, and command processing.
- Target adults only. Child accounts, regulated data, payments, and public moderation are not applicable.
- Maintain a clean-room provenance log from the first commit.
- Require explicit compatible licenses and attribution for third-party audiovisual assets.

### Accessibility and performance

- Provide synchronized captions, typed input, text descriptions of visual state, and non-audio equivalents for every cue.
- Support keyboard operation, high contrast, reduced motion, and status communication that does not rely on color alone.
- Support current iOS Safari and Android Chrome PWAs and a 1080p Chromium kiosk, remaining usable at 720p.
- Stop, duck, or replace music immediately when narration, PTT, or a safety pause requires it.

### Observability

- Emit local structured logs and a host diagnostics page for stage latency, schema failures, retries, room connections, provider cost, model and prompt versions, and event revisions.
- Redact transcript text, private facts, and secrets from operational logs; correlate by event and request IDs.
- Record no external product telemetry.
- Keep minimal Cloudflare platform analytics and never log audio or game payloads there.

### Migration, rollout, and rollback

Migration from existing application data is not applicable because this is a greenfield repository.

- Begin SQLite migrations at version 1 and make every migration transactional.
- Back up SQLite and the asset manifest before migrations.
- Retain the previous two backups and container tags.
- Make relay and protocol changes additive whenever possible.
- Deploy compatible relay changes before dependent clients.
- Reject incompatible protocol majors with a readable update message.
- Roll back by restoring the previous container tag and matching database backup.
- The user is the operational owner; there is no public SLA or external support obligation.

## 5. Ordered Implementation Phases

### Phase 0 — Repository and executable rules foundation

- Initialize Git and the pnpm workspace.
- Add Node 24, strict TypeScript, Biome, Vitest, Playwright, Docker Compose, and Wrangler configuration.
- Add `AGENTS.md`, this plan, the clean-room provenance log, an architecture record, a glossary, and the mechanical rules reference.
- Implement canonical schemas, core d20 math, Edge/Hindrance, outcome degrees, physical-roll triggers, and character foundations.
- Generate the probability report and mechanical reference tables from executable definitions.

**Exit criterion:** The core resolution examples pass and generated mechanical tables agree with engine definitions.

### Phase 1 — Deterministic engine and persistence

- Implement validation, reducers, seeded randomness, event replay, snapshots, SQLite migrations, projections, compensating undo, and a CLI simulator.
- Implement ranks 1–4 structures, Guard/Wounds, Exertion/Spark/Supply, named zones, alternating activations, fixed Impact, death tests, progress/danger tracks, social motives, and typed rituals.
- Add the six archetype identities and enough complete rank-one content to simulate a four-hero encounter.
- Implement content validation and generated rules-reference output.

**Exit criterion:** Replaying the representative event fixtures produces the same state hashes, and focused invariant tests reject invalid resources, activations, zone relationships, and death states.

### Phase 2 — Room shell, PWA, and TV

- Build the Fastify host, React/Vite role-based web app, filtered projections, seat management, QR flow, host transfer, typed commands, choices, die entry, and reconnect behavior.
- Deploy the Cloudflare Worker/Durable Object relay with hibernating WebSockets, static PWA assets, token validation, rate limits, and room cleanup.
- Add Chromium kiosk startup and the initial Docker Compose appliance.
- Exercise the complete room flow with fake provider adapters and text narration.

**Exit criterion:** Three to five physical phones can join, reconnect, receive correctly filtered state, submit one physical roll, and finish a simulated encounter without direct local-network access.

### Phase 3 — Text-first LLM game runner

- Implement the OpenRouter adapter, per-role model configuration, staged orchestration state machine, context envelope, bounded action and narrative proposals, clarification policy, explicit fallbacks, automatic canon, secrets, and checkpoints.
- Implement campaign-frame and episode-skeleton generation with schema and encounter-budget validation.
- Add conversational correction, consent-gated PvP, Lines/Veils, safety pause, and outage recovery.
- Run the first complete text-driven generated episode before adding voice.

**Exit criterion:** A household playtest completes a generated episode without manual database edits, illegal LLM state changes, or any player seeing hidden adventure material.

### Phase 4 — Voice, physical dice, art, and sound

- Add queued PTT capture, codec normalization in tmpfs, transcription, waiting cues, captions, streamed runner audio, interruption, and typed fallback.
- Add persistent abstract voice profiles for each major NPC and stable speaker labeling.
- Add the physical-roll stakes and confirmation UX.
- Add asynchronous scene-card generation, the campaign visual bible, combat SVG overlays, asset caching, and audio mixing.
- Add provider usage and cost accounting with the $15 soft-budget behavior.

**Exit criterion:** Routine speech begins within six seconds at p95, no raw audio remains after transcription, generated art never blocks play, and recurring major NPCs remain audibly distinguishable during the playtest.

### Phase 5 — Complete rank-one-to-four content and campaign loop

- Finish all six archetypes and twelve paths, eight Heritage Gifts, eight Upbringings, Drive and Bond templates, significant gear, techniques, and rank advancements.
- Add five enemy roles across three tiers, squad rules, boss overlays, encounter budgets, reusable powers and traits, hazards, objectives, and abbreviated-conflict templates.
- Complete session-zero world generation, the character workshop, advancement, episode preparation, recaps, automatic canon, and 4–6-episode continuity.
- Check parties of three, four, and five with a small set of engine simulations and household play sessions.

**Exit criterion:** One party can advance from rank 1 through rank 4 across a complete episode tier with no unsupported character, encounter, travel, social, or ritual state.

### Phase 6 — Appliance hardening and household acceptance

- Pin container images and dependencies.
- Add health checks, startup ordering, data export, pre-migration backup, restore, and rollback scripts.
- Harden relay authentication, payload limits, secret handling, prompt boundaries, projections, and crash recovery.
- Run basic responsive, accessibility, iOS Safari, Android Chrome, 720p/1080p, and kiosk smoke checks.
- Add a diagnostic bundle that excludes raw audio, private facts, and API keys.
- Conduct one complete household acceptance session.

**Exit criterion:** The core success metrics in Section 1 pass during the household acceptance session.

## 6. Test Strategy

### Automated tests

- Unit-test the core d20 outcomes, resource transitions, combat activation rules, physical-roll flow, and event replay.
- Add a few contract fixtures for valid structured output, malformed output, fallback selection, and idempotent retry without rerolling.
- Integration-test one representative room flow covering join approval, a player command, a physical roll, reconnect, and checkpoint recovery with fake providers.
- Keep one Chromium Playwright smoke path for the TV and phone interfaces. Check iOS Safari, Android Chrome, microphone denial, and typed fallback manually before a group session.
- Do not run live or semantic model evaluations in CI. Try a handful of representative inputs manually when changing a model or prompt.

### Representative failure cases

- Transcription returns the wrong character or ability name.
- Interpretation output violates schema or proposes an illegal action.
- A phone disconnects and reconnects during a turn.
- An OpenRouter request or selected upstream provider fails between transcription and resolution.
- Generated art completes after the scene has already changed.
- Canon extraction contradicts an existing fact or attempts to expose a private fact.

Each case must produce a typed, user-visible recovery state without corrupting canonical history or silently guessing.

## 7. Risks and Mitigations

- **Model drift:** Record model and prompt versions and run a short smoke test before changing defaults.
- **Automatic-canon errors:** Retain provenance and allow explicit superseding corrections without rewriting history.
- **Voice inconsistency:** Store stable abstract profiles and fall back to one fixed provider voice for that NPC rather than changing identity mid-session.
- **Hidden-roll distrust:** Keep a private deterministic audit trail even though routine results are not exposed during play.
- **Relay interruption:** Use acknowledgements, sequence numbers, idempotency, reconnect snapshots, and local canonical ownership.
- **Rules imbalance:** Constrain modifiers, generate rules tables from code, simulate encounters, and limit the prototype to ranks 1–4.
- **Lightweight AI testing:** Keep defaults stable between sessions and manually try representative inputs after a model or prompt change.
- **Intellectual-property contamination:** Maintain the clean-room provenance log and license manifest from the first commit.
- **Abrupt character loss:** Permit routine danger to cause a dying state, but require the final transparent physical death test before permanent loss.
- **Generated-media latency:** Generate asynchronously, retain prior assets, and always provide deterministic backgrounds and audio cues.

## 8. Decision Log

- Narrative play with tactical setpieces is the dominant rhythm.
- The first ruleset targets heroic fantasy, episodic campaigns, adult players, and parties of 3–5.
- TypeScript replaces the initially contemplated Rust stack.
- The local engine is mechanically authoritative; the LLM submits bounded proposals.
- Canonical execution and history remain on the Linux mini PC.
- Cloudflare Durable Objects provide an ephemeral room relay and HTTPS PWA delivery.
- OpenRouter is the sole runtime gateway behind a replaceable adapter; OpenAI models, when used, are reached through OpenRouter.
- Physical player-entered d20 rolls are sparse, dramatic, and transparent.
- Routine simulated rolls remain hidden.
- Characters use modular archetypes and cross-pillar options through rank 4.
- Combat uses named zones, alternating spotlight activations, fixed Impact, and Guard plus Wounds.
- Campaigns use generated frames, prepared hidden episode skeletons, and live improvisation.
- Campaign canon commits automatically.
- Generated scene art is asynchronous, while important NPCs receive unique persistent voice profiles.
- Model-dependent quality is accepted through lightweight manual checks and household play, not automated semantic evaluations.
- The release target is a Docker Compose appliance for one household, not a public service.

## Unresolved Decisions

None.
