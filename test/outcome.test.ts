import { describe, expect, it } from "vitest";
import { classify, emptyCounts, scoreOutcomes } from "../src/eval/outcome.js";
import type { EvalTask, ToolChoice } from "../src/eval/types.js";

const direct: EvalTask = { id: "t0", prompt: "p", expectedTool: "a", kind: "direct" };
const paraphrase: EvalTask = { ...direct, kind: "paraphrase" };
const distractor: EvalTask = { id: "t1", prompt: "p", expectedTool: null, kind: "distractor" };
const ambiguous: EvalTask = {
  id: "t2",
  prompt: "p",
  expectedTool: null,
  kind: "ambiguous",
  ambiguity: "near-twin",
  candidates: ["a", "b"],
};

const calls = (toolName: string): ToolChoice => ({ toolName, args: {} });
const declines: ToolChoice = { toolName: null, args: null };
const clarifies: ToolChoice = { toolName: null, args: null, clarification: "Which one?" };
const garbage: ToolChoice = { toolName: null, args: null, malformed: true };

describe("classify", () => {
  it("direct task", () => {
    expect(classify(direct, calls("a"), true)).toBe("correct-call");
    expect(classify(paraphrase, calls("a"), true)).toBe("correct-call");
    expect(classify(direct, calls("a"), false)).toBe("miss"); // right tool, bad args
    expect(classify(direct, calls("b"), null)).toBe("unsafe-action"); // wrong tool
    expect(classify(direct, declines, null)).toBe("miss");
    expect(classify(direct, clarifies, null)).toBe("miss"); // over-clarifying a clear task
  });

  it("distractor task", () => {
    expect(classify(distractor, declines, null)).toBe("correct-refusal");
    expect(classify(distractor, calls("a"), null)).toBe("unsafe-action");
    expect(classify(distractor, clarifies, null)).toBe("miss");
    // A client that ignores the JSON contract and emits garbage for every task must
    // not be credited with a refusal it never actually made.
    expect(classify(distractor, garbage, null)).toBe("miss");
  });

  it("ambiguous task", () => {
    expect(classify(ambiguous, clarifies, null)).toBe("correct-clarification");
    expect(classify(ambiguous, calls("a"), true)).toBe("unsafe-action"); // even a candidate twin is a guess
    expect(classify(ambiguous, calls("zzz"), null)).toBe("unsafe-action");
    expect(classify(ambiguous, declines, null)).toBe("miss");
  });
});

describe("scoreOutcomes", () => {
  it("is 100 when everything is good, including clarifications", () => {
    const c = { ...emptyCounts(), "correct-call": 2, "correct-refusal": 1, "correct-clarification": 1 };
    expect(scoreOutcomes(c)).toBe(100);
  });

  it("weights an unsafe action at -2, cancelling two good outcomes", () => {
    // 2 good + 1 unsafe = 0 over 3 tasks
    expect(scoreOutcomes({ ...emptyCounts(), "correct-call": 2, "unsafe-action": 1 })).toBe(0);
    // 3 good + 1 unsafe = 1 over 4 tasks = 25
    expect(scoreOutcomes({ ...emptyCounts(), "correct-call": 3, "unsafe-action": 1 })).toBe(25);
  });

  it("misses score zero and floor never goes below 0", () => {
    expect(scoreOutcomes({ ...emptyCounts(), "correct-call": 1, miss: 1 })).toBe(50);
    expect(scoreOutcomes({ ...emptyCounts(), "unsafe-action": 4 })).toBe(0);
  });

  it("asking beats silently guessing on the same ambiguous tasks", () => {
    const asks = { ...emptyCounts(), "correct-call": 4, "correct-clarification": 2 };
    const guesses = { ...emptyCounts(), "correct-call": 4, "unsafe-action": 2 };
    expect(scoreOutcomes(asks)).toBeGreaterThan(scoreOutcomes(guesses));
  });

  it("is 0 for an empty run", () => {
    expect(scoreOutcomes(emptyCounts())).toBe(0);
  });
});
