# ADR-0001: Executable Rules Foundation

## Status

Accepted

## Context

LLDM needs a small foundation that can support deterministic, recoverable household play without letting presentation code or generated fiction become a competing mechanical authority. Its first contracts must work at runtime as well as in TypeScript, and its written mechanical references must stay synchronized with code. Phase 0 does not yet have application processes, persistence, providers, or playable character content.

## Decision

LLDM uses a private pnpm workspace on Node 24 with strict TypeScript and ESM throughout. The Phase 0 dependency direction is:

```text
@lldm/engine  ---> @lldm/contracts <--- @lldm/content
```

`@lldm/contracts` has no workspace dependency. `@lldm/engine` and `@lldm/content` depend on its public entry point; neither depends on the other. Root-only tooling may import every public package to generate combined references.

TypeBox definitions are the joint runtime-schema and static-type authority. Opaque ID schemas decode to branded TypeScript strings. Every independently serialized canonical record begins with integer `schema_version: 1`; transport records also carry integer `protocol_version: 1`. Unsupported versions, unknown variants, malformed fields, and unexpected properties fail through the shared structured validation result.

The engine is pure and deterministic. It accepts validated values, reads no clock, filesystem, environment, network, database, or global random source, and returns complete values or typed rejections. It does not narrate, persist, or invent identifiers.

Normative identifiers, constants, algorithms, and concise original rules text live beside executable definitions. The committed mechanical reference and probability report are deterministic generated views of those public definitions. Authored architecture and terminology documents link to generated details instead of restating probability tables or creating parallel rules.

The repository uses integer versions because Phase 0 has one supported wire/schema generation, not independently negotiated semantic releases. Migration adapters will accompany the first revision that needs them.

## Alternatives Considered

- Handwritten TypeScript interfaces plus separate JSON Schema: rejected because the two representations can drift.
- Hand-maintained rule and probability documents: rejected because review cannot reliably prove they match every executable case.
- A framework or build orchestrator above pnpm: deferred because three packages and TypeScript project references do not need the added layer.
- Adding empty host, web, relay, provider, or persistence packages: rejected because placeholders would blur the Phase 0 boundary.
- Putting display metadata in the engine: rejected because presentation metadata can remain exhaustive without becoming part of calculation.

## Consequences

- Contract changes must update runtime schemas, fixtures, and any affected generated output together.
- Package cycles fail the project-reference build, and imports remain limited to public package entry points.
- The engine can be replayed later because its inputs are explicit and its result has no hidden time or randomness.
- Generated Markdown is reviewable and stable, but contributors must run `pnpm docs:generate` after authoritative definition changes.
- Version `1` values reject future versions until an explicit migration or compatibility policy is implemented.

## Follow-up Boundaries

Phase 1 may add transactional reducers, seeded simulated randomness, event storage, replay, snapshots, migrations, and real projections. Later phases may add applications, provider adapters, deployable Compose services, Worker code, and complete content catalogs. Those additions must preserve the dependency direction and mechanical authority established here; this ADR does not claim that any of them exist in Phase 0.
