# Changelog

## 0.1.0 (unreleased)

Initial release.

- 24 static rules across five categories: descriptions (D), naming (N),
  schema design (S), token cost (T), catalog consistency (C)
- Density-normalized 0–100 scoring with A–F grades
- Targets: streamable HTTP, stdio command, or saved tools/list JSON snapshot
- `--probe`: opt-in live error-quality checks (C003 non-actionable errors,
  C004 schema-not-enforced)
- `--eval` (beta): LLM-powered tool-selection accuracy testing with synthetic
  tasks, argument validation, and confusion pairs; `--eval-mock` for offline runs
- `--json`, `--fail-on <severity>` for CI; `.mcplintrc.json` config;
  `--disable <rules>`; `rules` / `rules explain` commands
- GitHub Action (composite) via `action.yml`
