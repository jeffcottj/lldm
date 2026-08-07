# Phase 1 — Deterministic Engine and Persistence

**Status:** Implementation in progress

**Parent plan:** [PRIMARY_PLAN.md](../../PRIMARY_PLAN.md)

**Planned:** 2026-08-07

**Primary executor:** Autonomous coding agent

**Audience:** AI coding agents. This is an execution contract, not a human-oriented project brief.

**Outcome:** A deterministic, event-sourced rules runtime with a pure authoritative engine, an impure reusable local runtime, SQLite persistence, replay and recovery, revisioned projections, compensating undo, initial playable rank-one content, and a scriptable CLI that can complete and reproduce one four-hero encounter.

## 1. Completion Standard

Phase 1 is complete when a fresh checkout can create and migrate a new local SQLite database, build a campaign pinned to an immutable content manifest, materialize four playable rank-one heroes from character foundations, execute the representative encounter through separate CLI processes, and recover the same validated mechanical state from canonical events.

The exit gate must prove all of the following:

- `@lldm/engine` remains pure and depends only on `@lldm/contracts`; it reads no clock, entropy, filesystem, environment, network, SQLite API, or global random source.
- TypeBox schemas in `@lldm/contracts` remain the only command, event, state, content, randomness-record, snapshot, and projection contract authority. No package declares a local competing command or event union.
- A command is bound permanently to its canonical payload. Retrying an identical command returns its committed transaction without rerunning the engine or drawing again, while the same command ID with different data is rejected as an identity collision.
- Each valid command commits exactly one contiguous event revision range in one SQLite transaction. A legal engine rejection is canonical; malformed input is rejected before canonical history.
- Simulated random draws are reproducible from the campaign seed and command identity through the versioned algorithm in this plan, and every realized draw is recorded. Event replay never draws randomness.
- Event-only replay reaches the recorded state hash after every transaction. A missing or invalid snapshot causes an explicit full-replay fallback rather than a guessed state.
- Projection rows advance atomically with events and can be rebuilt byte-for-byte from canonical history without exposing private state in public views.
- Compensating undo preserves history and reverses only the latest eligible accepted state-changing transaction.
- `CharacterFoundation` remains creation input, not playable state. A separately validated playable-character state owns resources, abilities, conditions, rank structure, and combat participation.
- Executable resource, rank, combat, challenge, social-state, and ritual invariants exist. Six archetypes are playable at rank 1; ranks 2–4 have tested structural advancement support but no shipped path, talent, or capstone catalog.
- One original deterministic encounter proves four heroes, named zones, alternating activations, actions, maneuvers, reactions, fixed Impact, Guard/Wounds, a boss transition/objective, deterministic enemy fallback selection, and a physical death-test branch.
- The committed mechanical, probability, and playable-content references regenerate byte-for-byte from public definitions, and `PRIMARY_PLAN.md` describes the application that actually exists.

Passing unit tests alone is insufficient. The phase is incomplete if the CLI cannot reopen the database between commands, replay hashes diverge, stale snapshots fail silently, a duplicate command can reroll, generated references drift, or Phase 2 application/provider work has been pulled forward.

## 2. Scope Boundary

### In scope

- Two new workspace units only:
  - `@lldm/runtime` in `packages/runtime` for transaction coordination, injected system ports, SQLite persistence, migrations, replay, snapshots, projection materialization, and backup/recovery helpers.
  - `@lldm/cli` in `apps/cli` for the `lldm` executable, argument parsing, JSON/file/stdin boundaries, and concise terminal presentation.
- Central version-1 TypeBox unions and domain records for Phase 1 commands, events, canonical state, content mechanics, random draw records, snapshots, and projections.
- A pure command-decider/event-applier engine architecture. Only applying validated events may change mechanical campaign state.
- One campaign-scoped event stream with event-level revisions, transaction identity, optimistic expected revisions, pre/post state hashes, and transaction-level storage timestamps.
- Versioned deterministic simulated randomness, physical-roll request/resume transactions, and retry behavior that cannot reroll.
- Playable-character state separate from `CharacterFoundation`; rank structure through 4; Guard, Wounds, Exertion, Spark, Supply, scene-use state, and explicit recovery transitions.
- Named-zone combat, activation economy, fixed Impact, armor, death tests, boss overlays/objectives, legal-action enumeration, and deterministic enemy fallback scoring.
- Executable generic kernels plus one example each for Progress/Danger challenges, social motives/limits/leverage, and typed rituals.
- Six complete rank-one archetype identities and the minimum complete supporting content needed for four legal distinct starter heroes and the representative encounter.
- Kysely with `better-sqlite3`, SQLite WAL mode, immutable versioned migrations beginning at storage migration 1, explicit backup-before-migrate behavior, event replay, snapshots, materialized projections, and compensating undo.
- A scriptable CLI, canonical JSON fixtures, deterministic scenario fixtures, focused exhaustive invariants, failure injection, and the fresh-database recovery exit scenario.
- A proposed-then-accepted ADR-0002 and continuous generated-reference and primary-plan alignment.

### Explicitly deferred

- `apps/host`, Fastify, HTTP or WebSocket APIs, room orchestration, seats, QR joining, relay traffic, and reconnect transport; these begin in Phase 2.
- `apps/web`, `apps/relay`, `packages/providers`, Docker application services, Durable Objects, and deployable Worker code.
- LLM calls, narration, speech, transcription, generated media, prompt/context systems, canon extraction, provider costs, and model configuration.
- Broad character catalogs; rank-2 paths, rank-3 talents, rank-4 capstones, all eight Heritage Gifts, all eight Upbringings, all twelve paths, and campaign advancement content remain Phase 5 work.
- Broad enemy rosters, encounter-budget tuning, campaign generation, episode preparation, and win-rate balance gates.
- A TUI, interactive REPL, conversational CLI, or terminal presentation intended to imitate the Phase 2 room experience.
- Async projection workers, multi-writer or multi-host coordination, vector storage, FTS memory, transcripts, summaries, generated assets, and asset metadata.
- Undoing arbitrary history, undoing an undo, rewriting/deleting events, or compensating a submitted physical result or permanent death.
- Database encryption or a general secrets system. Phase 1 protects the campaign seed by local file permissions and redaction; later appliance hardening may strengthen storage.

`apps/cli` is an actual Phase 1 application, not an early version of `apps/host`. `@lldm/runtime` is the reusable local application/runtime kernel that Phase 2's host will compose.

## 3. Fixed Decisions

These choices are settled. An implementation task may refine names and file splits, but it may not substitute a different architecture without first updating this plan and `PRIMARY_PLAN.md` with the reason.

| Area | Decision |
| --- | --- |
| Plan audience | Write this and future plan documents for AI coding agents, with explicit dependencies, owned paths, boundaries, acceptance criteria, commands, and evidence. |
| Package ownership | Add one impure `@lldm/runtime` package and one thin `@lldm/cli` application. Keep `apps/host` deferred to Phase 2. |
| Runtime internals | Keep system ports and transaction coordination independent of SQLite types inside `@lldm/runtime`; put Kysely, `better-sqlite3`, migrations, and backup filesystem work behind a package-internal SQLite adapter. |
| Dependency direction | `contracts` has no workspace dependency; `engine` and `content` depend only on `contracts`; `runtime` may depend on `contracts`, `engine`, and `content`; `cli` depends on `runtime` and contract types needed at its external boundary. |
| Content access | Inject a validated, campaign-pinned content catalog into the engine. The engine never imports `@lldm/content`. |
| Mechanical transition | A pure command decider emits typed events or a typed rejection. A pure event applier is the sole mechanical state-transition function. Replay calls only the event applier. |
| Contract unions | Extend centralized exported TypeBox unions in `@lldm/contracts`. Domain files export variants into the central registry; they do not publish local `GameCommand` or `GameEvent` unions. |
| Command retry | The first valid submission binds `command_id` to canonical command bytes/hash and its transaction. Same ID plus identical command returns the stored result. Same ID plus different command is a typed identity collision and is not appended. A new command that reuses an occupied transaction ID is likewise a typed non-canonical collision because preserving the caller's ID and storage uniqueness makes a canonical rejection impossible. |
| Rejections | Structurally invalid input is non-canonical and appears only in redacted diagnostics. A structurally valid command rejected by revision, campaign, content, or engine legality commits a typed `command_rejected` event with no mechanical state change. |
| Event stream | Use one stream per campaign. Empty campaigns are revision 0; committed events receive contiguous revisions beginning at 1. Events in one transaction share transaction identity and occupy one uninterrupted range in `transaction_index` order. |
| Concurrency | Every new command carries `expected_revision`. Idempotency lookup happens before the revision check. A new stale command commits a typed rejection at the then-current stream head. |
| Timestamps | Read an injected clock once per committed transaction and store an RFC 3339 UTC millisecond `committed_at` on the transaction row. Do not add wall-clock time to canonical events or mechanical state. Operational campaign, migration, backup, snapshot, and projection metadata may have storage timestamps. |
| Campaign seed | Generate 256 bits with an injected cryptographic entropy source during normal campaign creation. Store the secret only in protected local campaign metadata/backups. Permit explicit seeds only through a visibly test/fixture-only CLI path. |
| Simulated randomness | Use versioned, domain-separated HMAC-SHA-256 draws derived from campaign seed, campaign ID, command ID, stable purpose, purpose-local index, and block counter. Use rejection sampling for unbiased bounded integers. |
| Random evidence | Record algorithm version, seed fingerprint, command ID, purpose, purpose-local index, requested range, realized value, and rejection count with the resulting event. Never put the raw campaign seed in an event, snapshot, projection, log, or normal CLI output. |
| Physical rolls | The initiating transaction commits pending-check state and `physical_roll_requested`. A later `submit_die_result` command has new command/transaction identity and carries check ID plus a single-use nonce. No database transaction remains open for human input. |
| Hashing | Canonicalize mechanical state with one versioned JSON canonicalization implementation and hash it with SHA-256. Store pre/post state hashes per transaction; exclude projections, timestamps, storage rows, and diagnostics. |
| Snapshots | Treat snapshots as disposable validated replay accelerators. Snapshot after scene transitions, explicit checkpoint/session boundaries, and a fixed event-count threshold. Validate schema, revision, content manifest, and state hash before use; explicitly report fallback to event replay. |
| Content stability | Campaigns pin an immutable content-manifest hash containing stable content IDs, integer definition revisions, and definition hashes. Changed definitions receive a new revision/manifest. Events carry resolved mechanical facts sufficient for event-only replay. |
| Migrations | `@lldm/runtime` owns ordered immutable checksummed migrations. `lldm db migrate` applies them explicitly after a verified backup; ordinary commands refuse outdated, missing, failed, or future schemas with typed recovery instructions. |
| Projections | Pure projectors materialize public, seat-private, and host-control views in the same SQLite transaction as events. Projection revision equals the resulting event-stream revision. Projections are rebuildable derived data. |
| Undo | Only the latest accepted state-changing transaction is eligible, ignoring later rejections and inspection/checkpoint operations. A new command emits explicit compensating domain events. Undo cannot target another undo, a submitted physical result, or permanent death. |
| Character boundary | Preserve `CharacterFoundation` unchanged in meaning as bounded creation input. Materialize a distinct `PlayableCharacterState` only after catalog and invariant validation. |
| Rank/content depth | Ship six playable rank-one archetypes and enough supporting content for four starter heroes. Test advancement structure and invariants through rank 4 with validated test catalogs, while production paths/talents/capstones remain unavailable. |
| Non-combat depth | Implement executable generic kernels and one original vertical-slice definition each for Progress/Danger, social state, and rituals. Defer generation, narration, and broad catalogs. |
| Encounter depth | Use one original deterministic full-loop encounter with focused branch fixtures. Enemy decisions use legal-action enumeration plus deterministic fallback scoring, never an LLM. |
| Balance | Gate correctness and bounded sanity only. Seeded simulations may expose observations but no win-rate target blocks Phase 1. |
| CLI | Provide scriptable subcommands with file/stdin JSON input, stable JSON output, optional concise human output, and no REPL/TUI. |
| Generated references | Extend `mechanical-reference.md`, retain `probability-report.md`, and add `playable-content-reference.md`; generate all from public definitions and enforce drift checks. |
| Architecture record | Add ADR-0002 for the deterministic runtime and event store. Keep it Proposed until implementation matches it, then mark it Accepted in the exit audit. |

