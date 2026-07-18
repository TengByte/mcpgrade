import type { Finding, Rule } from "../types.js";
import { schemaDepth, walkParams } from "./util.js";

const ENUM_HINT = /\b(one of|allowed values?|must be either|valid (values|options)|choose from)\b/i;

export const S001: Rule = {
  id: "S001",
  category: "schema",
  severity: "error",
  title: "Missing input schema",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      const sc = t.inputSchema;
      if (!sc || (typeof sc === "object" && !sc.properties && sc.type !== "object" && !sc.anyOf && !sc.oneOf)) {
        out.push({
          ruleId: "S001", severity: "error", category: "schema", toolName: t.name,
          message: `Tool "${t.name}" has no usable inputSchema.`,
          fix: 'Declare an object schema, even for zero-arg tools: {"type":"object","properties":{}}.',
        });
      }
    }
    return out;
  },
};

export const S002: Rule = {
  id: "S002",
  category: "schema",
  severity: "error",
  title: "Parameter has no type",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      walkParams(t.inputSchema, (name, p) => {
        if (!p.type && !p.enum && !p.anyOf && !p.oneOf && !p.allOf) {
          out.push({
            ruleId: "S002", severity: "error", category: "schema", toolName: t.name,
            message: `Parameter "${name}" of "${t.name}" has no type.`,
            fix: `Add "type" to "${name}" so the model knows what to send.`,
          });
        }
      });
    }
    return out;
  },
};

export const S003: Rule = {
  id: "S003",
  category: "schema",
  severity: "warn",
  title: "No required array declared",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      const sc = t.inputSchema;
      if (sc?.properties && Object.keys(sc.properties).length > 0 && sc.required === undefined) {
        out.push({
          ruleId: "S003", severity: "warn", category: "schema", toolName: t.name,
          message: `"${t.name}" declares parameters but no "required" array — the model must guess which are optional.`,
          fix: 'Declare "required" explicitly (an empty array is fine if all params are optional).',
        });
      }
    }
    return out;
  },
};

export const S004: Rule = {
  id: "S004",
  category: "schema",
  severity: "warn",
  title: "Overly permissive schema",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      const sc = t.inputSchema;
      if (!sc) continue;
      if (sc.additionalProperties === true) {
        out.push({
          ruleId: "S004", severity: "warn", category: "schema", toolName: t.name,
          message: `"${t.name}" allows additionalProperties — models will invent arguments.`,
          fix: "Set additionalProperties: false and declare every parameter explicitly.",
        });
      } else if (sc.type === "object" && !sc.properties && !sc.anyOf && !sc.oneOf) {
        out.push({
          ruleId: "S004", severity: "warn", category: "schema", toolName: t.name,
          message: `"${t.name}" accepts an untyped object — the model has to guess the entire payload shape.`,
          fix: "Declare properties explicitly.",
        });
      }
    }
    return out;
  },
};

export const S005: Rule = {
  id: "S005",
  category: "schema",
  severity: "warn",
  title: "Enum candidates not enumerated",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      walkParams(t.inputSchema, (name, p) => {
        if (p.description && ENUM_HINT.test(p.description) && !p.enum) {
          out.push({
            ruleId: "S005", severity: "warn", category: "schema", toolName: t.name,
            message: `Parameter "${name}" of "${t.name}" describes a fixed value set in prose but declares no enum.`,
            fix: `Move the allowed values into "enum" — schema constraints beat prose.`,
          });
        }
      });
    }
    return out;
  },
};

export const S006: Rule = {
  id: "S006",
  category: "schema",
  severity: "warn",
  title: "Schema nested too deep",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      const depth = schemaDepth(t.inputSchema);
      if (depth > 3) {
        out.push({
          ruleId: "S006", severity: "warn", category: "schema", toolName: t.name,
          message: `"${t.name}" schema nests ${depth} levels deep — deep nesting hurts argument accuracy.`,
          fix: "Flatten the schema or split the tool.",
        });
      }
    }
    return out;
  },
};

export const S007: Rule = {
  id: "S007",
  category: "schema",
  severity: "warn",
  title: "Too many parameters",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      const n = Object.keys(t.inputSchema?.properties ?? {}).length;
      if (n > 8) {
        out.push({
          ruleId: "S007", severity: "warn", category: "schema", toolName: t.name,
          message: `"${t.name}" has ${n} parameters — argument accuracy degrades past ~8.`,
          fix: "Split the tool, or group related params into a well-described object.",
        });
      }
    }
    return out;
  },
};

export const S008: Rule = {
  id: "S008",
  category: "schema",
  severity: "info",
  title: "Complex parameter has no example",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      walkParams(t.inputSchema, (name, p) => {
        const complex = p.type === "object" || p.type === "array";
        if (complex && !p.examples && !(p.description ?? "").includes("e.g.")) {
          out.push({
            ruleId: "S008", severity: "info", category: "schema", toolName: t.name,
            message: `Complex parameter "${name}" of "${t.name}" has no example.`,
            fix: `Add "examples" or an "e.g." in the description.`,
          });
        }
      });
    }
    return out;
  },
};

export const schemaRules: Rule[] = [S001, S002, S003, S004, S005, S006, S007, S008];
