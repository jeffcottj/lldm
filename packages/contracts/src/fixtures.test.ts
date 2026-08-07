import { describe, expect, it } from "vitest";
import type { TSchema } from "@sinclair/typebox";
import invalidFixtures from "./fixtures/invalid.json" with { type: "json" };
import validFixturesJson from "./fixtures/valid.json" with { type: "json" };
import {
  CharacterFoundationSchema,
  validateCharacterFoundation,
} from "./characters.js";
import {
  BoundedProposalSchema,
  CheckPreviewProjectionSchema,
  CheckPreviewTransportMessageSchema,
  CheckRequestSchema,
  CheckResolvedEventSchema,
  ClientCommandSchema,
  GameEventSchema,
  ImpossibleCheckRejectionSchema,
  PhysicalResolvedCheckSchema,
  PhysicalRollDisclosureSchema,
  PhysicalRollRequestedEventSchema,
  ProposeCheckProposalSchema,
  ProjectionSchema,
  ResolveCheckCommandSchema,
  SimulatedResolvedCheckSchema,
  TransportMessageSchema,
} from "./checks.js";
import { CoreTermContentDefinitionSchema } from "./core-content.js";
import { validateValue } from "./validation.js";

const validFixtures: Record<string, unknown> = validFixturesJson;

const topLevelSchemas = {
  resolve_check_command: ResolveCheckCommandSchema,
  simulated_check_resolved_event: CheckResolvedEventSchema,
  physical_check_resolved_event: CheckResolvedEventSchema,
  physical_roll_requested_event: PhysicalRollRequestedEventSchema,
  propose_check_proposal: ProposeCheckProposalSchema,
  check_preview_projection: CheckPreviewProjectionSchema,
  check_preview_transport: CheckPreviewTransportMessageSchema,
  impossible_check_rejection: ImpossibleCheckRejectionSchema,
  character_foundation: CharacterFoundationSchema,
  core_term_content_definition: CoreTermContentDefinitionSchema,
} as const;
const schemaByFixtureName: Record<string, TSchema> = topLevelSchemas;

function cloneBase(name: string): unknown {
  const fixture = validFixtures[name];
  if (fixture === undefined) throw new Error(`Unknown fixture base ${name}.`);
  return structuredClone(fixture);
}

function objectAtPath(root: unknown, path: readonly (string | number)[]) {
  let cursor = root;
  for (const segment of path.slice(0, -1)) {
    if (typeof cursor !== "object" || cursor === null) {
      throw new Error(`Fixture path stopped before ${String(segment)}.`);
    }
    cursor = (cursor as Record<string | number, unknown>)[segment];
  }
  if (typeof cursor !== "object" || cursor === null) {
    throw new Error("Fixture mutation parent is not an object.");
  }
  return cursor as Record<string | number, unknown>;
}

function mutateFixture(fixture: (typeof invalidFixtures)[number]): unknown {
  const value = cloneBase(fixture.base);
  const parent = objectAtPath(value, fixture.path);
  const key = fixture.path.at(-1);
  if (key === undefined) throw new Error("Fixture mutation path is empty.");
  if (fixture.operation === "delete") {
    delete parent[key];
  } else {
    parent[key] = "value" in fixture ? fixture.value : undefined;
  }
  return value;
}

describe("canonical JSON fixtures", () => {
  for (const [name, schema] of Object.entries(topLevelSchemas)) {
    it(`round-trips ${name}`, () => {
      const fixture = validFixtures[name];
      const roundTrip: unknown = JSON.parse(JSON.stringify(fixture));
      const result =
        name === "character_foundation"
          ? validateCharacterFoundation(roundTrip)
          : validateValue(schema, roundTrip);
      expect(result.success).toBe(true);
    });
  }

  it("contains valid nested independently serialized records", () => {
    const command = validFixturesJson.resolve_check_command;
    const simulated = validFixturesJson.simulated_check_resolved_event;
    const physical = validFixturesJson.physical_check_resolved_event;
    const disclosure = validFixturesJson.physical_roll_requested_event;
    expect(
      validateValue(CheckRequestSchema, command.payload.request).success,
    ).toBe(true);
    expect(
      validateValue(SimulatedResolvedCheckSchema, simulated.payload.result)
        .success,
    ).toBe(true);
    expect(
      validateValue(PhysicalResolvedCheckSchema, physical.payload.result)
        .success,
    ).toBe(true);
    expect(
      validateValue(PhysicalRollDisclosureSchema, disclosure.payload.disclosure)
        .success,
    ).toBe(true);
  });

  it("links command causation by campaign and transaction identity", () => {
    const command = validFixturesJson.resolve_check_command;
    const event = validFixturesJson.simulated_check_resolved_event;
    expect(event.campaign_id).toBe(command.campaign_id);
    expect(event.transaction_id).toBe(command.transaction_id);
    expect(event.caused_by_command_id).toBe(command.command_id);
  });

  it.each([
    [ClientCommandSchema, validFixturesJson.resolve_check_command],
    [GameEventSchema, validFixturesJson.simulated_check_resolved_event],
    [BoundedProposalSchema, validFixturesJson.propose_check_proposal],
    [ProjectionSchema, validFixturesJson.check_preview_projection],
    [TransportMessageSchema, validFixturesJson.check_preview_transport],
  ] as const)(
    "rejects unknown centralized union variants",
    (schema, fixture) => {
      const unknownVariant = {
        ...structuredClone(fixture),
        kind: "unknown_variant",
      };
      expect(validateValue(schema, unknownVariant).success).toBe(false);
    },
  );

  for (const fixture of invalidFixtures) {
    it(`rejects ${fixture.name} for the intended path`, () => {
      const value = mutateFixture(fixture);
      const result =
        fixture.base === "character_foundation"
          ? validateCharacterFoundation(value)
          : validateValue(
              schemaByFixtureName[fixture.base] ?? ResolveCheckCommandSchema,
              value,
            );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.issues.some(({ path }) =>
            path.includes(fixture.expected_path),
          ),
        ).toBe(true);
      }
    });
  }

  for (const [name, schema] of Object.entries(topLevelSchemas)) {
    it(`rejects a future schema version for ${name}`, () => {
      const fixture = cloneBase(name);
      const root = objectAtPath(fixture, ["schema_version"]);
      root.schema_version = 2;
      const result = validateValue(schema, fixture);
      expect(result.success).toBe(false);
    });
  }
});
