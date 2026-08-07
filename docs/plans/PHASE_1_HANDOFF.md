# Phase 1 Implementation Handoff

**Status:** P1-001 through P1-050 complete; P1-051 started but not complete

**Prepared:** 2026-08-07

**Audience:** AI coding agents resuming implementation on another workstation.

## Resume objective

Continue implementing [PHASE_1.md](PHASE_1.md) from P1-051 through the P1-080 exit audit. Preserve every constraint in the repository [AGENTS.md](../../AGENTS.md), keep [PRIMARY_PLAN.md](../../PRIMARY_PLAN.md) aligned with actual behavior, and stop for user assistance whenever an unresolved judgment or manual action is required.

Do not redo P1-001 through P1-050. Begin by verifying the checkout and auditing the in-progress SQLite files described below.

## Verified completed state

P1-001 through P1-050 are marked Complete with evidence in `PHASE_1.md`.

The completed implementation includes:

- centralized versioned TypeBox command, event, state, content, transaction, randomness, projection-boundary, and scenario contracts;
- pure authoritative command decisions and event application for playable characters, resources, rank structure, combat, physical continuations, challenges, social state, and rituals;
- a canonically hashed 54-definition production catalog and four legal starter loadouts;
- a deterministic Floodgate/Echo Lantern scenario with literal draws, event order, and reviewed state hashes;
- bounded fixed-seed sanity simulations without a win-rate gate;
- canonical JSON and SHA-256 primitives shared through `@lldm/contracts`;
- a SQLite-independent runtime coordinator with injected ports, atomic commit input, deterministic identity allocation, exact retry short-circuiting, canonical stale/legality rejections, and non-canonical identity collisions;
- instrumented coordinator tests, including rollback at injected pre-commit boundaries and proof that an identical random command retry cannot reroll.

The last fully completed checkpoint passed:

```text
25 test files
194 tests
pnpm typecheck
```

The generated references were drift-free at the P1-041 checkpoint. Run the complete verification commands below after checking out this commit because P1-051 source files were added after that checkpoint.

## Approved decisions that must be preserved

- Independently stored or exchanged records carry `schema_version`; nested records inherit their enclosing version.
- Rank-one Guard maxima are Vanguard 8, Maverick 7, Wayfinder 6, Envoy 6, Weaver 5, and Beacon 6.
- A costly rest spends one Supply, fully restores Guard/Exertion, and resets scene abilities; it does not heal Wounds or restore Spark.
- Scene transition fully restores Guard/Exertion and resets scene abilities. Session start restores Spark and its recovery opportunity; Supply persists.
- The death test is target 13 Force plus Athletics. One ally may grant Edge by spending one Exertion or one Supply. Success/Triumph clears the newest third Wound; Triumph also creates the permanent scar `Death's Echo`.
- Combat is hero-first alternating activation with exhausted-side yield. Reaction priority is affected actor, then heroes and enemies in stable actor-ID order; the first used reaction closes the window.
- The example challenge uses Progress 4, Danger 3, and `resolved_with_cost` for a simultaneous threshold tie.
- Ritual interruption closes the ritual, preserves paid costs, leaves unpaid costs untouched, and requires a new ritual ID to restart.
- `advance_rank.expected_rank` means the current rank.
- Combat check profiles and enemy ratings are explicit. Success applies fixed Impact, Triumph adds two, and movement/objective facts are deterministic.
- Social Crisis/Setback does not improve stance, Success advances one step, Triumph at most two, and hard limits cannot be crossed.
- Ritual Success/Triumph completes; Crisis/Setback fails. Requirements include explicit fictional-position tags.
- Character materialization binds every occupied narrative significant-gear slot to pinned mechanics and tracks ready/spent state. Ritual gear costs spend the exact ready item.
- Production content uses the Floodgate theme and Echo Lantern ritual with Vanguard, Wayfinder, Envoy, and Weaver starters.
- A command ID is permanently bound to its canonical command. An identical retry returns the stored commit before revision, clock, content, identity, seed, random, decider, or projector work.
- Reusing a command ID for changed canonical data is a non-canonical collision that appends nothing.
- User-approved clarification: reusing an occupied transaction ID for another command is also a non-canonical `transaction_identity_collision` that appends nothing. It cannot be a canonical rejection because transaction IDs are unique and the runtime may not replace the caller's identity. This interpretation is recorded in `PHASE_1.md`, `PRIMARY_PLAN.md`, and the contract failure-code union.

## In-progress P1-051 work

P1-051 remains Ready in `PHASE_1.md`; do not mark it Complete until every acceptance criterion and validation command passes.

Two SQLite implementation files were just added and compile, but they do not yet have P1-051 tests:

- `packages/runtime/src/sqlite/migrations.ts`
- `packages/runtime/src/sqlite/store.ts`

Current intended behavior:

