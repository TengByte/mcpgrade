import type { Finding, Rule } from "../types.js";

const STOPWORDS = new Set([
  "a", "an", "the", "of", "in", "on", "to", "for", "and", "or", "with",
  "is", "are", "be", "this", "that", "it", "by", "from", "as", "at",
]);

function wordSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}

const HAS_CJK = /[一-鿿぀-ヿ가-힯]/;
const HAS_LATIN = /[a-zA-Z]{3,}/;

export const C001: Rule = {
  id: "C001",
  category: "consist",
  severity: "warn",
  title: "Tools with heavily overlapping functionality",
  check(s) {
    const out: Finding[] = [];
    const tools = s.tools.filter((t) => (t.description?.split(/\s+/).length ?? 0) >= 6);
    for (let i = 0; i < tools.length; i++) {
      const wa = wordSet(tools[i].description!);
      for (let j = i + 1; j < tools.length; j++) {
        const wb = wordSet(tools[j].description!);
        if (jaccard(wa, wb) > 0.75) {
          out.push({
            ruleId: "C001", severity: "warn", category: "consist", toolName: tools[i].name,
            message: `"${tools[i].name}" and "${tools[j].name}" describe heavily overlapping functionality — the model may pick either one at random.`,
            fix: "Merge the tools, or make each description state what the OTHER tool should be used for instead.",
          });
        }
      }
    }
    return out;
  },
};

export const C002: Rule = {
  id: "C002",
  category: "consist",
  severity: "info",
  title: "Mixed languages across tool descriptions",
  check(s) {
    const langs = new Set<string>();
    for (const t of s.tools) {
      const d = t.description ?? "";
      if (HAS_CJK.test(d)) langs.add("cjk");
      if (HAS_LATIN.test(d)) langs.add("latin");
    }
    // Mixed *within the catalog* is only a finding if some tools are
    // CJK-only and others latin-only (a bilingual description is fine).
    const cjkOnly = s.tools.some((t) => HAS_CJK.test(t.description ?? "") && !HAS_LATIN.test(t.description ?? ""));
    const latinOnly = s.tools.some((t) => HAS_LATIN.test(t.description ?? "") && !HAS_CJK.test(t.description ?? ""));
    if (cjkOnly && latinOnly) {
      return [{
        ruleId: "C002", severity: "info", category: "consist",
        message: "Some tool descriptions are in English and others in a CJK language — inconsistent language can bias tool selection.",
        fix: "Pick one language for all descriptions (English reaches the widest set of models/users).",
      }];
    }
    return [];
  },
};

export const consistRules: Rule[] = [C001, C002];
