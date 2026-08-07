> Generated from executable LLDM definitions. Do not edit by hand. Run `pnpm docs:generate` to regenerate.

# LLDM Phase 1 Playable Content Reference

## Pinned manifest

- Manifest ID: `content_manifest_phase1_001`
- Manifest hash: `sha256:7663c17e9a9cb83b5ec88e096c32fe735cafdabd2bf55c1127b6b288d9ab735b`
- Canonically sorted definitions: 54
- Definition revision: every shipped Phase 1 definition is revision 1

## Rank-one archetypes

| Archetype | Guard | Signature | Narrative permission |
| --- | --- | --- | --- |
| Vanguard | 8 | Brace the Breach | Assess where a physical defense will hold or fail first. |
| Maverick | 7 | Flashcut | Recognize habits that create an exploitable moment of distraction. |
| Wayfinder | 6 | Threadline | Determine the safest practical route through visible terrain. |
| Envoy | 6 | Answering Call | Recognize the protocol and status signals of an organized group. |
| Weaver | 5 | Current Fold | Identify the visible anchor of a bounded magical effect. |
| Beacon | 6 | Guiding Cadence | Recognize who is ready to accept practical aid or direction. |

## Heritage Gifts and Upbringings

| Category | Name | Tactical rule | Narrative permission |
| --- | --- | --- | --- |
| Heritage Gift | Emberveined | Once committed to danger, carry a steady inner heat through the attempt. | Endure ordinary heat and recognize traces left by unnatural flame. |
| Heritage Gift | Galecrest | Read a sudden change in air before committing to motion. | Sense open airways, pressure changes, and an approaching hard wind. |
| Heritage Gift | Stonewake | Set your footing against an incoming force. | Recognize whether worked stone is stable, strained, or recently moved. |
| Heritage Gift | Tidekin | Keep momentum while circumstances turn around you. | Read currents and move confidently through ordinary deep water. |
| Upbringing | Archive Lantern | Cross-check a remembered detail before acting on it. | Know how public records, catalog marks, and civic archives are organized. |
| Upbringing | Bellward Raised | Hold formation when an alarm scatters everyone else. | Invoke the practical customs shared by watch crews and flood wardens. |
| Upbringing | River Caravan | Find the next useful route when the obvious one closes. | Locate a plausible trade path, ferry custom, or traveling contact. |
| Upbringing | Rooftop Garden | Turn a small reserve into timely practical help. | Identify useful cultivated plants and the communities that tend them. |

## Signature techniques and significant gear

| Category | Name | Slot | Rule |
| --- | --- | --- | --- |
| Signature | Brace the Breach | action | Spend 1 Exertion and strike a same-zone foe for 4 Impact on Success. |
| Signature | Flashcut | action | Cross an opening and deal 3 Impact to a nearby foe on Success. |
| Signature | Threadline | maneuver | Move yourself or one ally to an adjacent zone without a check. |
| Signature | Answering Call | reaction | Use a reaction to restore one nearby ally's reaction. |
| Signature | Current Fold | action | On Success, move one foe into a zone adjacent to its current position. |
| Signature | Guiding Cadence | action | Advance an objective in your zone by 2 without a check. |
| Significant gear | Ironroot Hook | action | Strike a same-zone foe for 3 Impact on Success. |
| Significant gear | Slate Compass | maneuver | Move yourself or one ally to an adjacent zone without a check. |
| Significant gear | Accord Chime | action | Advance an objective in your zone by 1 without a check. |
| Significant gear | Resonant Wick Case | action | Release a charged wick for 2 Impact against a distant foe on Success. |

An occupied narrative gear slot is bound to a pinned significant-gear definition during materialization. A paid ritual gear cost changes that exact mechanical slot from ready to spent; the original foundation text remains canonical history.

## Committed starter loadouts

| Hero | Archetype | Heritage Gift | Upbringing | Significant gear |
| --- | --- | --- | --- | --- |
| Mara Venn | Vanguard | Stonewake | Bellward Raised | Ironroot Hook |
| Sable Reed | Wayfinder | Galecrest | River Caravan | Slate Compass |
| Ilyra Quill | Envoy | Tidekin | Archive Lantern | Accord Chime |
| Oren Ash | Weaver | Emberveined | Rooftop Garden | Resonant Wick Case |

## Floodgate encounter definitions

| Kind | Name | Definition ID |
| --- | --- | --- |
| ability | Flood Pike | content_enemy_action_flood_pike_001 |
| ability | Crushing Toll | content_enemy_action_crushing_toll_001 |
| enemy | Floodworn Crew | content_enemy_floodworn_crew_001 |
| enemy | Bell-Maw Custodian | content_enemy_bellmaw_custodian_001 |
| objective | Open the Spillway | content_objective_open_spillway_001 |
| boss_overlay | Last Resonance | content_overlay_last_resonance_001 |

## Non-combat vertical slice

| Kind | Name | Definition ID |
| --- | --- | --- |
| challenge | The Floodgate Sequence | content_challenge_floodgate_sequence_001 |
| social_profile | Gatewarden Nera | content_social_gatewarden_nera_001 |
| ritual | Kindle the Echo Lantern | content_ritual_echo_lantern_001 |

The Floodgate Sequence uses Progress 4, Danger 3, and `resolved_with_cost` for a simultaneous fill. Gatewarden Nera's declared hard limit cannot be crossed by a roll. Kindle the Echo Lantern requires established fictional position, two participants, the ready Resonant Wick Case, and 1 Supply before resolution.

## Explicitly unavailable production ranks

The following production registries are empty in Phase 1:

- paths
- talents
- capstones
