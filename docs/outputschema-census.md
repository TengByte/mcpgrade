# outputSchema census (2026-07-29)

Motivation: multi-hop eval design (issue #8) hinges on whether tool dependency
graphs can be *declared* rather than inferred. `outputSchema` is the only
spec-level place that could carry the shape of a tool's return value.

Method: connect over stdio, `tools/list`, count tools where `outputSchema != null`.
Raw data: [`outputschema-census.json`](./outputschema-census.json).
Reproduce: `node scripts/count-outputschema.mjs`.

| Metric | Value |
|---|---|
| Servers reachable | 15 |
| Servers with ≥1 `outputSchema` | **5** |
| Tools total | 173 |
| Tools with `outputSchema` | **47 (27.2%)** |

## Per server

| Server | tools with outputSchema |
|---|---|
| server-memory | 9 / 9 |
| server-filesystem | 14 / 14 |
| mongodb-mcp-server | 22 / 25 |
| server-sequential-thinking | 1 / 1 |
| server-everything | 1 / 13 |
| server-github | 0 / 26 |
| firecrawl-mcp | 0 / 26 |
| todoist-mcp-server | 0 / 33 |
| server-slack | 0 / 8 |
| server-google-maps | 0 / 7 |
| elasticsearch | 0 / 4 |
| context7 | 0 / 2 |
| exa | 0 / 2 |
| airbnb | 0 / 2 |
| perplexity-ask | 0 / 1 |

## The finding that matters

Adoption is not zero — 27% of tools declare an output shape. But the
distribution is the story: **the servers whose tools are pipelined declare
nothing.** Slack (`thread_ts` comes from `get_channel_history`), context7
(library id comes from `resolve-library-id`), GitHub, firecrawl, todoist —
all zero. The servers that do populate `outputSchema` are largely
self-contained single-step catalogs where the return shape is least needed
for chaining.

Two consequences for issue #8:

1. Even at 27% coverage, `outputSchema` describes a *shape*, never a *linkage*.
   Nothing in MCP lets a server state that this tool's output field is that
   tool's required input.
2. Where chaining actually exists, output declarations are absent entirely, so
   a multi-hop eval cannot rely on them at all and must infer — making
   inference quality a hidden variable that has to be reported alongside any
   score.
