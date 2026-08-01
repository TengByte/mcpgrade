#!/usr/bin/env node
/** Regenerates src/rule-docs.ts from docs/rules.md. Run after editing the docs. */
import { readFileSync, writeFileSync } from "node:fs";

const txt = readFileSync("docs/rules.md", "utf8");
const catOf = { D: "descriptions", N: "naming", S: "schema", T: "token-cost", C: "consistency" };
const re = /### (\w\d{3}) · (\w+) · ([^\n]+)\n([\s\S]*?)(?=\n### |\n## |$)/g;
const out = {};
for (const [, rid, sev, title, body] of txt.matchAll(re)) {
  const flat = body.trim().split(/\s+/).join(" ");
  const idx = flat.search(/\*\*Bad:\*\*|(?<![\w])Bad:/);
  const why = (idx === -1 ? flat : flat.slice(0, idx)).trim();
  const fix = idx === -1 ? null : flat.slice(idx).trim();
  out[rid] = { title: title.trim(), severity: sev, category: catOf[rid[0]], why, fix };
}
const header = `/**
 * Rule documentation — single source of truth shared by the \`rules\` command
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

export const RULE_DOCS: Record<string, RuleDoc> = `;
writeFileSync("src/rule-docs.ts", header + JSON.stringify(out, null, 2) + ";\n");
console.log(`wrote src/rule-docs.ts (${Object.keys(out).length} rules)`);
