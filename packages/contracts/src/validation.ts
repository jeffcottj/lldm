import { FormatRegistry, type Static, type TSchema } from "@sinclair/typebox";
import type { ValueError } from "@sinclair/typebox/errors";
import { Value } from "@sinclair/typebox/value";

if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set(
    "date-time",
    (value) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
      Number.isFinite(Date.parse(value)),
  );
}
if (!FormatRegistry.Has("uri")) {
  FormatRegistry.Set("uri", (value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol.length > 1;
    } catch {
      return false;
    }
  });
}

export interface ValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export type ValidationResult<Value> =
  | { readonly success: true; readonly value: Value }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] };

export function validationFailure(issues: readonly ValidationIssue[]): {
  readonly success: false;
  readonly issues: readonly ValidationIssue[];
} {
  return { success: false, issues };
}

export function validateValue<Schema extends TSchema>(
  schema: Schema,
  input: unknown,
): ValidationResult<Static<Schema>> {
  const flatten = (error: ValueError): ValueError[] => [
    error,
    ...error.errors.flatMap((iterator) =>
      [...iterator].flatMap((nested) => flatten(nested)),
    ),
  ];
  const seen = new Set<string>();
  const issues = [...Value.Errors(schema, input)]
    .flatMap((error) => flatten(error))
    .map((error) => ({
      path: error.path || "$",
      code: `schema.${error.type}`,
      message: error.message,
    }))
    .filter((issue) => {
      const key = `${issue.path}\u0000${issue.code}\u0000${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  if (issues.length > 0) {
    return validationFailure(issues);
  }

  return { success: true, value: Value.Decode(schema, input) };
}
