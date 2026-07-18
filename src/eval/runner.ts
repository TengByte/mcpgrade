import type { ServerSnapshot } from "../types.js";
import { synthesizeTasks } from "./synthesize.js";
import { validateArgs } from "./validate.js";
import type {
  ConfusionPair,
  EvalOptions,
  EvalReport,
  TaskResult,
  ToolChoice,
} from "./types.js";

const SELECT_SYSTEM = `You are an AI agent. You are given a catalog of tools and a user request.
Pick the single best tool and arguments, or decline if no tool fits.
Respond with JSON only, exactly one of:
{"tool": "<tool_name>", "args": { ... }}
{"tool": null}`;

function parseChoice(raw: string): ToolChoice {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { toolName: null, args: null, raw };
  try {
    const obj = JSON.parse(match[0]);
    return {
      toolName: typeof obj.tool === "string" ? obj.tool : null,
      args: obj.args && typeof obj.args === "object" ? obj.args : null,
      raw,
    };
  } catch {
    return { toolName: null, args: null, raw };
  }
}

export async function runEval(
  snapshot: ServerSnapshot,
  opts: EvalOptions,
): Promise<EvalReport> {
  const tasks = await synthesizeTasks(snapshot.tools, opts);
  const catalog = JSON.stringify(
    snapshot.tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  );

  const CONCURRENCY = 8;
  const results: TaskResult[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++;
        const task = tasks[i];
        const raw = await opts.client.complete(
          SELECT_SYSTEM,
          `Tool catalog:\n${catalog}\n\nUser request: ${task.prompt}`,
        );
        const choice = parseChoice(raw);
        const selectedCorrectly = choice.toolName === task.expectedTool;
        let argsValid: boolean | null = null;
        if (selectedCorrectly && task.expectedTool) {
          const tool = snapshot.tools.find((t) => t.name === task.expectedTool)!;
          argsValid = validateArgs(tool.inputSchema, choice.args);
        }
        results[i] = { task, choice, selectedCorrectly, argsValid };
      }
    }),
  );

  // Metrics
  const total = results.length;
  const correct = results.filter((r) => r.selectedCorrectly).length;
  const distractors = results.filter((r) => r.task.kind === "distractor");
  const refusedRight = distractors.filter((r) => r.choice.toolName === null).length;
  const withArgs = results.filter((r) => r.argsValid !== null);
  const argsOk = withArgs.filter((r) => r.argsValid).length;

  const confusionMap = new Map<string, number>();
  for (const r of results) {
    if (!r.selectedCorrectly && r.task.expectedTool && r.choice.toolName) {
      const key = `${r.task.expectedTool}→${r.choice.toolName}`;
      confusionMap.set(key, (confusionMap.get(key) ?? 0) + 1);
    }
  }
  const confusions: ConfusionPair[] = [...confusionMap.entries()]
    .map(([k, count]) => {
      const [expected, got] = k.split("→");
      return { expected, got, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const perTool: EvalReport["perTool"] = {};
  for (const r of results) {
    if (!r.task.expectedTool) continue;
    const e = (perTool[r.task.expectedTool] ??= { total: 0, correct: 0 });
    e.total++;
    if (r.selectedCorrectly) e.correct++;
  }

  return {
    model: opts.client.name,
    taskCount: total,
    selectionAccuracy: total ? correct / total : 0,
    refusalCorrectness: distractors.length ? refusedRight / distractors.length : 1,
    argValidity: withArgs.length ? argsOk / withArgs.length : 1,
    confusions,
    perTool,
    results,
  };
}
