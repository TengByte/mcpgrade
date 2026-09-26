import { describe, expect, it } from "vitest";
import { findTwinPairs } from "../src/eval/twins.js";
import type { ToolDef } from "../src/types.js";

const tool = (name: string, description: string): ToolDef => ({ name, description });

describe("findTwinPairs", () => {
  it("finds confusable pairs that the strict lint rules would miss", () => {
    const tools = [
      tool("search_feedback", "Search user feedback entries by keyword."),
      tool("feedback", "Submit or read user feedback entries."),
      tool("create_invoice", "Create a billing invoice for a customer account."),
      tool("delete_file", "Remove a file from the workspace permanently."),
    ];
    const pairs = findTwinPairs(tools, 3);
    expect(pairs.map((p) => p.sort().join("|"))).toEqual(["feedback|search_feedback"]);
  });

  it("returns nothing for clearly distinct tools", () => {
    const tools = [
      tool("create_invoice", "Create a billing invoice for a customer account."),
      tool("delete_file", "Remove a file from the workspace permanently."),
      tool("list_channels", "List the chat channels visible to the bot."),
    ];
    expect(findTwinPairs(tools, 3)).toEqual([]);
  });

  it("respects the limit, most similar first", () => {
    const tools = [
      tool("get_status", "Get the current status of a crawl job."),
      tool("check_status", "Check the current status of a crawl job."),
      tool("agent_status", "Get the status of an agent run."),
    ];
    const pairs = findTwinPairs(tools, 1);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].sort()).toEqual(["check_status", "get_status"]);
  });

  it("handles camelCase names and missing descriptions", () => {
    const tools = [tool("getUserById", "Fetch a user by id."), tool("getUsers", undefined as never)];
    expect(() => findTwinPairs(tools, 2)).not.toThrow();
  });
});
