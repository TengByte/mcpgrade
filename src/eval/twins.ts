import type { ToolDef } from "../types.js";
import { jaccard, similarity, wordSet } from "../rules/util.js";

/**
 * Loose "could a model confuse these two?" score in [0,1].
 *
 * Deliberately looser than lint rules N002 (name distance <=2) and C001
 * (description Jaccard >0.75): those catch near-duplicates, but real
 * collisions (search_feedback vs feedback, get_status vs agent_status) share
 * only a name token or some description vocabulary. Blend name-token overlap,
 * name edit similarity and description overlap.
 */
function confusability(a: ToolDef, b: ToolDef): number {
  const nameTokens = (n: string) => wordSet(n.replace(/([a-z0-9])([A-Z])/g, "$1 $2"));
  const nameTok = jaccard(nameTokens(a.name), nameTokens(b.name));
  const nameEdit = similarity(a.name.toLowerCase(), b.name.toLowerCase());
  const desc = jaccard(wordSet(a.description ?? ""), wordSet(b.description ?? ""));
  return 0.4 * nameTok + 0.2 * nameEdit + 0.4 * desc;
}

/**
 * Below this a pair is not a plausible twin, and the server gets no near-twin
 * task for it (a catalog of clearly distinct tools has none, which is honest).
 * Uncalibrated: chosen by fixtures, revisit against real leaderboard catalogs.
 */
export const TWIN_FLOOR = 0.3;

/** The `limit` most confusable tool-name pairs, most confusable first. */
export function findTwinPairs(tools: ToolDef[], limit: number): [string, string][] {
  const scored: { pair: [string, string]; score: number }[] = [];
  for (let i = 0; i < tools.length; i++) {
    for (let j = i + 1; j < tools.length; j++) {
      const score = confusability(tools[i], tools[j]);
      if (score >= TWIN_FLOOR) scored.push({ pair: [tools[i].name, tools[j].name], score });
    }
  }
  return scored
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((s) => s.pair);
}
