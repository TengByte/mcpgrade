import type { ServerSnapshot } from "../types.js";
import { buildFingerprint } from "./fingerprint.js";
import { classify, emptyCounts, scoreOutcomes } from "./outcome.js";
import { synthesizeTasks } from "./synthesize.js";
import { validateArgs } from "./validate.js";
import type {
  ConfusionPair,
  EvalOptions,
  EvalReport,
  TaskResult,
  ToolChoice,
} from "./types.js";

export const SELECT_SYSTEM = `You are an AI agent. You are given a catalog of tools and a user request.
Pick the single best tool and arguments. Decline if no tool fits the request.
If the request fits more than one tool equally well, or a required value is missing and you would have to guess it, ask one short clarifying question instead of guessing.
Respond with JSON only, exactly one of:
{"tool": "<tool_name>", "args": { ... }}
{"clarify": "<one question for the user>"}
{"tool": null}`;

/**
 * Parse the model's reply. A tool call wins over a clarification if both appear.
 *
 * `malformed` distinguishes a genuine, valid decline from a response that never
 * engaged with the contract at all — no JSON, broken JSON, or JSON with none of
 * the three recognized shapes. A decline must match `{"tool": null}` exactly:
 * any extra key (a stray `args`, an unrelated field) means the response didn't
 * actually produce one of the exact shapes the prompt asks for, so it doesn't
 * earn refusal credit — see `classify()` in outcome.ts.
 */
export function parseChoice(raw: string): ToolChoice {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { toolName: null, args: null, malformed: true, raw };
  try {
    const obj = JSON.parse(match[0]);
    const hasTool = typeof obj.tool === "string";
    const hasClarify = !hasTool && typeof obj.clarify === "string" && obj.clarify.trim().length > 0;
    const isExplicitDecline =
      !hasTool &&
      !hasClarify &&
      obj &&
      typeof obj === "object" &&
      Object.keys(obj).length === 1 &&
      "tool" in obj &&
      obj.tool === null;
    return {
      toolName: hasTool ? obj.tool : null,
      args: obj.args && typeof obj.args === "object" ? obj.args : null,
      ...(hasClarify && { clarification: obj.clarify }),
      malformed: !hasTool && !hasClarify && !isExplicitDecline,
      raw,
    };
  } catch {
    return { toolName: null, args: null, malformed: true, raw };
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
        const outcome = classify(task, choice, argsValid);
        results[i] = { task, choice, selectedCorrectly, argsValid, outcome };
      }
    }),
  );

  // Metrics
  const total = results.length;
  const outcomes = emptyCounts();
  for (const r of results) outcomes[r.outcome]++;
  // Legacy accuracy is over clear in-scope tasks only: distractors and ambiguous
  // tasks have their own outcome buckets and would otherwise inflate/deflate it.
  const inScope = results.filter((r) => r.task.kind === "direct" || r.task.kind === "paraphrase");
  const correct = inScope.filter((r) => r.selectedCorrectly).length;
  const distractors = results.filter((r) => r.task.kind === "distractor");
  const refusedRight = distractors.filter((r) => r.outcome === "correct-refusal").length;
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
    envFingerprint: buildFingerprint({
      snapshot,
      opts,
      serializedCatalog: catalog,
      systemPrompt: SELECT_SYSTEM,
    }),
    taskCount: total,
    score: scoreOutcomes(outcomes),
    outcomes,
    selectionAccuracy: inScope.length ? correct / inScope.length : 0,
    refusalCorrectness: distractors.length ? refusedRight / distractors.length : 1,
    argValidity: withArgs.length ? argsOk / withArgs.length : 1,
    confusions,
    perTool,
    results,
  };
}
