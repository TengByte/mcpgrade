import type { ToolDef } from "../types.js";
import type { EvalOptions, EvalTask } from "./types.js";
import { findTwinPairs } from "./twins.js";

const toolJson = (t: ToolDef) =>
  JSON.stringify({ name: t.name, description: t.description, inputSchema: t.inputSchema }, null, 2);

/** First required parameter without an enum: a value the model would have to invent. */
function firstOmittableParam(tool: ToolDef): string | null {
  const props = tool.inputSchema?.properties ?? {};
  return (tool.inputSchema?.required ?? []).find((r) => props[r] && !props[r].enum) ?? null;
}

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

const TWIN_SYSTEM = `You generate a user request to test whether an AI agent asks a clarifying question instead of guessing.
Given TWO similar tools, write ONE realistic user request that fits BOTH tools equally well,
so that a careful agent could not tell which one the user means without asking.
Rules:
- The request must be answerable by either tool, and must contain nothing that favours one over the other.
- Include any concrete values (IDs, URLs, names) so that missing values are never the reason to ask.
- Do NOT mention either tool name.
Respond with a JSON array containing exactly one string.`;

const MISSING_PARAM_SYSTEM = `You generate a user request to test whether an AI agent asks a clarifying question instead of inventing a value.
Given ONE tool and the name of one of its required parameters, write ONE realistic user request that clearly
wants this tool but OMITS the value of that parameter entirely, so that the agent cannot fill it without asking.
Rules:
- The request must still be clearly about this tool, and must supply concrete values for every OTHER required parameter.
- Do NOT hint at, guess or placeholder the omitted value, and do not mention the parameter name.
Respond with a JSON array containing exactly one string.`;

export function parseStringArray(raw: string): string[] {
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

  const ambiguous = opts.ambiguous ?? 0;
  if (ambiguous > 0) {
    // A: near-twin. One request per confusable pair; the right move is to ask which.
    const pairs = findTwinPairs(tools, ambiguous);
    const twinPrompts = await Promise.all(
      pairs.map(async (pair) => {
        const [a, b] = pair.map((name) => tools.find((t) => t.name === name)!);
        const user = `Tool A:\n${toolJson(a)}\n\nTool B:\n${toolJson(b)}\n\nGenerate 1 request.`;
        return parseStringArray(await opts.client.complete(TWIN_SYSTEM, user))[0];
      }),
    );
    twinPrompts.forEach((prompt, i) => {
      if (!prompt) return;
      tasks.push({
        id: `t${n++}`,
        prompt,
        expectedTool: null,
        kind: "ambiguous",
        ambiguity: "near-twin",
        candidates: [...pairs[i]],
      });
    });

    // B: missing-param. Omit one required, non-enum value (an enum is guessable).
    const targets = tools
      .map((tool) => ({ tool, param: firstOmittableParam(tool) }))
      .filter((t): t is { tool: ToolDef; param: string } => t.param !== null)
      .slice(0, ambiguous);
    const missingPrompts = await Promise.all(
      targets.map(async ({ tool, param }) => {
        const user = `Tool:\n${toolJson(tool)}\n\nParameter to omit: ${param}\n\nGenerate 1 request.`;
        return parseStringArray(await opts.client.complete(MISSING_PARAM_SYSTEM, user))[0];
      }),
    );
    missingPrompts.forEach((prompt, i) => {
      if (!prompt) return;
      tasks.push({
        id: `t${n++}`,
        prompt,
        expectedTool: null,
        kind: "ambiguous",
        ambiguity: "missing-param",
        candidates: [targets[i].tool.name],
      });
    });
  }

  return tasks;
}
