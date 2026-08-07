import { Type, type Static } from "@sinclair/typebox";
import {
  ContentDefinitionSchema,
  type ContentDefinition,
} from "./content-definitions.js";
import { strictObject } from "./envelopes.js";
import {
  ContentDefinitionHashSchema,
  ContentManifestHashSchema,
} from "./hashes.js";
import { ContentDefinitionIdSchema, ContentManifestIdSchema } from "./ids.js";
import {
  type ValidationIssue,
  type ValidationResult,
  validateValue,
  validationFailure,
} from "./validation.js";
import {
  ContentDefinitionRevisionSchema,
  SchemaVersionSchema,
} from "./versions.js";

export const ContentManifestEntrySchema = strictObject({
  content_definition_id: ContentDefinitionIdSchema,
  definition_revision: ContentDefinitionRevisionSchema,
  kind: Type.String({
    minLength: 1,
    maxLength: 60,
    pattern: "^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$",
  }),
  definition_hash: ContentDefinitionHashSchema,
});
export const ContentManifestSchema = strictObject({
  schema_version: SchemaVersionSchema,
  content_manifest_id: ContentManifestIdSchema,
  manifest_hash: ContentManifestHashSchema,
  entries: Type.Array(ContentManifestEntrySchema, { minItems: 1 }),
});
export const HashedContentDefinitionSchema = strictObject({
  definition: ContentDefinitionSchema,
  definition_hash: ContentDefinitionHashSchema,
});

export type ContentManifestEntry = Static<typeof ContentManifestEntrySchema>;
export type ContentManifest = Static<typeof ContentManifestSchema>;
export type HashedContentDefinition = Static<
  typeof HashedContentDefinitionSchema
>;

export function validateContentManifest(
  input: unknown,
): ValidationResult<ContentManifest> {
  const structural = validateValue(ContentManifestSchema, input);
  if (!structural.success) return structural;
  const manifest = structural.value;
  const sorted = [...manifest.entries].sort(compareEntries);
  const issues: ValidationIssue[] = [];
  manifest.entries.forEach((entry, index) => {
    if (
      entry.content_definition_id !== sorted[index]?.content_definition_id ||
      entry.definition_revision !== sorted[index]?.definition_revision
    ) {
      issues.push({
        path: `$.entries[${index}]`,
        code: "manifest.unsorted_entries",
        message: "Manifest entries must use canonical ID and revision order.",
      });
    }
    const duplicate = manifest.entries.findIndex(
      (candidate, candidateIndex) =>
        candidateIndex < index &&
        candidate.content_definition_id === entry.content_definition_id,
    );
    if (duplicate >= 0) {
      issues.push({
        path: `$.entries[${index}]`,
        code: "manifest.duplicate_definition",
        message: `A manifest can pin only one revision of ${entry.content_definition_id}.`,
      });
    }
  });
  return issues.length === 0
    ? { success: true, value: manifest }
    : validationFailure(issues);
}

function compareEntries(
  left: ContentManifestEntry,
  right: ContentManifestEntry,
): number {
  const idOrder = left.content_definition_id.localeCompare(
    right.content_definition_id,
  );
  return idOrder === 0
    ? left.definition_revision - right.definition_revision
    : idOrder;
}

export function buildSortedManifestEntries(
  records: readonly HashedContentDefinition[],
): readonly ContentManifestEntry[] {
  return records
    .map(({ definition, definition_hash }) => ({
      content_definition_id: definition.content_definition_id,
      definition_revision: definition.definition_revision,
      kind: definition.kind,
      definition_hash,
    }))
    .sort(compareEntries);
}

function referencedDefinitions(
  definition: ContentDefinition,
): readonly { readonly id: string; readonly revision?: number }[] {
  switch (definition.kind) {
    case "core_term":
    case "condition":
    case "objective":
    case "challenge":
    case "social_profile":
      return [];
    case "playable_option":
      return [
        ...definition.payload.prerequisites.flatMap((prerequisite) =>
          prerequisite.kind === "rank"
            ? []
            : [
                {
                  id: prerequisite.required.content_definition_id,
                  revision: prerequisite.required.definition_revision,
                },
              ],
        ),
        ...definition.payload.granted_ability_ids.map((id) => ({ id })),
      ];
    case "ability":
      return definition.payload.effects.flatMap((effect) =>
        effect.kind === "apply_condition" || effect.kind === "mark_scene_use"
          ? [
              {
                id:
                  effect.kind === "apply_condition"
                    ? effect.condition.content_definition_id
                    : effect.ability.content_definition_id,
                revision:
                  effect.kind === "apply_condition"
                    ? effect.condition.definition_revision
                    : effect.ability.definition_revision,
              },
            ]
          : [],
      );
    case "enemy":
      return definition.payload.actions.map(({ action }) => ({
        id: action.content_definition_id,
        revision: action.definition_revision,
      }));
    case "boss_overlay":
      return [
        {
          id: definition.payload.objective.content_definition_id,
          revision: definition.payload.objective.definition_revision,
        },
      ];
    case "ritual":
      return [
        ...definition.payload.requirements.flatMap((requirement) =>
          requirement.kind === "content"
            ? [
                {
                  id: requirement.definition.content_definition_id,
                  revision: requirement.definition.definition_revision,
                },
              ]
            : [],
        ),
        ...definition.payload.costs.flatMap((cost) =>
          cost.kind === "significant_gear"
            ? [
                {
                  id: cost.definition.content_definition_id,
                  revision: cost.definition.definition_revision,
                },
              ]
            : [],
        ),
      ];
  }
}

