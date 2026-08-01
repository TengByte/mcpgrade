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

/**
 * Connect to a live MCP server over HTTP and take a snapshot.
 *
 * Tries streamable HTTP first, then falls back to SSE — many hosted servers
 * still only speak the older transport. Custom headers (auth tokens) are
 * forwarded to both.
 *
 * Secrets note: headers are never stored on the snapshot or echoed in output.
 */
export async function snapshotFromHttp(
  url: string,
  headers?: Record<string, string>,
): Promise<ServerSnapshot> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const requestInit = headers && Object.keys(headers).length ? { headers } : undefined;

  const connect = async (kind: "streamable" | "sse") => {
    const client = new Client({ name: "mcpgrade", version: "0.3.1" });
    let transport;
    if (kind === "streamable") {
      const { StreamableHTTPClientTransport } = await import(
        "@modelcontextprotocol/sdk/client/streamableHttp.js"
      );
      transport = new StreamableHTTPClientTransport(new URL(url), { requestInit });
    } else {
      const { SSEClientTransport } = await import("@modelcontextprotocol/sdk/client/sse.js");
      transport = new SSEClientTransport(new URL(url), {
        requestInit,
        eventSourceInit: requestInit
          ? {
              fetch: (input: string | URL | Request, init?: RequestInit) =>
                fetch(input, { ...init, headers: { ...init?.headers, ...headers } }),
            }
          : undefined,
      } as never);
    }
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
  };

  try {
    return await connect("streamable");
  } catch (streamableError) {
    try {
      return await connect("sse");
    } catch {
      // Report the primary failure — the SSE attempt is a fallback, not the story.
      throw streamableError;
    }
  }
}

/** Spawn a local MCP server over stdio and take a snapshot. */
export async function snapshotFromStdio(command: string): Promise<ServerSnapshot> {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = await import(
    "@modelcontextprotocol/sdk/client/stdio.js"
  );
  const [cmd, ...args] = command.split(/\s+/);
  const client = new Client({ name: "mcpgrade", version: "0.1.0" });
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
  headers?: Record<string, string>;
}): Promise<ServerSnapshot> {
  if (opts.snapshot) return snapshotFromFile(opts.snapshot);
  if (opts.stdio) return snapshotFromStdio(opts.stdio);
  if (opts.target) {
    if (/^https?:\/\//.test(opts.target)) return snapshotFromHttp(opts.target, opts.headers);
    if (opts.target.endsWith(".json")) return snapshotFromFile(opts.target);
    return snapshotFromStdio(opts.target);
  }
  throw new Error("No target. Pass a URL, a command via --stdio, or --snapshot file.json");
}
