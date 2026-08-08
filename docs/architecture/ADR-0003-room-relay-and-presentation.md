# ADR-0003: Local Room Stream, Ephemeral Relay, and Filtered Presentation

## Status

Proposed

## Context

Phase 2 must connect browser players to a locally canonical campaign without moving mechanical authority to the browser, appliance composition service, or Cloudflare relay. Participant identity, stable character seats, delivery connections, room history, and campaign mechanics have different lifetimes and visibility.

## Decision

The mini-PC owns two local append-only streams. The existing campaign stream remains the sole mechanical authority. A new independently revisioned room stream records participant, seat, guided-presentation, operational recovery, and durable mechanical-workflow linkage. A recoverable stored workflow maps one validated room command to stable internal game command and transaction identities before it invokes the public runtime command coordinator.

The appliance host composes public runtime, content, contract, and fake-provider APIs. It does not import engine or SQLite internals. The player-host is an approved participant with explicit operational authority, never the appliance service and never a privileged mechanical or secret-data audience.

Cloudflare keeps only expiring room, authentication, rate, routing, and alarm metadata. It routes validated-size opaque application frames and stores or logs no frame payload. Canonical mechanics, room history, narration, clues, flavor, and projections remain local.

Client-deliverable views are explicit public-TV, participant-private, and player-host-operational schemas. The Phase 1 host-control projection and combined server-internal view are not members of the delivery union. Seat or authority changes force a filtered snapshot.

## Consequences

- Relay replacement and delivery retry cannot change mechanics.
- A process crash can explicitly settle a pending workflow through exact coordinator retry without rerolling.
- Normal participants own at most one stable character seat; rehearsal participants may own several explicit seats while viewing one private seat at a time.
- UI, deterministic narration, and fake providers consume authoritative projections and committed facts but cannot fabricate legal actions or mechanical events.

## Acceptance

This record becomes Accepted only after migration 2, replay and workflow recovery, filtered delivery, the appliance/relay/PWA, automated multi-participant flows, and required physical-device evidence all match this decision.

Local implementation evidence as of 2026-08-08 includes checksummed migration 2, separate room replay, crash-recoverable workflows, filtered combined views, the appliance host, ephemeral relay, browser PWA, six-starter guided content, deterministic 3/4/5 encounter variants, a recorded test-owned Docker Compose migrate/start/restart, and the complete automated P2-071 browser/process harness. The record remains Proposed because the deployed-relay physical-device signoff in `docs/evidence/phase-2-manual-signoff.md` has not been run.