## 4. Authoritative Transaction and Replay Model

### 4.1 Identity and envelopes

Extend the command envelope with `expected_revision`. Keep the existing `command_id`, `transaction_id`, `campaign_id`, `schema_version`, `kind`, and payload. A command ID and transaction ID each identify exactly one canonical command; both are unique within storage. Do not silently replace a caller's transaction ID.

Extend the event envelope with `stream_revision` while preserving `event_id`, `transaction_id`, `campaign_id`, `caused_by_command_id`, and zero-based `transaction_index`. Event IDs are allocated outside the engine from explicit runtime input. Use a deterministic versioned derivation from transaction identity and transaction index, or pass an injected deterministic allocation plan; do not generate IDs inside rule functions.

Add opaque IDs for pending checks, physical submissions/nonces, snapshots, content manifests, challenges, combats, zones, objectives, wounds, rituals, conditions, and any other serialized Phase 1 identity. Keep their lexical representation opaque to domain code.

Every persisted command and event is validated against the one centralized version-1 union before commit and again when read for replay. Unknown variants, unexpected properties, unsupported schema versions, invalid IDs, and invalid domain values fail explicitly.

### 4.2 Command execution sequence

For every submitted command, `@lldm/runtime` performs this order:

1. Parse and validate the raw value through the centralized command union. Return a structured non-canonical validation failure if it is malformed.
2. Canonicalize the validated command and compute its identity hash.
3. Begin a SQLite immediate write transaction and look up `command_id` before reading the stream head or clock.
4. If the command ID exists with the same canonical bytes/hash, return the stored transaction exactly. Do not call the clock, entropy source, content resolver, engine, random oracle, projector, or snapshotter.
5. If the command ID exists with different bytes/hash, roll back and return `command_identity_collision`. Do not append a second rejection under the occupied ID.
6. Validate the storage migration, campaign, pinned content manifest, transaction-ID uniqueness, and `expected_revision`. An occupied transaction ID returns a non-canonical `transaction_identity_collision` and appends nothing; never substitute a runtime-generated transaction ID.
7. Capture one injected-clock value for the transaction. Build the deterministic random oracle only if the command can reach simulated resolution.
8. Ask the pure engine decider for domain event payloads or a typed legality rejection. Supply validated current state, command, pinned catalog, explicit IDs/nonces required by emitted facts, and deterministic random access.
9. Prepend one `command_accepted` event to accepted domain events, or create one `command_rejected` event for a valid rejection. The rejection event records a stable code and bounded safe detail, not raw malformed input or secrets.
10. Allocate contiguous stream revisions and event envelopes, validate every event, and apply them in order with the pure event applier. Assert invariants after each event and after the transaction.
11. Calculate pre/post state hashes, update all affected materialized projections, and create a snapshot when the deterministic trigger policy applies.
12. Insert the command, transaction, events, projections, and optional snapshot atomically, then commit. No narration or generated content is part of this transaction.

A rejected valid command advances the event stream by one event, retains equal pre/post mechanical state hashes, and advances projection revisions even when a view's payload is unchanged. Read-only CLI inspection never creates a command or event.

### 4.3 Randomness algorithm

Define the algorithm as a centralized contract constant such as `hmac_sha256_v1`; do not leave the algorithm or string framing implementation-defined.

The byte input must use fixed UTF-8 domain tags, unambiguous length-prefixing or NUL framing, and fixed-width unsigned integer encoding. At minimum it includes:

```text
LLDM random v1
campaign_id
command_id
purpose
purpose_local_index
block_counter
```

Use the 256-bit campaign seed as the HMAC key. Convert digest words to unsigned integers using one documented byte order. Map to `[minimum, maximum]` with rejection sampling, never modulo bias. Each mechanic owns stable purpose constants, and each repeated purpose uses an explicit zero-based purpose-local index. Adding a draw under another purpose must not shift existing results.

The engine receives a deterministic draw interface whose result is a complete validated `RandomDrawRecord`; it never receives ambient entropy. Tests must include fixed published vectors, range-boundary cases, a forced rejection-sampling case, purpose isolation, and identical command retry. Physical faces never call this source.

Replay applies recorded `check_resolved` and other outcome events and does not recompute HMAC. A separate read-only audit mode may re-decide stored commands against their pinned catalog and seed, compare domain events/draw records, and report divergence without appending history.

### 4.4 State hashing and replay

Create one canonical state serialization function with a named integer version. Prefer a standards-defined JSON canonicalization or a small repository implementation with exhaustive fixtures; ordinary `JSON.stringify` property order is not sufficient as an undocumented contract. Hash the canonical bytes with SHA-256 and render a tagged lowercase digest such as `sha256:<hex>`.

The hash input includes the validated mechanical campaign state, its state-schema version, and pinned content-manifest identity. It excludes storage timestamps, command rows, projections, diagnostics, migration state, and snapshot metadata.

Provide two replay paths:

- **Full replay:** Start from the explicit version-1 empty campaign state and apply every validated event by stream revision.
- **Snapshot replay:** Validate a snapshot at revision `N`, verify its hash and manifest, then apply events `N + 1` through the stream head.

Both paths verify transaction revision ranges, transaction indexes, command causation, pre/post hashes, event IDs, event schema versions, and invariants. On the first mismatch, stop with the exact campaign, transaction, revision, expected value, and actual value. Never skip an invalid event.

Snapshots are written after successful scene-transition transactions, explicit `checkpoint` commands including session-boundary reasons, and whenever 100 events have committed since the latest snapshot. The threshold is an operational accelerator, not a rule input. A corrupt or stale snapshot is quarantined or ignored with an explicit diagnostic, followed by verified full replay.

### 4.5 SQLite ownership and minimum schema

Storage migration 1 must create, at minimum, strictly constrained tables equivalent to:

- `schema_migrations`: ordered version, stable name, checksum, applied storage timestamp, and success metadata.
- `campaigns`: campaign ID, schema/state versions, current stream revision, secret seed bytes, non-secret seed fingerprint, pinned content-manifest hash, and storage creation timestamp.
- `commands`: campaign/command/transaction identity, expected revision, kind, canonical JSON, command hash, outcome classification, and committed transaction link.
- `transactions`: campaign and command identity, contiguous first/last revision, event count, accepted/rejected/undo classification, optional undo target, pre/post state hashes, and one `committed_at` value.
- `events`: campaign plus stream revision primary order, unique event ID, transaction identity/index, event kind, and canonical validated event JSON.
- `snapshots`: snapshot/campaign/revision identity, state-schema version, manifest hash, state hash, trigger, validated state JSON, and storage timestamp.
- `projections`: campaign, audience kind/key, projection kind, projection revision, schema version, validated projection JSON, and storage timestamp.

Use foreign keys, uniqueness checks, non-negative/count checks, and transaction-range constraints where SQLite can enforce them; enforce cross-row/domain invariants in runtime code and tests. Enable foreign keys and WAL mode on every connection. Select and document a durability and busy-timeout configuration appropriate to one local writer. Do not let SQLite defaults silently decide correctness behavior.

