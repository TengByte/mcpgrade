# Eval calibration notes (2026-07-12, claude-haiku-4-5)

Run on 3 real servers via user's machine (sandbox blocks external API keys).

## Round 1 results

| Server | Static | Selection | Args | Refusal | Tokens (in/out) |
|---|---|---|---|---|---|
| @upstash/context7-mcp (2 tools) | 100* | 38% | 100% | 100% | 12.0k / 2.1k |
| server-memory (9 tools) | B/81 | 93% | 100% | 100% | 35.6k / 3.5k |
| server-slack (8 tools) | A/97 | 54% | 100% | 100% | 25.1k / 3.4k |

*context7 static=100 on user's machine (latest version) vs 70 in earlier scan
(v3.2.3) — they fixed their param descriptions between versions. Point-in-time
caveat is real.

## Key finding: single-shot selection eval is unfair to pipelined tools

The catastrophic-looking scores (context7 38%, slack 54%) trace to one cause:
tools whose required params come from a *previous* tool call (thread_ts,
library id). Synthesized tasks lacked those values, so the model correctly
chose the prerequisite tool (get_channel_history, resolve-library-id) or
declined — and got marked wrong. memory's 93% confirms: single-step tools
score fine.

**Fix (v0.2.1):** synthesis prompt now requires every task to embed concrete
values for all required params, so one-step selection is fair.

## Round 2 (after fix)

| Server | Selection R1 → R2 | Args | Refusal |
|---|---|---|---|
| context7 | 38% → **100%** | 100% | 100% |
| server-slack | 54% → **100%** | 100% | 100% |

Fix validated.

## Round 3: discriminative power (firecrawl, 26 tools)

| Metric | Score |
|---|---|
| Tool selection | **84%** (vs 100% for well-documented servers) |
| Argument validity | 100% |
| **Refusal accuracy** | **50%** |

Discriminative power confirmed, with two headline findings:

1. **Selection misses land exactly on naming collisions** — extract↔scrape,
   agent_status↔check_crawl_status, feedback↔search_feedback — the same pairs
   static rules N002/C001 flag. Static lint predicts live model confusion.
2. **Refusal collapses on big fuzzy catalogs (50%)**: given out-of-scope
   tasks, the model "finds" a plausible tool half the time instead of
   declining. The bigger and vaguer the catalog, the more likely an agent
   does *something* when it should do *nothing* — arguably the most dangerous
   failure mode in production.

## Verdict

Calibration complete (3 rounds, 4 servers, ~$0.6 total). Metrics are fair
(R2), discriminative (R3), and cheap (~$0.04–0.2/server on Haiku). v0.2
eval is publishable alongside static scores.

## Cost (Haiku)

3 servers ≈ 73k in / 9k out ≈ **$0.12 total, ~$0.04/server** (small catalogs).
Extrapolated full 36-server sweep: **≈ $1.5–2**. Cheaper than budgeted.

## Secondary observations

- Argument validity 100% across the board — when the model picks right, Haiku
  fills args correctly on these catalogs. Signal may saturate; consider
  harder arg cases later.
- Refusal accuracy 100% — distractor design works.
- Confusion pairs surfaced exactly the intuitive collisions
  (create_relations→create_entities, get_channel_history→list_channels).
