# Changelog

## 0.3.0 (2026-07-31)

- **`mcpgrade serve` — MCP server mode.** mcpgrade now runs as an MCP server so an
  agent can grade other servers: `claude mcp add mcpgrade -- npx -y mcpgrade serve`.
  Three tools: `grade_mcp_server`, `explain_rule`, `list_grading_rules`.
  Local launch commands are restricted to an allowlist, since the target string is
  model-chosen; URLs and snapshots are unrestricted. The CLI is unaffected.
- **Dogfooding guard in CI.** The serve catalog is graded by mcpgrade itself and must
  hold A with zero errors (currently A/96).
- **`envFingerprint` in every eval result** (#3): catalog content hash, tool count,
  model + temperature, versioned selection prompt with hash, serializer version,
  task policy, timestamp — plus `comparable(a, b)`. Temperature was previously the
  provider default and unrecorded; it is now pinned to 0 across all clients.
- **Rule documentation is now a single source of truth** (`src/rule-docs.ts`,
  generated from `docs/rules.md`), shared by the `rules` command and serve mode.
- Docs: `docs/outputschema-census.md` (outputSchema adoption across 15 servers) and
  `docs/rule-overlap-audit.md` (D004 entails S008; the double charge is regressive).

## 0.1.0

Initial release.

- 24 static rules across five categories: descriptions (D), naming (N),
  schema design (S), token cost (T), catalog consistency (C)
- Density-normalized 0–100 scoring with A–F grades
- Targets: streamable HTTP, stdio command, or saved tools/list JSON snapshot
- `--probe`: opt-in live error-quality checks (C003 non-actionable errors,
  C004 schema-not-enforced)
- `--eval` (beta): LLM-powered tool-selection accuracy testing with synthetic
  tasks, argument validation, and confusion pairs; `--eval-mock` for offline runs
- `--json`, `--fail-on <severity>` for CI; `.mcpgraderc.json` config;
  `--disable <rules>`; `rules` / `rules explain` commands
- GitHub Action (composite) via `action.yml`
