import { STATE_CANONICALIZATION_VERSION } from "./versions.js";

export const CANONICAL_JSON_VERSION = STATE_CANONICALIZATION_VERSION;

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return JSON.stringify(value);
    case "number":
      if (!Number.isFinite(value)) {
        throw new TypeError(
          "Canonical JSON does not permit non-finite numbers.",
        );
      }
      return JSON.stringify(value);
    case "object": {
      if (ancestors.has(value)) {
        throw new TypeError("Canonical JSON does not permit cyclic values.");
      }
      ancestors.add(value);
      try {
        if (Array.isArray(value)) {
          return `[${value
            .map((item) => {
              if (
                item === undefined ||
                typeof item === "function" ||
                typeof item === "symbol"
              ) {
                throw new TypeError(
                  "Canonical JSON arrays require explicit JSON values.",
                );
              }
              return canonicalize(item, ancestors);
            })
            .join(",")}]`;
        }
        const record = value as Record<string, unknown>;
        const properties = Object.keys(record)
          .sort()
          .map((key) => {
            const item = record[key];
            if (
              item === undefined ||
              typeof item === "function" ||
              typeof item === "symbol"
            ) {
              throw new TypeError(
                "Canonical JSON objects require explicit JSON values.",
              );
            }
            return `${JSON.stringify(key)}:${canonicalize(item, ancestors)}`;
          });
        return `{${properties.join(",")}}`;
      } finally {
        ancestors.delete(value);
      }
    }
    case "undefined":
    case "function":
    case "symbol":
    case "bigint":
      throw new TypeError(`Canonical JSON does not permit ${typeof value}.`);
  }
  throw new TypeError("Canonical JSON received an unsupported value.");
}

export function canonicalJson(value: unknown): string {
  return canonicalize(value, new Set());
}
