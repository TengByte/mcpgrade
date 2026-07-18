#!/usr/bin/env node
/**
 * Batch-scan MCP servers and emit a markdown leaderboard.
 * Usage: node scripts/batch.mjs servers.json [outdir]
 * - Results stream to <outdir>/results.ndjson (resumable, crash-safe)
 * - Leaderboard written to <outdir>/leaderboard.md at the end
 * - Each scan runs in its own process group and is SIGKILLed on timeout,
 *   so hanging servers can't wedge the batch.
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const cli = resolve(here, "../dist/cli.js");
const outdir = resolve(process.argv[3] ?? resolve(here, ".."));
const ndjson = resolve(outdir, "results.ndjson");
const SCAN_TIMEOUT_MS = 30_000;

function scanOne(server) {
  return new Promise((resolveP) => {
    const child = spawn(
      "node",
      [cli, "--stdio", server.command, "--json"],
      { env: { ...process.env, ...(server.env ?? {}) }, detached: true, stdio: ["ignore", "pipe", "ignore"] },
    );
    let out = "";
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      try { process.kill(-child.pid, "SIGKILL"); } catch { /* already dead */ }
      resolveP(result);
    };
    const timer = setTimeout(() => finish({ failed: true, reason: "timeout" }), SCAN_TIMEOUT_MS);
    child.stdout.on("data", (c) => (out += c));
    child.on("exit", () => {
      clearTimeout(timer);
      try {
        const report = JSON.parse(out);
        finish({ report });
      } catch {
        finish({ failed: true, reason: "no-json" });
      }
    });
    child.on("error", () => { clearTimeout(timer); finish({ failed: true, reason: "spawn-error" }); });
  });
}

const servers = JSON.parse(readFileSync(process.argv[2], "utf8"));
const already = new Set();
if (existsSync(ndjson)) {
  for (const line of readFileSync(ndjson, "utf8").split("\n").filter(Boolean)) {
    already.add(JSON.parse(line).name);
  }
}

for (const s of servers) {
  if (already.has(s.name)) {
    process.stderr.write(`skip (done) ${s.name}\n`);
    continue;
  }
  process.stderr.write(`scanning ${s.name}... `);
  const res = await scanOne(s);
  let row;
  if (res.failed) {
    row = { name: s.name, failed: true, reason: res.reason };
    process.stderr.write(`FAILED (${res.reason})\n`);
  } else {
    const r = res.report;
    row = {
      name: s.name,
      score: r.totalScore,
      grade: r.grade,
      tools: r.snapshot.toolCount,
      errors: r.findings.filter((f) => f.severity === "error").length,
      warns: r.findings.filter((f) => f.severity === "warn").length,
      cats: Object.fromEntries(r.categories.map((c) => [c.category, c.score])),
    };
    process.stderr.write(`${r.grade} ${r.totalScore}\n`);
  }
  appendFileSync(ndjson, JSON.stringify(row) + "\n");
}

// Render leaderboard from all accumulated results
const rows = readFileSync(ndjson, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

const lines = [];
lines.push("# MCP Server Agent-Usability Leaderboard (mcpgrade v0.1)\n");
lines.push(`Scanned: ${new Date().toISOString().slice(0, 10)} · static rules only · point-in-time snapshot\n`);
lines.push("| Rank | Server | Grade | Score | Tools | Errors | Warnings | Desc | Schema | Naming | Token |");
lines.push("|---|---|---|---|---|---|---|---|---|---|---|");
let rank = 1;
for (const r of rows) {
  if (r.failed) {
    lines.push(`| — | ${r.name} | — | scan failed (${r.reason}) | | | | | | | |`);
    continue;
  }
  lines.push(
    `| ${rank++} | ${r.name} | **${r.grade}** | ${r.score} | ${r.tools} | ${r.errors} | ${r.warns} | ${r.cats.desc} | ${r.cats.schema} | ${r.cats.name} | ${r.cats.token} |`,
  );
}
writeFileSync(resolve(outdir, "leaderboard.md"), lines.join("\n") + "\n");
process.stderr.write(`\nleaderboard written: ${resolve(outdir, "leaderboard.md")}\n`);
