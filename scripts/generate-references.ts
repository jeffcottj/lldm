import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  CharacterFoundationSchema,
  OUTCOME_DEGREES,
  STANDARD_TARGETS,
} from "@lldm/contracts";
import {
  ATTRIBUTE_METADATA,
  DISCIPLINE_METADATA,
  OUTCOME_METADATA,
  TARGET_METADATA,
} from "@lldm/content";
import {
  CORE_RULES,
  LEGAL_TOTAL_MODIFIERS,
  PHYSICAL_ROLL_REASON_PRECEDENCE,
  STARTING_ATTRIBUTE_ALLOCATION,
  STARTING_DISCIPLINE_ALLOCATION,
  enumerateOutcomeCounts,
  formatOutcomePercentage,
} from "@lldm/engine";

const GENERATED_WARNING =
  "> Generated from executable LLDM definitions. Do not edit by hand. Run `pnpm docs:generate` to regenerate.";

function markdownTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
) {
  const header = `| ${headers.join(" | ")} |`;
  const separator = `| ${headers.map(() => "---").join(" | ")} |`;
  return [
    header,
    separator,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");
}

function physicalReasonLabel(reason: string): string {
  return reason
    .split("_")
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function renderMechanicalReference(): string {
  const attributes = Object.entries(ATTRIBUTE_METADATA).map(
    ([identifier, metadata]) => [identifier, metadata.description],
  );
  const disciplines = Object.entries(DISCIPLINE_METADATA).map(
    ([identifier, metadata]) => [identifier, metadata.description],
  );
  const targets = STANDARD_TARGETS.map((target) => [
    String(target),
    TARGET_METADATA[target].description,
  ]);
  const outcomes = OUTCOME_DEGREES.map((degree) => [
    degree,
    OUTCOME_METADATA[degree].description,
  ]);
  const characterFields = Object.keys(CharacterFoundationSchema.properties)
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
    .map((field) => `- \`${field}\``)
    .join("\n");
  const reasonPrecedence = PHYSICAL_ROLL_REASON_PRECEDENCE.map(
    (reason) => `- ${physicalReasonLabel(reason)}`,
  ).join("\n");

  return `${GENERATED_WARNING}

# LLDM Phase 0 Mechanical Reference

## Core terms

### Attributes

${markdownTable(["Identifier", "Display meaning"], attributes)}

Starting ratings: \`${STARTING_ATTRIBUTE_ALLOCATION.join(", ")}\`.

### Disciplines

${markdownTable(["Identifier", "Display meaning"], disciplines)}

Starting ratings: \`${STARTING_DISCIPLINE_ALLOCATION.join(", ")}\`.

### Standard targets

${markdownTable(["Target", "Display guidance"], targets)}

## Resolution

### ${CORE_RULES.resolution_formula.title}

${CORE_RULES.resolution_formula.text}

### ${CORE_RULES.edge_and_hindrance.title}

${CORE_RULES.edge_and_hindrance.text}

### ${CORE_RULES.outcome_degrees.title}

${CORE_RULES.outcome_degrees.text}

${markdownTable(["Degree", "Display meaning"], outcomes)}

### ${CORE_RULES.natural_faces.title}

${CORE_RULES.natural_faces.text}

## Physical rolls

${CORE_RULES.physical_rolls.text}

Primary-reason precedence:

${reasonPrecedence}

${CORE_RULES.spark.text}

### ${CORE_RULES.physical_disclosure.title}

${CORE_RULES.physical_disclosure.text}

## Character foundation

${CORE_RULES.starting_allocations.text}

The version-1 \`character_foundation\` record contains these canonical fields:

${characterFields}

The record is a foundation, not a playable character state. Heritage Gift, Upbringing, and archetype values are opaque future-content references. Paths, option effects, advancement, resources, combat statistics, and complete catalogs are deferred beyond Phase 0. Narrative text fields do not grant mechanical bonuses.
`;
}

export function renderProbabilityReport(): string {
  const rows = STANDARD_TARGETS.flatMap((target) =>
    LEGAL_TOTAL_MODIFIERS.map((modifier) => {
      const counts = enumerateOutcomeCounts(target, modifier);
      return [
        String(target),
        modifier >= 0 ? `+${modifier}` : String(modifier),
        ...OUTCOME_DEGREES.map(
          (degree) =>
            `${counts[degree]} (${formatOutcomePercentage(counts[degree])})`,
        ),
      ];
    }),
  );

  return `${GENERATED_WARNING}

# LLDM Phase 0 Probability Report

Each row directly enumerates all twenty d20 faces through the authoritative resolution function. Counts are exact integers out of 20; percentages use five percentage points per face.

${markdownTable(["Target", "Modifier", ...OUTCOME_DEGREES], rows)}

Natural 1 downgrades and natural 20 upgrades, including end-degree clamping, are already included in every row.
`;
}

const outputs = [
  {
    path: "docs/generated/mechanical-reference.md",
    contents: renderMechanicalReference(),
  },
  {
    path: "docs/generated/probability-report.md",
    contents: renderProbabilityReport(),
  },
] as const;

async function checkOutput(path: string, expected: string): Promise<boolean> {
  let actual: string;
  try {
    actual = await readFile(path, "utf8");
  } catch {
    console.error(`${path} is missing; run pnpm docs:generate.`);
    return false;
  }
  if (actual === expected) return true;

  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const difference = expectedLines.findIndex(
    (line, index) => line !== actualLines[index],
  );
  console.error(
    `${path} is stale at line ${difference + 1}.\n- committed: ${actualLines[difference] ?? "<missing>"}\n+ generated: ${expectedLines[difference] ?? "<missing>"}`,
  );
  return false;
}

if (process.argv.includes("--check")) {
  const checks = await Promise.all(
    outputs.map(({ path, contents }) => checkOutput(path, contents)),
  );
  if (checks.some((matches) => !matches)) process.exitCode = 1;
} else {
  await mkdir("docs/generated", { recursive: true });
  await Promise.all(
    outputs.map(({ path, contents }) => writeFile(path, contents, "utf8")),
  );
}
