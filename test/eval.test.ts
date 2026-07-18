import { describe, expect, it } from "vitest";
import { runEval } from "../src/eval/runner.js";
import { mockClient } from "../src/eval/client.js";
import { validateArgs } from "../src/eval/validate.js";
import type { ServerSnapshot } from "../src/types.js";

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
