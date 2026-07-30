# Rule overlap audit (2026-07-29)

Prompted by [FromZeroToShip](https://dev.to/fromzerotoship/comment/3c60f), who
found the same class of bug in his own scanner: rules that overlap on a pattern
read as "well covered" when they are one detection wearing several names.

Reproduce: `node scripts/rule-overlap-audit.mjs --stdio "<cmd>" ...`
Raw data: [`rule-overlap-audit.json`](./rule-overlap-audit.json).

## Method

Findings are keyed by the concrete subject they point at — `tool::parameter`.
Any two rules firing on the same subject co-occur. A pair is an **entailment**
when one rule's firing condition is implied by the other's; entailed pairs are
one defect observed at two granularities and should be charged once. Genuinely
orthogonal co-occurrence deserves two charges.

## Co-occurrence across 12 servers

| Pair | Subjects where both fire |
|---|---|
| **D004 + S008** | **75** |
| D007 + S006 | 7 |
| D001 + S003 | 4 |
| D007 + N004 | 4 |
| D006 + D007 | 2 |
| others | ≤2 each |

D004+S008 is an order of magnitude ahead of everything else, and it is not
coincidence — it is an implication:

- `D004` fires when a parameter has no description (and no enum).
- `S008` fires when a *complex* parameter has no `examples` **and** its
  description lacks `"e.g."`.

A parameter with no description trivially has no `"e.g."` in it. So for any
complex parameter without an `examples` field, **D004 entails S008**. The only
escape is a parameter that populates `examples` but no prose description.

## Score impact of collapsing the entailment

| Server | before | after | Δ | dropped |
|---|---|---|---|---|
| firecrawl-fastmcp | 58 **F** | 63 **D** | +5 | 46 |
| MongoDB MCP Server | 66 D | 67 D | +1 | 14 |
| github-mcp-server | 67 D | 68 D | +1 | 5 |
| memory-server | 78 C | 79 C | +1 | 4 |
| slack, google-maps, shrimp, elasticsearch, airbnb, context7, todoist, filesystem | unchanged | | 0 | 0–3 |

**One grade flip (firecrawl F → D), and every affected server is at the bottom
of the table.** No A-grade server is touched: catalogs that document their
parameters never trip D004, so they can never be double-charged.

## What this means

The double charge is **regressive, not random**. It does not scramble rankings
(no rank inversions in this sample) — it systematically inflates the penalty on
exactly one defect class, undocumented complex parameters, on exactly the
catalogs that already score worst. The measurement error concentrates where the
consequences are loudest: the bottom of a public leaderboard, where a letter
grade is what maintainers actually react to.

That is also a prioritization error in the sense FromZeroToShip describes:
remediation attention flows toward the shape the ruleset over-counts. Here it
happens to point at a real and important defect, which is luck, not design.

## Fix (tracked in #9)

1. Declare entailments in the ruleset as data, not folklore: `S008 ⊂ D004`.
2. Collapse entailed findings to a single charge at scoring time; keep both in
   the *report* so the diagnosis stays granular.
3. Re-scan all 36 servers under the corrected model and label leaderboard rows
   with the scoring version that produced them (ties into `envFingerprint`, #3).
4. Re-run this audit as a CI check so a new rule that quietly entails an old one
   shows up as a co-occurrence spike rather than as a silent penalty increase.
