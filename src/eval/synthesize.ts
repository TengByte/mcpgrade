import type { ToolDef } from "../types.js";
import type { EvalOptions, EvalTask } from "./types.js";

const SYNTH_SYSTEM = `You generate realistic user requests to test an AI agent's tool selection.
Given ONE tool's name, description and parameter schema, produce user requests a real person would type.
Rules:
- Requests must be answerable by THIS tool alone, in a SINGLE step.
- Every request MUST embed a concrete, plausible value for EVERY required parameter
  (invent realistic IDs/handles/timestamps as needed, e.g. channel "C0123ABCDEF",
  thread ts "1712345678.123456", library "/vercel/next.js"), phrased naturally —
  the agent must never need another tool first to fill in a parameter.
- Do NOT mention the tool name or parameter names verbatim; write like a real user
  who happens to have the details at hand.
Respond with a JSON array of strings only.`;

const DISTRACTOR_SYSTEM = `You generate user requests that CANNOT be satisfied by ANY tool in the provided catalog.
They should be plausible requests in the same domain, but just outside what the tools can do.
Respond with a JSON array of strings only.`;

function parseStringArray(raw: string): string[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const arr = JSON.parse(match[0]);
    return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

export async function synthesizeTasks(
  tools: ToolDef[],
  opts: EvalOptions,
): Promise<EvalTask[]> {
  const tasks: EvalTask[] = [];
  let n = 0;

  const perTool = await Promise.all(
    tools.map(async (tool) => {
      const user = `Tool:\n${JSON.stringify(
        { name: tool.name, description: tool.description, inputSchema: tool.inputSchema },
        null,
        2,
      )}\n\nGenerate ${opts.tasksPerTool} user requests.`;
      const raw = await opts.client.complete(SYNTH_SYSTEM, user);
      return { tool, prompts: parseStringArray(raw).slice(0, opts.tasksPerTool) };
    }),
  );
  for (const { tool, prompts } of perTool) {
    for (const prompt of prompts) {
      tasks.push({
        id: `t${n++}`,
        prompt,
        expectedTool: tool.name,
        kind: "direct",
      });
    }
  }

  if (opts.distractors > 0) {
    const catalog = tools.map((t) => ({ name: t.name, description: t.description }));
    const user = `Catalog:\n${JSON.stringify(catalog, null, 2)}\n\nGenerate ${opts.distractors} out-of-scope requests.`;
    const raw = await opts.client.complete(DISTRACTOR_SYSTEM, user);
    for (const prompt of parseStringArray(raw).slice(0, opts.distractors)) {
      tasks.push({ id: `t${n++}`, prompt, expectedTool: null, kind: "distractor" });
    }
  }

  return tasks;
}