Migration files are immutable after release and carry checksums. `db status` distinguishes current, pending, checksum mismatch, failed/incomplete, and database-newer-than-runtime. `db migrate` first creates a verified recoverable backup in a database-specific sibling backup directory, records its path without exposing seed data, applies all pending migrations transactionally where SQLite permits, and leaves the original usable on failure. Normal commands never auto-migrate.

### 4.6 Projections and visibility

Phase 1 defines public-TV, seat-private, and host-control projections even though the CLI is the only consumer. Projection builders are pure functions over authoritative state and audience identity. They may filter and format already-derived mechanical facts but may not recalculate legality differently from the engine. Legal actions and targets come from pure engine enumeration.

Materialize affected projections in the same database transaction as events. Their `revision` equals the post-transaction campaign revision. Provide a rebuild operation that deletes/replaces only derived projection rows after a successful in-memory rebuild and comparison; canonical events remain untouched.

Tests use deliberately planted public, private, and runner/host-only facts. Public projections must contain none of the private values or IDs, including through error details, legal-action labels, or serialized optional fields.

### 4.7 Compensating undo

The runtime locates the latest accepted transaction whose domain events changed mechanical state, ignoring later rejections, projection rebuilds, reads, snapshots, and checkpoints. It rejects an explicit target that is not that transaction.

The engine owns exhaustive compensation planners for undoable event families. The runtime supplies the target transaction's validated events and current state; the engine emits ordinary inverse domain events plus an audit event linking the target and compensation transaction. Never restore a serialized old state wholesale, mutate prior rows, delete events, decrement revisions, or special-case replay.

Reject undo when the target is an undo, has already been compensated, includes a submitted/resolved physical die, includes permanent death, or cannot be inverted without violating current invariants. A pending physical-roll request may be compensated only before a die submission; compensation invalidates its nonce and restores any explicitly spent resource through typed events.

## 5. Mechanical and Content Sub-Boundaries

### 5.1 Character foundation versus playable state

Do not add optional resources or combat fields to `CharacterFoundation`. Introduce a separate versioned `PlayableCharacterState` containing a reference or immutable copy of the validated foundation facts plus resolved content revisions, rank, Guard, Wounds, Exertion, Spark/session recovery state, significant-gear mechanics, scene-use markers, conditions, position/activation state when applicable, and derived legal capabilities.

A materialization command resolves every foundation content reference against the campaign's pinned manifest, verifies that all required options are playable at rank 1, and emits complete creation events. Free-text Drive, Bond, gear notes, and signature concept never grant bonuses. Only validated content definitions grant mechanical effects and narrative permissions.

### 5.2 Rank boundary

The engine and contracts support ranks 1 through 4 and enforce ordered advancement:

- Rank 1 requires a playable archetype core and signature capability.
- Rank 2 requires a compatible path selection.
- Rank 3 requires a compatible cross-pillar talent.
- Rank 4 requires a compatible first-tier capstone.

Phase 1 production content ships only rank-one options. Therefore a normal Phase 1 campaign cannot advance beyond rank 1 and receives a typed `required_content_unavailable` rejection. Engine tests use small validated test-only definitions to prove legal `1 -> 2 -> 3 -> 4` transitions and reject skipping, replacement, duplicate grants, unmet prerequisites, and out-of-range ranks. Test-only definitions never appear in the public playable catalog or generated content reference.

### 5.3 Resource invariants

- Guard is an integer between zero and its validated maximum.
- A hero has exactly three stable named Wound slots. Empty and filled states are explicit; no fourth Wound is representable.
- Exertion is an integer from zero through three. Costs are paid before effects commit and cannot underflow.
- A session starts with at most one available Spark per hero. Spark conversion spends it atomically, grants Edge before cancellation, and creates a physical request. One Drive/Bond complication may restore it per session; repeated recovery is rejected.
- Shared Supply is an integer from zero through `party size + 2`; party-size changes revalidate the cap explicitly rather than silently truncating Supply.
- Signature scene uses and reactions are explicit keyed state, reset only by typed scene/round transitions.
- Recovery occurs through explicit scene transition, validated content effect, or costly-rest events. No command infers a reset from wall time or CLI process restart.

Before resource implementation begins, P1-025 locks every still-unspecified numeric value and recovery effect in executable rule constants with clean-room text and golden examples. No reducer may hide a balance decision as an unexplained literal.

### 5.4 Combat invariants

- A battlefield contains 5–9 uniquely named zones. Connections reference existing zones, are symmetric, contain no self-edge or duplicate, and form a connected graph.
- Capacity, cover, hazards, objectives, elevation, and visibility are typed tags/records. Actor positions always reference a legal zone and respect capacity unless an explicit effect says otherwise.
- Range is derived as self, same zone, adjacent, or distant from actor identity, graph distance, and visibility. Content cannot invent a fifth range category.
- Each activation provides one action and one maneuver. Each actor has at most one reaction per round. Spending, passing, opening, and closing a reaction window are explicit events.
- Hero and enemy sides alternate while each has unspent legal activations. If one side has no remaining legal activation, the other may finish; the round ends only when all eligible actors/squads are spent, then round resources reset through events.
- Players choose an unspent hero. Enemy candidates and targets are exhaustively enumerated by the engine; a stable scoring policy chooses the highest-scored legal option, with deterministic random tie-breaking recorded only when scores remain equal.
- A maneuver moves one adjacent zone, changes a validated stance, or performs a typed environment interaction. An action attacks, uses a power, dashes, or advances an objective.
- Success deals fixed base Impact; Triumph adds two Impact and the content-defined validated rider. Armor reduces Impact only when its definition applies and never below one.
- Impact depletes Guard. Overflow at positive Guard marks exactly one Wound and leaves Guard at zero; harmful hits at zero Guard mark one further Wound.
- Filling the third Wound commits a fully disclosed pending physical death test. One eligible nearby ally may spend Exertion or Supply before submission to grant Edge. Success stabilizes with two Wounds, Triumph returns the hero conscious with a permanent Scar, and Setback/Crisis commits permanent death.
- Boss phase changes use validated overlays/objectives and the named-boss physical trigger. The representative encounter must not model a boss as only a larger Guard total.

### 5.5 Challenges, social state, and rituals

Progress/Danger challenges use bounded integer tracks, explicit thresholds, a state machine, and outcome-to-track effects declared by validated definitions. The engine rejects changes beyond bounds, resolving an already closed challenge, or applying both completion and failure without an explicit tie rule.

NPC social state contains motives, fears, stance, leverage, and hard limits with visibility. Social actions may change stance or create/spend leverage only through typed events and cannot override a hard limit or compel impossible behavior. Free conversation text is not a command and has no mechanical effect in Phase 1.

Ritual definitions declare scope, time, requirements, costs, target mode, success effects, and consequence bands. Starting, contributing to, resolving, interrupting, and completing a ritual are explicit commands/events. Requirements and costs are validated before a roll or resource change; no free-text ritual proposal creates mechanics.

### 5.6 Content boundary

Content definitions are inert, versioned TypeBox data with exhaustive generic effect variants; they do not contain callbacks or import the engine. Each character option has both at least one meaningful tactical effect and a bounded narrative permission. Each enemy action, reaction, boss overlay, challenge, and ritual uses only registered effect variants the engine interprets exhaustively.

The Phase 1 public catalog contains:

- Six playable rank-one archetype cores: Vanguard, Maverick, Wayfinder, Envoy, Weaver, and Beacon, each clean-room original in mechanics and prose.
- The minimum complete Heritage Gift, Upbringing, significant-gear, signature-technique, and power definitions necessary to build at least four legal distinct starter loadouts. Shared options are allowed; broken or narrative-only placeholders are not.
- Enemy squad and boss definitions sufficient for the representative encounter, including legal actions, goals/temperament scoring metadata, one phase overlay, and one objective.
- One Progress/Danger challenge definition, one social profile, and one ritual definition that exercise their generic kernels.

The campaign manifest sorts definitions by stable ID and revision, hashes each canonical definition, and hashes the resulting manifest. A changed mechanic or rule text creates a new definition revision. The installed runtime must retain every manifest used by committed fixtures; deleting an in-use manifest is a test failure.

## 6. Status, Dependency Order, and Evidence

Use the Phase 0 status meanings unchanged: **Complete**, **Ready**, **Pending**, and **Blocked**. Dependency ordering alone is not a blocker. Only mark a task Complete after its validation runs and concise file/command evidence replaces `Not yet implemented`.

