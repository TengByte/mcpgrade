/** A JSON-Schema-ish object as served by MCP tools/list. Kept loose on purpose. */
export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema | JsonSchema[];
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  examples?: unknown[];
  [key: string]: unknown;
}

export interface ToolDef {
  name: string;
  description?: string;
  inputSchema?: JsonSchema;
}

export interface ServerSnapshot {
  source: string; // how we got it: url, command, or file path
  serverName?: string;
  tools: ToolDef[];
}

export type Severity = "error" | "warn" | "info";
export type Category = "desc" | "name" | "schema" | "token" | "consist";

export interface Finding {
  ruleId: string;
  severity: Severity;
  category: Category;
  toolName?: string;
  message: string;
  fix: string;
}

export interface Rule {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  docsUrl?: string;
  check(snapshot: ServerSnapshot): Finding[];
}

export interface CategoryScore {
  category: Category;
  score: number; // 0-100
  findings: Finding[];
}

export interface Report {
  snapshot: { source: string; serverName?: string; toolCount: number };
  totalScore: number; // 0-100
  grade: "A" | "B" | "C" | "D" | "F";
  categories: CategoryScore[];
  findings: Finding[];
}

export const CATEGORY_WEIGHTS: Record<Category, number> = {
  desc: 0.3,
  name: 0.15,
  schema: 0.3,
  token: 0.15,
  consist: 0.1,
};

export const SEVERITY_PENALTY: Record<Severity, number> = {
  error: 10,
  warn: 4,
  info: 1,
};
