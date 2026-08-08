import type { PhysicalRollDisclosure } from "@lldm/contracts";

export function PhysicalDisclosure({
  disclosure,
  showFaces = true,
}: {
  readonly disclosure:
    | Omit<PhysicalRollDisclosure, "eligible_roller">
    | PhysicalRollDisclosure;
  readonly showFaces?: boolean;
}) {
  const modifiers = disclosure.modifier_breakdown;
  return (
    <section className="physical-disclosure" aria-labelledby="physical-title">
      <h2 id="physical-title">Pivotal physical d20</h2>
      <p>
        <strong>Target {disclosure.target}</strong> · final modifier{" "}
        {disclosure.final_modifier >= 0 ? "+" : ""}
        {disclosure.final_modifier}
      </p>
      <p>
        Attribute {modifiers.attribute.name}{" "}
        {modifiers.attribute.value >= 0 ? "+" : ""}
        {modifiers.attribute.value}; {modifiers.discipline.name} +
        {modifiers.discipline.value}; Edge{" "}
        {modifiers.edge.active ? "+2" : "inactive"}; Hindrance{" "}
        {modifiers.hindrance.active ? "−2" : "inactive"}; situation{" "}
        {modifiers.situational_modifier >= 0 ? "+" : ""}
        {modifiers.situational_modifier}.
      </p>
      <p>
        <strong>Stakes:</strong> {disclosure.stakes}
      </p>
      <p>
        <strong>Reason:</strong> {disclosure.reason.replaceAll("_", " ")}
      </p>
      <ul className="outcome-bands">
        {disclosure.outcome_bands.map((band) => (
          <li key={band.degree}>
            <strong>{band.degree}:</strong> {band.consequence}
          </li>
        ))}
      </ul>
      {showFaces && (
        <fieldset className="face-map" aria-label="All die faces and outcomes">
          {disclosure.face_to_outcome.map((face) => (
            <span key={face.face}>
              <strong>{face.face}</strong> {face.degree}
            </span>
          ))}
        </fieldset>
      )}
    </section>
  );
}
