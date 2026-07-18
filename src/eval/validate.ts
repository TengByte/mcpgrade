import type { JsonSchema } from "../types.js";

/**
 * Minimal JSON-schema argument validator: required fields, primitive types,
 * enums. Deliberately not a full validator — we measure whether the model
 * produced *plausibly correct* args, not full spec conformance.
 */
export function validateArgs(
  schema: JsonSchema | undefined,
  args: Record<string, unknown> | null,
): boolean {
  if (!schema?.properties) return args === null || Object.keys(args ?? {}).length === 0 || true;
  const a = args ?? {};
  for (const req of schema.required ?? []) {
    if (!(req in a)) return false;
  }
  for (const [key, value] of Object.entries(a)) {
    const prop = schema.properties[key];
    if (!prop) return false; // invented argument
    if (!typeMatches(prop, value)) return false;
    if (prop.enum && !prop.enum.some((e) => e === value)) return false;
  }
  return true;
}

function typeMatches(prop: JsonSchema, value: unknown): boolean {
  const t = prop.type;
  if (!t) return true;
  const types = Array.isArray(t) ? t : [t];
  return types.some((ty) => {
    switch (ty) {
      case "string": return typeof value === "string";
      case "number": return typeof value === "number";
      case "integer": return typeof value === "number" && Number.isInteger(value);
      case "boolean": return typeof value === "boolean";
      case "array": return Array.isArray(value);
      case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
      case "null": return value === null;
      default: return true;
    }
  });
}