export function validateContentCatalog(
  input: readonly unknown[],
): ValidationResult<readonly HashedContentDefinition[]> {
  const records: HashedContentDefinition[] = [];
  const issues: ValidationIssue[] = [];
  input.forEach((candidate, index) => {
    const result = validateValue(HashedContentDefinitionSchema, candidate);
    if (result.success) records.push(result.value);
    else {
      issues.push(
        ...result.issues.map((issue) => ({
          ...issue,
          path: `$[${index}]${issue.path === "$" ? "" : issue.path}`,
        })),
      );
    }
  });
  if (issues.length > 0) return validationFailure(issues);

  const byRevision = new Map<string, HashedContentDefinition>();
  records.forEach((record, index) => {
    const definition = record.definition;
    const key = `${definition.content_definition_id}@${definition.definition_revision}`;
    const existing = byRevision.get(key);
    if (existing !== undefined) {
      issues.push({
        path: `$[${index}].definition`,
        code:
          existing.definition_hash === record.definition_hash
            ? "content.duplicate_revision"
            : "content.immutable_revision_changed",
        message:
          existing.definition_hash === record.definition_hash
            ? `${key} appears more than once.`
            : `${key} has more than one definition hash.`,
      });
    } else {
      byRevision.set(key, record);
    }
  });

  const byId = new Set<string>(
    records.map(({ definition }) => definition.content_definition_id),
  );
  records.forEach(({ definition }, index) => {
    if (definition.kind === "playable_option") {
      const requiredRank = {
        heritage_gift: 1,
        upbringing: 1,
        archetype: 1,
        path: 2,
        talent: 3,
        capstone: 4,
      }[definition.payload.category];
      if (definition.payload.rank !== requiredRank) {
        issues.push({
          path: `$[${index}].definition.payload.rank`,
          code: "content.invalid_rank_availability",
          message: `${definition.payload.category} must be a rank-${requiredRank} option.`,
        });
      }
    }
    const effectCollections =
      definition.kind === "playable_option"
        ? [definition.payload.tactical_effects]
        : definition.kind === "ability" ||
            definition.kind === "condition" ||
            definition.kind === "boss_overlay"
          ? [definition.payload.effects]
          : [];
    effectCollections.flat().forEach((effect) => {
      if (effect.kind === "adjust_resource" && effect.amount === 0) {
        issues.push({
          path: `$[${index}].definition.payload`,
          code: "content.zero_resource_effect",
          message: "A resource adjustment cannot have zero tactical effect.",
        });
      }
    });
    referencedDefinitions(definition).forEach((reference) => {
      const exact =
        reference.revision === undefined
          ? byId.has(reference.id)
          : byRevision.has(`${reference.id}@${reference.revision}`);
      if (!exact) {
        issues.push({
          path: `$[${index}].definition.payload`,
          code: "content.missing_reference",
          message: `Missing content reference ${reference.id}${
            reference.revision === undefined ? "" : `@${reference.revision}`
          }.`,
        });
      }
    });
  });

  const prerequisiteGraph = new Map<string, string[]>();
  records.forEach(({ definition }) => {
    if (definition.kind !== "playable_option") return;
    prerequisiteGraph.set(
      definition.content_definition_id,
      definition.payload.prerequisites.flatMap((prerequisite) =>
        prerequisite.kind === "rank"
          ? []
          : [prerequisite.required.content_definition_id],
      ),
    );
  });
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    const cyclic = (prerequisiteGraph.get(id) ?? []).some(visit);
    visiting.delete(id);
    visited.add(id);
    return cyclic;
  };
  for (const id of prerequisiteGraph.keys()) {
    if (visit(id)) {
      issues.push({
        path: "$",
        code: "content.prerequisite_cycle",
        message: `Playable prerequisites contain a cycle involving ${id}.`,
      });
      break;
    }
  }

  return issues.length === 0
    ? { success: true, value: records }
    : validationFailure(issues);
}
