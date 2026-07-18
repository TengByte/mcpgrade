import { describe, expect, it } from "vitest";
import { isActionableError, runProbe } from "../src/probe.js";
import type { ServerSnapshot } from "../src/types.js";

describe("isActionableError", () => {
  it("accepts errors naming the parameter", () => {
    expect(isActionableError('Missing required parameter "query"', ["query"])).toBe(true);
    expect(isActionableError("Invalid type for issue_id: expected string", ["issue_id"])).toBe(true);
  });
  it("accepts schema-language errors with specifics", () => {
    expect(isActionableError("Validation failed: 'q' is required", ["query"])).toBe(true);
  });
  it("rejects generic failures", () => {
    expect(isActionableError("Internal Server Error", ["query"])).toBe(false);
    expect(isActionableError("error", ["query"])).toBe(false);
    expect(isActionableError("", ["query"])).toBe(false);
  });
});

describe("runProbe", () => {
  const snapshot: ServerSnapshot = {
    source: "test://probe",
    tools: [
      {
        name: "good_tool",
        description: "x",
        inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      },
      {
        name: "vague_tool",
        description: "x",
        inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      },
      {
        name: "accepts_anything",
        description: "x",
        inputSchema: { type: "object", properties: { q: { type: "string" } }, required: ["q"] },
      },
      {
        name: "all_optional",
        description: "x",
        inputSchema: { type: "object", properties: { q: { type: "string" } } },
      },
    ],
  };

  const fakeCaller = {
    async callTool(name: string) {
      if (name === "good_tool") return { isError: true, text: 'Missing required parameter "q"' };
      if (name === "vague_tool") return { isError: true, text: "Internal Server Error" };
      return { isError: false, text: "did the thing with undefined!" };
    },
    async close() {},
  };

  it("grades error quality and detects non-enforced schemas, skipping all-optional tools", async () => {
    const findings = await runProbe(snapshot, fakeCaller);
    const byTool = Object.fromEntries(findings.map((f) => [f.toolName, f.ruleId]));
    expect(byTool["good_tool"]).toBeUndefined(); // actionable error → clean
    expect(byTool["vague_tool"]).toBe("C003"); // vague error
    expect(byTool["accepts_anything"]).toBe("C004"); // executed without required args
    expect(byTool["all_optional"]).toBeUndefined(); // never probed (safety)
  });
});
