import { describe, expect, it } from "vitest";
import { runRules } from "../src/rules/index.js";
import { buildReport } from "../src/score.js";
import type { ServerSnapshot } from "../src/types.js";

const goodSnapshot: ServerSnapshot = {
  source: "test://good",
  tools: [
    {
      name: "search_issues",
      description:
        "Search issues in the tracker by free-text query. Use when the user wants to find existing issues. Returns a list of matching issues with id, title and status.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Free text search query, e.g. 'login bug'." },
          status: {
            type: "string",
            description: "Filter by issue status.",
            enum: ["open", "closed", "all"],
          },
        },
        required: ["query"],
        additionalProperties: false,
      },
    },
    {
      name: "create_comment",
      description:
        "Add a comment to an existing issue. Use after locating the issue id. Returns the created comment id and URL.",
      inputSchema: {
        type: "object",
        properties: {
          issue_id: { type: "string", description: "The id of the issue to comment on." },
          body: { type: "string", description: "Markdown body of the comment." },
        },
        required: ["issue_id", "body"],
        additionalProperties: false,
      },
    },
  ],
};

const badSnapshot: ServerSnapshot = {
  source: "test://bad",
  tools: [
    { name: "process", description: "TODO" },
    {
      name: "get_user",
      description: "Gets a user.",
      inputSchema: { type: "object", properties: { id: {} } },
    },
    {
      name: "get_users",
      description: "Gets a user.",
      inputSchema: { type: "object", additionalProperties: true },
    },
  ],
};

describe("rules on a good snapshot", () => {
  it("scores high with no errors", async () => {
    const findings = await runRules(goodSnapshot);
    const errors = findings.filter((f) => f.severity === "error");
    expect(errors).toHaveLength(0);
    const report = buildReport(goodSnapshot, findings);
    expect(report.totalScore).toBeGreaterThanOrEqual(90);
    expect(report.grade).toBe("A");
  });
});

describe("rules on a bad snapshot", () => {
  it("catches the classic failures", async () => {
    const findings = await runRules(badSnapshot);
    const ids = new Set(findings.map((f) => f.ruleId));
    expect(ids).toContain("D002"); // "TODO" too short
    expect(ids).toContain("D004"); // param id has no description
    expect(ids).toContain("D006"); // duplicate descriptions
    expect(ids).toContain("N002"); // get_user vs get_users
    expect(ids).toContain("N003"); // generic "process"
    expect(ids).toContain("S001"); // missing schema on process
    expect(ids).toContain("S002"); // id has no type
    expect(ids).toContain("S004"); // additionalProperties true
  });

  it("grades it F", async () => {
    const findings = await runRules(badSnapshot);
    const report = buildReport(badSnapshot, findings);
    expect(report.totalScore).toBeLessThan(60);
    expect(report.grade).toBe("F");
  });
});

describe("rule disabling", () => {
  it("respects --disable", async () => {
    const findings = await runRules(badSnapshot, { disabledRules: ["N002", "D006"] });
    const ids = new Set(findings.map((f) => f.ruleId));
    expect(ids).not.toContain("N002");
    expect(ids).not.toContain("D006");
  });
});
