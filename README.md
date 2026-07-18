# mcpgrade

> **Lighthouse for MCP servers.** Your server can be 100% spec-compliant and still fail agents — vague descriptions, token-bloated schemas, confusable tool names. mcpgrade scores what compliance checkers can't: whether an LLM can actually use your tools.

```bash
npx mcpgrade https://your-server.example.com/mcp   # streamable HTTP
npx mcpgrade --stdio "node ./my-server.js"          # local stdio server
npx mcpgrade --snapshot tools.json                  # saved tools/list output
```

Zero config. No API key. Report in seconds.

## What it checks

| Category | Weight | Examples |
|---|---|---|
| **Descriptions** | 35% | missing/too-short descriptions, undocumented params, placeholder text, duplicate descriptions |
| **Schema design** | 35% | missing types, no `required` array, `additionalProperties: true`, prose-instead-of-enum, deep nesting |
| **Naming** | 15% | confusable names (`get_user` vs `get_users`), generic verbs (`process`), mixed conventions |
| **Token cost** | 15% | catalog total budget, per-tool budget — agents pay your schema on *every* request |

Every finding comes with a concrete fix. Scores are density-normalized: 3 broken tools out of 3 is an F; 3 out of 30 is a dent.

## Example

```
mcpgrade — agent usability report
target: examples/bad-server.json · 4 tools

  F   28/100

  Descriptions   ░░░░░░░░░░░░░░░░░░░░   0
  Naming         ███████████░░░░░░░░░  55
  Schema design  ███░░░░░░░░░░░░░░░░░  13
  Token cost     ████████████████████ 100

  Descriptions
    ✖ D002 [get_user] Description of "get_user" is only 12 chars ("Gets a user.").
      ↳ Expand to at least one full sentence: what it does, when to use it, what it returns.
    ...
```

## CI

```bash
mcpgrade <target> --json                # machine-readable
mcpgrade <target> --fail-on error       # exit 1 on errors — gate your PRs
mcpgrade <target> --disable S008,N001   # tune rules
mcpgrade rules                          # list all rules
```

## Why

I integrate first-party and third-party MCP connectors into a production AI agent for a living. Most MCP servers fail agents in the same ten ways — none of which show up in a spec compliance check. So I wrote the linter I wished server authors had run before shipping.


## mcpgrade vs mcp-lint

Different tools, different questions. [mcp-lint](https://www.npmjs.com/package/mcp-lint) checks whether your tool schemas *parse correctly* across clients (Claude, Cursor, OpenAI strict mode, ...) — syntax-level compatibility. mcpgrade measures whether a model can actually *use* your tools — description quality, naming confusion, token economics, and live LLM tool-selection accuracy. A server can pass mcp-lint cleanly and still score an F here, and vice versa. They compose well: lint for compatibility, grade for usability.

## Roadmap

- [x] v0.1 — static lint engine, 21 rules, A–F scoring
- [x] v0.2 — `--eval`: LLM-powered live testing — synthetic task generation, blind tool selection, argument validation, refusal accuracy, confusion pairs. Calibrated on real servers ([methodology](docs/eval-calibration.md)); costs ~$0.05–0.2 per server on Haiku. Bring your own `ANTHROPIC_API_KEY`, or any OpenAI-compatible endpoint via `--eval-base-url` (DeepSeek, OpenRouter, ...); `--eval-mock` runs offline. Respects `HTTPS_PROXY`.
- [ ] v0.3 — GitHub Action, dynamic badges, public leaderboard of popular MCP servers

## License

MIT
