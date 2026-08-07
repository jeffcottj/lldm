# Phase 0 — Repository and Executable Rules Foundation

**Status:** Complete

**Parent plan:** [PRIMARY_PLAN.md](../../PRIMARY_PLAN.md)

**Last verified:** 2026-08-07

**Primary executor:** Autonomous coding agent

**Outcome:** A reproducible TypeScript workspace whose versioned contracts, pure rules functions, tests, and generated references form an authoritative foundation for later application work.

## 1. Completion Standard

Phase 0 is complete when a fresh checkout on Node 24 can install with the committed lockfile, pass the repository quality gate, validate the baseline Compose and Wrangler configurations, and regenerate identical mechanical documentation from executable definitions.

The exit gate must prove all of the following:

- Core resolution examples pass as readable golden tests.
- Exhaustive checks cover every d20 face for standard targets `10`, `13`, `16`, `19`, and `22` with every currently legal total modifier from `-2` through `+6`.
- Generated probability and mechanical-reference tables match the executable rules exactly and produce no Git diff after regeneration.
- Canonical Phase 0 commands, events, content records, proposals, projections, and transport envelopes are typed, integer-versioned, and runtime validated.
- A physical-roll request cannot be produced without its target, complete modifier breakdown, final modifier, outcome bands, concrete stakes, reason, and eligible roller.
- A starting-character foundation accepts exactly the attribute and discipline allocations selected in the primary plan.
- CI runs formatting/lint checks, type checking, unit tests, and generated-file drift checks.
- Supporting architecture, terminology, and clean-room documents exist and do not compete with executable definitions as a second source of mechanical truth.

Passing tests alone is insufficient if generated files are stale, required documentation is absent, or code from a later phase has been pulled into this phase.

## 2. Scope Boundary

### In scope

- Root pnpm workspace and Node 24 development contract.
- Strict TypeScript, TypeBox, Biome, Vitest, Playwright, Docker Compose, and Wrangler setup.
- Minimal GitHub Actions quality gate.
- Physical packages `@lldm/contracts`, `@lldm/engine`, and `@lldm/content` only.
- Integer version `1` contract envelopes and detailed Phase 0 resolution and character-foundation schemas.
- Pure d20 resolution, Edge/Hindrance normalization, outcome degrees, natural-face shifts, physical-roll selection, physical-roll disclosure data, and starting-character validation.
- Deterministic generation of the probability report and mechanical reference.
- One foundational architecture decision record, a glossary, and a lightweight clean-room policy.

### Explicitly deferred

- Reducers, event storage, seeded simulated randomness, snapshots, replay execution, migrations, projections over real campaign state, compensating undo, and the CLI simulator; these begin in Phase 1.
- Guard, Wounds, Exertion, Spark recovery, Supply transitions, ranks 2–4, combat activations, zones, progress/danger tracks, social state, rituals, and enemy mechanics; these begin in Phase 1.
- Complete Heritage Gift, Upbringing, archetype, path, talent, gear, or power catalogs; representative mechanical options are not required in Phase 0.
- `apps/host`, `apps/web`, `apps/relay`, and `packages/providers`; empty application packages are not created.
- A runnable container service, deployable Worker, browser product flow, LLM integration, speech, images, audio, and household playtesting.
- Persistence compatibility or protocol migrations beyond rejecting unsupported version values. Migration adapters arrive with the first actual revision that needs them.

Placeholder Compose and Wrangler configurations establish syntax and tool readiness only. They must not masquerade as deployable application infrastructure.

## 3. Fixed Decisions

These choices are settled for Phase 0 and are not implementation-time options.

| Area | Decision |
| --- | --- |
| Canonical name | Use **LLDM** in documents, package scopes, configuration names, and examples. |
| Plan location | Keep this plan at `docs/plans/PHASE_0.md`; link it from `PRIMARY_PLAN.md`, not directly from `README.md`. |
| Detail level | Use execution-ready tasks with dependencies, owned paths, acceptance criteria, validation commands, status, and evidence. |
| Estimation | Do not include calendar or effort estimates. Dependencies and exit evidence determine execution order. |
| Phase boundary | Remain strictly within Phase 0; define seams for later phases without implementing them. |
| Physical workspace | Create only `packages/contracts`, `packages/engine`, and `packages/content`; reserve `apps/*` and other `packages/*` through workspace globs. |
| Package names | Use private scoped names: `@lldm/contracts`, `@lldm/engine`, and `@lldm/content`. |
| Versions | Use `schema_version: 1` for independently serialized canonical schemas and `protocol_version: 1` for transport envelopes. Use integers, not semantic-version strings. |
| Tool versions | Require Node 24, pin an exact pnpm release in `packageManager`, declare compatible dependency ranges, and commit `pnpm-lock.yaml`. |
| Rules authority | Keep normative identifiers, values, algorithms, and concise original rule text in executable definitions. Generated Markdown is a derived view. |
| Starting disciplines | Assign one trained discipline at `+2`, three familiar disciplines at `+1`, and four untrained disciplines at `0`. |
| Character scope | Validate foundational identity, allocations, Drive, Bond, significant-gear slots, signature concept, rank, and future content references; do not implement option effects or advancement. |
| Probability coverage | Report every standard target across legal Phase 0 total modifiers `-2...+6`, including natural 1 and natural 20 degree shifts. |
| Verification | Use both clean-room golden examples and exhaustive numerical invariants. |
| Generated files | Commit deterministic Markdown under `docs/generated/`; CI rejects drift. Generated output contains no timestamps or environment-dependent ordering. |
| Clean-room record | Create a lightweight policy describing permitted source categories and originality review. Do not require a per-change provenance ledger. |
| Architecture record | Create one foundational ADR covering the workspace, dependency direction, pure engine, TypeBox validation, integer versions, and generated references. |
| CI | Add one minimal GitHub Actions workflow for formatting/lint, type checking, tests, and generation drift. |
| Infrastructure tools | Add syntactically valid Compose and Wrangler placeholders plus validation commands, with no application entry points or deploy step. |