| Task | Summary | Depends on | Status | Evidence |
| --- | --- | --- | --- | --- |
| P1-001 | Verify the Phase 1 baseline and planning guardrails | Phase 0 complete | Complete | Node 24.14.0 and pnpm 11.13.0; frozen install and `pnpm verify` pass with 87 tests in 7 files; the four-project graph remains `engine -> contracts <- content`; pre-existing dirty files were `AGENTS.md`, `PRIMARY_PLAN.md`, and untracked `docs/plans/PHASE_1.md`. |
| P1-010 | Establish runtime/CLI package boundaries and proposed ADR | P1-001 | Complete | Buildable private `@lldm/runtime` and `@lldm/cli` units, allowed workspace edges, pinned Kysely 0.29.4/better-sqlite3 13.0.3, root `lldm` forwarding, truthful help/version output, and Proposed ADR-0002; typecheck and both purity audits pass. |
| P1-020 | Extend identity, envelopes, centralized unions, and fixtures | P1-010 | Complete | Central `commands`, `events`, `content-definitions`, `projections`, `proposals`, and `transport` registries; expected/stream revisions, distinct version and hash schemas, Phase 1 opaque IDs, transaction/rejection and random-evidence records, and canonical retry/collision/stale fixtures; 106 contract-focused tests pass and docs are drift-free. |
| P1-021 | Define playable character, rank, and resource contracts | P1-020 | Complete | Separate versioned playable state, resolved option revisions, exact Guard/Wound/Exertion/Spark slots, materialization/resource/recovery/scene/rank variants, and semantic boundary validators; foundation distinction, overflow/underflow, Spark repetition, Wound count, ranks 1–4, and unavailable-feature tests pass. |
| P1-022 | Define combat, zone, physical-roll continuation, and enemy contracts | P1-020 | Complete | Versioned combat/pending-check state, symmetric connected 5–9-zone validation, activation/action/reaction economy, legal enemy candidates, boss/objective/death records, nonce-only die continuation, and centralized command/event variants; zone, capacity, overlay, slot-spend, and submission tests pass. |
| P1-023 | Define challenge, social-state, and ritual contracts | P1-020 | Complete | Versioned Progress/Danger, visibility-tagged social, and typed ritual lifecycle schemas plus centralized commands/events; overflow, tie/lifecycle, leverage, hard-limit preservation, requirement, and cost tests pass. |
| P1-024 | Define generic content effects, definition revisions, and manifests | P1-020 | Complete | Exhaustive inert effect/content unions, tactical-plus-narrative option requirements, definition revisions, catalog reference/rank/cycle/immutability validation, and canonically sorted versioned manifests; order, missing-reference, immutable-revision, and manifest tests pass. |
| P1-025 | Lock Phase 1 executable rule constants and original rules text | P1-021, P1-022, P1-023, P1-024 | Complete | Approved Guard maxima, recovery/rest/session behavior, target-13 Force/Athletics death test, combat/reaction ordering, required challenge thresholds/ties, ritual interruption, and condition expiry are exported from contracts/engine with original rule text and literal golden tests; 135 tests pass and generated references agree. |
| P1-030 | Implement the pure state kernel, event applier, and invariants | P1-025 | Complete | Versioned empty `GameState`, semantic state validator, exhaustive pure `applyGameEvent`, and exhaustive rejecting command shell; audit/no-op, materialization, resource, mutation isolation, and invalid-event tests pass (140 tests total), as does the engine purity audit. |
| P1-031 | Implement deterministic randomness and the two-transaction roll flow | P1-030 | Complete | Fixed length-prefixed HMAC-SHA-256 vectors, seed fingerprints, 256-bit rejection sampling, purpose isolation, explicit engine draw evidence, Spark conversion, immutable pre-roll disclosure, and nonce-bound two-transaction physical resolution pass contracts/engine/runtime typechecks and 150 tests; committed-command retry short-circuiting remains owned and tested by P1-050. |
| P1-032 | Implement playable-character, resource, recovery, and rank decisions | P1-030, P1-031 | Complete | Pinned-catalog materialization resolves complete rank-one state and exact Guard/signature facts; resource spend/recovery, once-per-session Spark recovery, atomic costly rest, scene/session resets, stable legal-action enumeration, and `expected_rank` current-rank guarding are pure and tested through structural ranks 1–4; 159 tests pass and generated rules agree. |
| P1-033 | Implement zones, combat, death, and enemy fallback decisions | P1-022, P1-031, P1-032 | Complete | Pure graph/range helpers, content-matched combat start, stable legal enumeration, hero-first alternating activations, slot/pass/round flow, fixed Impact/armor/Wounds, reactions, objective and boss-overlay facts, replayable enemy tie breaks, physical action continuations, one-point death aid, and all 20 aided/unaided death faces pass 167 tests and the engine purity audit. |
| P1-034 | Implement challenge, social-state, and ritual decisions | P1-023, P1-031, P1-032 | Complete | Pure shared-check decisions, physical continuations, pinned Progress/Danger effects, bounded social shifts and hard-limit enforcement, leverage, ritual preflight/ordered costs/interruption/degree consequences, and strengthened replay invariants pass 174 tests; generated rules agree. |
| P1-040 | Author the pinned rank-one and vertical-slice content catalog | P1-024, P1-032, P1-033, P1-034 | Complete | A canonically hashed 54-definition manifest, six distinct rank-one archetypes/signatures, four materializable starter loadouts with ready/spent gear, two enemies plus objective/overlay, and challenge/social/ritual examples pass 186 tests, clean-room checks, and generated-reference drift checks. |
| P1-041 | Add representative fixtures, invariants, and deterministic scenario | P1-040 | Complete | The runtime-validated Floodgate/Echo Lantern JSON fixture drives four production starters through five zones, squad and boss combat, objective/overlay transitions, a recoverable physical continuation, challenge/social/ritual conclusions, literal draws/event order, and reviewed pending/final state hashes; focused death/reaction/zone branches plus 64 fixed-seed bounded simulations pass 189 tests, with observed check degrees 101 Crisis, 110 Setback, 122 Success, and 179 Triumph and no win-rate gate. |
| P1-050 | Implement runtime ports and transactional command coordination | P1-020, P1-030, P1-031, P1-040 | Complete | Narrow clock/seed/identity/random/content/decider/projector/atomic-store ports and a SQLite-independent coordinator implement centralized validation, canonical identity hashing, retry-before-revision, non-canonical identity collisions, canonical stale/legality rejection, deterministic envelopes/draws, event application, state hashes, projections, and atomic commit; instrumented fake-port and injected-failure tests prove retry makes zero prohibited calls and pass with 194 total tests. |
| P1-051 | Implement SQLite migration 1, store adapter, and backups | P1-050 | Ready | Not yet implemented. |
| P1-052 | Implement canonical hashing, replay, snapshots, and recovery | P1-041, P1-051 | Pending | Not yet implemented. |
| P1-053 | Implement transactional projections and visibility rebuilds | P1-034, P1-051, P1-052 | Pending | Not yet implemented. |
| P1-054 | Implement compensating undo | P1-033, P1-034, P1-051, P1-052 | Pending | Not yet implemented. |
| P1-060 | Implement the scriptable CLI | P1-041, P1-051, P1-052, P1-053, P1-054 | Pending | Not yet implemented. |
| P1-061 | Run failure, restart, retry, and fresh-database integration scenarios | P1-060 | Pending | Not yet implemented. |
| P1-070 | Complete generated references and accept ADR-0002 | P1-041, P1-061 | Pending | Not yet implemented. |
| P1-080 | Run and record the Phase 1 exit audit | P1-061, P1-070 | Pending | Not yet implemented. |

The critical path is:

```text
P1-001 -> P1-010 -> P1-020
                       |-> P1-021 --|
                       |-> P1-022 --|
                       |-> P1-023 --|-> P1-025 -> P1-030 -> P1-031 -> P1-032
                       |-> P1-024 --|                           |         |
                                                               |         |-> P1-033 --|
                                                               |         |-> P1-034 --|-> P1-040 -> P1-041
                                                               |                              |          |
                                                               |-> P1-050 -> P1-051 -> P1-052 ---------|
                                                                                          |-> P1-053 ----|
                                                                                          |-> P1-054 ----|
                                                                                                         v
                                                                                                      P1-060
                                                                                                         |
                                                                                                      P1-061
                                                                                                         |
                                                                                                      P1-070
                                                                                                         |
                                                                                                      P1-080
```

Contract-domain tasks P1-021 through P1-024 may proceed independently after P1-020, but each edits different domain files and registers variants only through the central union modules. Engine domain tasks may proceed independently only after P1-030 establishes the one event-applier pattern. SQLite work must not begin by moving reducer logic into the adapter.

## 7. Intended Deliverable Layout

File names may be split when a module becomes unwieldy, but ownership and public entry-point direction are fixed.

```text
.
├── AGENTS.md
├── PRIMARY_PLAN.md
├── apps
│   └── cli
│       ├── package.json
│       ├── src
│       │   ├── commands
│       │   │   ├── campaign.ts
│       │   │   ├── command.ts
│       │   │   ├── db.ts
│       │   │   ├── projection.ts
│       │   │   ├── replay.ts
│       │   │   └── scenario.ts
│       │   ├── main.ts
│       │   └── output.ts
│       └── tsconfig.json
├── docs
│   ├── architecture
│   │   ├── ADR-0001-executable-rules-foundation.md
│   │   └── ADR-0002-deterministic-runtime-and-event-store.md
│   ├── generated
│   │   ├── mechanical-reference.md
│   │   ├── playable-content-reference.md
│   │   └── probability-report.md
│   └── plans
│       ├── PHASE_0.md
│       └── PHASE_1.md
├── packages
│   ├── content
│   │   └── src
│   │       ├── archetypes.ts
│   │       ├── challenges.ts
│   │       ├── enemies.ts
│   │       ├── manifest.ts
│   │       ├── rituals.ts
│   │       └── starter-options.ts
│   ├── contracts
│   │   └── src
│   │       ├── commands.ts
│   │       ├── content-mechanics.ts
│   │       ├── events.ts
│   │       ├── game-state.ts
│   │       ├── projections.ts
│   │       ├── randomness.ts
│   │       ├── snapshots.ts
│   │       └── domains
│   │           ├── challenges.ts
│   │           ├── combat.ts
│   │           ├── playable-characters.ts
│   │           └── rituals.ts
│   ├── engine
│   │   └── src
│   │       ├── apply-event.ts
│   │       ├── decide-command.ts
│   │       ├── invariants.ts
│   │       ├── legal-actions.ts
│   │       ├── state.ts
│   │       └── domains
│   │           ├── challenges.ts
│   │           ├── combat.ts
│   │           ├── playable-characters.ts
│   │           ├── resources.ts
│   │           └── rituals.ts
│   └── runtime
│       ├── package.json
│       ├── src
│       │   ├── application
│       │   │   ├── execute-command.ts
│       │   │   ├── projections.ts
│       │   │   ├── replay.ts
│       │   │   ├── snapshots.ts
│       │   │   └── undo.ts
│       │   ├── hashing
│       │   │   ├── canonical-json.ts
│       │   │   └── state-hash.ts
│       │   ├── ports
│       │   │   ├── clock.ts
│       │   │   ├── entropy.ts
│       │   │   ├── ids.ts
│       │   │   └── store.ts
│       │   ├── randomness
│       │   │   └── hmac-sha256-v1.ts
│       │   ├── sqlite
│       │   │   ├── backup.ts
│       │   │   ├── database.ts
│       │   │   ├── migrations
│       │   │   │   └── 001_initial.ts
│       │   │   └── store.ts
│       │   └── index.ts
│       └── tsconfig.json
├── scripts
│   └── generate-references.ts
└── test
    └── fixtures
        └── phase-1
```

