> Generated from executable LLDM definitions. Do not edit by hand. Run `pnpm docs:generate` to regenerate.

# LLDM Phase 1 Mechanical Reference

## Core terms

### Attributes

| Identifier | Display meaning |
| --- | --- |
| Force | Direct strength, endurance, and physical commitment. |
| Finesse | Precision, balance, speed, and careful handling. |
| Insight | Perception, analysis, memory, and measured judgment. |
| Presence | Conviction, empathy, expression, and social bearing. |

Starting ratings: `2, 1, 1, 0`.

### Disciplines

| Identifier | Display meaning |
| --- | --- |
| Athletics | Traverse obstacles and apply practiced physical effort. |
| Subterfuge | Move unnoticed, misdirect attention, and handle covert work. |
| Craft | Build, mend, inspect, and operate made things. |
| Lore | Recall studied history, cultures, creatures, and places. |
| Vigilance | Notice danger, hidden detail, and sudden change. |
| Influence | Negotiate, reassure, command attention, and read a room. |
| Survival | Navigate wild places, track signs, and endure exposure. |
| Mysticism | Recognize and carefully engage supernatural forces. |

Starting ratings: `2, 1, 1, 1, 0, 0, 0, 0`.

### Standard targets

| Target | Display guidance |
| --- | --- |
| 10 | A consequential test with generous footing. |
| 13 | A demanding test suited to prepared adventurers. |
| 16 | A severe test that rewards strong capability. |
| 19 | An exceptional test with little room for error. |
| 22 | An extraordinary test near the edge of mortal skill. |

## Resolution

### Check formula

Add the d20 face, attribute rating, discipline rating, and normalized situational modifier; compare the total with the target.

### Edge and Hindrance

One Edge adds 2 and one Hindrance subtracts 2. Each is a flag, so neither stacks; when both apply, they remain visible and cancel.

### Outcome degrees

A target delta of -5 or less is Crisis; -4 through -1 is Setback; 0 through 4 is Success; and 5 or more is Triumph.

| Degree | Display meaning |
| --- | --- |
| Crisis | The attempt fails and the disclosed worst consequence follows. |
| Setback | The attempt falls short and the situation changes against the actor. |
| Success | The attempt achieves its disclosed aim. |
| Triumph | The attempt excels and earns its disclosed added benefit. |

### Natural faces

A natural 1 lowers the base outcome by one degree and a natural 20 raises it by one degree. The result cannot move below Crisis or above Triumph, and a natural face cannot make an impossible action possible.

## Physical rolls

Use a physical d20 for permanent death, a declared irreversible stake, a named boss transition, a pivotal scene conclusion, or an eligible Spark invocation.

Primary-reason precedence:

- Permanent Death
- Declared Irreversible Stake
- Named Boss Transition
- Pivotal Scene Conclusion
- Spark Invocation

Spending Spark converts an eligible unresolved simulated check to a physical roll and grants Edge before Edge and Hindrance cancel.

### Pre-roll disclosure

Before a physical roll, reveal the target, every modifier component, the final modifier, all four outcome consequences, the concrete stakes, the reason, the eligible roller, and the outcome for every die face.

## Simulated randomness

### Recorded simulated randomness

Routine draws use domain-separated HMAC-SHA-256 with a campaign seed, campaign and command identities, a stable purpose, and a purpose-local index. Unbiased realized values are recorded with resolved events; replay applies those facts without drawing again.

The version-1 algorithm identifier is `hmac_sha256_v1`. Its length-prefixed, big-endian framing begins with the UTF-8 domain tag `LLDM random v1`; bounded integers use 256-bit rejection sampling.

## Character foundation

Assign attribute ratings 2, 1, 1, and 0. Assign one discipline at 2, three at 1, and four at 0.

The version-1 `character_foundation` record contains these canonical fields:

- `actor_id`
- `archetype_ref`
- `attributes`
- `bond`
- `character_id`
- `disciplines`
- `display_name`
- `drive`
- `heritage_gift_ref`
- `rank`
- `record_kind`
- `schema_version`
- `signature_technique_concept`
- `significant_gear`
- `upbringing_ref`

The record is creation input, not playable state. Narrative text fields do not grant mechanical bonuses.

## Playable characters and resources

Rank-one Guard maxima are Vanguard 8, Maverick 7, Wayfinder 6, Envoy 6, Weaver 5, and Beacon 6. Every hero has 3 Exertion, one session Spark, and exactly three Wound slots. Shared Supply cannot exceed party size plus 2.

| Archetype | Rank-one Guard maximum |
| --- | --- |
| Vanguard | 8 |
| Maverick | 7 |
| Wayfinder | 6 |
| Envoy | 6 |
| Weaver | 5 |
| Beacon | 6 |

The independently versioned `playable_character_state` record contains these canonical fields:

- `character_id`
- `conditions`
- `foundation`
- `rank`
- `record_kind`
- `resolved_options`
- `resolved_significant_gear`
- `resources`
- `scene_ability_uses`
- `schema_version`
- `significant_gear`

### Significant gear

Each occupied narrative gear slot binds to one pinned significant-gear definition when the hero is materialized. Ready gear grants its declared ability. Paying a ritual gear cost changes that exact slot to spent; interruption does not restore it.

### Scene and rest recovery

A scene transition fully restores Guard and Exertion and resets scene abilities. A costly rest spends 1 shared Supply and gives those benefits to participating heroes. Neither transition heals Wounds or restores Spark. Session start restores one Spark and its one complication recovery; Supply persists.

### Ordered rank advancement

Advancement moves exactly one rank at a time. The command's expected rank names the hero's current rank; the pinned selected feature must be an eligible path at rank 2, talent at rank 3, or capstone at rank 4 with every prerequisite met.

## Combat

### Round and side flow

Heroes begin each round. Hero and enemy sides alternate; an exhausted side yields until both sides are exhausted. Then a new hero-first round restores one action, one maneuver, and one reaction to every eligible participant.

### Reaction priority

The directly affected actor receives first reaction priority, followed by heroes and then enemies in stable actor-ID order. The first used reaction closes the window; the window also closes after every eligible actor passes.

### Physical death test

Filling the third Wound requests a physical target-13 Force plus Athletics test. One eligible nearby ally may spend 1 Exertion or 1 Supply to grant Edge. Success clears the newest third Wound and leaves two Wounds; Triumph also records the permanent Scar Death’s Echo; Setback or Crisis is permanent death.

## Progress, social state, rituals, and conditions

### Progress and Danger

Every challenge definition declares its Progress maximum, Danger maximum, and tie rule. The Phase 1 example uses Progress 4, Danger 3, and resolves a simultaneous fill with a cost.

### Social stance shifts

Crisis and Setback do not change stance. Success moves one step toward the requested stance. Triumph moves at most two steps toward it. No outcome can cross a declared hard limit or compel impossible behavior.

### Ritual resolution

A ritual starts only after every declared requirement is established and every declared cost is payable. Costs are paid once in order. Success or Triumph completes the ritual; Setback or Crisis fails it; the matching definition consequence applies in either case.

### Ritual interruption

Interrupting a ritual closes it as interrupted. Paid costs remain spent, unpaid costs remain untouched, and another attempt starts a new ritual.

### Condition duration

A round condition expires at the next round transition, a scene condition at the next scene transition, and an until-removed condition only through an explicit removal effect.

Production paths, rank-three talents, rank-four capstones, broad catalogs, room applications, and generated-fiction systems remain unavailable in Phase 1.
