# LLDM Phase 0 Glossary

This glossary defines the vocabulary used by the foundation. Exact values and algorithms are generated from executable definitions in the [mechanical reference](generated/mechanical-reference.md).

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

**Spark:** A player resource whose Phase 0 rule can convert an eligible unresolved check to a physical roll and grant Edge. Resource ownership and recovery state begin in Phase 1.

**Stakes:** A concrete statement of what materially changes because of a check.

**Outcome band:** One of the four disclosed outcome degrees paired with its concrete consequence for the pending check.

## Contract terms

**Command:** A validated, identified, transaction-scoped request to the authoritative rules system. Phase 0 defines an initial command contract but not command reduction.

**Event:** A validated, identified fact caused by a command at a specific index in the same transaction. Phase 0 defines initial event contracts but not event storage or replay execution.

**Transaction:** The shared identity joining a command to its ordered resulting events. Atomic reducer and storage behavior begins in Phase 1.

**Proposal:** A versioned, bounded suggestion that must pass a registered contract before authoritative code may consider it. It is not a mechanical result.

**Projection:** A versioned, revisioned view contract intended for a consumer. Phase 0 defines a preview shape but does not project campaign state.

**Content definition:** A versioned canonical record for a registered content kind. Phase 0 content definitions provide display metadata only.

**Schema version:** The integer generation of an independently serialized canonical schema. Phase 0 accepts only version 1.

**Protocol version:** The integer transport compatibility generation carried in addition to schema version. Phase 0 accepts only version 1.