Tests remain colocated as `*.test.ts` unless a fixture is intentionally shared across packages. Do not commit generated `dist/` or `tsconfig.tsbuildinfo` changes as evidence unless repository policy explicitly tracks them.

## 8. Task Specifications

### P1-001 — Verify the Phase 1 baseline and planning guardrails

**Status:** Complete

**Depends on:** Completed Phase 0

**Owns:** Status/evidence fields in this plan and factual corrections in `PRIMARY_PLAN.md`; no mechanical code.

Confirm that Phase 0 still passes before changing schemas. Read `AGENTS.md`, `PRIMARY_PLAN.md`, ADR-0001, this plan, and the Phase 0 handoff completely. Inspect the worktree and preserve unrelated user changes.

**Acceptance criteria**

- The current package graph is still `engine -> contracts <- content` with no application/runtime package yet.
- Node, pnpm, frozen install, and `pnpm verify` match the completed baseline or any discrepancy is documented before implementation.
- The first implementation commit/task does not silently absorb unrelated changes.
- This task's evidence records the exact baseline test count and any pre-existing dirty files.

**Validation**

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm verify
pnpm list --recursive --depth 0
git status --short
```

### P1-010 — Establish runtime/CLI package boundaries and proposed ADR

**Status:** Complete

**Depends on:** P1-001

**Owns:** `packages/runtime`, `apps/cli`, root/package manifests, TypeScript references, and proposed ADR-0002.

Create buildable private ESM packages named `@lldm/runtime` and `@lldm/cli`. Expose the CLI binary as `lldm` and a root forwarding script that supports `pnpm lldm -- <args>`. Initially implement only a typed help/version or explicit not-yet-implemented command; do not fake persistence success.

Establish the dependency direction in Section 3 and package-internal `ports`, `application`, and `sqlite` boundaries. Add Kysely and `better-sqlite3` only to `@lldm/runtime`, with required type packages and native-build policy pinned in the lockfile. `@lldm/cli` must not import Kysely, `better-sqlite3`, or engine internals.

Create ADR-0002 with status Proposed and the standard ADR sections. Record all fixed architecture choices without claiming they are implemented.

**Strict boundary**

- Do not add a database file, migration, command variant, reducer, content definition, host server, web route, or provider.
- Do not broaden engine dependencies.

**Acceptance criteria**

- The project-reference build detects cycles and builds both new units.
- Recursive dependency output exactly matches the allowed workspace edges.
- A purity audit still finds no prohibited engine import or call.
- ADR-0002 accurately distinguishes proposed work from completed Phase 0 facts.

**Validation**

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm --filter @lldm/runtime list --depth 0
pnpm --filter @lldm/cli list --depth 0
pnpm lldm -- --help
if rg -n "@lldm/(content|engine|runtime)|better-sqlite3|kysely" packages/contracts/src; then exit 1; fi
if rg -n "@lldm/(content|runtime)|better-sqlite3|kysely|node:fs|node:crypto" packages/engine/src; then exit 1; fi
```

### P1-020 — Extend identity, envelopes, centralized unions, and fixtures

**Status:** Complete

**Depends on:** P1-010

**Owns:** Cross-domain Phase 1 contract kernel, centralized union modules, envelope/ID changes, and canonical fixtures in `@lldm/contracts`.

Refactor the current union declarations out of domain-local ownership. Preserve existing public imports where practical, but make one module each authoritative for `GameCommand`, `GameEvent`, `ContentDefinition`, `Projection`, and any retained `ClientCommand`/proposal/transport unions. Domain modules export concrete schemas; central modules assemble exhaustive discriminated unions.

Add expected revision, stream revision, new opaque IDs, transaction outcome/rejection codes, canonical state/hash identifiers, pending physical identities, and random-draw evidence schemas. Decide explicitly which values are independently serialized and require `schema_version: 1` on each. Keep storage migration version, state canonicalization version, randomness algorithm version, content definition revision, schema version, and protocol version as different named integer concepts.

Update every Phase 0 fixture affected by envelope changes. Add fixtures for accepted/rejected transaction identity, contiguous revisions, same-command causation, stale expected revision, unknown variants, extra properties, future versions, and identity collision input pairs.

**Strict boundary**

- Define shapes only. Do not implement state transitions, SQL tables, random hashing, or CLI parsing.
- Do not create a local test-only union that omits production variants.

**Acceptance criteria**

- A repository search finds exactly one exported authoritative schema/type for each canonical union.
- All envelope identity/revision relationships can be expressed without optional placeholder fields.
- Contract validation rejects malformed/future/unknown records with path-specific issues.
- Existing Phase 0 semantics remain covered after fixture migration.

**Validation**

```sh
pnpm --filter @lldm/contracts typecheck
pnpm --filter @lldm/contracts test
rg -n "export const (GameCommand|GameEvent|ContentDefinition|Projection)Schema" packages/contracts/src
pnpm docs:generate
pnpm docs:check
```

After completion, update the current-state facts in `PRIMARY_PLAN.md` and this task's status/evidence before starting domain schemas.

### P1-021 — Define playable character, rank, and resource contracts

**Status:** Complete

**Depends on:** P1-020

**Owns:** Playable-character, rank, resource, recovery, rest, materialization, and advancement variants in `@lldm/contracts`.

Define `PlayableCharacterState` separately from `CharacterFoundation`, including exact stable resource slots and resolved content references/revisions. Add commands/events for materialization, resource spend/recovery, Spark complication recovery, costly rest, scene reset, and structural rank advancement. Register every variant centrally.

Use schemas to make impossible states unrepresentable where practical and semantic validators for cross-field invariants. Preserve bounded free-text limits and ensure narrative fields cannot contain mechanical payloads.

**Strict boundary**

- Do not add combat positioning/activation state; P1-022 owns it.
- Do not author actual archetypes or supporting content; P1-040 owns catalog entries.
- Do not reinterpret the foundation as a playable record.

**Acceptance criteria**

- A foundation fixture does not validate as playable state.
- Resource underflow/overflow, fourth Wound, repeated Spark recovery, illegal rank, skipped rank, missing rank feature, and unavailable-content states have precise failures.
- Phase 1 production availability can remain rank 1 while validated test definitions express ranks 2–4.

**Validation**

```sh
pnpm --filter @lldm/contracts test -- playable-character resource rank
pnpm --filter @lldm/contracts typecheck
pnpm docs:generate
pnpm docs:check
```

### P1-022 — Define combat, zone, physical-roll continuation, and enemy contracts

**Status:** Complete

**Depends on:** P1-020

**Owns:** Combat, zone graph, activation, action economy, Impact, death, boss, objective, legal-action, pending check, die submission, and enemy decision variants in `@lldm/contracts`.

Define the complete combat state machine and centralized command/event variants. Extend physical disclosure with pending-check identity and nonce as needed without weakening Phase 0 disclosure requirements. A die submission references the pending request; it does not carry a caller-selected target, modifier, reason, or stakes that could replace committed disclosure.

Define typed candidate actions and targets so the engine can enumerate every legal enemy option. Scoring metadata belongs to validated content/state, while chosen results belong to events.

**Strict boundary**

- Do not implement reducers or select numeric content stats.
- Do not add LLM-choice/proposal schemas for enemy tactics in Phase 1.
- Do not model a zone graph as arbitrary presentation SVG data.

**Acceptance criteria**

- Invalid/disconnected/asymmetric zone graphs, illegal ranges, over-capacity positions, duplicate activation spends, malformed boss overlays, and incomplete death disclosures fail validation.
- The only die-submission degrees of freedom are pending identity, nonce, and physical face.
- Commands/events are present in the central unions and unknown combat variants fail closed.

**Validation**

```sh
pnpm --filter @lldm/contracts test -- combat zone physical enemy
pnpm --filter @lldm/contracts typecheck
pnpm docs:generate
pnpm docs:check
```

### P1-023 — Define challenge, social-state, and ritual contracts

**Status:** Complete

**Depends on:** P1-020

**Owns:** Progress/Danger, social-state, and ritual state/command/event variants in `@lldm/contracts`.

Define reusable bounded track records and lifecycle states. Define NPC motives, fears, stance, leverage, and hard limits with explicit visibility. Define ritual scope/time/requirements/cost/target/consequence records and lifecycle commands/events. Register variants centrally and keep narration/free conversation outside mechanical payloads.

**Strict boundary**

- Do not add campaign generation, NPC dialogue, transcript, or LLM proposal orchestration.
- Do not author the public example definitions; P1-040 owns them.

**Acceptance criteria**

- Track overflow, impossible lifecycle transitions, leverage beyond bounds, hard-limit override, unmet ritual requirements, and unpayable ritual costs fail with typed issues.
- Public and private social fields are distinguishable before projection implementation.
- No schema accepts free text as an unbounded effect or rule expression.

