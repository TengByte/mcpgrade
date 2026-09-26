import { describe, expect, it } from "vitest";
import { runEval } from "../src/eval/runner.js";
import { mockClient } from "../src/eval/client.js";
import { validateArgs } from "../src/eval/validate.js";
import type { ServerSnapshot } from "../src/types.js";
import type { ModelClient } from "../src/eval/types.js";

const snapshot: ServerSnapshot = {
  source: "test://eval",
  tools: [
    {
      name: "search_issues",
      description: "Search issues in the tracker by free-text query.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query." },
        },
        required: ["query"],
      },
    },
    {
      name: "create_comment",
      description: "Add a comment to an existing issue.",
      inputSchema: {
        type: "object",
        properties: {
          issue_id: { type: "string", description: "Issue id." },
          body: { type: "string", description: "Comment body." },
        },
        required: ["issue_id", "body"],
      },
    },
  ],
};

describe("eval harness with mock client", () => {
  it("produces a full report end-to-end", async () => {
    const report = await runEval(snapshot, {
      client: mockClient(),
      tasksPerTool: 3,
      distractors: 2,
    });
    expect(report.taskCount).toBe(8); // 2 tools × 3 + 2 distractors
    expect(report.selectionAccuracy).toBeGreaterThan(0.7); // mock matches by name overlap
    expect(report.refusalCorrectness).toBe(1); // distractors refused
    expect(report.argValidity).toBe(1); // mock fills required args by type
  });
});

describe("arg validation", () => {
  const schema = {
    type: "object",
    properties: {
      q: { type: "string" },
      limit: { type: "integer" },
      status: { type: "string", enum: ["open", "closed"] },
    },
    required: ["q"],
  };
  it("accepts valid args", () => {
    expect(validateArgs(schema, { q: "x", limit: 5, status: "open" })).toBe(true);
  });
  it("rejects missing required", () => {
    expect(validateArgs(schema, { limit: 5 })).toBe(false);
  });
  it("rejects wrong type", () => {
    expect(validateArgs(schema, { q: "x", limit: "five" })).toBe(false);
  });
  it("rejects invented args", () => {
    expect(validateArgs(schema, { q: "x", nonexistent: 1 })).toBe(false);
  });
  it("rejects out-of-enum values", () => {
    expect(validateArgs(schema, { q: "x", status: "banana" })).toBe(false);
  });
});

describe("env fingerprint", () => {
  it("pins server, model, harness and task policy in the report", async () => {
    const { runEval } = await import("../src/eval/runner.js");
    const { mockClient } = await import("../src/eval/client.js");
    const snapshot = {
      source: "test://fixture",
      serverName: "fixture",
      tools: [
        {
          name: "search_issues",
          description: "Search issues in a repository by query string.",
          inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
        },
      ],
    };
    const report = await runEval(snapshot as never, {
      client: mockClient(),
      tasksPerTool: 1,
      distractors: 1,
    });
    const f = report.envFingerprint;
    expect(f.server.toolCount).toBe(1);
    expect(f.server.catalogHash).toMatch(/^[0-9a-f]{16}$/);
    expect(f.model.temperature).toBe(0);
    expect(f.harness.promptHash).toMatch(/^[0-9a-f]{16}$/);
    expect(f.taskPolicy.catalogPolicy).toBe("full-catalog-single-shot");
    expect(f.taskPolicy.tasksPerTool).toBe(1);
    expect(Date.parse(f.runAt)).not.toBeNaN();
  });

  it("catalogHash changes when the catalog changes, and comparable() reflects it", async () => {
    const { catalogHash, comparable, buildFingerprint } = await import("../src/eval/fingerprint.js");
    expect(catalogHash("a")).not.toBe(catalogHash("b"));
    const mk = (cat: string) =>
      buildFingerprint({
        snapshot: { source: "s", tools: [] } as never,
        opts: { client: { name: "m", temperature: 0, complete: async () => "" }, tasksPerTool: 1, distractors: 1 },
        serializedCatalog: cat,
        systemPrompt: "p",
      });
    expect(comparable(mk("x"), mk("x"))).toBe(true);
    expect(comparable(mk("x"), mk("y"))).toBe(false);
  });
});