## 4. Status and Evidence

Use these states consistently:

- **Complete:** Acceptance criteria were run and evidence is recorded.
- **Ready:** All dependencies are complete and implementation can start.
- **Pending:** One or more listed dependencies are incomplete.
- **Blocked:** An external condition or missing decision prevents progress. Dependency ordering by itself is not a blocker.

When a task becomes complete, update its summary status and replace `Not yet implemented` in its evidence field with concise file and command evidence. Do not mark a task complete for merely creating its files.

| Task | Summary | Depends on | Status | Evidence |
| --- | --- | --- | --- | --- |
| P0-001 | Verify repository baseline | — | Complete | Git worktree on `main`; `origin` points to `jeffcottj/lldm`; initial commit `d0aaeee` exists. |
| P0-002 | Verify repository guardrails | P0-001 | Complete | Root `AGENTS.md` contains the project instructions supplied for this repository. |
| P0-003 | Align planning documents | P0-001, P0-002 | Complete | This document exists; `PRIMARY_PLAN.md` uses LLDM, records the current repository, and links here. |
| P0-010 | Bootstrap the pnpm workspace | P0-003 | Complete | Node 24/pnpm 11.13.0 manifests, strict project references, three private packages, and `pnpm-lock.yaml`; frozen install, build, and recursive dependency listing pass. |
| P0-011 | Configure quality tools and CI | P0-010 | Complete | Biome, Vitest, Playwright, canonical root scripts, and `.github/workflows/ci.yml`; `pnpm verify` and `pnpm playwright:check` pass. |
| P0-012 | Add infrastructure-tool placeholders | P0-010 | Complete | `compose.yaml`, `wrangler.jsonc`, and generated `types/wrangler.d.ts`; Docker Compose and Wrangler `types --check` pass without credentials. |
| P0-020 | Implement the canonical contract kernel | P0-010 | Complete | `packages/contracts/src/{versions,ids,envelopes,validation}.ts`; strict runtime round-trip and malformed-boundary tests pass. |
| P0-021 | Define resolution and physical-roll schemas | P0-020 | Complete | `packages/contracts/src/checks.ts` and check fixtures/tests; registered version-1 command, event, proposal, projection, and transport variants validate. |
| P0-022 | Define character-foundation schemas | P0-020 | Complete | `packages/contracts/src/characters.ts` and character tests; exact allocations, Unicode limits, four gear slots, and opaque future references validate. |
| P0-023 | Implement pure executable rules | P0-021, P0-022 | Complete | `packages/engine/src/`; resolution, modifier normalization, physical selection/disclosure, Spark, and starting-character validation tests pass; purity audit is empty. |
| P0-024 | Establish the content-package boundary | P0-020 | Complete | `packages/content/src/core-catalog.ts`; all 21 core-term records validate and seven later registries remain typed, unavailable, and empty. |
| P0-030 | Add readable golden examples | P0-023 | Complete | `packages/engine/src/golden.test.ts` and contract character/check cases cover every specified boundary, trigger, Spark interaction, disclosure, and allocation behavior. |
| P0-031 | Add exhaustive numerical verification | P0-023 | Complete | `packages/engine/src/exhaustive.test.ts` enumerates all 900 supported cases and checks distributions, monotonic non-natural faces, normalization, and disclosure agreement. |
| P0-032 | Add schema and version fixtures | P0-021, P0-022 | Complete | Canonical `packages/contracts/src/fixtures/*.json` plus fixture tests cover valid round trips, causation identity, unsupported versions, unknown variants, and malformed fields. |
| P0-040 | Generate and commit mechanical references | P0-023, P0-024, P0-030, P0-031 | Complete | `scripts/generate-references.ts` produces both `docs/generated/` files deterministically; repeated generation and `pnpm docs:check` pass. |
| P0-041 | Add supporting architecture and policy documents | P0-003 | Complete | Accepted ADR-0001, `docs/GLOSSARY.md`, and `docs/CLEAN_ROOM.md` match the implemented foundation and generated-rule boundary. |
| P0-050 | Run and record the Phase 0 exit audit | P0-011, P0-012, P0-032, P0-040, P0-041 | Complete | Node 24.14.0, pnpm 11.13.0, frozen install, `pnpm verify`, Compose, Wrangler, repeated generation, dependency, purity, and deferred-scope audits pass. |

The intended dependency flow is:

```text
P0-001 -> P0-002 -> P0-003
                         |-> P0-010 -> P0-011 --------------------------|
                         |          |-> P0-012 --------------------------|
                         |          |-> P0-020 -> P0-021 -> P0-023 -----|
                         |                     |-> P0-022 ---^           |
                         |                     |-> P0-024 -------|       |
                         |                                  P0-030 --|   |
                         |                                  P0-031 --|-> P0-040
                         |                                  P0-032 ------|
                         |-> P0-041 ------------------------------------|
                                                                       v
                                                                    P0-050
```