**Validation**

```sh
pnpm --filter @lldm/contracts test -- challenge social ritual
pnpm --filter @lldm/contracts typecheck
pnpm docs:generate
pnpm docs:check
```

### P1-024 — Define generic content effects, definition revisions, and manifests

**Status:** Complete

**Depends on:** P1-020

**Owns:** Phase 1 content-definition schemas, effect unions, revisions, availability, manifest schemas, and content validation helpers in `@lldm/contracts`.

Extend the centralized content union with generic, exhaustively discriminated effect records sufficient for Phase 1. Each playable option schema requires tactical effects and at least one bounded narrative permission. Add integer definition revisions and deterministic manifest entries containing ID, revision, kind, and definition hash.

Define referential and prerequisite validation APIs that operate over a whole proposed catalog: unique ID/revision pairs, no missing references, rank availability, valid effect target/range/action slots, and no cycles where forbidden.

**Strict boundary**

- Content remains data; schemas cannot carry source text, function names, JavaScript expressions, callbacks, or engine imports.
- Do not populate production definitions in contracts.

**Acceptance criteria**

- Every effect variant has a central discriminator and bounded fields.
- A playable option without both tactical meaning and narrative permission is rejected.
- Catalog order does not affect manifest bytes/hash.
- Changed definition bytes under the same ID/revision are detected as an immutable-content violation.

**Validation**

```sh
pnpm --filter @lldm/contracts test -- content manifest effect
pnpm --filter @lldm/contracts typecheck
pnpm docs:generate
pnpm docs:check
```

### P1-025 — Lock Phase 1 executable rule constants and original rules text

**Status:** Complete

**Depends on:** P1-021, P1-022, P1-023, P1-024

**Owns:** Phase 1 additions to the engine's executable rules catalog, matching contract constants, golden expected values, generated reference sections, and factual mechanical clarifications in `PRIMARY_PLAN.md`.

Before reducer work, resolve every mechanical value not fixed by the parent plan: playable resource maxima derived by content, costly-rest costs/effects, scene/session reset behavior, death-test target and modifier source, round/side transition edge cases, reaction-window priority, default Progress/Danger thresholds or definition requirements, challenge tie handling, ritual interruption behavior, and any condition duration needed by the vertical slice.

Choose the smallest clean-room rule set that supports the required scenario. Put constants and concise normative text beside executable definitions; do not hide choices in fixtures or reducers. Update generated references in the same task. Record balance-sensitive choices as provisional Phase 1 values without creating win-rate gates.

**Strict boundary**

- Do not implement command/event reducers.
- Do not copy terminology, prose, examples, action suites, or stat blocks from an existing tabletop ruleset.
- Do not add mechanics unused by a required invariant, content option, or scenario path.

**Acceptance criteria**

- No Phase 1 reducer task depends on an unresolved numeric/mechanical TODO.
- Each constant has original concise rules text and at least one literal golden case.
- `PRIMARY_PLAN.md`, executable constants, and generated mechanics agree.

**Validation**

```sh
pnpm --filter @lldm/engine test -- core-rules golden
pnpm --filter @lldm/engine typecheck
pnpm docs:generate
pnpm docs:check
pnpm format:check
```

### P1-030 — Implement the pure state kernel, event applier, and invariants

**Status:** Complete

**Depends on:** P1-025

**Owns:** Pure initial state, event applier, command-dispatch shell, invariant validator, and exhaustive discriminant checks in `@lldm/engine`.

Create the explicit version-1 empty campaign state and a total `applyGameEvent` function. Apply every central event variant or fail compilation/exhaustiveness. Command acceptance/rejection audit events do not alter mechanical fields. Domain events must carry enough resolved facts that application never queries content or randomness.

Implement an invariant validator run after each applied event in tests and by the runtime. It covers identity uniqueness, campaign consistency, pending operations, characters/resources, scenes, challenges, combat, and visibility-bearing facts. Provide a command-decider dispatcher whose unimplemented domains reject explicitly until their owning tasks complete.

**Strict boundary**

- No state mutation outside `applyGameEvent`.
- No clock, random source, ID creation, database, filesystem, content import, projection persistence, or narration.
- Do not calculate state hashes here if doing so requires a Node/runtime adapter; expose canonical state values instead.

**Acceptance criteria**

- Applying the same validated event sequence to equal initial state returns deeply equal state.
- Every central event variant is handled exactly once and unknown variants cannot compile or validate.
- An event failing invariant validation cannot yield a usable next state.
- A static purity audit passes.

**Validation**

```sh
pnpm --filter @lldm/engine test -- state apply-event invariant exhaustive
pnpm --filter @lldm/engine typecheck
if rg -n "Math\.random|Date\.now|new Date|process\.env|node:fs|node:path|node:crypto|better-sqlite3|kysely|@lldm/(content|runtime)" packages/engine/src; then exit 1; fi
```

### P1-031 — Implement deterministic randomness and the two-transaction roll flow

**Status:** Complete

**Depends on:** P1-030

**Owns:** Randomness port/implementation/tests in `@lldm/runtime`, pure random-consumer and check decisions in `@lldm/engine`, and matching contract fixtures.

Implement the exact HMAC/framing/rejection algorithm from Section 4.3 outside the engine, with injected seed access. Give the engine only explicit deterministic draw results through the selected port boundary. Preserve draw records in emitted event payloads.

Implement simulated resolution in the initiating command and physical resolution as the two transactions specified in Section 4.2. Pending state contains the immutable disclosure, check ID, nonce fingerprint/validation data, eligible roller, and unresolved consequences. Submission validates the face and nonce once, then emits result/consequence events. Spark spend and Edge are part of the initiating event set.

**Strict boundary**

- Retrying a committed command never calls the random implementation.
- Replay never calls HMAC or accepts a newly supplied random value.
- Physical face input never passes through simulated randomness.

**Acceptance criteria**

- Fixed vectors and unbiased range tests pass.
- Equal seed/campaign/command/purpose/index gives equal output; changing any component changes the vector fixture.
- Adding another purpose does not shift an existing draw.
- A duplicate simulated command returns identical stored random evidence with a verified zero additional draw-call count.
- A nonce cannot resolve twice or resolve a different pending check.

**Validation**

```sh
pnpm --filter @lldm/runtime test -- randomness
pnpm --filter @lldm/engine test -- check physical spark
pnpm --filter @lldm/contracts test -- randomness physical
pnpm typecheck
pnpm docs:generate
pnpm docs:check
```

### P1-032 — Implement playable-character, resource, recovery, and rank decisions

**Status:** Complete

**Depends on:** P1-030, P1-031

**Owns:** Pure character materialization, resource, rest/recovery, scene reset, Spark, and rank command decisions/event application in `@lldm/engine`.

Implement materialization against an injected validated catalog. Emit resolved facts and definition revisions so replay requires no catalog lookup. Implement resource costs atomically: if any precondition fails, emit no domain effects and let runtime commit only the typed rejection.

Implement rank advancement generically through rank 4 and test it with test-only catalogs. Ensure production-manifest unavailability rejects before any rank or resource event. Expose legal character actions for projection/combat consumers rather than duplicating rules later.

**Acceptance criteria**

- Four starter foundations can become complete playable state only with an available pinned manifest.
- All Section 5.3 invariants have boundary tests.
- Multi-resource costs are all-or-nothing.
- Engine tests prove ranks 1–4 structurally, while the production catalog exports no playable rank-2/3/4 definition.

**Validation**

```sh
pnpm --filter @lldm/engine test -- playable-character resource recovery rank
pnpm --filter @lldm/contracts test -- playable-character resource rank
pnpm docs:generate
pnpm docs:check
```

### P1-033 — Implement zones, combat, death, and enemy fallback decisions

**Status:** Complete

**Depends on:** P1-022, P1-031, P1-032

**Owns:** Pure combat decisions, event application, graph/range helpers, legal-action enumeration, enemy scoring, and focused combat tests in `@lldm/engine`.

Implement Section 5.4 as pure decisions and events. Separate legal candidate enumeration from selection. Selection accepts enemy scoring metadata and uses stable comparison; only exact-score ties may request the recorded deterministic draw purpose.

Implement pending reaction and physical-death states explicitly so the command loop can pause and resume across processes. Consequences follow the already committed disclosure. Boss transitions and objectives must change available actions/state, not only labels.

**Acceptance criteria**

- Focused invariants reject every invalid resource, activation, zone relationship, target/range, Impact, Wound, reaction, and death state named in the Phase 1 exit criterion.
- Every legal enemy action/target pair is enumerable; an illegal pair cannot be selected.
- Enemy fallback is deterministic and tie-break random evidence is replayable.
- The death-test disclosure matches the eventual result for all twenty faces and all allowed aid states.

**Validation**

```sh
pnpm --filter @lldm/engine test -- zone combat activation impact wound death enemy
pnpm --filter @lldm/engine typecheck
pnpm docs:generate
pnpm docs:check
```

### P1-034 — Implement challenge, social-state, and ritual decisions

**Status:** Complete

**Depends on:** P1-023, P1-031, P1-032

**Owns:** Pure decisions/event application, legal actions, and tests for Progress/Danger, social state, and rituals in `@lldm/engine`.

Implement the executable generic kernels from Section 5.5. Reuse core check and random/physical flow rather than creating subsystem-specific roll algorithms. Carry resolved definition facts in events. Social transitions must enforce hard limits mechanically, not rely on rule text.

**Acceptance criteria**

- Each subsystem can start, advance, reject an illegal transition, resolve, replay, and project one example.
- A hard social limit cannot be bypassed by a high roll.
- Ritual requirements/costs are checked before randomness, and failed preconditions consume neither resources nor draws.
- Every subsystem uses centralized commands/events and the shared check result.

