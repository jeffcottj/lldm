import { describe, expect, it } from "vitest";
import type { TSchema } from "@sinclair/typebox";
import invalidFixtures from "./fixtures/invalid.json" with { type: "json" };
import validFixturesJson from "./fixtures/valid.json" with { type: "json" };
import {
  CharacterFoundationSchema,
  validateCharacterFoundation,
} from "./characters.js";
import {
  CheckPreviewProjectionSchema,
  CheckPreviewTransportMessageSchema,
  CheckRequestSchema,
  CheckResolvedEventSchema,
  ImpossibleCheckRejectionSchema,
  PhysicalResolvedCheckSchema,
  PhysicalRollDisclosureSchema,
  PhysicalRollRequestedEventSchema,
  ProposeCheckProposalSchema,
  ResolveCheckCommandSchema,
  SimulatedResolvedCheckSchema,
} from "./checks.js";
import {
  CommandAcceptedEventSchema,
  CommandRejectedEventSchema,
} from "./audit-events.js";
import { ClientCommandSchema } from "./commands.js";
import { ContentDefinitionSchema } from "./content-definitions.js";
import { CoreTermContentDefinitionSchema } from "./core-content.js";
import { GameEventSchema } from "./events.js";
import { ProjectionSchema } from "./projections.js";
import { BoundedProposalSchema } from "./proposals.js";
import {
  RandomDrawRecordSchema,
  validateRandomDrawRecord,
} from "./randomness.js";
import {
  CommittedTransactionRecordSchema,
  validateCommittedTransactionRecord,
} from "./transactions.js";
import { TransportMessageSchema } from "./transport.js";
import { validateValue } from "./validation.js";

const validFixtures: Record<string, unknown> = validFixturesJson;

const topLevelSchemas = {
  resolve_check_command: ResolveCheckCommandSchema,
  command_accepted_event: CommandAcceptedEventSchema,
  command_rejected_event: CommandRejectedEventSchema,
  accepted_transaction: CommittedTransactionRecordSchema,
  rejected_transaction: CommittedTransactionRecordSchema,
  random_draw_record: RandomDrawRecordSchema,
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
    const accepted = validFixturesJson.command_accepted_event;
    const event = validFixturesJson.simulated_check_resolved_event;
    const transaction = validFixturesJson.accepted_transaction;
    expect(event.campaign_id).toBe(command.campaign_id);
    expect(event.transaction_id).toBe(command.transaction_id);
    expect(event.caused_by_command_id).toBe(command.command_id);
    expect(accepted.transaction_index).toBe(0);
    expect(event.transaction_index).toBe(1);
    expect(accepted.stream_revision).toBe(transaction.first_revision);
    expect(event.stream_revision).toBe(transaction.last_revision);
    expect(transaction.event_count).toBe(2);
  });

  it("validates accepted and rejected transaction invariants", () => {
    expect(
      validateCommittedTransactionRecord(validFixtures.accepted_transaction)
        .success,
    ).toBe(true);
    expect(
      validateCommittedTransactionRecord(validFixtures.rejected_transaction)
        .success,
    ).toBe(true);

    const nonContiguous = structuredClone(
      validFixturesJson.accepted_transaction,
    );
    nonContiguous.event_count = 1;
    const rangeResult = validateCommittedTransactionRecord(nonContiguous);
    expect(rangeResult.success).toBe(false);
    if (!rangeResult.success) {
      expect(
        rangeResult.issues.some(
          ({ code }) => code === "transaction.non_contiguous_range",
        ),
      ).toBe(true);
    }

    const changedRejection = structuredClone(
      validFixturesJson.rejected_transaction,
    );
    changedRejection.post_state_hash =
      "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
    const rejectionResult =
      validateCommittedTransactionRecord(changedRejection);
    expect(rejectionResult.success).toBe(false);
    if (!rejectionResult.success) {
      expect(
        rejectionResult.issues.some(
          ({ code }) => code === "transaction.rejection_changed_state",
        ),
      ).toBe(true);
    }
  });

  it("validates random evidence ranges", () => {
    expect(
      validateRandomDrawRecord(validFixtures.random_draw_record).success,
    ).toBe(true);
    const outside = structuredClone(validFixturesJson.random_draw_record);
    outside.realized_value = 21;
    const result = validateRandomDrawRecord(outside);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some(({ code }) => code === "random.value_out_of_range"),
      ).toBe(true);
    }
  });

  it.each([
    [ClientCommandSchema, validFixturesJson.resolve_check_command],
    [GameEventSchema, validFixturesJson.simulated_check_resolved_event],
    [BoundedProposalSchema, validFixturesJson.propose_check_proposal],
    [ProjectionSchema, validFixturesJson.check_preview_projection],
    [TransportMessageSchema, validFixturesJson.check_preview_transport],
    [ContentDefinitionSchema, validFixturesJson.core_term_content_definition],
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