describe("four-outcome scoring (issue #1)", () => {
  const twinSnapshot: ServerSnapshot = {
    source: "test://twins",
    tools: [
      {
        name: "get_status",
        description: "Get the current status of a crawl job by its job id.",
        inputSchema: {
          type: "object",
          properties: { job_id: { type: "string", description: "Job id." } },
          required: ["job_id"],
        },
      },
      {
        name: "check_status",
        description: "Check the current status of a crawl job by its job id.",
        inputSchema: {
          type: "object",
          properties: { job_id: { type: "string", description: "Job id." } },
          required: ["job_id"],
        },
      },
      {
        name: "create_invoice",
        description: "Create a billing invoice for a customer account.",
        inputSchema: {
          type: "object",
          properties: { customer: { type: "string", description: "Customer name." } },
          required: ["customer"],
        },
      },
    ],
  };

  /** The mock, except it never asks: any clarification becomes a confident call to the first tool. */
  const guesser = (): ModelClient => {
    const inner = mockClient();
    return {
      ...inner,
      async complete(system, user) {
        const raw = await inner.complete(system, user);
        if (user.startsWith("Tool catalog:") && JSON.parse(raw).clarify) {
          return JSON.stringify({ tool: "get_status", args: { job_id: "j1" } });
        }
        return raw;
      },
    };
  };

  const opts = { tasksPerTool: 3, distractors: 2, ambiguous: 1 };

  it("synthesizes one near-twin and one missing-param task per mechanism", async () => {
    const report = await runEval(twinSnapshot, { client: mockClient(), ...opts });
    const amb = report.results.filter((r) => r.task.kind === "ambiguous");
    expect(amb.map((r) => r.task.ambiguity).sort()).toEqual(["missing-param", "near-twin"]);
    expect(amb.find((r) => r.task.ambiguity === "near-twin")!.task.candidates!.sort()).toEqual([
      "check_status",
      "get_status",
    ]);
    expect(report.taskCount).toBe(13); // 3 tools × 3 + 2 distractors + 2 ambiguous
  });

  it("scores a server that asks above one that silently guesses", async () => {
    const asks = await runEval(twinSnapshot, { client: mockClient(), ...opts });
    const guesses = await runEval(twinSnapshot, { client: guesser(), ...opts });
    expect(asks.outcomes["correct-clarification"]).toBe(2);
    expect(asks.outcomes["unsafe-action"]).toBe(0);
    expect(guesses.outcomes["correct-clarification"]).toBe(0);
    expect(guesses.outcomes["unsafe-action"]).toBe(2);
    expect(asks.score).toBeGreaterThan(guesses.score);
  });

  it("reports outcome counts that sum to the task count", async () => {
    const report = await runEval(twinSnapshot, { client: mockClient(), ...opts });
    const sum = Object.values(report.outcomes).reduce((a, b) => a + b, 0);
    expect(sum).toBe(report.taskCount);
    expect(report.results.every((r) => r.outcome)).toBe(true);
  });

  it("adds no ambiguous tasks when not requested", async () => {
    const report = await runEval(twinSnapshot, { client: mockClient(), tasksPerTool: 1, distractors: 0 });
    expect(report.results.some((r) => r.task.kind === "ambiguous")).toBe(false);
  });

  it("gives no near-twin task for a catalog of distinct tools", async () => {
    const report = await runEval(snapshot, { client: mockClient(), tasksPerTool: 1, distractors: 0, ambiguous: 1 });
    expect(report.results.some((r) => r.task.ambiguity === "near-twin")).toBe(false);
  });
});

describe("parseChoice", () => {
  it("reads tool calls, clarifications, declines and garbage", async () => {
    const { parseChoice } = await import("../src/eval/runner.js");
    expect(parseChoice('{"tool":"a","args":{"x":1}}')).toMatchObject({ toolName: "a", args: { x: 1 } });
    expect(parseChoice('{"clarify":"Which one?"}')).toMatchObject({ toolName: null, clarification: "Which one?" });
    expect(parseChoice('{"tool":null}').clarification).toBeUndefined();
    expect(parseChoice("no json here")).toMatchObject({ toolName: null, args: null });
    expect(parseChoice('{"clarify":"   "}').clarification).toBeUndefined();
  });

  it("flags anything that isn't a recognized shape as malformed, not a valid decline", async () => {
    const { parseChoice } = await import("../src/eval/runner.js");
    expect(parseChoice("I cannot help with that").malformed).toBe(true); // no JSON at all
    expect(parseChoice("{not json").malformed).toBe(true); // JSON.parse throws
    expect(parseChoice("{}").malformed).toBe(true); // valid JSON, no recognized field
    expect(parseChoice('{"foo":"bar"}').malformed).toBe(true);
    expect(parseChoice('{"tool":null}').malformed).toBe(false); // explicit, valid decline
    expect(parseChoice('{"clarify":"Which one?"}').malformed).toBe(false);
    expect(parseChoice('{"tool":"a","args":{}}').malformed).toBe(false);
  });

  it("a tool call wins over a clarification", async () => {
    const { parseChoice } = await import("../src/eval/runner.js");
    const c = parseChoice('{"tool":"a","args":{},"clarify":"hm?"}');
    expect(c.toolName).toBe("a");
    expect(c.clarification).toBeUndefined();
  });
});

describe("fingerprint with ambiguous tasks", () => {
  it("bumps the prompt version and treats different ambiguous counts as incomparable", async () => {
    const { comparable, buildFingerprint, PROMPT_VERSION } = await import("../src/eval/fingerprint.js");
    expect(PROMPT_VERSION).toBe(2);
    const mk = (ambiguous: number) =>
      buildFingerprint({
        snapshot: { source: "s", tools: [] } as never,
        opts: { client: { name: "m", temperature: 0, complete: async () => "" }, tasksPerTool: 1, distractors: 1, ambiguous },
        serializedCatalog: "c",
        systemPrompt: "p",
      });
    expect(comparable(mk(2), mk(2))).toBe(true);
    expect(comparable(mk(2), mk(0))).toBe(false);
  });
});
