> Generated from executable LLDM definitions. Do not edit by hand. Run `pnpm docs:generate` to regenerate.

# LLDM Phase 2 Room and Guided Slice Reference

## Versioned boundaries

| Boundary | Current value |
| --- | --- |
| Serialized schema | 1 |
| Transport protocol | 1 |
| Mechanical state | 1 |
| Room state | 1 |
| SQLite migration | 2 (`phase_2_room_stream`, checksum `sha256:38b882c242fb41685ef4004239d9a3e27211f81573a4a44f5031ddb06beafb27`) |
| Mechanical manifest | `sha256:8231d8b34a1e531af298e87c360c7f43e47575a359e04777b6172951656300b7` |
| Presentation manifest | `sha256:802249ccc0aa2b8997bbba7e3ab6ddc57399de8e05ba15cb5b03db74095d689e` |

Untrusted `ClientCommand`, durable `RoomCommand`, and internal `GameCommand` are distinct serialized unions. The room stream owns people, seats, guided presentation, recovery, and workflow linkage; the campaign stream remains the sole mechanical authority. Both streams use command identity binding, canonical hashes, atomic transaction rows, and deterministic replay.

Client delivery is limited to `public_tv`, `participant_private`, and `player_host_operational`. The Phase 1 `host_control` projection and Phase 2 `server_internal` combined view are never members of the client delivery union. A missing cursor, revision gap, seat change, or authority change requires a filtered snapshot; otherwise retained deltas advance exactly one view revision.

## Relay and transport limits

| Limit | Value |
| --- | --- |
| Maximum frame | 262144 bytes |
| Connections per room | 10 |
| Player frames per minute | 120 |
| Appliance fanout frames per minute | 1200 |
| Room lifetime | 86400 seconds |

The relay stores expiring authentication, routing, sequence, acknowledgement, rate, and alarm metadata only. It does not persist application-frame payloads. Reconnect rotates `ConnectionId` while preserving approved `ParticipantId`; reconnect credentials are browser-local IndexedDB data.

## Six fixed starter heroes

| Hero | Starter ID | Archetype | Signature permission |
| --- | --- | --- | --- |
| Mara Venn | starter_loadout_mara_venn_001 | content_archetype_vanguard_001 | Set my stance at the breach and turn pressure back on its source. |
| Sable Reed | starter_loadout_sable_reed_001 | content_archetype_wayfinder_001 | Trace a forgotten route through ground that seems impassable. |
| Ilyra Quill | starter_loadout_ilyra_quill_001 | content_archetype_envoy_001 | Call an ally back into the moment with one unmistakable signal. |
| Oren Ash | starter_loadout_oren_ash_001 | content_archetype_weaver_001 | Fold a visible current until it carries danger away from an ally. |
| Kest Rel | starter_loadout_kest_rel_001 | content_archetype_maverick_001 | Cross a narrow opening before opposition can close it. |
| Nima Vale | starter_loadout_nima_vale_001 | content_archetype_beacon_001 | Set a cadence that turns scattered effort toward one objective. |

## Authored encounter variants

| Party | Variant | Enemies | Reinforcement | Objective definition |
| --- | --- | --- | --- | --- |
| 3 | party_3 | 2 | none | content_objective_open_spillway_001 (threshold 3) |
| 4 | party_4 | 3 | round_2 | content_objective_open_spillway_party4_001 (threshold 4) |
| 5 | party_5 | 4 | objective_progress_2 | content_objective_open_spillway_party5_001 (threshold 5) |

Enemy definitions and actor statistics remain pinned across party sizes. Variants change authored roster, placement, reinforcement, and objective pressure only.

## Guided Floodgate graph

| Beat | Kind | Operation | Visibility | Conclusion |
| --- | --- | --- | --- | --- |
| guided_beat_opening_001 | opening | room_choice | public | — |
| guided_beat_clue_mara_001 | private_clue | deliver_private_clue | seat_private | — |
| guided_beat_clue_sable_001 | private_clue | deliver_private_clue | seat_private | — |
| guided_beat_clue_ilyra_001 | private_clue | deliver_private_clue | seat_private | — |
| guided_beat_clue_oren_001 | private_clue | deliver_private_clue | seat_private | — |
| guided_beat_clue_kest_001 | private_clue | deliver_private_clue | seat_private | — |
| guided_beat_clue_nima_001 | private_clue | deliver_private_clue | seat_private | — |
| guided_beat_optional_spark_001 | optional_spark | resolve_check | public | — |
| guided_beat_challenge_001 | challenge | start_challenge | public | — |
| guided_beat_cost_merge_001 | merge | scene_transition | public | — |
| guided_beat_social_001 | social | establish_social | public | — |
| guided_beat_ritual_001 | ritual | start_ritual | public | — |
| guided_beat_combat_001 | combat | start_combat | public | — |
| guided_beat_physical_001 | mandatory_physical | resolve_check | public | — |
| guided_beat_conclusion_success_001 | conclusion | conclude | public | clean_success |
| guided_beat_conclusion_cost_001 | conclusion | conclude | public | success_with_cost |
| guided_beat_conclusion_withdrawal_001 | conclusion | conclude | public | withdrawal |
| guided_beat_conclusion_defeat_001 | conclusion | conclude | public | defeat |

The presentation manifest contains deterministic text and layout metadata only and is never supplied to the rules engine. Mechanical beat operations are derived as bounded, validated game commands and advance presentation only from committed outcome bands or combat outcomes. The final Floodgate lock is a mandatory disclosed physical d20; optional Spark can convert the earlier eligible check to a disclosed physical roll.
