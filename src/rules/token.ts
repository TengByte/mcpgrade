import type { Finding, ServerSnapshot } from "../types.js";
import { countToolTokens } from "../tokens.js";

/**
 * Token rules need async counting, so they run through a dedicated
 * async checker instead of the sync Rule interface.
 */
export interface TokenBudget {
  totalBudget: number; // T001
  perToolBudget: number; // T002
  maxTools: number; // T004
}

export const DEFAULT_BUDGET: TokenBudget = {
  totalBudget: 8000,
  perToolBudget: 1200,
  maxTools: 25,
};

export async function checkTokenRules(
  s: ServerSnapshot,
  budget: TokenBudget = DEFAULT_BUDGET,
): Promise<Finding[]> {
  const out: Finding[] = [];
  let total = 0;
  for (const t of s.tools) {
    const n = await countToolTokens(t);
    total += n;
    if (n > budget.perToolBudget) {
      out.push({
        ruleId: "T002", severity: "warn", category: "token", toolName: t.name,
        message: `"${t.name}" costs ~${n} tokens in every request (budget: ${budget.perToolBudget}).`,
        fix: "Trim the description, flatten the schema, drop redundant boilerplate.",
      });
    }
  }
  if (total > budget.totalBudget) {
    out.push({
      ruleId: "T001", severity: "error", category: "token",
      message: `The full tool catalog costs ~${total} tokens per request (budget: ${budget.totalBudget}). Agents pay this on every single call.`,
      fix: "Reduce tool count, tighten descriptions, or split the server by domain.",
    });
  }
  // T003: repeated boilerplate — same long prefix across ≥3 descriptions
  const prefixCount = new Map<string, string[]>();
  for (const t of s.tools) {
    const d = (t.description ?? "").trim().toLowerCase();
    if (d.length < 40) continue;
    const prefix = d.slice(0, 40);
    prefixCount.set(prefix, [...(prefixCount.get(prefix) ?? []), t.name]);
  }
  for (const [, names] of prefixCount) {
    if (names.length >= 3) {
      out.push({
        ruleId: "T003", severity: "warn", category: "token",
        message: `${names.length} tools share the same 40+ char description preamble (${names.slice(0, 3).join(", ")}…) — boilerplate multiplies token cost with zero information.`,
        fix: "Strip the shared preamble; put shared context once in the server description.",
      });
      break; // one finding is enough to make the point
    }
  }

  if (s.tools.length > budget.maxTools) {
    out.push({
      ruleId: "T004", severity: "info", category: "token",
      message: `${s.tools.length} tools in one server (suggested max: ${budget.maxTools}). Big catalogs dilute tool selection accuracy.`,
      fix: "Split into multiple focused servers, or gate rarely-used tools behind a mode flag.",
    });
  }
  return out;
}