**Validation**

```sh
pnpm --filter @lldm/engine test -- challenge social ritual
pnpm --filter @lldm/engine typecheck
pnpm docs:generate
pnpm docs:check
```

### P1-040 — Author the pinned rank-one and vertical-slice content catalog

**Status:** Complete

**Depends on:** P1-024, P1-032, P1-033, P1-034

**Owns:** Production Phase 1 definitions, manifest creation, content tests, and generated playable content sections in `@lldm/content`.

Author the Section 5.6 catalog with concise clean-room names, prose, mechanical effects, and narrative permissions. Use only validated generic effects. Make the six archetypes mechanically distinct at rank 1 without minor numerical-only option choices. Build four committed starter loadouts and all enemy/challenge/social/ritual definitions needed by P1-041.

Compute definition and manifest hashes deterministically from canonical definitions. Export manifest lookup by hash while keeping old committed fixture manifests available. Mark future registries unavailable rather than populating placeholders.

Implementation note: with user approval, P1-040 pulled the dependency-free version-one canonical JSON and SHA-256 primitives forward from P1-052 so content and later state hashing share one implementation. P1-052 still owns state/command hashing, replay verification, snapshots, and recovery.

**Acceptance criteria**

- All six archetypes materialize as legal rank-one characters and each has meaningful tactical and narrative permission evidence.
- Four distinct starter loadouts are complete with no dangling reference.
- The catalog contains no playable rank-2 path, rank-3 talent, or rank-4 capstone.
- Catalog validation and clean-room review pass.
- Reordering source arrays changes neither manifest bytes nor generated output.

**Validation**

```sh
pnpm --filter @lldm/content test
pnpm --filter @lldm/content typecheck
pnpm docs:generate
pnpm docs:check
git diff --check
```

### P1-041 — Add representative fixtures, invariants, and deterministic scenario

**Status:** Complete

**Depends on:** P1-040

**Owns:** Shared Phase 1 JSON fixtures, pure scenario commands/expected events, engine/content golden tests, and bounded seeded-simulation tests.

Create one original encounter fixture with 5–9 zones, four of the committed starter heroes, an enemy squad, a boss overlay/objective, and command branches that collectively exercise every required combat feature. Keep one readable main path; put death outcomes, reaction alternatives, invalid zones, and other combinatorial branches in focused fixtures.

Add a challenge, social, and ritual vertical-slice sequence. Store literal expected event kinds, revision-independent domain payloads, draw references/results, and state hashes only after the canonical hashing task can calculate them; do not generate expected values by calling the unit under test in the assertion.

Add small exhaustive state-space tests where practical and a few fixed-seed sanity simulations. Report balance observations without a pass/fail win-rate threshold.

**Acceptance criteria**

- The scenario reaches a valid conclusion with no illegal state and includes a recoverable pending physical roll.
- Each required mechanic appears in the main path or a named focused branch.
- Fixtures are deterministic, original, bounded, and runtime validated.
- No fixture imports a private package module or current wall time.

**Validation**

```sh
pnpm --filter @lldm/contracts test -- fixtures
pnpm --filter @lldm/engine test -- scenario invariant simulation
pnpm --filter @lldm/content test -- scenario manifest
pnpm docs:generate
pnpm docs:check
```

### P1-050 — Implement runtime ports and transactional command coordination

**Status:** Complete

**Depends on:** P1-020, P1-030, P1-031, P1-040

**Owns:** Runtime system ports, command coordinator, ID/clock/entropy adapters, transaction result API, and in-memory/fake port tests in `@lldm/runtime`.

Define narrow ports for clock, entropy/seed access, ID allocation, content-manifest lookup, and atomic store operations. Implement the exact execution sequence in Section 4.2 against those ports before coupling it to SQLite. Return typed results for committed acceptance, committed rejection, idempotent replay, malformed input, identity collision, storage mismatch, and recovery-required states.

Count/instrument fake clock, entropy, ID, random, decider, projector, and store calls in tests so duplicate behavior is proven by absence of invocation, not only equal output. Ensure event envelope allocation remains outside engine logic.

**Acceptance criteria**

- Accepted and legal-rejection paths are atomic under injected failure at every boundary.
- Duplicate identical command returns stored bytes/result with zero prohibited calls.
- Identity collision and malformed input append nothing.
- Stale expected revision commits one rejection transaction after idempotency lookup.
- Transaction timestamps are captured once and excluded from state hashes/events.

**Validation**

```sh
pnpm --filter @lldm/runtime test -- coordinator idempotency transaction ports
pnpm --filter @lldm/runtime typecheck
pnpm typecheck
```

### P1-051 — Implement SQLite migration 1, store adapter, and backups

**Status:** Ready

**Depends on:** P1-050

**Owns:** Runtime SQLite adapter, migration registry/files, connection policy, backup/restore verification helpers, and database integration tests.

Implement the schema in Section 4.5 with Kysely and `better-sqlite3`. Keep driver/query types within `src/sqlite`. Serialize canonical JSON through the one canonicalizer; validate on write and read. Use real SQLite transactions for command/event/projection/snapshot atomicity.

Implement immutable migration discovery/checksums and explicit status/migrate operations. Back up before any pending migration and verify that the backup opens, reports the prior schema, and retains its integrity check. Tests use unique temporary directories and close handles deterministically.

Test supported SQLite capabilities at startup, including foreign keys and WAL. Treat missing required behavior as a typed startup error; do not silently fall back to a weaker mode.

**Acceptance criteria**

- Fresh migration, reopen, pending migration, checksum mismatch, future schema, injected migration failure, backup verification, and rollback-to-original cases pass.
- Constraints reject duplicate IDs, revision gaps/races, transaction-index duplicates, broken causation, and dangling rows.
- The adapter satisfies runtime ports without leaking database types through public coordination APIs.
- Normal command execution never auto-migrates.

**Validation**

```sh
pnpm --filter @lldm/runtime test -- sqlite migration backup
pnpm --filter @lldm/runtime typecheck
pnpm lldm -- db status --database <temporary-test-database>
pnpm typecheck
```

The automated test owns creation/removal of its temporary path. Do not point validation at a user campaign database.

### P1-052 — Implement canonical hashing, replay, snapshots, and recovery

**Status:** Pending

**Depends on:** P1-041, P1-051

**Owns:** Canonical JSON/state hashing, full and snapshot replay, snapshot policy, verification/audit APIs, and corruption/failure tests in `@lldm/runtime`.

Implement Section 4.4 by reusing the fixed canonicalization/SHA-256 vectors introduced in P1-040. Persist pre/post hashes for every transaction, including equal hashes for rejections. Verify state at each transaction boundary and identify the first divergence.

Implement snapshot triggers and validation. Snapshot creation belongs inside the event transaction but snapshot failure may abort the transaction rather than leave ambiguous state. On load, report an invalid snapshot and fall back to full replay; optionally quarantine the derived row only after a successful full replay. Never modify canonical events during recovery.

Add read-only command re-execution audit when the pinned manifest and algorithm version exist. Distinguish event replay success from command re-execution compatibility.

**Acceptance criteria**

- Full and snapshot-plus-tail replay produce identical canonical bytes and hashes.
- Corrupt state JSON, incorrect snapshot hash, wrong manifest, revision gap, changed event, and incorrect transaction hash each fail at the expected boundary.
- Explicit fallback from bad snapshot reaches the correct state and is visible in structured output.
- Replay makes zero clock, entropy, random, or ID calls.

**Validation**

```sh
pnpm --filter @lldm/runtime test -- canonical hash replay snapshot recovery
pnpm --filter @lldm/engine test -- replay-fixtures
pnpm typecheck
```

### P1-053 — Implement transactional projections and visibility rebuilds

**Status:** Pending

**Depends on:** P1-034, P1-051, P1-052

**Owns:** Pure Phase 1 projectors, projection storage/update/rebuild orchestration, visibility fixtures, and projection commands in `@lldm/runtime` plus schemas in contracts.

Implement public-TV, seat-private, and host-control projectors. Use engine legal-action enumeration for actions/targets. Update affected rows at every committed revision in the same transaction as the events, including rejected command revisions.

Implement read-only comparison and explicit rebuild. Build all replacement rows in memory, validate and hash/compare them, then replace derived rows transactionally. Never treat stored projection data as an engine input.

**Acceptance criteria**

- Projection revision always equals stream head after commit.
- Rebuilds are byte-identical and do not alter command, transaction, event, snapshot, or state hashes.
- Public projection leakage fixtures pass for secret motives, private leverage, eligible-player details, and host diagnostics.
- A failed projector aborts the canonical transaction before commit.

**Validation**

```sh
pnpm --filter @lldm/runtime test -- projection visibility rebuild
pnpm --filter @lldm/contracts test -- projection
pnpm typecheck
```

### P1-054 — Implement compensating undo

**Status:** Pending

**Depends on:** P1-033, P1-034, P1-051, P1-052

**Owns:** Undo eligibility lookup/orchestration in runtime, exhaustive compensation decisions/events in engine, and undo fixtures.

Implement Section 4.7 for every event family used by the representative scenario. A compensation transaction uses new command, transaction, and event identities; links the target; preserves revisions; and passes ordinary event application/invariants. No generic old-state replacement is allowed.

Classify all event variants as non-state-changing, undoable with a named inverse, or non-undoable with a stable reason. Compile/test exhaustiveness so adding an event requires an explicit classification.

**Acceptance criteria**

- The latest eligible state-changing transaction can be compensated and replayed.
- Later rejection/checkpoint transactions do not block eligibility.
- A later accepted state-changing transaction, submitted physical result, permanent death, prior undo, or non-invertible dependency blocks it with the intended code.
- Original rows and hashes remain unchanged; the new post-state hash reflects compensation.