`P0-010` and `P0-041` may proceed independently. After `P0-020`, schema work may be divided by domain, but no task may redefine a shared version or identifier contract locally.

## 5. Deliverable Layout

This is the intended Phase 0 shape. A task may split a listed source file when doing so preserves the same ownership and public API.

```text
.
├── .github/workflows/ci.yml
├── .gitignore
├── .node-version
├── .npmrc
├── AGENTS.md
├── PRIMARY_PLAN.md
├── biome.json
├── compose.yaml
├── package.json
├── playwright.config.ts
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
├── vitest.config.ts
├── wrangler.jsonc
├── docs
│   ├── CLEAN_ROOM.md
│   ├── GLOSSARY.md
│   ├── architecture
│   │   └── ADR-0001-executable-rules-foundation.md
│   ├── generated
│   │   ├── mechanical-reference.md
│   │   └── probability-report.md
│   └── plans
│       └── PHASE_0.md
├── packages
│   ├── content
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── core-catalog.ts
│   │   │   └── index.ts
│   │   └── tsconfig.json
│   ├── contracts
│   │   ├── package.json
│   │   ├── src
│   │   │   ├── characters.ts
│   │   │   ├── checks.ts
│   │   │   ├── envelopes.ts
│   │   │   ├── ids.ts
│   │   │   ├── index.ts
│   │   │   ├── validation.ts
│   │   │   └── versions.ts
│   │   └── tsconfig.json
│   └── engine
│       ├── package.json
│       ├── src
│       │   ├── character-creation.ts
│       │   ├── index.ts
│       │   ├── physical-rolls.ts
│       │   └── resolution.ts
│       └── tsconfig.json
├── scripts
│   └── generate-references.ts
└── types
    └── wrangler.d.ts
```

Tests may be colocated as `*.test.ts` or placed in package-local `test/` directories, but use one convention across all three packages.

## 6. Task Specifications

### P0-001 — Verify repository baseline

**Status:** Complete

**Depends on:** Nothing

**Owns:** Existing Git metadata only; this task does not edit it.

Confirm that work begins from the intended repository rather than initializing Git again.

Completed observations:

- Repository root is `/home/john/repos/lldm`.
- The active branch is `main` and tracks `origin/main`.
- `origin` is `https://github.com/jeffcottj/lldm.git`.
- Initial commit `d0aaeee` contains the planning baseline.

**Acceptance criteria**

- `git rev-parse --show-toplevel` returns `/home/john/repos/lldm`.
- `git branch --show-current` returns `main`.
- At least one commit exists.
- No task runs `git init` or rewrites existing history.

**Validation**

```sh
git rev-parse --show-toplevel
git branch --show-current
git remote -v
git log -1 --oneline
```

### P0-002 — Verify repository guardrails

**Status:** Complete

**Depends on:** P0-001

**Owns:** `AGENTS.md` only if a factual correction is required.

Treat the existing root `AGENTS.md` as active implementation policy. Do not replace it with generated boilerplate or duplicate it below package directories during Phase 0.

**Acceptance criteria**

- The file exists at the repository root and is non-empty.
- It states that TypeScript is mechanically authoritative and that commands/events must be typed, versioned, validated, transactional, and replayable.
- It requires `PRIMARY_PLAN.md` to remain aligned with implementation.

**Validation**

```sh
test -s AGENTS.md
rg -n "TypeScript rules engine" AGENTS.md
rg -n "typed, versioned, validated" AGENTS.md
rg -n "PRIMARY_PLAN.md" AGENTS.md
```

### P0-003 — Align planning documents

**Status:** Complete

**Depends on:** P0-001, P0-002

**Owns:** `PRIMARY_PLAN.md`, `docs/plans/PHASE_0.md`

Make the roadmap describe the repository that actually exists and establish this document as the execution plan.

**Required changes**

- Standardize the product name on LLDM.
- Correct the repository path and replace the obsolete “empty repository” finding with the verified baseline.
- Preserve the high-level roadmap while replacing the Phase 0 bullets with the strict scope, current completion facts, and a link to this plan.
- Record the starting discipline allocation as one trained, three familiar, and four untrained.
- Keep `README.md` unchanged; it already links to `PRIMARY_PLAN.md`, which is the selected navigation path.

**Acceptance criteria**

- The primary plan contains no `AIDM2` or `/home/john/repos/aidm2` reference.
- Its Phase 0 section links to `docs/plans/PHASE_0.md`.
- Both documents state the same Phase 0 boundary and exit criterion.
- The primary plan does not claim an unresolved discipline allocation.

**Validation**

```sh
test -s docs/plans/PHASE_0.md
rg -n "^# LLDM" PRIMARY_PLAN.md
rg -n "docs/plans/PHASE_0.md" PRIMARY_PLAN.md
rg -n "one discipline as trained.*three as familiar.*four as untrained" PRIMARY_PLAN.md
if rg -n "AIDM2|/home/john/repos/aidm2" PRIMARY_PLAN.md; then exit 1; fi
```

### P0-010 — Bootstrap the pnpm workspace

**Status:** Complete

**Depends on:** P0-003

**Owns:** Root package-manager and TypeScript configuration, `pnpm-lock.yaml`, and the manifests/entry points for the three Phase 0 packages.

Create the smallest workspace that establishes the final dependency direction without adding application stubs.

