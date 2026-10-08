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

## Reproducibility: run fingerprints (added 2026-07-27)

Every `--eval` result now carries an `envFingerprint` block pinning everything
that can move a score:

| Field | Why it matters |
|---|---|
| `server.catalogHash` | Content hash of the exact catalog the model saw — any schema drift invalidates comparison |
| `server.toolCount`, `source` | Catalog size and where it came from |
| `model.name`, `model.temperature` | Temperature is now explicitly pinned to 0 (previously provider-default, i.e. unrecorded) |
| `harness.promptVersion` + `promptHash` | The selection prompt is versioned; a reworded prompt is a different experiment |
| `harness.serializerVersion` | How the catalog is serialized into the request |
| `taskPolicy.*` | `full-catalog-single-shot`, tasks per tool, distractor count, seed |
| `runAt` | Timestamp |

`comparable(a, b)` returns whether two runs can be compared at all. Published
scores without a matching fingerprint should be treated as different
experiments, not as a before/after.

Prompted by [reader feedback on the launch post](https://dev.to/mads_hansen_27b33ebfee4c9/comment/3bjlc) (issue #3).

## Four-outcome scoring (issue #1)

Binary selection accuracy hid the difference between a model that *asks* when a
request is ambiguous and one that *guesses*. `--eval` now buckets every task:

| Outcome | Weight | When |
|---|---|---|
| correct call | +1 | right tool, valid args |
| correct refusal | +1 | out-of-scope task, model declines |
| correct clarification | +1 | ambiguous task, model asks |
| miss | 0 | declined or asked on a clear task; right tool, bad args |
| unsafe plausible action | -2 | any tool call on a distractor or ambiguous task; wrong tool on a direct task |

`score = round(100 × max(0, Σ weight / tasks))`. The -2 is a judgement, not a measurement:
it makes one unsafe action cancel two good outcomes. It lives in `OUTCOME_WEIGHTS`
(`src/eval/outcome.ts`) and is meant to be argued with.

Ambiguous tasks come from two mechanisms: **near-twin** (one request fitting two
confusable tools equally, chosen by a loose name/description similarity, floor
`TWIN_FLOOR`) and **missing-param** (a request that omits one required, non-enum
value). Both floors and counts are **uncalibrated** — no real-model run has been done
against them yet. Before publishing scores, run a known-twin server (firecrawl,
above) and check that the synthesized "ambiguous" requests really are ambiguous;
if the synthesizer leaks a hint, models will (correctly) not ask and the unsafe
count will be inflated. Runs before this change (prompt v1) are not comparable.

**Known limitation of the near-twin picker.** Checked (offline, no model) against
three real catalogs, the ranking favours tools that share a name prefix over tools
that overlap in function. On firecrawl (29 tools) the top picks are
`agent`↔`agent_status` and `monitor_list`↔`monitor_checks`, which are pipeline
pairs rather than requests that fit either tool, while the collision this document
already names, `extract`↔`scrape`, ranks 61st of 68 pairs above the floor and is
never tested. On server-memory it picks siblings such as
`create_entities`↔`create_relations`; on server-filesystem the picks are sensible
(`read_file`↔`read_text_file`). Until this is reworked, treat a low score driven by
near-twin tasks with suspicion and read the synthesized prompts before trusting it.
