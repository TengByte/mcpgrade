#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { takeSnapshot } from "./introspect.js";
import { loadConfig } from "./config.js";
import { runRules, staticRules } from "./rules/index.js";
import { buildReport } from "./score.js";
import { renderJson, renderTerminal } from "./report.js";

/**
 * Parses `--header "Name: Value"` occurrences plus the MCPGRADE_HEADERS env var
 * (semicolon-separated) into a header map.
 *
 * Header values routinely carry bearer tokens, so they are only ever passed to
 * the transport — never written to the snapshot, the report, or the eval
 * fingerprint. MCP serve mode does not accept headers at all: there, the target
 * is chosen by a model, and a model should not be handing out credentials.
 */
export function parseHeaders(flags?: string[]): Record<string, string> | undefined {
  const raw = [
    ...(process.env.MCPGRADE_HEADERS?.split(";") ?? []),
    ...(flags ?? []),
  ]
    .map((h) => h.trim())
    .filter(Boolean);
  if (!raw.length) return undefined;
  const headers: Record<string, string> = {};
  for (const entry of raw) {
    const i = entry.indexOf(":");
    if (i <= 0) {
      throw new Error(`Bad header "${entry}". Expected "Name: Value".`);
    }
    headers[entry.slice(0, i).trim()] = entry.slice(i + 1).trim();
  }
  return headers;
}

const program = new Command();

program
  .name("mcpgrade")
  .description("Lighthouse for MCP servers — lint for agent usability, not just spec compliance")
  .version("0.4.0");

program
  .argument("[target]", "server URL (http/https), a local command, or a snapshot .json")
  .option("--stdio <command>", "spawn a local MCP server over stdio")
  .option("--snapshot <file>", "lint a saved tools/list JSON snapshot")
  .option(
    "--header <header>",
    'HTTP header for authenticated remote servers, e.g. --header "Authorization: Bearer $TOKEN". Repeatable. Also read from MCPGRADE_HEADERS ("A: 1; B: 2").',
    (value: string, previous: string[] = []) => [...previous, value],
  )
  .option("--json", "machine-readable JSON output")
  .option("--fail-on <severity>", "exit 1 if findings at/above severity exist (error|warn|info)")
  .option("--disable <rules>", "comma-separated rule IDs to disable")
  .option("--config <file>", "path to .mcpgraderc.json")
  .option("--probe", "live-probe error quality: call tools with invalid args (stdio targets only)")
  .option("--eval", "run LLM-powered tool-selection eval (needs ANTHROPIC_API_KEY)")
  .option("--eval-model <model>", "model for --eval (default: claude-haiku-4-5-20251001)")
  .option("--eval-base-url <url>", "OpenAI-compatible endpoint (DeepSeek/Qwen/OpenRouter/...); key via MCPLINT_EVAL_API_KEY or OPENAI_API_KEY")
  .option("--eval-mock", "run eval with the offline mock client (for testing the harness)")
  .action(async (target: string | undefined, opts) => {
    try {
      const config = await loadConfig(opts.config);
      const snapshot = await takeSnapshot({
        target,
        stdio: opts.stdio,
        snapshot: opts.snapshot,
        headers: parseHeaders(opts.header),
      });
      const disabled = [
        ...(config.disable ?? []),
        ...(opts.disable?.split(",").map((s: string) => s.trim()) ?? []),
      ];
      const findings = await runRules(snapshot, {
        disabledRules: disabled,
        tokenBudget: config.tokenBudget,
      });
      if (opts.probe) {
        const stdioCmd = opts.stdio ?? (target && !/^https?:\/\//.test(target) && !target.endsWith(".json") ? target : null);
        if (!stdioCmd) throw new Error("--probe currently requires a stdio target");
        const { makeStdioCaller, runProbe } = await import("./probe.js");
        const caller = await makeStdioCaller(stdioCmd);
        try {
          findings.push(...(await runProbe(snapshot, caller)));
        } finally {
          await caller.close();
        }
      }
      const report = buildReport(snapshot, findings);
      console.log(opts.json ? renderJson(report) : renderTerminal(report));

      if (opts.eval || opts.evalMock) {
        const { runEval } = await import("./eval/runner.js");
        const { renderEval } = await import("./eval/report.js");
        const { anthropicClient, mockClient, openaiCompatClient } = await import("./eval/client.js");
        const client = opts.evalMock
          ? mockClient()
          : opts.evalBaseUrl
            ? openaiCompatClient({
                baseUrl: opts.evalBaseUrl,
                apiKey: process.env.MCPLINT_EVAL_API_KEY ?? process.env.OPENAI_API_KEY ?? (() => {
                  throw new Error("--eval-base-url needs MCPLINT_EVAL_API_KEY (or OPENAI_API_KEY)");
                })(),
                model: opts.evalModel ?? (() => {
                  throw new Error("--eval-base-url needs --eval-model (e.g. deepseek-chat)");
                })(),
              })
            : anthropicClient({
                apiKey: process.env.ANTHROPIC_API_KEY ?? (() => {
                  throw new Error("--eval needs ANTHROPIC_API_KEY (or use --eval-mock / --eval-base-url)");
                })(),
                model: opts.evalModel,
              });
        const evalReport = await runEval(snapshot, {
          client,
          tasksPerTool: 3,
          distractors: 2,
        });
        console.log(opts.json ? JSON.stringify(evalReport, null, 2) : renderEval(evalReport));
        if (client.usage && (client.usage.inputTokens || client.usage.outputTokens)) {
          console.log(
            `  tokens: ${client.usage.inputTokens} in / ${client.usage.outputTokens} out`,
          );
        }
      }
      if (opts.failOn) {
        const order = ["info", "warn", "error"];
        const min = order.indexOf(opts.failOn);
        if (min === -1) throw new Error(`--fail-on must be one of: ${order.join(", ")}`);
        const hit = report.findings.some((f) => order.indexOf(f.severity) >= min);
        process.exit(hit ? 1 : 0);
      }
    } catch (err) {
      console.error(chalk.red(`mcpgrade: ${err instanceof Error ? err.message : err}`));
      process.exit(2);
    }
  });

program
  .command("serve")
  .description("run mcpgrade as an MCP server so an agent can grade other servers")
  .action(async () => {
    const { serve } = await import("./serve.js");
    await serve();
  });

program
  .command("rules")
  .description("list all rules")
  .action(() => {
    for (const r of staticRules) {
      console.log(`${r.id}  ${r.severity.padEnd(5)}  ${r.title}`);
    }
    console.log("T001  error  Tool catalog total token cost over budget");
    console.log("T002  warn   Single tool schema token cost over budget");
    console.log("T003  warn   Repeated boilerplate across descriptions");
    console.log("T004  info   Too many tools in one server");
    console.log("C003  warn   Non-actionable error messages (--probe)");
    console.log("C004  error  Schema not enforced (--probe)");
  });

program.parseAsync();