- Migration 1 creates strict `schema_migrations`, `campaigns`, `commands`, `transactions`, `events`, `snapshots`, and `projections` tables plus indexes and constraints.
- `readMigrationStatus` distinguishes pending/current/checksum mismatch/failed/future/incompatible states.
- `migrateSqliteDatabase` creates and verifies a sibling backup with `VACUUM INTO` before applying pending SQL in `BEGIN IMMEDIATE`.
- `SqliteRuntimeStore` enables foreign keys, WAL, `synchronous=FULL`, and a five-second busy timeout; it refuses non-current schemas.
- The adapter implements the coordinator's synchronous atomic-store port with real `BEGIN IMMEDIATE` transactions.
- `commands.result_json` and `transactions.post_state_json` retain the exact committed result/state needed for idempotent reads until P1-052 replaces head-cache trust with verified replay.
- A small Kysely integrity query ensures Kysely is an active part of the adapter while direct `better-sqlite3` statements preserve the coordinator's synchronous atomic callback.

Treat this code as an implementation draft. Audit it before expanding it. In particular, verify:

1. Fresh-file `VACUUM INTO` produces a verified pre-migration backup and handles an already-existing deterministic backup path safely.
2. `PRAGMA user_version = 1` and all DDL roll back under the injected migration failure.
3. Checksums and migration names are stable and a future/failed/checksum-corrupt registry is reported without mutation.
4. WAL and foreign-key assertions behave correctly across reopen, and all handles close deterministically.
5. SQL constraints and runtime checks reject duplicate identities, revision races/gaps, transaction-index duplicates, broken causation, and dangling rows.
6. Stored `result_json`, commands, transactions, events, states, and projections are revalidated on read.
7. A coordinator can commit, close, reopen, and idempotently return the same committed transaction from SQLite.
8. Seed bytes never appear in events, hashes, projections, logs, normal CLI output, or hand-authored diagnostics.
9. The package-internal SQLite types do not leak through the public coordinator API.

Add focused tests in `packages/runtime/src/sqlite/*.test.ts` using unique `mkdtemp` directories with explicit handle closure. Never point tests at a developer database.

## Recommended immediate sequence

Run:

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
git status -sb
pnpm typecheck
pnpm test
pnpm docs:check
```

Then implement and validate P1-051 in this order:

1. Add migration/status/backup tests before changing the new SQL.
2. Add SQLite coordinator commit/reopen/retry tests.
3. Add direct constraint and injected rollback tests.
4. Run `pnpm --filter @lldm/runtime test -- sqlite migration backup` and root typecheck.
5. Update P1-051 evidence, change P1-052 from Pending to Ready, and align the primary plan only after those checks pass.

Continue in dependency order:

```text
P1-051 SQLite/migrations/backups
P1-052 replay/snapshots/recovery
P1-053 projections/visibility/rebuild
P1-054 compensating undo
P1-060 CLI
P1-061 cross-process exit scenario
P1-070 generated references and Accepted ADR-0002
P1-080 full exit audit
```

## Important files

- `docs/plans/PHASE_1.md`: authoritative task order, fixed architecture, status, and acceptance evidence.
- `PRIMARY_PLAN.md`: actual application/rules state; keep current as each task completes.
- `docs/architecture/ADR-0002-deterministic-runtime-and-event-store.md`: remains Proposed until implementation and audit match every claim.
- `packages/runtime/src/application/coordinator.ts`: exact command transaction sequence.
- `packages/runtime/src/ports/index.ts`: SQLite-independent port boundary.
- `packages/runtime/src/application/coordinator.test.ts`: retry, collision, randomness, rejection, and rollback evidence.
- `packages/runtime/src/sqlite/`: current P1-051 work area.
- `test/fixtures/phase-1/floodgate-scenario.json`: reviewed representative scenario, including literal pending/final hashes.
- `test/phase-1-scenario.test.ts`: public-package scenario runner.
- `packages/content/src/phase-1-catalog.ts`: pinned production definitions and manifest.
- `scripts/generate-references.ts`: sole generator for committed mechanical, probability, and playable-content references.

## Known scope boundaries

Do not pull Phase 2 work forward. `apps/host`, `apps/web`, `apps/relay`, providers, network services, LLM calls, narration, audio, and generated media remain absent. Do not add production rank-2 paths, rank-3 talents, or rank-4 capstones in Phase 1.

The TypeScript engine stays authoritative and pure. Runtime/storage code may perform I/O but may never bypass typed command decisions or mutate mechanical state except by applying validated events. Replay must never draw randomness.

## Suggested resume prompt

```text
Resume Phase 1 implementation from docs/plans/PHASE_1_HANDOFF.md. Read AGENTS.md, the handoff, docs/plans/PHASE_1.md, and PRIMARY_PLAN.md before acting. Audit the in-progress P1-051 SQLite files, implement and fully validate P1-051, keep all documentation aligned, and stop for assistance on any unresolved judgment or manual step.
```
