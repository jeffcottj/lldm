> Generated from executable LLDM definitions. Do not edit by hand. Run `pnpm docs:generate` to regenerate.

# LLDM Phase 0 Mechanical Reference

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

The record is a foundation, not a playable character state. Heritage Gift, Upbringing, and archetype values are opaque future-content references. Paths, option effects, advancement, resources, combat statistics, and complete catalogs are deferred beyond Phase 0. Narrative text fields do not grant mechanical bonuses.
