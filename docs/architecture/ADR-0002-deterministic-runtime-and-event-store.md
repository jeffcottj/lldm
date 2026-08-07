# ADR-0002: Deterministic Runtime and Event Store

## Status

Accepted

## Context

Phase 0 established pure executable rules and centralized TypeBox contracts. Phase 1 added local transaction coordination and persistence capable of replaying a campaign across process restarts without moving mechanical authority into an application or database adapter.

## Decision

Add `@lldm/runtime` as the reusable impure local runtime and `@lldm/cli` as its thin scriptable application. The workspace dependency direction is:

```text
@lldm/engine  ---> @lldm/contracts <--- @lldm/content
       \                  ^                   /
        \                 |                  /
         +---------- @lldm/runtime ----------+
                         ^
                         |
                     @lldm/cli
```

The engine receives validated state, commands, content catalogs, explicit identifiers, and deterministic draw records. It decides typed domain events, and its event applier is the only mechanical state-transition function. It imports neither content nor runtime code.

The runtime coordinates command identity, optimistic revisions, deterministic randomness, event allocation, state hashing, projections, snapshots, replay, and compensating undo through injected ports. Application coordination and system ports remain independent of SQLite types. Kysely, `better-sqlite3`, migrations, connection policy, and backup filesystem work remain inside the package's private SQLite adapter.

Records that are independently stored or exchanged carry `schema_version`, including commands, events, campaign and playable state, content definitions and manifests, random-draw records, snapshots, projections, transaction results, proposals, and transport messages. Existing independently usable check and physical-disclosure records remain versioned. Nested resource, wound, zone, effect, manifest-entry, and payload fragments inherit validation from their versioned parent rather than carrying redundant versions.

Canonical history is one campaign-scoped append-only event stream. A structurally valid command commits one accepted or rejected transaction with a contiguous revision range. Identical retries return their stored transaction without re-execution; an occupied command ID with different canonical bytes is an identity collision and appends nothing. Events contain resolved facts so replay applies events without content lookup or random draws.

Campaigns pin an immutable content manifest. Simulated draws use a versioned domain-separated HMAC-SHA-256 algorithm and record reproducible evidence without exposing the campaign seed. Physical rolls commit a pending request before a separate nonce-bound result command. Mechanical state uses versioned canonical JSON and SHA-256 hashes at every transaction boundary.

SQLite is the local canonical store. Migration 1 uses foreign keys, WAL mode, full synchronous durability, a busy timeout, an immutable checksum, and verified backup-before-migrate behavior. Normal execution refuses pending or incompatible schemas rather than auto-migrating. Scene, session, and fixed-threshold snapshots are disposable validated replay accelerators with explicit full-replay fallback. Public-TV, eligible-seat-private, and host-control projections are filtered derived data, replaced atomically with each transaction and rebuilt from canonical events.

Undo appends typed compensating events for only the latest eligible state-changing transaction. It never rewrites or deletes canonical history.

The scriptable CLI composes the runtime for explicit migration, campaign, command, scenario, replay/audit, snapshot, projection, and undo operations. It is an operational and test seam, not a room application. The fresh-database Phase 1 scenario and focused failure tests verify the decisions above; deployable host behavior remains a Phase 2 concern.

## Alternatives Considered

- Put persistence in `apps/host`: rejected because the later room host should compose the same tested local runtime instead of owning canonical storage.
- Let SQLite triggers or stored procedures apply mechanics: rejected because the TypeScript engine is the sole mechanical authority.
- Recompute randomness during event replay: rejected because replay must remain possible from recorded events without seed or algorithm execution.
- Update or delete history for undo: rejected because compensation preserves auditability and replay.
- Auto-migrate on ordinary commands: rejected because explicit backup and recovery behavior is safer for local canonical campaigns.

## Consequences

- `@lldm/runtime` is impure by design, while its coordination code is testable through narrow injected ports.
- Every command, event, state, content, randomness, snapshot, and projection change must update centralized contracts and exhaustive handlers together.
- Transaction execution does more synchronous validation and projection work, favoring one local writer and clear recovery over throughput.
- Campaign seeds require local protection and redaction even though derived random evidence is canonical.
- Phase 2 can add Fastify and room delivery without moving rules or persistence into the host.

## Follow-up Boundaries

Phase 1 implements only the deterministic local mechanical/runtime vertical slice and scriptable CLI. `apps/host`, `apps/web`, `apps/relay`, providers, LLM narration, speech, generated media, room identity, and deployable services remain deferred. Rank-two paths, rank-three talents, rank-four capstones, broad character/enemy catalogs, and campaign generation also remain later work.
