import type { Finding, Rule } from "../types.js";
import { levenshtein, namingStyle } from "./util.js";

const GENERIC_VERBS = /^(process|handle|do|run|execute|manage|perform)($|_|-)/i;

export const N001: Rule = {
  id: "N001",
  category: "name",
  severity: "warn",
  title: "Inconsistent naming convention across tools",
  check(s) {
    if (s.tools.length < 2) return [];
    const styles = new Map<string, string[]>();
    for (const t of s.tools) {
      const st = namingStyle(t.name);
      if (st === "other") continue;
      styles.set(st, [...(styles.get(st) ?? []), t.name]);
    }
    if (styles.size <= 1) return [];
    const desc = [...styles.entries()]
      .map(([k, v]) => `${k} (${v.length})`)
      .join(", ");
    return [{
      ruleId: "N001", severity: "warn", category: "name",
      message: `Tool names mix naming conventions: ${desc}.`,
      fix: "Pick one convention (snake_case is most common for MCP tools) and rename.",
    }];
  },
};

export const N002: Rule = {
  id: "N002",
  category: "name",
  severity: "error",
  title: "Tool names too similar — easy to confuse",
  check(s) {
    const out: Finding[] = [];
    for (let i = 0; i < s.tools.length; i++) {
      for (let j = i + 1; j < s.tools.length; j++) {
        const a = s.tools[i].name, b = s.tools[j].name;
        if (a !== b && levenshtein(a, b) <= 2 && Math.min(a.length, b.length) > 4) {
          out.push({
            ruleId: "N002", severity: "error", category: "name", toolName: a,
            message: `"${a}" and "${b}" differ by ≤2 characters — models mix these up.`,
            fix: "Rename so the distinguishing concept appears in the name (e.g. get_user_by_id vs list_users).",
          });
        }
      }
    }
    return out;
  },
};

export const N003: Rule = {
  id: "N003",
  category: "name",
  severity: "warn",
  title: "Generic verb name with no object",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      if (GENERIC_VERBS.test(t.name) && t.name.replace(/[-_]/g, "").length <= 10) {
        out.push({
          ruleId: "N003", severity: "warn", category: "name", toolName: t.name,
          message: `"${t.name}" is a generic verb — it tells the model nothing about what it operates on.`,
          fix: "Use verb_object naming: search_issues, create_invoice, delete_branch.",
        });
      }
    }
    return out;
  },
};

export const N004: Rule = {
  id: "N004",
  category: "name",
  severity: "info",
  title: "Name and description semantically disjoint",
  check(s) {
    const out: Finding[] = [];
    for (const t of s.tools) {
      const d = (t.description ?? "").toLowerCase();
      if (d.length < 30) continue; // short descriptions are D002's problem
      const tokens = t.name
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase()
        .split(/[-_\s]+/)
        .filter((w) => w.length > 3);
      if (tokens.length === 0) continue;
      const overlap = tokens.some((w) => d.includes(w.slice(0, Math.max(4, w.length - 2))));
      if (!overlap) {
        out.push({
          ruleId: "N004", severity: "info", category: "name", toolName: t.name,
          message: `No meaningful token of "${t.name}" appears in its description — one of the two is misleading.`,
          fix: "Align the name with the description (or vice versa).",
        });
      }
    }
    return out;
  },
};

export const nameRules: Rule[] = [N001, N002, N003, N004];
