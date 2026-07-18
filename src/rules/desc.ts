import type { Finding, Rule } from "../types.js";
import { similarity, walkParams } from "./util.js";

const PLACEHOLDER = /\b(todo|tbd|fixme|lorem ipsum|my tool|test tool|placeholder|xxx)\b/i;

export const D001: Rule = {
  id: "D001",
  category: "desc",
  severity: "error",
  title: "Tool is missing a description",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      if (!t.description?.trim()) {
        out.push({
          ruleId: "D001", severity: "error", category: "desc", toolName: t.name,
          message: `Tool "${t.name}" has no description. The model has only the name to decide when to call it.`,
          fix: "Add a description stating what the tool does, when to use it, and what it returns.",
        });
      }
    }
    return out;
  },
};

export const D002: Rule = {
  id: "D002",
  category: "desc",
  severity: "error",
  title: "Description too short to be useful",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      const d = t.description?.trim();
      if (d && d.length < 30) {
        out.push({
          ruleId: "D002", severity: "error", category: "desc", toolName: t.name,
          message: `Description of "${t.name}" is only ${d.length} chars ("${d}").`,
          fix: "Expand to at least one full sentence: what it does, when to use it, what it returns.",
        });
      }
    }
    return out;
  },
};

export const D004: Rule = {
  id: "D004",
  category: "desc",
  severity: "error",
  title: "Parameter is missing a description",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      walkParams(t.inputSchema, (name, param) => {
        if (!param.description?.trim() && !param.enum) {
          out.push({
            ruleId: "D004", severity: "error", category: "desc", toolName: t.name,
            message: `Parameter "${name}" of "${t.name}" has no description.`,
            fix: `Describe what "${name}" means, its format, and give an example value.`,
          });
        }
      });
    }
    return out;
  },
};

export const D005: Rule = {
  id: "D005",
  category: "desc",
  severity: "warn",
  title: "Placeholder or dev-leftover text in description",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      if (t.description && PLACEHOLDER.test(t.description)) {
        out.push({
          ruleId: "D005", severity: "warn", category: "desc", toolName: t.name,
          message: `Description of "${t.name}" contains placeholder text.`,
          fix: "Replace placeholder text with a real description before shipping.",
        });
      }
    }
    return out;
  },
};

export const D006: Rule = {
  id: "D006",
  category: "desc",
  severity: "warn",
  title: "Multiple tools have nearly identical descriptions",
  check(s) {
    const out: Finding[] = [];
    const tools = s.tools.filter((t) => (t.description?.trim().length ?? 0) > 0);
    for (let i = 0; i < tools.length; i++) {
      for (let j = i + 1; j < tools.length; j++) {
        const a = tools[i].description!.toLowerCase();
        const b = tools[j].description!.toLowerCase();
        if (similarity(a, b) > 0.85) {
          out.push({
            ruleId: "D006", severity: "warn", category: "desc", toolName: tools[i].name,
            message: `"${tools[i].name}" and "${tools[j].name}" have nearly identical descriptions — the model cannot tell them apart.`,
            fix: "Differentiate the descriptions: state explicitly when to use one vs. the other.",
          });
        }
      }
    }
    return out;
  },
};

export const D007: Rule = {
  id: "D007",
  category: "desc",
  severity: "info",
  title: "Description doesn't state the return value",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      const d = t.description?.trim() ?? "";
      if (d.length >= 30 && !/\b(returns?|responds?|yields?|outputs?|gives back|provides|lists?)\b/i.test(d)) {
        out.push({
          ruleId: "D007", severity: "info", category: "desc", toolName: t.name,
          message: `Description of "${t.name}" doesn't say what the tool returns.`,
          fix: "Add one clause about the return value — models plan multi-step calls around it.",
        });
      }
    }
    return out;
  },
};

export const descRules: Rule[] = [D001, D002, D004, D005, D006, D007];
