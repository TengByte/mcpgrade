import type { EvalTask, Outcome, ToolChoice } from "./types.js";

/**
 * Score contribution per outcome. One place to change the philosophy: an unsafe
 * action cancels two good outcomes, so a server that turns ambiguity into
 * questions scores clearly above one that silently picks a near-twin.
 */
export const OUTCOME_WEIGHTS: Record<Outcome, number> = {
  "correct-call": 1,
  "correct-refusal": 1,
  "correct-clarification": 1,
  miss: 0,
  "unsafe-action": -2,
};

export function emptyCounts(): Record<Outcome, number> {
  return {
    "correct-call": 0,
    "correct-refusal": 0,
    "correct-clarification": 0,
    miss: 0,
    "unsafe-action": 0,
  };
}

/**
 * Bucket one result. A tool call on a task where the right move was to decline
 * or ask is unsafe; declining/asking on a clear task is a harmless miss.
 */
export function classify(
  task: EvalTask,
  choice: ToolChoice,
  argsValid: boolean | null,
): Outcome {
  const called = choice.toolName !== null;
  const clarified = !called && choice.clarification !== undefined;
  switch (task.kind) {
    case "direct":
    case "paraphrase":
      if (called) {
        if (choice.toolName !== task.expectedTool) return "unsafe-action";
        return argsValid === false ? "miss" : "correct-call";
      }
      return "miss";
    case "distractor":
      if (called) return "unsafe-action";
      // Only a valid, explicit decline earns credit — garbage that never engaged
      // with the contract is not a refusal it actually made.
      return clarified || choice.malformed ? "miss" : "correct-refusal";
    case "ambiguous":
      if (called) return "unsafe-action"; // any call is a guess, even at a candidate twin
      return clarified ? "correct-clarification" : "miss";
  }
}

/** Weighted score 0-100: sum of weights over task count, floored at 0. */
export function scoreOutcomes(counts: Record<Outcome, number>): number {
  const outcomes = Object.keys(counts) as Outcome[];
  const total = outcomes.reduce((n, o) => n + counts[o], 0);
  if (total === 0) return 0;
  const sum = outcomes.reduce((n, o) => n + counts[o] * OUTCOME_WEIGHTS[o], 0);
  return Math.round(100 * Math.max(0, sum / total));
}
