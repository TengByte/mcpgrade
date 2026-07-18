import type { ModelClient } from "./types.js";

/**
 * Node's built-in fetch ignores HTTP(S)_PROXY env vars. If a proxy is
 * configured (common in corporate/CI environments), route through undici's
 * EnvHttpProxyAgent so --eval works behind proxies.
 */
type FetchLike = (url: string, init: Record<string, unknown>) => Promise<Response>;
let cachedFetch: FetchLike | null = null;
async function proxyAwareFetch(): Promise<FetchLike> {
  if (cachedFetch) return cachedFetch;
  if (process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY) {
    try {
      const { fetch: undiciFetch, EnvHttpProxyAgent } = await import("undici");
      const dispatcher = new EnvHttpProxyAgent();
      cachedFetch = ((url: string, init: Record<string, unknown>) =>
        undiciFetch(url, { ...init, dispatcher })) as unknown as FetchLike;
      return cachedFetch;
    } catch {
      /* undici unavailable — fall through to global fetch */
    }
  }
  cachedFetch = fetch as unknown as FetchLike;
  return cachedFetch;
}

/** Anthropic Messages API client via fetch — no SDK dependency. */
export function anthropicClient(opts: {
  apiKey: string;
  model?: string;
}): ModelClient {
  const model = opts.model ?? "claude-haiku-4-5-20251001";
  const usage = { inputTokens: 0, outputTokens: 0 };
  return {
    name: model,
    usage,
    async complete(system, user) {
      const doFetch = await proxyAwareFetch();
      const res = await doFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": opts.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system,
          messages: [{ role: "user", content: user }],
        }),
      });
      if (!res.ok) {
        throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        content: { type: string; text?: string }[];
        usage?: { input_tokens: number; output_tokens: number };
      };
      usage.inputTokens += data.usage?.input_tokens ?? 0;
      usage.outputTokens += data.usage?.output_tokens ?? 0;
      return data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    },
  };
}

/**
 * OpenAI-compatible chat-completions client — covers DeepSeek, Qwen/DashScope,
 * GLM, OpenRouter, OpenAI, and any other endpoint speaking the same dialect.
 */
export function openaiCompatClient(opts: {
  baseUrl: string; // e.g. https://api.deepseek.com/v1
  apiKey: string;
  model: string; // e.g. deepseek-chat
}): ModelClient {
  const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
  return {
    name: opts.model,
    async complete(system, user) {
      const doFetch = await proxyAwareFetch();
      const res = await doFetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${opts.apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: 1024,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`${opts.baseUrl} ${res.status}: ${await res.text()}`);
      }
      const data = (await res.json()) as {
        choices: { message: { content: string } }[];
      };
      return data.choices[0]?.message?.content ?? "";
    },
  };
}

/**
 * Deterministic mock client for tests and offline development.
 * - Task synthesis: emits templated requests derived from the tool name.
 * - Selection: picks the tool whose name's tokens overlap the request most;
 *   declines when overlap is zero (so distractors are refused).
 */
export function mockClient(): ModelClient {
  return {
    name: "mock",
    async complete(system, user) {
      if (system.includes("generate realistic user requests") || system.includes("You generate realistic")) {
        const nameMatch = user.match(/"name":\s*"([^"]+)"/);
        const name = nameMatch?.[1] ?? "tool";
        const words = name.replace(/[-_]/g, " ");
        return JSON.stringify([
          `Please ${words} for me`,
          `I need to ${words} right now`,
          `Could you ${words}?`,
        ]);
      }
      if (system.includes("CANNOT be satisfied")) {
        return JSON.stringify([
          "Please book me a flight to the moon",
          "What is the meaning of life?",
        ]);
      }
      // Selection: crude token-overlap matcher
      const catalogMatch = user.match(/Tool catalog:\n([\s\S]*)\n\nUser request: ([\s\S]*)$/);
      if (!catalogMatch) return JSON.stringify({ tool: null });
      const tools: { name: string; inputSchema?: { properties?: Record<string, unknown>; required?: string[] } }[] =
        JSON.parse(catalogMatch[1]);
      const request = catalogMatch[2].toLowerCase();
      let best: { name: string; score: number } | null = null;
      for (const t of tools) {
        const tokens = t.name.toLowerCase().split(/[-_\s]+/).filter((w) => w.length > 2);
        const score = tokens.filter((w) => request.includes(w)).length / Math.max(tokens.length, 1);
        if (score > 0 && (!best || score > best.score)) best = { name: t.name, score };
      }
      if (!best || best.score < 0.5) return JSON.stringify({ tool: null });
      const tool = tools.find((t) => t.name === best!.name)!;
      const args: Record<string, unknown> = {};
      for (const req of tool.inputSchema?.required ?? []) {
        const prop = (tool.inputSchema?.properties?.[req] ?? {}) as { type?: string; enum?: unknown[] };
        if (prop.enum) args[req] = prop.enum[0];
        else if (prop.type === "integer" || prop.type === "number") args[req] = 1;
        else if (prop.type === "boolean") args[req] = true;
        else if (prop.type === "array") args[req] = [];
        else if (prop.type === "object") args[req] = {};
        else args[req] = "example";
      }
      return JSON.stringify({ tool: best.name, args });
    },
  };
}