**Implementation requirements**

- Require Node `>=24 <25` and commit `.node-version` with major `24`.
- Select a Node-24-compatible pnpm release, pin its exact version in the root `packageManager` field, and use it to create `pnpm-lock.yaml`.
- Mark the root and every workspace package `private`.
- Configure `pnpm-workspace.yaml` with `packages/*` and `apps/*`; only the three selected package directories exist now.
- Use ESM consistently. Configure strict TypeScript with at least `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, and `useUnknownInCatchVariables` enabled.
- Use project references or an equivalent build layout that detects dependency cycles.
- Establish this dependency direction:
  - `@lldm/contracts` has no workspace dependency.
  - `@lldm/engine` may depend on `@lldm/contracts`.
  - `@lldm/content` may depend on `@lldm/contracts` but not `@lldm/engine`.
  - Contract and content packages never import the engine.
- Export only explicit public entry points. Do not rely on package-internal deep imports.
- Add root scripts that can later compose `build`, `typecheck`, `lint`, `test`, `docs:generate`, `docs:check`, and `verify`; scripts whose implementation depends on later tasks may initially fail with an explicit message rather than silently succeed.

**Acceptance criteria**

- A clean install uses the lockfile without rewriting it.
- All three package entry points type-check under the shared strict configuration.
- Workspace package names and dependency direction match this task.
- No `apps/*` directory or `packages/providers` placeholder is added.

**Validation**

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm exec tsc --build
pnpm list --recursive --depth 0
```

### P0-011 — Configure quality tools and CI

**Status:** Complete

**Depends on:** P0-010

**Owns:** `biome.json`, `vitest.config.ts`, `playwright.config.ts`, root quality scripts, and `.github/workflows/ci.yml`

Create one unsurprising local quality gate and run its portable subset in GitHub Actions.

**Implementation requirements**

- Configure Biome for formatting and linting of TypeScript, JSON, and JSONC files used by the repository.
- Configure Vitest for package-local unit tests with deterministic execution and no live network access.
- Add a Playwright configuration compatible with the later `apps/web` work, but do not create a browser product test or install browsers in CI during Phase 0. Type-check the configuration and expose a version/configuration smoke command.
- Define canonical scripts:
  - `format` and `format:check`
  - `lint`
  - `typecheck`
  - `test`
  - `docs:generate` and `docs:check`
  - `config:check`
  - `verify`, which composes the non-mutating checks
- Add a GitHub Actions workflow using Node 24 and the exact pnpm version declared by the repository. It must install with `--frozen-lockfile`, then run formatting/lint, type checking, unit tests, and documentation drift checks.
- Do not require Docker, Cloudflare credentials, browser downloads, live providers, or networked model calls in CI.

**Acceptance criteria**

- Every canonical script fails on a real violation and returns zero on the completed repository.
- `verify` does not rewrite source or generated files.
- The CI workflow uses the lockfile and has no deploy permissions or secret requirement.
- Playwright is pinned and configured even though product E2E coverage is deferred.

**Validation**

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm docs:check
pnpm verify
```

### P0-012 — Add infrastructure-tool placeholders

**Status:** Complete

**Depends on:** P0-010

**Owns:** `compose.yaml`, `wrangler.jsonc`, `types/wrangler.d.ts`, and the corresponding `config:check` implementation

Pin and validate the tools that later phases will use without inventing an application to configure.

**Implementation requirements**

- Add a Compose Specification file named `compose.yaml` with project name `lldm` and an explicitly empty `services` map. Do not add the obsolete top-level `version` field.
- Add a root `wrangler.jsonc`, the format Cloudflare recommends for new projects, containing a placeholder LLDM relay name and an explicit compatibility date. It must contain no entry point, binding, credential, route, or deploy target.
- Generate and commit runtime types at `types/wrangler.d.ts` if the pinned Wrangler version supports configuration-only type generation; otherwise validate the JSONC through the pinned Wrangler parser and record the limitation in the task evidence.
- Make `config:check` validate Compose syntax and check the committed Wrangler-generated types without contacting Cloudflare or deploying anything.
- Keep the configuration comments explicit that runnable services and Worker code begin in Phase 2.

**Acceptance criteria**

- `docker compose config --quiet` accepts the Compose file without pulling or starting an image.
- The pinned Wrangler accepts the JSONC and its type check runs without credentials.
- Neither configuration references a nonexistent application entry point.
- No service, Worker source file, or Cloudflare resource is created.

**Validation**

```sh
docker compose -f compose.yaml config --quiet
pnpm exec wrangler --config wrangler.jsonc types types/wrangler.d.ts --check
pnpm config:check
```

The validation commands follow the official [Docker Compose `config --quiet` reference](https://docs.docker.com/reference/cli/docker/compose/config/) and [Wrangler `types --check` reference](https://developers.cloudflare.com/workers/wrangler/commands/workers/). If the selected pinned Wrangler changes argument placement, update the repository script and this command together.

### P0-020 — Implement the canonical contract kernel

**Status:** Complete

**Depends on:** P0-010

**Owns:** Shared version, opaque-ID, envelope, and validation modules in `@lldm/contracts`

Establish runtime schemas and inferred TypeScript types before defining domain payloads.

**Implementation requirements**

- Use TypeBox schemas as the source for runtime JSON Schema and inferred static types. Do not maintain parallel handwritten interfaces.
- Export literal constants for schema version `1` and protocol version `1`.
- Define opaque branded string types and schemas for the IDs needed by Phase 0, including command, event, transaction, campaign, actor, character, seat, content-definition, proposal, projection, message, room, and connection IDs. Treat their string values as opaque; do not bake a UUID implementation into domain logic.
- Define reusable version-1 envelope builders or schemas for commands, events, content definitions, bounded proposals, projections, and transport messages.
- Require every independently serialized canonical value to carry `schema_version: 1`. Require every transport envelope to also carry `protocol_version: 1`.
- Give command and event envelopes enough identity for later transactions and replay: command/event ID, transaction ID, campaign ID, discriminating `kind`, and payload; events additionally carry command causation and a zero-based index within the transaction. Stream revisions remain a Phase 1 storage concern.
- Give projections a non-negative revision. Give transport envelopes the message, room, connection, optional seat, monotonic sequence, optional reply, kind, and payload fields specified by the parent plan. These are contracts only; Phase 0 does not route or filter a message.
- Exclude timestamps from pure mechanical envelopes. A later storage or observability wrapper may record time without making it a rules input.
- Reject unsupported versions, unknown discriminants, unexpected properties, malformed IDs, and out-of-range values with structured validation issues that identify paths. Do not silently coerce inputs.
- Provide one public validation API that returns a typed success or typed issue list; callers must not need unchecked casts.
- Keep future unions extensible through centralized registration/export rather than local declaration merging.

**Acceptance criteria**

- Runtime validation and static types come from the same TypeBox definitions.
- A version other than integer `1` is rejected in every Phase 0 top-level fixture.
- Envelope fixtures round-trip through JSON without losing discriminants or ID types.
- Contracts import no engine, content, database, network, clock, or random source.

**Validation**

```sh
pnpm --filter @lldm/contracts typecheck
pnpm --filter @lldm/contracts test
```

### P0-021 — Define resolution and physical-roll schemas

**Status:** Complete

**Depends on:** P0-020

**Owns:** Resolution, check-result, and physical-roll contracts in `@lldm/contracts`

Model enough data to calculate a check and reveal a physical check honestly before the die is rolled.

**Required schemas and constants**

- `Attribute`: Force, Finesse, Insight, Presence.
- `Discipline`: Athletics, Subterfuge, Craft, Lore, Vigilance, Influence, Survival, Mysticism.
- Standard targets: `10`, `13`, `16`, `19`, `22`.
- Die face: integer `1...20`.
- Discipline rating: `0`, `1`, or `2`; attribute rating: `0`, `1`, or `2` within a separately validated allocation.
- Modifier state with one Edge flag and one Hindrance flag. A boolean representation makes stacking unrepresentable; both flags may be true and cancel.
- Outcome degree: Crisis, Setback, Success, Triumph.
- Physical-roll reason: permanent death, declared irreversible stake, named boss transition, pivotal scene conclusion, or Spark invocation.
- Check request, resolved-check record, typed impossibility rejection, four concrete outcome consequences, and physical-roll disclosure.

The check request must identify the actor, attribute, discipline, target, modifier state, visibility, stakes, action feasibility, and whether the unresolved check is eligible for Spark conversion. A physical request must also contain its primary reason and eligible roller. The resolved record must retain the die face, each modifier component, final modifier, total, target delta, base degree, natural-face adjustment, final degree, roll mode, and physical reason when applicable.

Define initial version-1 `resolve_check` command, `check_resolved` and `physical_roll_requested` event, `propose_check` bounded-proposal, and `check_preview` projection payloads. They prove each envelope family with Phase 0 data; Phase 0 does not implement a command reducer, invoke an LLM, build a player projection, or append events to a stream.

**Acceptance criteria**

- Invalid targets, die faces, rating values, stacked modifier counts, empty physical stakes, and incomplete physical disclosures fail validation.
- A physical disclosure contains every fact a player must see before rolling, including a deterministic face-to-outcome table that reflects natural-face shifts.
- Impossible actions cannot reach a schema state that asks for a die face.
- No schema permits narration to replace a mechanical result.
- Initial command, event, proposal, and projection variants all use centralized discriminated unions and reject unknown variants.

**Validation**

```sh
pnpm --filter @lldm/contracts test -- checks
pnpm --filter @lldm/contracts typecheck
```

### P0-022 — Define character-foundation schemas

**Status:** Complete

**Depends on:** P0-020

**Owns:** Character-foundation contracts and validation fixtures in `@lldm/contracts`

Define a versioned character foundation without pulling later character-option mechanics into this phase.

**Implementation requirements**

- Store each of the four attributes exactly once and validate the multiset `+2, +1, +1, 0`.
- Store each of the eight disciplines exactly once and validate exactly one trained at `+2`, three familiar at `+1`, and four untrained at `0`.
- Include opaque character/actor IDs, a trimmed non-empty display name, rank `1`, Drive, Bond, four stable significant-gear slots, and a bounded signature-technique concept.
- Count limits in Unicode code points after requiring leading/trailing whitespace to be absent: display name `1...40`; Drive, Bond, and signature concept `1...160`; gear label `1...60`; optional gear note `0...120`. Reject control characters rather than silently normalizing them.
- Require Heritage Gift, Upbringing, and archetype selections as opaque content references. At rank 1 the path is absent. Catalog existence and mechanical prerequisites are deferred until those catalogs exist.
- Treat Drive, Bond, gear descriptions, and signature concept as bounded narrative fields that grant no unvalidated modifier or mechanical effect.
- Distinguish a Phase 0 foundation record from a later playable character state so the absence of archetype/resource mechanics cannot be mistaken for completeness.

These phone-glanceable limits are validation constraints, not opportunities to embed mechanics in free text.

**Acceptance criteria**

- Reordering attribute or discipline entries does not affect validation or derived meaning.
- Duplicate/missing attributes or disciplines and every incorrect allocation are rejected with path-specific issues.
- There are exactly four stable gear slots; empty slots are permitted and do not imply an item.
- No engine function interprets a free-text field as a bonus, cost, Impact, condition, or other mechanical effect.
- No Heritage Gift, Upbringing, archetype, path, or talent mechanics are implemented.

**Validation**

```sh
pnpm --filter @lldm/contracts test -- characters
pnpm --filter @lldm/contracts typecheck
```

### P0-023 — Implement pure executable rules

**Status:** Complete

**Depends on:** P0-021, P0-022

**Owns:** Pure rule modules and their public exports in `@lldm/engine`

Implement the authoritative mechanics as total, deterministic functions over validated values.

**Resolution algorithm**

1. Reject an impossible action without requesting or consuming a die face.
2. Normalize Edge and Hindrance: Edge contributes `+2`, Hindrance contributes `-2`, and both together contribute `0`; neither stacks.
3. Calculate `die face + attribute + discipline + normalized situational modifier`.
4. Compare the total to the target:
   - delta `<= -5`: Crisis
   - delta `-4...-1`: Setback
   - delta `0...4`: Success
   - delta `>= 5`: Triumph
5. On natural 1, lower the base degree by one. On natural 20, raise it by one. Clamp at Crisis and Triumph.
6. Return a complete immutable result record. Do not narrate, mutate character state, write an event, or choose random input.

**Physical-roll policy**

- Mandatory triggers are permanent death, declared irreversible stakes, named boss transitions, and pivotal scene conclusions.
- Spark changes an unresolved simulated check explicitly marked Spark-eligible into a physical check and grants Edge before Edge/Hindrance cancellation. Reject Spark invocation when the request is impossible, already resolved, lacks an eligible roller, or is marked ineligible; broader command-context eligibility is implemented in Phase 1.
- If several triggers apply, use deterministic primary-reason precedence in the order listed above, followed by Spark. Preserve whether Spark was spent separately so its Edge is not lost when another reason is primary.
- Produce a pending physical-roll disclosure rather than a result. Resolution resumes only when a separately validated face is supplied in a later phase's transaction flow.
- Derive the displayed face-to-outcome mapping from the same resolution function used to settle the result.

**Purity and boundary requirements**

- Export a frozen core-rules catalog containing stable rule IDs and concise clean-room rule text beside the constants/functions it describes. This catalog supplies generated documentation and cannot override the algorithms.
- Do not read the wall clock, environment, filesystem, database, network, global random state, or mutable singleton state.
- Do not call `Math.random` or generate IDs inside rule functions.
- Return typed rejections for invalid feasibility or physical-disclosure conditions.
- Keep prose embellishment out of engine results; concise canonical rule text and concrete stakes are allowed.
- Validate starting character allocations through pure functions that consume the contract types.

**Acceptance criteria**

- Identical inputs return deeply equal outputs.
- The algorithm matches all boundary rules and natural-face shifts in the parent plan.
- Both Edge and Hindrance are visible in the result even when their net modifier is zero.
- Spark plus Hindrance results in both flags being present and a net situational modifier of zero.
- The engine has no dependency beyond `@lldm/contracts` and pure standard-library operations.

**Validation**

```sh
pnpm --filter @lldm/engine typecheck
pnpm --filter @lldm/engine test
if rg -n "Math\.random|Date\.now|new Date|process\.env|node:fs|node:http|node:net" packages/engine/src; then exit 1; fi
```

The final `rg` is an audit aid. The root documentation generator may perform file I/O, but it must remain outside `@lldm/engine`; do not weaken the rule-module boundary to accommodate generation.

### P0-024 — Establish the content-package boundary

**Status:** Complete

**Depends on:** P0-020

**Owns:** `@lldm/content` Phase 0 catalog metadata and exports

Make the content package real and buildable without prematurely authoring character options.

**Implementation requirements**

- Export versioned, clean-room original display metadata for the four attributes, eight disciplines, standard target values, and outcome degrees as the initial concrete `core_term` content-definition records.
- Key metadata by contract identifiers and prove exhaustiveness at compile time.
- Keep all numerical values, allocation rules, resolution algorithms, and physical-trigger decisions in the engine/contracts rather than duplicating them here.
- Export intentionally empty typed registries for later Heritage Gifts, Upbringings, archetypes, paths, talents, powers, and enemies only if a registry seam is needed by the public API. Label them unavailable rather than populating sample mechanics.
- Depend only on `@lldm/contracts`; never import `@lldm/engine`.

**Acceptance criteria**

- Every Phase 0 identifier has exactly one original display label and concise description where needed by generated documentation.
- The package contains no tactical ability, narrative permission, content bonus, or advancement rule.
- Compile-time exhaustiveness fails if a Phase 0 identifier is added without matching metadata.

**Validation**

```sh
pnpm --filter @lldm/content typecheck
pnpm --filter @lldm/content test
pnpm --filter @lldm/content list --depth 0
```

### P0-030 — Add readable golden examples

**Status:** Complete

**Depends on:** P0-023

**Owns:** Human-readable resolution, physical-roll, and character-allocation tests

Use short clean-room original scenarios and table-driven expected values. Each failure should identify the rule it contradicts.

**Required coverage**

- Delta boundaries at `-5`, `-4`, `-1`, `0`, `+4`, and `+5`.
- Natural 1 downgrade, natural 20 upgrade, and Crisis/Triumph clamping.
- Edge alone, Hindrance alone, and mutual cancellation.
- Impossible action rejection without a roll.
- Each mandatory physical-roll reason.
- Spark conversion, Spark-granted Edge, and Spark/Hindrance cancellation.
- A physical disclosure with target, component modifiers, final modifier, four consequences, concrete stakes, reason, eligible roller, and exact die-face mapping.
- Valid attribute allocation and the selected `1/3/4` discipline allocation.
- Invalid duplicate, missing, and incorrectly distributed character ratings.

Examples must use LLDM terminology and original names/fiction. They may not mirror examples from an existing tabletop rules publication.

**Acceptance criteria**

- Each listed behavior has at least one readable case with explicit input and expected output.
- Expected values are literal fixtures, not generated by calling the function under test.
- Error snapshots avoid unstable stack traces, timestamps, or machine paths.

**Validation**

```sh
pnpm --filter @lldm/engine test -- golden
pnpm --filter @lldm/contracts test -- character
```

### P0-031 — Add exhaustive numerical verification

**Status:** Complete

**Depends on:** P0-023

**Owns:** Enumerated resolution invariants and probability aggregation tests

Enumerate the complete supported Phase 0 resolution space rather than sampling it.

**Implementation requirements**

- For each target in `10, 13, 16, 19, 22`, each total modifier in `-2...+6`, and each die face in `1...20`, resolve and record exactly one final outcome.
- Verify each target/modifier distribution totals 20 faces and 100 percent.
- Verify that final degrees are always within the four-value ordered set and that natural shifts change by at most one degree.
- Verify monotonicity for non-natural boundary comparisons and explicitly account for natural 1/20 adjustments rather than asserting a false global monotonic rule.
- Verify Edge/Hindrance normalization independently from outcome classification.
- Build expected probability counts through direct face enumeration; do not use floating-point approximations as the source of truth. Render percentages from integer counts.
- Add invariants that generated face-to-outcome disclosures agree with resolution for every face.

**Acceptance criteria**

- All `5 × 9 × 20 = 900` supported target/modifier/face combinations are checked.
- Probability counts are integers out of 20 and rendered consistently.
- The test fails if a target, legal modifier, die face, or outcome degree is omitted.

**Validation**

```sh
pnpm --filter @lldm/engine test -- exhaustive
```

### P0-032 — Add schema and version fixtures

**Status:** Complete

**Depends on:** P0-021, P0-022

**Owns:** Canonical JSON fixtures and validation tests in `@lldm/contracts`

Prove that the runtime boundary rejects malformed or future data explicitly.

**Required fixtures**

- One valid JSON fixture for each concrete Phase 0 independently serialized schema.
- Unsupported `schema_version` and `protocol_version` values.
- Unknown `kind`, missing discriminator, extra property, malformed opaque ID, invalid target, invalid die face, incomplete physical disclosure, and invalid character allocation.
- A command/event causation pair that shares campaign and transaction identity.
- JSON serialize/parse/validate round trips for all valid fixtures.

**Acceptance criteria**

- Invalid fixtures fail for the intended path and reason rather than an incidental earlier error.
- Unknown properties are rejected at canonical external boundaries.
- No fixture depends on current time, random ID generation, or property iteration order.
- Fixture text contains no copied rules prose or third-party setting content.

**Validation**

```sh
pnpm --filter @lldm/contracts test -- fixtures
```

### P0-040 — Generate and commit mechanical references

**Status:** Complete

**Depends on:** P0-023, P0-024, P0-030, P0-031

**Owns:** `scripts/generate-references.ts`, `docs/generated/mechanical-reference.md`, and `docs/generated/probability-report.md`

Produce reader-friendly derived artifacts without creating a second mechanical authority.

**Mechanical reference contents**

- Generated-file warning and exact regeneration command.
- Four attributes and eight disciplines with display metadata.
- Starting attribute and discipline allocations.
- Standard target ladder.
- Full check formula and Edge/Hindrance cancellation.
- Crisis, Setback, Success, and Triumph boundaries.
- Natural 1 and natural 20 shifts and clamping.
- Physical-roll triggers, Spark interaction, and required pre-roll disclosures.
- Phase 0 character-foundation fields and explicit deferrals.

**Probability report contents**

- Method statement: direct enumeration of twenty faces per row.
- One row for every target/modifier pair in the `5 × 9` matrix.
- Crisis, Setback, Success, and Triumph counts and percentages.
- A focused natural-face note explaining that natural 1/20 shifts are already included.
- No unsupported modifier ranges or speculative character bonuses.

**Generation requirements**

- Keep the generator in the root `scripts/` directory, where it may import the public APIs of both `@lldm/engine` and `@lldm/content`; do not add a content dependency to the engine package.
- Import executable definitions and content metadata; do not retype rule constants inside the generator.
- Use stable sorting, LF line endings, and fixed formatting. Do not include a generation timestamp, absolute path, package installation path, or host version.
- `docs:generate` writes the two committed files.
- `docs:check` renders in memory or a temporary directory and fails with a useful diff if committed output is stale.
- The CI workflow runs `docs:check`, never a mutating generation command.

**Acceptance criteria**

- Running the generator twice produces byte-identical files.
- A deliberate executable-rule change fails `docs:check` until the documents are regenerated.
- Every probability row agrees with exhaustive resolution tests.
- Normative mechanical text is imported from executable definitions; authored wrapper prose cannot alter a rule.

**Validation**

```sh
pnpm docs:generate
git diff --exit-code -- docs/generated
pnpm docs:check
pnpm docs:generate
git diff --exit-code -- docs/generated
```

For the first run, review and commit the expected generated files before using `git diff --exit-code` as the clean-state check.

### P0-041 — Add supporting architecture and policy documents

**Status:** Complete

**Depends on:** P0-003

**Owns:** `docs/architecture/ADR-0001-executable-rules-foundation.md`, `docs/GLOSSARY.md`, `docs/CLEAN_ROOM.md`

Document the foundation without restating generated mechanics by hand.

**Foundational ADR**

Use the sections Status, Context, Decision, Alternatives Considered, Consequences, and Follow-up Boundaries. Record:

- A strict Node 24/pnpm TypeScript workspace.
- Package dependency direction.
- TypeBox schemas as runtime/static contract authority.
- Integer schema/protocol versions beginning at `1`.
- Pure deterministic engine boundaries.
- Executable normative rules and deterministic generated references.
- The decision to defer reducers, persistence, applications, providers, and complete content.

Mark it Accepted only after its claims match the implemented workspace; until then use Proposed.

**Glossary**

Define LLDM terms used in Phase 0, including attribute, discipline, target, modifier, Edge, Hindrance, outcome degree, Crisis, Setback, Success, Triumph, physical roll, Spark, stakes, outcome band, command, event, transaction, proposal, projection, content definition, schema version, and protocol version. Link to generated mechanical details instead of duplicating values likely to drift.

**Clean-room policy**

- Require all rules names, prose, examples, setting fragments, and content to be original to LLDM.
- Permit official technical documentation for tools and libraries without importing its prose into game content.
- Forbid copying or close adaptation from existing tabletop rules, stat blocks, examples, terminology collections, or lore.
- Require explicit license and attribution records for any future third-party audiovisual asset.
- Describe a lightweight review step for new rules/content and what to do when origin is uncertain.
- Do not create or require a per-change provenance ledger in Phase 0.

**Acceptance criteria**

- The ADR matches actual package dependencies and implemented versioning before the exit audit.
- The glossary defines terms rather than introducing new mechanics.
- The clean-room policy is actionable and consistent with `AGENTS.md` and `PRIMARY_PLAN.md`.
- No document manually reproduces the generated probability matrix.

**Validation**

```sh
test -s docs/architecture/ADR-0001-executable-rules-foundation.md
test -s docs/GLOSSARY.md
test -s docs/CLEAN_ROOM.md
pnpm format:check
```

### P0-050 — Run and record the Phase 0 exit audit

**Status:** Complete

**Depends on:** P0-011, P0-012, P0-032, P0-040, P0-041

**Owns:** Status/evidence updates in this plan and factual status alignment in `PRIMARY_PLAN.md`

Run the complete gate from a clean checkout-equivalent state and record evidence without claiming later-phase capability.

**Execution sequence**

1. Confirm Node 24 and the repository-pinned pnpm version.
2. Install using the existing lockfile without mutation.
3. Run the non-mutating repository `verify` script.
4. Validate Compose and Wrangler placeholders locally.
5. Regenerate the two mechanical documents and confirm a zero diff.
6. Review package dependency direction and the engine purity audit.
7. Confirm that all required Phase 0 files are tracked and that no deferred package or application was added.
8. Update each completed task's status and evidence.
9. Update the Phase 0 status in `PRIMARY_PLAN.md` to match the actual application.

**Acceptance criteria**

- Every Phase 0 task is Complete with concrete evidence and none is Blocked.
- `pnpm verify` succeeds on the completed worktree.
- Compose and Wrangler configuration checks succeed without credentials or external state changes.
- Regeneration is byte-stable and leaves `docs/generated/` unchanged.
- The core-resolution examples and all 900 exhaustive numerical cases pass.
- No Phase 1 reducer, event store, application, provider, playable content catalog, or generated-media code is present.
- The primary plan and this plan describe the same implemented state.

**Validation**

```sh
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm verify
docker compose -f compose.yaml config --quiet
pnpm config:check
pnpm docs:generate
git diff --exit-code -- docs/generated
git status --short
```

`git status --short` is evidence, not an automatic failure condition while implementation changes are intentionally uncommitted. The exit record must distinguish expected Phase 0 changes from unexpected generated drift or unrelated files.

## 7. Final Handoff

The Phase 0 handoff must state:

- Which tasks became Complete and the evidence added for each.
- The Node and pnpm versions actually used.
- The exact `pnpm verify` result.
- Whether local Docker Compose and Wrangler checks ran or were unavailable, with the explicit reason.
- The paths of the generated mechanical reference and probability report.
- Any deliberate deviation from this plan and the matching update made to `PRIMARY_PLAN.md`.
- The next ready task in Phase 1, without implementing it.

Do not describe Phase 0 as a playable prototype. Its value is a small, trustworthy mechanical and repository foundation on which the deterministic event system can be built.
