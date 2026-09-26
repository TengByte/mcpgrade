import chalk from "chalk";
import type { EvalReport } from "./types.js";

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

function bar(x: number): string {
  const filled = Math.round(x * 20);
  const color = x >= 0.9 ? chalk.green : x >= 0.7 ? chalk.yellow : chalk.red;
  return color("█".repeat(filled).padEnd(20, "░"));
}

export function renderEval(report: EvalReport): string {
  const lines: string[] = [];
  lines.push("");
  lines.push(chalk.bold("mcpgrade --eval") + chalk.dim(` — live agent usability (model: ${report.model})`));
  lines.push(chalk.dim(`${report.taskCount} synthetic tasks`));
  lines.push("");
  const scoreColor = report.score >= 90 ? chalk.green : report.score >= 70 ? chalk.yellow : chalk.red;
  lines.push(`  Eval score  ${scoreColor(chalk.bold(`${report.score}/100`))}${chalk.dim("  (unsafe actions count double against you)")}`);
  lines.push("");
  const o = report.outcomes;
  const row = (label: string, n: number, color: (s: string) => string) =>
    lines.push(`  ${label.padEnd(24)} ${color(String(n).padStart(3))}${chalk.dim(` / ${report.taskCount}`)}`);
  row("Correct call", o["correct-call"], chalk.green);
  row("Correct refusal", o["correct-refusal"], chalk.green);
  row("Correct clarification", o["correct-clarification"], chalk.green);
  row("Missed (harmless)", o.miss, chalk.yellow);
  row("Unsafe plausible action", o["unsafe-action"], o["unsafe-action"] ? chalk.red : chalk.green);
  lines.push("");
  lines.push(`  Tool selection    ${bar(report.selectionAccuracy)} ${pct(report.selectionAccuracy)}`);
  lines.push(`  Argument validity ${bar(report.argValidity)} ${pct(report.argValidity)}`);
  lines.push(`  Refusal accuracy  ${bar(report.refusalCorrectness)} ${pct(report.refusalCorrectness)}`);
  lines.push("");
  const weak = Object.entries(report.perTool)
    .map(([name, s]) => ({ name, acc: s.correct / s.total, total: s.total }))
    .filter((t) => t.acc < 1)
    .sort((a, b) => a.acc - b.acc)
    .slice(0, 5);
  if (weak.length) {
    lines.push(chalk.bold("  Weakest tools"));
    for (const w of weak) {
      lines.push(`    ${chalk.cyan(w.name.padEnd(30))} ${pct(w.acc)} of ${w.total} tasks`);
    }
    lines.push("");
  }
  if (report.confusions.length) {
    lines.push(chalk.bold("  Top confusions") + chalk.dim(" (expected → picked)"));
    for (const c of report.confusions) {
      lines.push(`    ${chalk.cyan(c.expected)} → ${chalk.red(c.got)} ×${c.count}`);
    }
    lines.push("");
  }
  const f = report.envFingerprint;
  lines.push(chalk.dim("  run fingerprint (results are only comparable across identical fingerprints)"));
  lines.push(
    chalk.dim(
      `    catalog ${f.server.catalogHash} · ${f.server.toolCount} tools · model ${f.model.name} @ temp ${f.model.temperature ?? "provider-default"}`,
    ),
  );
  lines.push(
    chalk.dim(
      `    prompt v${f.harness.promptVersion}/${f.harness.promptHash} · serializer v${f.harness.serializerVersion} · ${f.taskPolicy.catalogPolicy} · ${f.taskPolicy.tasksPerTool}×tool +${f.taskPolicy.distractors} distractors +${f.taskPolicy.ambiguous} twin/${f.taskPolicy.ambiguous} missing-param ambiguous`,
    ),
  );
  lines.push("");
  return lines.join("\n");
}
