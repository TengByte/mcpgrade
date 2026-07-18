import { readFile } from "node:fs/promises";
import type { ServerSnapshot, ToolDef } from "./types.js";

/** Load a snapshot from a JSON file: {"tools":[...]} or raw tools/list result. */
export async function snapshotFromFile(path: string): Promise<ServerSnapshot> {
  const raw = JSON.parse(await readFile(path, "utf8"));
  const tools: ToolDef[] = raw.tools ?? raw;
  if (!Array.isArray(tools)) {
    throw new Error(`Snapshot file must contain a "tools" array: ${path}`);
  }
  return { source: path, serverName: raw.serverName, tools };
}

/** Connect to a live MCP server over streamable HTTP and take a snapshot. */
export async function snapshotFromHttp(url: string): Promise<ServerSnapshot> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/streamableHttp.js"
  );
  const client = new Client({ name: "mcplint", version: "0.1.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url));
  await client.connect(transport);
  try {
    const res = await client.listTools();
    return {
      source: url,
      serverName: client.getServerVersion()?.name,
      tools: res.tools as ToolDef[],
    };
  } finally {
    await client.close();
  }
}

/** Spawn a local MCP server over stdio and take a snapshot. */
export async function snapshotFromStdio(command: string): Promise<ServerSnapshot> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );
  const [cmd, ...args] = command.split(/\s+/);
  const client = new Client({ name: "mcplint", version: "0.1.0" });
  // Pass through the full environment: real servers need their API keys etc.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([, v]) => v !== undefined),
  ) as Record<string, string>;
  const transport = new StdioClientTransport({ command: cmd, args, env });
  await client.connect(transport);
  try {
    const res = await client.listTools();
    return {
      source: command,
      serverName: client.getServerVersion()?.name,
      tools: res.tools as ToolDef[],
    };
  } finally {
    await client.close();
  }
}

export async function takeSnapshot(opts: {
  target?: string;
  stdio?: string;
  snapshot?: string;
}): Promise<ServerSnapshot> {
  if (opts.snapshot) return snapshotFromFile(opts.snapshot);
  if (opts.stdio) return snapshotFromStdio(opts.stdio);
  if (opts.target) {
    if (/^https?:\/\//.test(opts.target)) return snapshotFromHttp(opts.target);
    if (opts.target.endsWith(".json")) return snapshotFromFile(opts.target);
    return snapshotFromStdio(opts.target);
  }
  throw new Error("No target. Pass a URL, a command via --stdio, or --snapshot file.json");
}
