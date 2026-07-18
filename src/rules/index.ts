import type { Finding, Rule, ServerSnapshot } from "../types.js";
import { descRules } from "./desc.js";
import { nameRules } from "./name.js";
import { schemaRules } from "./schema.js";
import { consistRules } from "./consist.js";
import { checkTokenRules, DEFAULT_BUDGET, type TokenBudget } from "./token.js";

export const staticRules: Rule[] = [...descRules, ...nameRules, ...schemaRules, ...consistRules];

export interface LintOptions {
  disabledRules?: string[];
  tokenBudget?: Partial<TokenBudget>;
}

export async function runRules(
  snapshot: ServerSnapshot,
  opts: LintOptions = {},
): Promise<Finding[]> {
  const disabled = new Set(opts.disabledRules ?? []);
  const findings: Finding[] = [];
  for (const rule of staticRules) {
    if (disabled.has(rule.id)) continue;
    findings.push(...rule.check(snapshot));
  }
  const tokenFindings = await checkTokenRules(snapshot, {
    ...DEFAULT_BUDGET,
    ...opts.tokenBudget,
  });
  findings.push(...tokenFindings.filter((f) => !disabled.has(f.ruleId)));
  return findings;
}
