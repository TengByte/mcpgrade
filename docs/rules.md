# mcplint Rules Reference

Every rule links to its rationale. Disagree? Open an issue — the ruleset is
opinionated by design, and disputes make it better. Disable any rule with
`--disable <ID>` or in `.mcplintrc.json`.

Severities: **error** (breaks agents) · **warn** (degrades agents) · **info** (polish).

References used throughout: [MCP spec — tools](https://modelcontextprotocol.io/specification),
[Anthropic tool-use best practices](https://docs.claude.com/en/docs/build-with-claude/tool-use),
JSON Schema draft-07.

---

## D — Descriptions (weight 30%)

### D001 · error · Tool is missing a description
The description is the model's *only* semantic signal for tool selection —
the name alone forces guessing.
**Bad:** `{"name": "gc_run"}` **Good:** `"Run garbage collection on the cache. Use when memory alerts fire. Returns bytes freed."`

### D002 · error · Description too short (<30 chars)
"Gets a user." tells the model nothing about *when* to prefer this tool over
`get_users`. A useful description answers: what it does, when to use it, what
it returns.

### D004 · error · Parameter missing a description
The dominant failure in the ecosystem (132/134 errors in one popular server).
Type systems know `url: string`; models need *which* URL, format, constraints.
zod users: add `.describe()`. **Bad:** `"url": {"type":"string"}`
**Good:** `"url": {"type":"string","description":"Full page URL incl. protocol, e.g. https://example.com/pricing"}`

### D005 · warn · Placeholder / dev-leftover text
`TODO`, `TBD`, `lorem`, `my tool` in production descriptions — ships every week.

### D006 · warn · Nearly identical descriptions across tools
If two descriptions are >85% similar, the model picks between them at random.
State explicitly when to use one vs. the other.

### D007 · info · Description doesn't state the return value
Models plan multi-step calls based on what a tool yields; say what comes back.

## N — Naming (weight 15%)

### N001 · warn · Mixed naming conventions
`get_user` + `createInvoice` in one catalog reads as two half-finished APIs;
consistency helps models generalize. snake_case is the de-facto MCP standard.

### N002 · error · Confusable tool names (edit distance ≤2)
`get_user` vs `get_users` is the classic. Models mix these up measurably —
put the distinguishing concept in the name: `get_user_by_id` / `list_users`.

### N003 · warn · Generic verb with no object
`process`, `handle`, `run`, `execute` — verbs without objects tell the model
nothing. Use verb_object: `search_issues`, `create_invoice`.

### N004 · info · Name and description semantically disjoint
If no meaningful token of the name appears in the description, one of the two
is misleading.

## S — Schema design (weight 30%)

### S001 · error · Missing input schema
Even zero-arg tools must declare `{"type":"object","properties":{}}` — an
absent schema makes argument construction pure guesswork.

### S002 · error · Parameter has no type
Untyped params get strings, numbers, or hallucinated objects at random.

### S003 · warn · No `required` array
Without it, the model must guess which params are optional. Declare it even
when empty — that's information too.

### S004 · warn · Overly permissive schema
`additionalProperties: true` or a bare `type: object` invites the model to
invent arguments. Close the schema; declare everything.

### S005 · warn · Enum candidates not enumerated
"must be one of: active, inactive" in prose is a constraint the model can
violate. `"enum": ["active","inactive"]` is one it can't.

### S006 · warn · Schema nested >3 levels
Argument accuracy drops with nesting depth. Flatten or split the tool.

### S007 · warn · More than 8 parameters
Same story: past ~8 params, argument quality degrades. Split the tool or
group related params into one described object.

### S008 · info · Complex parameter without example
For object/array params, one example in `examples` or an "e.g." in the
description measurably improves argument construction.

## T — Token cost (weight 15%)

### T001 · error · Catalog total >8k tokens
Agents pay your entire tools/list *on every request*. 8k tokens of schemas is
a tax on every user message. Budget configurable via `.mcplintrc.json`.

### T002 · warn · Single tool >1.2k tokens
One bloated schema usually means boilerplate descriptions or over-nested
structures.

### T003 · warn · Repeated boilerplate across descriptions
The same 40+ char preamble in every description multiplies token cost for
zero information gain.

### T004 · info · More than 25 tools in one server
Big catalogs dilute selection accuracy and burn tokens. Split by domain, or
gate rare tools behind a mode.

## C — Consistency (weight 10%)

### C001 · warn · Tools with heavily overlapping functionality
Two tools whose descriptions share >75% of their vocabulary compete for the
same intents; the model picks randomly. Merge, or cross-reference ("for X,
use tool_b instead").

### C002 · info · Mixed languages across descriptions
Some tools described in English, others in another language biases selection.

### C003 · warn · Non-actionable error messages (`--probe`)
Probed live: called with deliberately invalid args (an empty object where
required params exist — a correct server rejects at validation, so no side
effects). "Internal Server Error" strands the model; "Missing required
parameter 'query'" lets it self-correct in one turn.

### C004 · error · Schema not enforced (`--probe`)
The server *accepted* a call missing all required arguments. Declared
`required` that isn't enforced is worse than none — the model trusts it.

---

## Scoring

Findings are weighted (error 10 / warn 4 / info 1) and **density-normalized**
by tool count: 3 broken tools out of 3 is an F; 3 out of 30 is a dent.
Category scores combine with the weights above into 0–100 and A–F
(A ≥90, B ≥80, C ≥70, D ≥60, F <60).
