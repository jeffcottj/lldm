import "fake-indexeddb/auto";
import type {
  ClientDeliverableView,
  CombinedPublicTvView,
  PhysicalRollDisclosure,
} from "@lldm/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { PhysicalDisclosure } from "./components/PhysicalDisclosure.js";
import { ZoneMap } from "./components/ZoneMap.js";
import { INITIAL_CLIENT_STATE, reduceClientState } from "./state/connection.js";
import {
  clearReconnect,
  loadReconnect,
  storeReconnect,
} from "./transport/indexed-db.js";

afterEach(async () => {
  await clearReconnect("room_web_phase2_001");
});

describe("phone transport state and reconnect persistence", () => {
  it("never admits a public TV view into phone state", () => {
    const publicView = { view_kind: "public_tv" } as ClientDeliverableView;
    expect(
      reduceClientState(INITIAL_CLIENT_STATE, {
        kind: "view",
        view: publicView,
      }),
    ).toBe(INITIAL_CLIENT_STATE);
  });

  it("clears derived private state while resynchronizing", () => {
    const privateView = {
      view_kind: "participant_private",
    } as ClientDeliverableView;
    const ready = reduceClientState(INITIAL_CLIENT_STATE, {
      kind: "view",
      view: privateView,
    });
    expect(ready.phase).toBe("ready");
    const syncing = reduceClientState(ready, {
      kind: "clear_for_resync",
      message: "A revision gap was detected.",
    });
    expect(syncing).toMatchObject({
      phase: "approved_syncing",
      participant_view: null,
      player_host_view: null,
    });
    expect(
      reduceClientState(ready, {
        kind: "phase",
        phase: "reconnecting",
        message: "The relay connection dropped.",
      }),
    ).toMatchObject({
      phase: "reconnecting",
      participant_view: null,
      player_host_view: null,
    });
  });

  it("stores only reconnect routing identity and filtered cursor", async () => {
    await storeReconnect({
      room_id: "room_web_phase2_001",
      participant_id: "participant_web_phase2_001",
      connection_id: "connection_web_phase2_001",
      reconnect_token: "reconnect.token.web.phase2.001",
      expires_at: "2026-08-08T00:00:00.000Z",
      view_revision: 12,
    });
    const stored = await loadReconnect("room_web_phase2_001");
    expect(stored).toMatchObject({
      participant_id: "participant_web_phase2_001",
      view_revision: 12,
    });
    expect(Object.keys(stored ?? {}).sort()).toEqual([
      "connection_id",
      "expires_at",
      "participant_id",
      "reconnect_token",
      "room_id",
      "view_revision",
    ]);
  });
});

const disclosure: PhysicalRollDisclosure = {
  schema_version: 1,
  actor_id: "actor_web_phase2_001",
  target: 13,
  modifier_breakdown: {
    attribute: { name: "Finesse", value: 2 },
    discipline: { name: "Craft", value: 1 },
    edge: { active: true, value: 2 },
    hindrance: { active: false, value: 0 },
    situational_modifier: 0,
  },
  final_modifier: 5,
  outcome_bands: [
    { degree: "Crisis", consequence: "The locking tooth breaks." },
    { degree: "Setback", consequence: "The gate catches at a cost." },
    { degree: "Success", consequence: "The relief locks." },
    { degree: "Triumph", consequence: "The relief locks cleanly." },
  ],
  stakes: "Set the final tooth before the surge.",
  reason: "pivotal_scene_conclusion",
  eligible_roller: "seat_web_phase2_001",
  face_to_outcome: Array.from({ length: 20 }, (_, index) => ({
    face: (index + 1) as never,
    degree: index + 1 + 5 >= 13 ? ("Success" as const) : ("Setback" as const),
    consequence:
      index + 1 + 5 >= 13 ? "The relief locks." : "The gate catches at a cost.",
  })) as unknown as PhysicalRollDisclosure["face_to_outcome"],
};

describe("shared TV presentation components", () => {
  it("renders the full disclosure without the submission nonce", () => {
    const html = renderToStaticMarkup(
      <PhysicalDisclosure disclosure={disclosure} />,
    );
    expect(html).toContain("Target 13");
    expect(html).toContain("final modifier +5");
    expect(html).toContain("The locking tooth breaks");
    expect(html).toContain("<strong>20</strong>");
    expect(html).not.toContain("nonce");
  });

  it("renders authored zones, connections, objective, and actor from projection data", () => {
    const zones = [
      "gate_controls",
      "lower_causeway",
      "pump_gallery",
      "bell_chamber",
      "spillway_walk",
    ].map((name, index) => ({
      zone_id: `zone_${name}_001`,
      name: name.replaceAll("_", " "),
      capacity: 5,
      cover: "partial",
      elevation: "level",
      visibility: "open",
      hazard_tags: index === 2 ? ["rising_water"] : [],
      objective_ids: index === 0 ? ["objective_open_spillway_001"] : [],
      connections: [] as string[],
    }));
    for (let index = 0; index < zones.length - 1; index += 1) {
      const current = zones[index];
      const next = zones[index + 1];
      if (current === undefined || next === undefined)
        throw new Error("Zone fixture is incomplete.");
      current.connections.push(next.zone_id);
      next.connections.push(current.zone_id);
    }
    const view = {
      map_layout: {
        layout_id: "layout_web_phase2_001",
        zones: zones.map((zone, index) => ({
          zone_id: zone.zone_id,
          x: 5 + index * 18,
          y: 20,
          width: 15,
          height: 20,
          shape: "rect",
        })),
        connections: zones.slice(0, -1).map((zone, index) => ({
          from: zone.zone_id,
          to: zones[index + 1]?.zone_id,
        })),
      },
      mechanical: {
        payload: {
          combat: {
            active_actor_id: "actor_web_phase2_001",
            battlefield: { zones },
            participants: [
              {
                actor_id: "actor_web_phase2_001",
                zone_id: zones[0]?.zone_id,
                side: "hero",
              },
            ],
          },
        },
      },
    } as unknown as CombinedPublicTvView;
    const html = renderToStaticMarkup(<ZoneMap view={view} />);
    expect(html.match(/class="zone active"/g) ?? []).toHaveLength(1);
    expect(html.match(/class="zone"/g) ?? []).toHaveLength(4);
    expect(html.match(/class="zone-connection"/g) ?? []).toHaveLength(4);
    expect(html).toContain("open_spillway_001");
    expect(html).toContain("actor_web_phase2_001".replace("actor_", ""));
  });
});
