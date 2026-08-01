/**
 * MCP server mode: expose mcpgrade itself over the Model Context Protocol so
 * an agent can grade other MCP servers.
 *
 * Design note — this catalog is deliberately small and intention-shaped. It is
 * also graded by mcpgrade in CI (see test/serve.test.ts): a tool that scores
 * MCP servers on agent usability has no excuse for a mediocre catalog.
 */
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { takeSnapshot } from "./introspect.js";
import { runRules, staticRules } from "./rules/index.js";
import { buildReport } from "./score.js";
import { RULE_DOCS } from "./rule-docs.js";
import type { Finding, Report } from "./types.js";

/**
 * Only these executables may be spawned when a target is a local command.
 *
 * Serve mode runs inside an AI host where a model chooses the arguments, so a
 * target string is untrusted input. The CLI has no such restriction.
 */
const ALLOWED_COMMANDS = new Set([
  "npx",
  "node",
  "python",
  "python3",
  "uv",
  "uvx",
  "deno",
  "bun",
  "docker",
]);

export class TargetRejectedError extends Error {}

/** Validates a target string before it reaches the process spawner. */
export function assertTargetAllowed(target: string): void {
  const t = target.trim();
  if (!t) throw new TargetRejectedError("Target must not be empty.");
  if (/^https?:\/\//i.test(t)) return; // remote server URL
  if (t.endsWith(".json")) return; // saved snapshot
  const exe = t.split(/\s+/)[0];
  const base = exe.split("/").pop() ?? exe;
  if (!ALLOWED_COMMANDS.has(base)) {
    throw new TargetRejectedError(
      `Command "${base}" is not permitted in MCP server mode. ` +
        `Allowed: ${[...ALLOWED_COMMANDS].sort().join(", ")}. ` +
        `Use an http(s) URL, a .json snapshot, or the mcpgrade CLI (which has no restriction).`,
    );
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  desc: "descriptions",
  name: "naming",
  schema: "schema",
  token: "token-cost",
  consist: "consistency",
};

function summarize(report: Report, maxFindings: number) {
  const bySeverity = (s: Finding["severity"]) =>
    report.findings.filter((f) => f.severity === s).length;
  const ordered = [...report.findings].sort((a, b) => {
    const rank = { error: 0, warn: 1, info: 2 } as const;
    return rank[a.severity] - rank[b.severity];
  });
  return {
    server: report.snapshot.serverName ?? report.snapshot.source,
    toolCount: report.snapshot.toolCount,
    grade: report.grade,
    score: report.totalScore,
    categoryScores: Object.fromEntries(
      report.categories.map((c) => [CATEGORY_LABEL[c.category] ?? c.category, c.score]),
    ),
    findingCounts: {
      error: bySeverity("error"),
      warn: bySeverity("warn"),
      info: bySeverity("info"),
    },
    findings: ordered.slice(0, maxFindings).map((f) => ({
      ruleId: f.ruleId,
      severity: f.severity,
      tool: f.toolName,
      problem: f.message,
      fix: f.fix,
    })),
    truncated: Math.max(0, ordered.length - maxFindings),
  };
}

export function createServer(): McpServer {
  const server = new McpServer({ name: "mcpgrade", version: "0.3.0" });

  server.registerTool(
    "grade_mcp_server",
    {
      title: "Grade an MCP server",
      description:
        "Scores an MCP server on agent usability (A–F) and returns the specific defects that cost it points, each with a concrete fix. Grades description quality, schema design, tool naming, token cost and catalog consistency — the properties that determine whether a model picks the right tool and fills valid arguments, which spec-compliance checks do not measure. Returns a grade, per-category scores, finding counts by severity, and a prioritized finding list. Use this before depending on a third-party server, or after changing your own catalog.",
      inputSchema: {
        target: z
          .string()
          .describe(
            'What to grade. Three accepted forms: a remote server URL, e.g. "https://mcp.example.com/mcp"; a local launch command, e.g. "npx -y @modelcontextprotocol/server-memory"; or a path to a saved tools/list JSON snapshot, e.g. "./tools.json". Local commands must start with one of: npx, node, python, python3, uv, uvx, deno, bun, docker.',
          ),
        max_findings: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "Maximum number of findings to return, most severe first. Defaults to 20. Raise it when you intend to fix everything, e.g. 100.",
          ),
      },
    },
    async ({ target, max_findings }) => {
      assertTargetAllowed(target);
      const snapshot = await takeSnapshot({ target });
      const findings = await runRules(snapshot);
      const report = buildReport(snapshot, findings);
      const payload = summarize(report, max_findings ?? 20);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
      };
    },
  );

  server.registerTool(
    "explain_rule",
    {
      title: "Explain a grading rule",
      description:
        "Returns the full rationale for one grading rule: what it detects, why it degrades agent behaviour, and how to fix it. Use this after grade_mcp_server reports a finding you want to understand or dispute, rather than guessing what a rule ID means.",
      inputSchema: {
        rule_id: z
          .string()
          .describe(
            'The rule identifier exactly as it appears in a finding, e.g. "D004", "N002", "S008". Case-insensitive.',
          ),
      },
    },
    async ({ rule_id }) => {
      const id = rule_id.trim().toUpperCase();
      const doc = RULE_DOCS[id];
      if (!doc) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Unknown rule "${id}". Call list_grading_rules to see all rule identifiers.`,
            },
          ],
          isError: true,
        };
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ruleId: id, ...doc }, null, 2) }],
      };
    },
  );

  server.registerTool(
    "list_grading_rules",
    {
      title: "List grading rules",
      description:
        "Lists every rule mcpgrade applies, with its identifier, severity and one-line summary. Use this to see what is checked before grading, or to find the identifier of a rule to pass to explain_rule.",
      inputSchema: {
        category: z
          .enum(["all", "descriptions", "naming", "schema", "token-cost", "consistency"])
          .describe(
            'Which rules to list. Pass "all" for the complete ruleset, or one category to narrow it, e.g. "descriptions".',
          ),
      },
    },
    async ({ category }) => {
      const rows = Object.entries(RULE_DOCS)
        .map(([id, d]) => ({ ruleId: id, ...d }))
        .filter((r) => category === "all" || r.category === category)
        .sort((a, b) => a.ruleId.localeCompare(b.ruleId));
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { ruleCount: rows.length, rules: rows.map(({ why, fix, ...rest }) => rest) },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}

export async function serve(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

/** Exposed for tests: the rule ids the static engine actually implements. */
export const implementedRuleIds = staticRules.map((r) => r.id);
