import type { CombinedPublicTvView } from "@lldm/contracts";

export function ZoneMap({ view }: { readonly view: CombinedPublicTvView }) {
  const combat = view.mechanical.payload.combat;
  const layout = view.map_layout;
  if (combat === null || layout === null) return null;
  const zoneById = new Map(
    combat.battlefield.zones.map((zone) => [zone.zone_id, zone]),
  );
  const layoutById = new Map(layout.zones.map((zone) => [zone.zone_id, zone]));
  return (
    <section className="map-panel" aria-labelledby="map-title">
      <h2 id="map-title">Floodgate zones</h2>
      <svg
        className="zone-map"
        viewBox="0 0 100 100"
        role="img"
        aria-describedby="map-description"
      >
        <title>Named-zone tactical map</title>
        {layout.connections.map((connection) => {
          const from = layoutById.get(connection.from);
          const to = layoutById.get(connection.to);
          if (from === undefined || to === undefined) return null;
          return (
            <line
              key={`${connection.from}-${connection.to}`}
              x1={from.x + from.width / 2}
              y1={from.y + from.height / 2}
              x2={to.x + to.width / 2}
              y2={to.y + to.height / 2}
              className="zone-connection"
            />
          );
        })}
        {layout.zones.map((box) => {
          const zone = zoneById.get(box.zone_id);
          const occupants = combat.participants.filter(
            ({ zone_id }) => zone_id === box.zone_id,
          );
          const active = occupants.some(
            ({ actor_id }) => actor_id === combat.active_actor_id,
          );
          return (
            <g key={box.zone_id} className={active ? "zone active" : "zone"}>
              {box.shape === "ellipse" ? (
                <ellipse
                  cx={box.x + box.width / 2}
                  cy={box.y + box.height / 2}
                  rx={box.width / 2}
                  ry={box.height / 2}
                />
              ) : (
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  rx="2"
                />
              )}
              <text x={box.x + 2} y={box.y + 5}>
                {zone?.name ?? box.zone_id}
              </text>
              <text x={box.x + 2} y={box.y + 10} className="zone-tags">
                {[zone?.cover, zone?.elevation, zone?.visibility]
                  .filter(Boolean)
                  .join(" · ")}
              </text>
              {occupants.map((actor, index) => (
                <text
                  key={actor.actor_id}
                  x={box.x + 3}
                  y={box.y + 16 + index * 5}
                  className={
                    actor.actor_id === combat.active_actor_id
                      ? "active-token"
                      : "token"
                  }
                >
                  {actor.side === "hero" ? "◆" : "●"}{" "}
                  {actor.actor_id.replace("actor_", "")}
                </text>
              ))}
              {(zone?.objective_ids ?? []).map((objective, index) => (
                <text
                  key={objective}
                  x={box.x + 3}
                  y={box.y + box.height - 3 - index * 4}
                  className="objective"
                >
                  ◎ {objective.replace("objective_", "")}
                </text>
              ))}
            </g>
          );
        })}
      </svg>
      <div id="map-description" className="map-description">
        {combat.battlefield.zones.map((zone) => {
          const occupants = combat.participants
            .filter(({ zone_id }) => zone_id === zone.zone_id)
            .map(({ actor_id }) => actor_id.replace("actor_", ""));
          return (
            <p key={zone.zone_id}>
              <strong>{zone.name}:</strong> connects to{" "}
              {zone.connections
                .map((id) => zoneById.get(id)?.name ?? id)
                .join(", ")}
              ; {zone.cover} cover;{" "}
              {zone.hazard_tags.length > 0
                ? `hazards ${zone.hazard_tags.join(", ")}`
                : "no named hazard"}
              ; occupants {occupants.length > 0 ? occupants.join(", ") : "none"}
              .
            </p>
          );
        })}
      </div>
    </section>
  );
}
