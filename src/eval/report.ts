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
  return lines.join("\n");
}
