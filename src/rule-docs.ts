/**
 * Rule documentation — single source of truth shared by the `rules` command
 * and MCP serve mode. Generated from docs/rules.md by scripts/gen-rule-docs.mjs.
 * Do not edit by hand.
 */
export interface RuleDoc {
  title: string;
  severity: "error" | "warn" | "info";
  category: "descriptions" | "naming" | "schema" | "token-cost" | "consistency";
  /** Why this degrades agent behaviour. */
  why: string;
  /** Concrete remedy, with examples where the docs provide them. */
  fix: string | null;
}

export const RULE_DOCS: Record<string, RuleDoc> = {
  "D001": {
    "title": "Tool is missing a description",
    "severity": "error",
    "category": "descriptions",
    "why": "The description is the model's *only* semantic signal for tool selection — the name alone forces guessing.",
    "fix": "**Bad:** `{\"name\": \"gc_run\"}` **Good:** `\"Run garbage collection on the cache. Use when memory alerts fire. Returns bytes freed.\"`"
  },
  "D002": {
    "title": "Description too short (<30 chars)",
    "severity": "error",
    "category": "descriptions",
    "why": "\"Gets a user.\" tells the model nothing about *when* to prefer this tool over `get_users`. A useful description answers: what it does, when to use it, what it returns.",
    "fix": null
  },
  "D004": {
    "title": "Parameter missing a description",
    "severity": "error",
    "category": "descriptions",
    "why": "The dominant failure in the ecosystem (132/134 errors in one popular server). Type systems know `url: string`; models need *which* URL, format, constraints. zod users: add `.describe()`.",
    "fix": "**Bad:** `\"url\": {\"type\":\"string\"}` **Good:** `\"url\": {\"type\":\"string\",\"description\":\"Full page URL incl. protocol, e.g. https://example.com/pricing\"}`"
  },
  "D005": {
    "title": "Placeholder / dev-leftover text",
    "severity": "warn",
    "category": "descriptions",
    "why": "`TODO`, `TBD`, `lorem`, `my tool` in production descriptions — ships every week.",
    "fix": null
  },
  "D006": {
    "title": "Nearly identical descriptions across tools",
    "severity": "warn",
    "category": "descriptions",
    "why": "If two descriptions are >85% similar, the model picks between them at random. State explicitly when to use one vs. the other.",
    "fix": null
  },
  "D007": {
    "title": "Description doesn't state the return value",
    "severity": "info",
    "category": "descriptions",
    "why": "Models plan multi-step calls based on what a tool yields; say what comes back.",
    "fix": null
  },
  "N001": {
    "title": "Mixed naming conventions",
    "severity": "warn",
    "category": "naming",
    "why": "`get_user` + `createInvoice` in one catalog reads as two half-finished APIs; consistency helps models generalize. snake_case is the de-facto MCP standard.",
    "fix": null
  },
  "N002": {
    "title": "Confusable tool names (edit distance ≤2)",
    "severity": "error",
    "category": "naming",
    "why": "`get_user` vs `get_users` is the classic. Models mix these up measurably — put the distinguishing concept in the name: `get_user_by_id` / `list_users`.",
    "fix": null
  },
  "N003": {
    "title": "Generic verb with no object",
    "severity": "warn",
    "category": "naming",
    "why": "`process`, `handle`, `run`, `execute` — verbs without objects tell the model nothing. Use verb_object: `search_issues`, `create_invoice`.",
    "fix": null
  },
  "N004": {
    "title": "Name and description semantically disjoint",
    "severity": "info",
    "category": "naming",
    "why": "If no meaningful token of the name appears in the description, one of the two is misleading.",
    "fix": null
  },
  "S001": {
    "title": "Missing input schema",
    "severity": "error",
    "category": "schema",
    "why": "Even zero-arg tools must declare `{\"type\":\"object\",\"properties\":{}}` — an absent schema makes argument construction pure guesswork.",
    "fix": null
  },
  "S002": {
    "title": "Parameter has no type",
    "severity": "error",
    "category": "schema",
    "why": "Untyped params get strings, numbers, or hallucinated objects at random.",
    "fix": null
  },
  "S003": {
    "title": "No `required` array",
    "severity": "warn",
    "category": "schema",
    "why": "Without it, the model must guess which params are optional. Declare it even when empty — that's information too.",
    "fix": null
  },
  "S004": {
    "title": "Overly permissive schema",
    "severity": "warn",
    "category": "schema",
    "why": "`additionalProperties: true` or a bare `type: object` invites the model to invent arguments. Close the schema; declare everything.",
    "fix": null
  },
  "S005": {
    "title": "Enum candidates not enumerated",
    "severity": "warn",
    "category": "schema",
    "why": "\"must be one of: active, inactive\" in prose is a constraint the model can violate. `\"enum\": [\"active\",\"inactive\"]` is one it can't.",
    "fix": null
  },
  "S006": {
    "title": "Schema nested >3 levels",
    "severity": "warn",
    "category": "schema",
    "why": "Argument accuracy drops with nesting depth. Flatten or split the tool.",
    "fix": null
  },
  "S007": {
    "title": "More than 8 parameters",
    "severity": "warn",
    "category": "schema",
    "why": "Same story: past ~8 params, argument quality degrades. Split the tool or group related params into one described object.",
    "fix": null
  },
  "S008": {
    "title": "Complex parameter without example",
    "severity": "info",
    "category": "schema",
    "why": "For object/array params, one example in `examples` or an \"e.g.\" in the description measurably improves argument construction.",
    "fix": null
  },
  "T001": {
    "title": "Catalog total >8k tokens",
    "severity": "error",
    "category": "token-cost",
    "why": "Agents pay your entire tools/list *on every request*. 8k tokens of schemas is a tax on every user message. Budget configurable via `.mcpgraderc.json`.",
    "fix": null
  },
  "T002": {
    "title": "Single tool >1.2k tokens",
    "severity": "warn",
    "category": "token-cost",
    "why": "One bloated schema usually means boilerplate descriptions or over-nested structures.",
    "fix": null
  },
  "T003": {
    "title": "Repeated boilerplate across descriptions",
    "severity": "warn",
    "category": "token-cost",
    "why": "The same 40+ char preamble in every description multiplies token cost for zero information gain.",
    "fix": null
  },
  "T004": {
    "title": "More than 25 tools in one server",
    "severity": "info",
    "category": "token-cost",
    "why": "Big catalogs dilute selection accuracy and burn tokens. Split by domain, or gate rare tools behind a mode.",
    "fix": null
  },
  "C001": {
    "title": "Tools with heavily overlapping functionality",
    "severity": "warn",
    "category": "consistency",
    "why": "Two tools whose descriptions share >75% of their vocabulary compete for the same intents; the model picks randomly. Merge, or cross-reference (\"for X, use tool_b instead\").",
    "fix": null
  },
  "C002": {
    "title": "Mixed languages across descriptions",
    "severity": "info",
    "category": "consistency",
    "why": "Some tools described in English, others in another language biases selection.",
    "fix": null
  },
  "C003": {
    "title": "Non-actionable error messages (`--probe`)",
    "severity": "warn",
    "category": "consistency",
    "why": "Probed live: called with deliberately invalid args (an empty object where required params exist — a correct server rejects at validation, so no side effects). \"Internal Server Error\" strands the model; \"Missing required parameter 'query'\" lets it self-correct in one turn.",
    "fix": null
  },
  "C004": {
    "title": "Schema not enforced (`--probe`)",
    "severity": "error",
    "category": "consistency",
    "why": "The server *accepted* a call missing all required arguments. Declared `required` that isn't enforced is worse than none — the model trusts it. ---",
    "fix": null
  }
};
