#!/usr/bin/env node
/**
 * Rule co-occurrence audit: for every pair of rules that fire on the same
 * (tool, parameter), report how often they co-occur and whether one rule's
 * firing set is a strict subset of the other's — i.e. an *entailment* that
 * should collapse to a single charge, versus orthogonal co-occurrence that
 * legitimately deserves two.
 *
 * Also recomputes each server's score with entailed duplicates collapsed,
 * so the prioritization impact is quantified rather than asserted.
 *
 *   node scripts/rule-overlap-audit.mjs <snapshot-or-report.json>...
 *   node scripts/rule-overlap-audit.mjs --stdio "<cmd>"    (single server)
 */
import { readFileSync } from "node:fs";
import { snapshotFromStdio, snapshotFromFile } from "../dist/introspect.js";
import { runRules } from "../dist/rules/index.js";
import { buildReport } from "../dist/score.js";

const SEVERITY_PENALTY = { error: 10, warn: 4, info: 1 };
const CATEGORY_WEIGHTS = { desc: 0.3, name: 0.15, schema: 0.3, token: 0.15, consist: 0.1 };

/** Findings are keyed by the concrete thing they point at. */
function subject(f) {
  const m = f.message.match(/[Pp]arameter "([^"]+)"/);
  return m ? `${f.toolName}::${m[1]}` : `${f.toolName}::<tool>`;
}

function collapse(findings, entailments) {
  // entailments: [[childRuleId, parentRuleId], ...] — child is entailed by parent
  const bySubject = new Map();
  for (const f of findings) {
    const k = subject(f);
    if (!bySubject.has(k)) bySubject.set(k, []);
    bySubject.get(k).push(f);
  }
  const dropped = [];
  const kept = [];
  for (const [, group] of bySubject) {
    const ids = new Set(group.map((f) => f.ruleId));
    for (const f of group) {
      const entailedBy = entailments.find(([child, parent]) => child === f.ruleId && ids.has(parent));
      if (entailedBy) dropped.push(f);
      else kept.push(f);
    }
  }
  return { kept, dropped };
}

function scoreOf(findings, toolCount) {
  const cats = Object.keys(CATEGORY_WEIGHTS);
  let total = 0;
  for (const cat of cats) {
    const penalty = findings
      .filter((f) => f.category === cat)
      .reduce((a, f) => a + SEVERITY_PENALTY[f.severity], 0);
    const s = Math.max(0, Math.round(100 * (1 - penalty / (Math.max(toolCount, 1) * 10))));
    total += s * CATEGORY_WEIGHTS[cat];
  }
  return Math.round(total);
}

const grade = (s) => (s >= 90 ? "A" : s >= 80 ? "B" : s >= 70 ? "C" : s >= 60 ? "D" : "F");

// Declared entailments to test. child entailed by parent.
// D004 (no description) entails S008 (complex param has no example) whenever the
// param is complex and has no `examples` field: a missing description cannot
// contain "e.g.".
const ENTAILMENTS = [["S008", "D004"]];

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error("usage: rule-overlap-audit.mjs <file.json|--stdio cmd>...");
  process.exit(1);
}

const pairCounts = new Map();
const rows = [];

for (let i = 0; i < targets.length; i++) {
  const t = targets[i];
  let snapshot;
  if (t === "--stdio") {
    snapshot = await snapshotFromStdio(targets[++i]);
  } else {
    const raw = JSON.parse(readFileSync(t, "utf8"));
    snapshot = raw.snapshot?.tools ? raw.snapshot : { source: t, tools: raw.tools ?? raw };
  }
  const findings = await runRules(snapshot);
  const report = buildReport(snapshot, findings);

  // pairwise co-occurrence on the same subject
  const bySubject = new Map();
  for (const f of findings) {
    const k = subject(f);
    if (!bySubject.has(k)) bySubject.set(k, new Set());
    bySubject.get(k).add(f.ruleId);
  }
  for (const [, ids] of bySubject) {
    const arr = [...ids].sort();
    for (let a = 0; a < arr.length; a++)
      for (let b = a + 1; b < arr.length; b++) {
        const key = `${arr[a]}+${arr[b]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
  }

  const { kept, dropped } = collapse(findings, ENTAILMENTS);
  const before = report.totalScore;
  const after = scoreOf(kept, snapshot.tools.length);
  rows.push({
    server: snapshot.serverName ?? snapshot.source,
    tools: snapshot.tools.length,
    findings: findings.length,
    subjects: bySubject.size,
    droppedAsEntailed: dropped.length,
    scoreBefore: before,
    gradeBefore: grade(before),
    scoreAfter: after,
    gradeAfter: grade(after),
    delta: after - before,
  });
  console.error(
    `${rows.at(-1).server}: ${before}${grade(before)} → ${after}${grade(after)} (dropped ${dropped.length})`,
  );
}

console.log(
  JSON.stringify(
    {
      auditedAt: new Date().toISOString(),
      declaredEntailments: ENTAILMENTS,
      coOccurringPairs: [...pairCounts.entries()]
        .map(([pair, count]) => ({ pair, count }))
        .sort((a, b) => b.count - a.count),
      perServer: rows,
    },
    null,
    2,
  ),
);
