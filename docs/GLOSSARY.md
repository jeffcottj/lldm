# LLDM Glossary

This glossary defines shared project vocabulary without duplicating authoritative mechanics. Exact values and algorithms are generated from executable definitions in the [mechanical reference](generated/mechanical-reference.md), while shipped options and encounter content are listed in the [playable content reference](generated/playable-content-reference.md).

## Rules terms

**Attribute:** One broad capability recorded on a character foundation and added to a relevant check.

**Discipline:** One learned field recorded on a character foundation and paired with an attribute for a check.

**Target:** The disclosed difficulty value that a resolved check total is compared against.

**Modifier:** A named numerical component included in a check total. The resolved record preserves every component as well as their final sum.

**Edge:** A single non-stacking favorable situational flag. It remains visible when Hindrance cancels its numerical effect.

**Hindrance:** A single non-stacking unfavorable situational flag. It remains visible when Edge cancels its numerical effect.

**Outcome degree:** One member of the ordered mechanical result set used to select a disclosed consequence.

**Crisis:** The lowest outcome degree.

**Setback:** The outcome degree above Crisis and below Success.

**Success:** The outcome degree above Setback and below Triumph.

**Triumph:** The highest outcome degree.

**Physical roll:** A pivotal check for which an eligible player rolls a physical d20 after seeing the complete disclosure.

**Spark:** A player resource that can convert an eligible unresolved pivotal check to a physical roll and grant Edge. Its expenditure is committed with the pending physical-roll request.

**Stakes:** A concrete statement of what materially changes because of a check.

**Outcome band:** One of the four disclosed outcome degrees paired with its concrete consequence for the pending check.

## Contract terms

**Command:** A versioned, validated, identified request to the authoritative rules system. Its ID permanently binds its canonical bytes, so an exact retry returns the stored transaction and conflicting reuse appends nothing.

**Event:** A versioned, validated, identified mechanical fact caused by a command at a specific index in the same transaction. Ordered events are the replay input and canonical campaign history.

**Transaction:** The atomic record joining one command to a contiguous, non-empty event range and its pre-state and post-state hashes. A transaction records an accepted, rejected, or compensating-undo outcome.

**Proposal:** A versioned, bounded suggestion that must pass a registered contract before authoritative code may consider it. It is not a mechanical result.

**Projection:** A versioned, revisioned, audience-filtered derived view for the public TV, an eligible private seat, or host control. Projections are rebuilt from canonical history and never become rules authority.

**Content definition:** An inert, versioned canonical record for a registered rules, option, ability, enemy, encounter, or non-combat kind. Definitions contain validated generic effects and bounded narrative permissions, never executable callbacks.

**Content manifest:** The immutable, canonically sorted set of exact content-definition IDs, revisions, and hashes pinned by a campaign.

**Playable character state:** The authoritative materialized mechanical record used during play. It is distinct from the narrative-facing character foundation used as creation input.

**Canonical history:** A campaign's append-only SQLite event stream. Commands and transaction boundaries prove how it was produced; snapshots and projections are replaceable derivatives.

**Snapshot:** A validated state image at a known event revision used only to accelerate replay. An invalid snapshot is reported and ignored in favor of full event replay.

**Compensating undo:** A new linked transaction whose typed inverse events reverse the latest eligible mechanical change without editing or deleting prior history.

**Random evidence:** A versioned record of a deterministic simulated draw's algorithm, seed fingerprint, command and purpose identity, requested range, result, and rejection count. It never contains the raw campaign seed.

**Schema version:** The integer generation of an independently serialized canonical schema. Phase 0 accepts only version 1.

**Protocol version:** The integer transport compatibility generation carried in addition to schema version. Phase 0 accepts only version 1.
