# How mcpgrade compares to other MCP quality tools

Fair question, worth a precise answer. Each tool below answers a *different
question* about your server. Ran side-by-side where possible (July 2026).

| Tool | The question it answers | Overlap with mcpgrade |
|---|---|---|
| **mcpgrade** (this) | *Can a model actually use your tools?* — description quality, naming confusion, token economics, live LLM selection/refusal accuracy | — |
| [mcp-lint](https://www.npmjs.com/package/mcp-lint) | *Do your schemas parse correctly in every client?* — Claude/Cursor/Gemini/OpenAI-strict quirks, autofix, compat matrix | small (both flag missing param descriptions, deep nesting) |
| [mcp-compliance](https://github.com/YawLabs/mcp-compliance) | *Does your server implement the MCP spec correctly?* — transport, lifecycle, protocol conformance | none |
| [MCP Inspector](https://github.com/modelcontextprotocol/inspector) | *What does my server expose right now?* — manual, exploratory debugging UI | none (different job) |
| MCPSpec | *Did this release change behavior?* — record/replay regression diffing | none |

## The concrete difference, on one file

We keep a deliberately broken server in [`examples/bad-server.json`](../examples/bad-server.json):
a tool literally named `process` with a `TODO` description and no schema,
`get_user`/`get_users` twins with identical 12-char descriptions, prose-instead-of-enum,
6-level nesting.

**mcp-lint 0.5.3** (`--score`): overall **C / 64**. The `process` tool scores
**B / 80** — second best in the file — because an almost-empty tool has almost
nothing to violate client compatibility rules. Its findings: missing Cursor
`title`s, missing `additionalProperties: false` for OpenAI strict mode,
`integer` type, one missing param description (warning).

**mcpgrade 0.1.0**: overall **F / 28**. The same `process` tool triggers
placeholder-description, generic-verb-name, and missing-schema errors; the
`get_user`/`get_users` pair triggers confusable-names and duplicate-description
errors — the exact failures that make a model pick the wrong tool or guess
arguments in production.

Neither result is wrong. They're grading different exams.

## What mcp-lint catches that we deliberately don't

Client-specific compatibility is real and mcp-lint does it well: OpenAI strict
mode's `additionalProperties` requirement, Cursor's `title` display, Gemini's
default-value preferences, unsupported JSON Schema keywords per client. mcpgrade
ignores all of that on purpose — it's orthogonal to whether a model *understands*
your tools.

## Recommendation

Run both. `mcp-lint` before you ship to make sure every client can parse you;
`mcpgrade` before you ship to make sure a model can use you. A server can pass
one and fail the other in either direction — as the example above shows.