**Validation**

```sh
pnpm --filter @lldm/engine test -- compensation undo
pnpm --filter @lldm/runtime test -- undo eligibility replay
pnpm typecheck
```

### P1-060 — Implement the scriptable CLI

**Status:** Pending

**Depends on:** P1-041, P1-051, P1-052, P1-053, P1-054

**Owns:** `apps/cli` command implementations, stable output contracts, root forwarding script, and CLI process tests.

Implement at least:

```text
lldm db status|migrate
lldm campaign create|show
lldm command submit
lldm scenario run
lldm replay verify|audit
lldm snapshot list|verify
lldm projection show|rebuild
lldm undo
```

Use explicit `--database` or a documented local default that never points at the repository root. Accept command/scenario JSON through `--file` or stdin. `--json` emits stable machine-readable results with schema version and no ANSI; default output is concise and human-readable. Test/fixture-only explicit campaign seeds require an unmistakable flag and warning and are rejected in ordinary campaign creation.

Map typed errors to documented nonzero exit codes. Redact seed bytes, nonces not intended for the caller, private projection data, and raw database exceptions. The CLI parses/presents; it does not reproduce transaction, validation, replay, or projection rules.

**Acceptance criteria**

- Separate process invocations can migrate, create, submit, reopen, inspect, replay, rebuild, and undo.
- stdin/file inputs behave identically and malformed JSON never reaches runtime coordination.
- JSON output is byte-stable under an injected fixture clock/IDs and suitable for golden tests.
- Help names every command and safety boundary without claiming Phase 2 features.

**Validation**

```sh
pnpm --filter @lldm/cli test
pnpm --filter @lldm/cli typecheck
pnpm lldm -- --help
pnpm lldm -- db status --help
pnpm lldm -- scenario run --help
```

### P1-061 — Run failure, restart, retry, and fresh-database integration scenarios

**Status:** Pending

**Depends on:** P1-060

**Owns:** Cross-package temporary-database integration tests, CLI fixtures/golden output, failure injection, and test harness scripts.

Automate the selected exit scenario from an empty temporary directory:

1. Show an unmigrated status, migrate explicitly, and verify migration/backup behavior appropriate to a fresh database.
2. Create a fixture-seeded campaign pinned to the production Phase 1 manifest.
3. Submit four foundation-materialization commands and verify playable projections.
4. Run the representative scenario through separate CLI processes, reopening SQLite between meaningful steps.
5. Retry one simulated command byte-for-byte and prove no new transaction, event, revision, timestamp, ID, or random call.
6. Attempt the same command ID with changed payload and prove identity collision without append.
7. Submit one stale new command and prove a canonical rejection with equal pre/post state hash.
8. Reach a physical request, inspect complete disclosure, close the process, submit the face with nonce in a new process, and prove one-use behavior.
9. Execute one eligible undo and prove compensation; prove one prohibited undo reason.
10. Reopen from a valid snapshot plus tail and compare full replay.
11. Corrupt a copied snapshot row, observe explicit fallback to full replay, and leave canonical history unchanged.
12. Rebuild all projections and compare bytes/revisions.
13. Verify every transaction boundary and final hash.

Use temporary copies for corruption tests. Never edit a developer's real database or delete a broad directory.

**Acceptance criteria**

- The entire sequence passes locally and in CI without live network, Docker, browser, or provider access.
- Process restarts do not change output or mechanical state.
- Failure injection at every pre-commit stage leaves no partial transaction.
- Final event count, revision, transaction hashes, snapshot hash, and projection revisions match literal reviewed fixtures.

**Validation**

```sh
pnpm test -- phase-1-e2e
pnpm verify
```

### P1-070 — Complete generated references and accept ADR-0002

**Status:** Pending

**Depends on:** P1-041, P1-061

**Owns:** Root generator, three generated documents, ADR-0002, glossary/clean-room links, and current-state sections of `PRIMARY_PLAN.md`.

Generated documentation must have been updated with each authoritative task. This task performs the completeness audit, adds any missing cross-links, and proves there was no late hand-authored rules fork.

Extend `mechanical-reference.md` with transaction/retry/randomness disclosures, playable state/resource/rank rules, combat, death, Progress/Danger, social limits, rituals, and explicit Phase 1 deferrals. Keep probability output derived from the same d20 engine. Add `playable-content-reference.md` for available definitions, definition revisions, manifest hash, starter loadouts, enemies, boss overlay/objective, challenge/social/ritual examples, and unavailable future ranks.

Mark ADR-0002 Accepted only after every claim matches code and tests. Update glossary definitions without duplicating generated mechanics. Recheck every new piece of prose/content under the clean-room policy.

**Acceptance criteria**

- Repeated generation is byte-identical and `docs:check` reports useful diffs.
- Generated files include warnings and exact regeneration commands and contain no timestamps/absolute paths.
- No production content or rule constant is missing from the appropriate generated view.
- ADR-0002 and `PRIMARY_PLAN.md` describe `@lldm/runtime`, `apps/cli`, and the Phase 2 host boundary accurately.

**Validation**

```sh
pnpm docs:generate
git diff --exit-code -- docs/generated
pnpm docs:check
pnpm docs:generate
git diff --exit-code -- docs/generated
pnpm format:check
```

### P1-080 — Run and record the Phase 1 exit audit

**Status:** Pending

**Depends on:** P1-061, P1-070

**Owns:** Status/evidence updates in this plan, factual status in `PRIMARY_PLAN.md`, and final audit notes only.

Run the complete phase from a clean-checkout-equivalent state. Do not fix failures by weakening validators, deleting failing fixtures, auto-migrating, bypassing snapshot checks, or broadening scope.

**Execution sequence**

1. Confirm Node 24 and pinned pnpm, then frozen-install.
2. Run root verification and package dependency/purity audits.
3. Run migration, SQLite integrity, backup, and future/checksum failure tests.
4. Run fixed random vectors, duplicate no-reroll, identity-collision, revision, transaction, and physical continuation tests.
5. Run full/snapshot replay, corruption fallback, projection rebuild/leakage, and undo tests.
6. Run the fresh-database CLI recovery scenario across processes.
7. Regenerate all references twice and prove zero drift.
8. Confirm ADR-0002 is accepted and accurate.
9. Confirm `apps/host`, `apps/web`, `apps/relay`, `packages/providers`, network/provider/media code, and rank-2-to-4 production content remain absent.
10. Update all task statuses/evidence and align the primary plan's current state, Phase 1 status, test evidence, and next ready Phase 2 task.

**Acceptance criteria**

- Every Phase 1 task is Complete with evidence and no unresolved blocker/TODO remains in executable scope.
- All completion-standard bullets and the full fresh-database scenario pass.
- The SQLite event stream remains canonical; projections and snapshots rebuild from it.
- `@lldm/engine` has only `@lldm/contracts` as a workspace dependency and passes the purity audit.
- Primary and detailed plans match actual packages, mechanics, generated files, and phase boundaries.

**Validation**

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm verify
pnpm list --recursive --depth 0
pnpm test -- phase-1-e2e
pnpm docs:generate
git diff --exit-code -- docs/generated
if rg -n "Math\.random|Date\.now|new Date|process\.env|node:fs|node:path|node:crypto|better-sqlite3|kysely|@lldm/(content|runtime)" packages/engine/src; then exit 1; fi
test ! -d apps/host
test ! -d apps/web
test ! -d apps/relay
test ! -d packages/providers
git status --short
```

## 9. Continuous Documentation and Change Protocol

Every implementation task follows this protocol:

1. Read its dependencies' evidence and inspect current public exports before editing.
2. Touch only its owned paths plus central registries/generator/plan lines explicitly named by the task.
3. Add or update TypeBox schema, inferred type, validator, fixture, and exhaustive union handling together.
4. Add literal golden examples and failure cases before marking the task complete.
5. If authoritative mechanics or content changed, update the generator and regenerate references in the same task; never leave this to the exit audit.
6. If package shape, delivered capability, test evidence, or phase boundary changed, update `PRIMARY_PLAN.md` immediately.
7. Run the task validation and relevant upstream regression tests.
8. Update status and concise evidence in this plan. Record a deliberate deviation and its rationale rather than silently following stale text.

`PRIMARY_PLAN.md` remains the high-level product/architecture truth, while this file owns Phase 1 execution detail. Generated files remain derived views. ADRs explain durable architectural rationale. None may become a competing executable rules authority.

## 10. Final Handoff

The Phase 1 handoff must state:

- Which tasks became Complete and the evidence recorded for each.
- The final package dependency graph and confirmation that engine purity passed.
- Node, pnpm, SQLite library, migration, randomness-algorithm, canonicalization, and content-manifest versions actually used.
- The exact root verification and fresh-database scenario results, including test counts.
- The representative campaign ID/fixture, final stream revision, transaction count, event count, final state hash, snapshot revision/hash, and projection revisions.
- Evidence that duplicate retry produced no rerun/reroll and that identity collision appended nothing.
- Evidence for explicit corrupt-snapshot fallback, projection rebuild equality/privacy, and compensating undo.
- Paths of the three generated references and confirmation of byte-stable regeneration.
- Any deviation from this plan and the corresponding `PRIMARY_PLAN.md`/ADR update.
- The next ready Phase 2 task: create `apps/host` as a Fastify composition layer over `@lldm/runtime`, without moving persistence or mechanics into the host.

Do not call Phase 1 a living-room application. It is a replayable local mechanical/runtime vertical slice operated through a development CLI; room, phone, TV, relay, and generated-fiction experiences remain later phases.
