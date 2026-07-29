#!/usr/bin/env node
/**
 * Counts how many servers / tools populate `outputSchema` in tools/list.
 * Evidence for the claim that MCP dependency graphs cannot be declared today.
 *
 *   node scripts/count-outputschema.mjs
 */
import { spawn } from "node:child_process";

const BIN = "/tmp/mcptest/node_modules/.bin";
const SERVERS = [
  ["server-everything", `${BIN}/mcp-server-everything`, {}],
  ["server-memory", `${BIN}/mcp-server-memory`, {}],
  ["server-filesystem", `${BIN}/mcp-server-filesystem /tmp`, {}],
  ["server-sequential-thinking", `${BIN}/mcp-server-sequential-thinking`, {}],
  ["server-github", `${BIN}/mcp-server-github`, { GITHUB_PERSONAL_ACCESS_TOKEN: "dummy" }],
  ["server-slack", `${BIN}/mcp-server-slack`, { SLACK_BOT_TOKEN: "dummy", SLACK_TEAM_ID: "dummy" }],
  ["server-google-maps", `${BIN}/mcp-server-google-maps`, { GOOGLE_MAPS_API_KEY: "dummy" }],
  ["context7", `${BIN}/context7-mcp`, {}],
  ["exa", `${BIN}/exa-mcp-server`, { EXA_API_KEY: "dummy" }],
  ["firecrawl", `${BIN}/firecrawl-mcp`, { FIRECRAWL_API_KEY: "dummy" }],
  ["mongodb", `${BIN}/mongodb-mcp-server`, { MDB_MCP_CONNECTION_STRING: "mongodb://localhost:27017/test" }],
  ["todoist", `${BIN}/todoist-mcp-server`, { TODOIST_API_TOKEN: "dummy" }],
  ["shrimp-task-manager", `${BIN}/mcp-shrimp-task-manager`, { DATA_DIR: "/tmp/shrimp" }],
  ["elasticsearch", `${BIN}/mcp-server-elasticsearch`, { ES_URL: "http://localhost:9200" }],
  ["airbnb", `${BIN}/mcp-server-airbnb`, {}],
  ["perplexity-ask", `${BIN}/mcp-server-perplexity-ask`, { PERPLEXITY_API_KEY: "dummy" }],
];

function listTools(cmd, env, timeoutMs = 20000) {
  return new Promise((resolve) => {
    const [exe, ...args] = cmd.split(" ");
    const child = spawn(exe, args, {
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "ignore"],
    });
    let buf = "";
    const done = (v) => {
      try { child.kill("SIGKILL"); } catch {}
      resolve(v);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    child.stdout.on("data", (d) => {
      buf += d.toString();
      for (const line of buf.split("\n")) {
        if (!line.trim().startsWith("{")) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id === 2 && msg.result?.tools) {
            clearTimeout(timer);
            done(msg.result.tools);
          }
        } catch {}
      }
    });
    child.on("error", () => { clearTimeout(timer); done(null); });
    const send = (o) => child.stdin.write(JSON.stringify(o) + "\n");
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
      protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "outputschema-census", version: "1" } } });
    setTimeout(() => {
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    }, 700);
  });
}

const rows = [];
for (const [name, cmd, env] of SERVERS) {
  const tools = await listTools(cmd, env);
  if (!tools) { rows.push({ name, status: "unreachable" }); continue; }
  const withOut = tools.filter((t) => t.outputSchema != null);
  rows.push({
    name,
    status: "ok",
    tools: tools.length,
    withOutputSchema: withOut.length,
    examples: withOut.slice(0, 3).map((t) => t.name),
  });
  console.error(`${name}: ${withOut.length}/${tools.length}`);
}

const ok = rows.filter((r) => r.status === "ok");
const totalTools = ok.reduce((a, r) => a + r.tools, 0);
const totalWith = ok.reduce((a, r) => a + r.withOutputSchema, 0);
const serversWithAny = ok.filter((r) => r.withOutputSchema > 0);

console.log(JSON.stringify({
  scannedAt: new Date().toISOString(),
  serversAttempted: SERVERS.length,
  serversReachable: ok.length,
  serversWithAnyOutputSchema: serversWithAny.length,
  serversWithAnyOutputSchemaNames: serversWithAny.map((r) => r.name),
  totalTools,
  toolsWithOutputSchema: totalWith,
  pctToolsWithOutputSchema: totalTools ? +(100 * totalWith / totalTools).toFixed(1) : 0,
  perServer: rows,
}, null, 2));
