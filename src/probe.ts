import type { Finding, ServerSnapshot, ToolDef } from "./types.js";

/**
 * C003 — live probe: call tools with deliberately invalid arguments (an empty
 * object where required params exist) and grade the error message quality.
 * A correct server rejects at schema validation, so no side effects occur.
 *
 * Safety: opt-in via --probe. Only tools with ≥1 required param are probed
 * (sending {} to an all-optional tool could trigger a real execution).
 */

/** Is this error message actionable for a model — does it say WHAT is wrong? */
export function isActionableError(message: string, requiredParams: string[]): boolean {
  if (!message || message.length < 8) return false;
  const lower = message.toLowerCase();
  // Names a concrete parameter?
  if (requiredParams.some((p) => lower.includes(p.toLowerCase()))) return true;
  // Speaks schema-validation language with specifics?
  if (/(required|missing|expected|must (be|have|provide)|invalid (type|value|argument|param))/i.test(message)
      && /["'`\w]{3,}/.test(message)) {
    // Reject pure generic failures
    if (/^(internal|unknown|unexpected)? ?(server )?error\.?$/i.test(message.trim())) return false;
    return true;
  }
  return false;
}

function probeTargets(tools: ToolDef[], limit: number): ToolDef[] {
  return tools
    .filter((t) => (t.inputSchema?.required?.length ?? 0) > 0)
    .slice(0, limit);
}

export interface ProbeCaller {
  callTool(name: string, args: Record<string, unknown>): Promise<{ isError?: boolean; text: string }>;
  close(): Promise<void>;
}

export async function makeStdioCaller(command: string): Promise<ProbeCaller> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
  const [cmd, ...args] = command.split(/\s+/);
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;
  const client = new Client({ name: "mcplint-probe", version: "0.1.0" });
  await client.connect(new StdioClientTransport({ command: cmd, args, env }));
  return {
    async callTool(name, callArgs) {
      try {
        const res = await client.callTool({ name, arguments: callArgs });
        const text = (res.content as { type: string; text?: string }[] | undefined)
          ?.filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("\n") ?? "";
        return { isError: Boolean(res.isError), text };
      } catch (err) {
        // Protocol-level rejection (e.g. schema validation) arrives as an error
        return { isError: true, text: err instanceof Error ? err.message : String(err) };
      }
    },
    close: () => client.close(),
  };
}

export async function runProbe(
  snapshot: ServerSnapshot,
  caller: ProbeCaller,
  limit = 5,
): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const tool of probeTargets(snapshot.tools, limit)) {
    const required = tool.inputSchema?.required ?? [];
    const res = await caller.callTool(tool.name, {});
    if (!res.isError) {
      findings.push({
        ruleId: "C004", severity: "error", category: "consist", toolName: tool.name,
        message: `"${tool.name}" ACCEPTED a call with all ${required.length} required argument(s) missing — schema is not enforced.`,
        fix: "Validate arguments against the declared schema before executing; declared 'required' must actually be required.",
      });
      continue;
    }
    if (!isActionableError(res.text, required)) {
      findings.push({
        ruleId: "C003", severity: "warn", category: "consist", toolName: tool.name,
        message: `"${tool.name}" rejects invalid calls with a non-actionable error ("${res.text.slice(0, 80)}") — the model cannot self-correct.`,
        fix: "Return errors that name the missing/invalid parameter and the expected format.",
      });
    }
  }
  return findings;
}
