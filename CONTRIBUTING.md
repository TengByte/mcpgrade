# Contributing

## Disputing a rule

The rules are opinionated by design. If you think one is wrong, open an issue
titled `rule: <ID> <what's wrong>` — bring a concrete counterexample (a real
tool schema where the rule misfires). Rules with repeated, evidenced disputes
get demoted (error→warn→info) or gain escape hatches before being removed.

## Adding a rule

1. One rule per export in `src/rules/<category>.ts`, implementing the `Rule`
   interface — `id`, `severity`, `category`, `title`, `check(snapshot)`.
2. Every finding MUST include a concrete `fix` — "description too short" is
   not a fix; "state what it does, when to use it, what it returns" is.
3. Add the rule to `docs/rules.md` (rationale + bad/good example). Docs and
   implementation must never drift.
4. Add a fixture case in `test/` — one snapshot that triggers it, one that
   doesn't.
5. `npm test` green, `npx tsc` clean.

## Development

```bash
npm install
npm run dev -- examples/bad-server.json   # run CLI from source
npm test
```

## Re-scan requests

Fixed your server's score? Open an issue titled `rescan: <server name>` with
the npm package or repo link — I'll re-run and update the leaderboard.
