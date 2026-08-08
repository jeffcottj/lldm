# Phase 2 Manual Device Signoff

**Status:** Not run

**Authority:** This checklist records the external P2-072 gate from `docs/plans/PHASE_2.md`. Do not mark a row Passed without observing it on the named devices and deployed relay. Do not record credentials, tokens, private clues, player flavor, physical nonces, campaign seeds, or raw payloads.

## Preconditions

- [ ] `pnpm verify` passes from the reviewed revision.
- [ ] `pnpm playwright test --project=chromium` passes.
- [ ] `docker compose -f compose.yaml build` passes.
- [ ] The appliance database is explicitly migrated and test-owned.
- [ ] The reviewed Worker/Durable Object and PWA are deployed with secrets outside the repository.
- [ ] The deployment identifier and compatibility date are recorded below without credentials.

## Safe environment record

| Field | Result |
| --- | --- |
| Reviewed revision | Not run |
| Worker deployment identifier | Not run |
| Compatibility date | Not run |
| Appliance image identifier | Not run |
| Test room-session ID | Not run |
| Test campaign ID | Not run |

## Two-phone rehearsal

Record actual device model, OS, and browser version; do not claim a generic matrix.

| Check | Result |
| --- | --- |
| Device 1 inventory | Not run |
| Device 2 inventory | Not run |
| Both phones joined through the HTTPS relay, never a LAN URL | Not run |
| Both participants were approved through the player-host flow | Not run |
| Multiple explicit hero seats were claimed and private views switched | Not run |
| Private clues remained confined to the selected authorized seat | Not run |
| Challenge, social, ritual, combat, optional Spark, and mandatory physical roll completed | Not run |
| One correction request produced the expected typed result | Not run |
| One phone reconnected and restored the filtered view | Not run |
| One host/container restart resumed explicitly without reroll or duplicate transaction | Not run |
| Supported conclusion reached; duration recorded | Not run |
| Code/database/container/Cloudflare intervention during active play | Not run |

## Formal three-to-five-phone room

Use at least three simultaneously connected physical phones in normal mode, one approved participant and one hero per phone. Include current iOS Safari or Android Chrome when available and record only what was actually tested.

| Check | Result |
| --- | --- |
| Device/browser/OS inventory | Not run |
| Setup and approval duration | Not run |
| One hero per participant; normal one-seat limit enforced | Not run |
| Each phone used only the public HTTPS PWA/relay route | Not run |
| TV remained the primary public display and voice-equivalent text surface | Not run |
| Private clue negative checks passed on TV, other phone, and player-host controls | Not run |
| One active phone disconnected and reconnected; measured recovery time recorded | Not run |
| Reaction timeout and disconnected pause were visible and recorded | Not run |
| Mandatory physical disclosure showed target, modifiers, all bands, stakes, and reason before entry | Not run |
| One supported guided conclusion completed | Not run |
| Scenario duration, command/recovery failures, accidental corrections, and intervention count recorded | Not run |
| Relay metadata expired and storage/log inspection found no routed payload | Not run |

## Canonical verification

Resolve the exact test-owned database and campaign ID before running these commands. Never use a glob, repository root, or household campaign.

```sh
pnpm lldm -- replay verify --database <test-owned-manual-database> --campaign <recorded-campaign-id>
pnpm lldm -- projection rebuild --database <test-owned-manual-database> --campaign <recorded-campaign-id>
```

| Check | Result |
| --- | --- |
| Campaign replay final revision/hash | Not run |
| Room replay final revision/hash | Not run |
| Workflow linkage has no unresolved entry | Not run |
| Projection rebuild matches delivered final views | Not run |
| Host logs contain no secrets/private text | Not run |
| Relay logs/storage contain no application payload | Not run |

## Signoff rule

P2-072 remains Blocked until every required row above is Passed. Any failure returns the owning implementation task to Pending; it is not waived in this document. ADR-0003 remains Proposed until P2-072 and the full P2-080 audit pass.
