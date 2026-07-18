import type { JsonSchema } from "../types.js";

export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

/** Similarity in [0,1] based on normalized edit distance. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

export function schemaDepth(schema: JsonSchema | undefined, depth = 0): number {
  if (!schema || typeof schema !== "object") return depth;
  let max = depth;
  const children: (JsonSchema | undefined)[] = [];
  if (schema.properties) children.push(...Object.values(schema.properties));
  if (schema.items) {
    children.push(...(Array.isArray(schema.items) ? schema.items : [schema.items]));
  }
  for (const arr of [schema.anyOf, schema.oneOf, schema.allOf]) {
    if (arr) children.push(...arr);
  }
  for (const child of children) {
    max = Math.max(max, schemaDepth(child, depth + 1));
  }
  return max;
}

export function namingStyle(name: string): "snake" | "camel" | "kebab" | "other" {
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(name)) return "snake";
  if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(name)) return "camel";
  if (/^[a-z0-9]+(-[a-z0-9]+)+$/.test(name)) return "kebab";
  return "other";
}

export function walkParams(
  schema: JsonSchema | undefined,
  cb: (name: string, param: JsonSchema) => void,
): void {
  if (!schema?.properties) return;
  for (const [name, param] of Object.entries(schema.properties)) {
    cb(name, param);
  }
}
