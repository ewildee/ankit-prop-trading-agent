# Progress

- Current issue: [ANKA-339](/ANKA/issues/ANKA-339) — QA pass for Trader policy v0 + Judge v0.
- Worktree: `.paperclip/worktrees/ANKA-318-svc-trader-v0-vertical-slice-on-xauusd-7d-replay`.
- Bun llms.txt fetched/read: 2026-04-30 12:00 Europe/Amsterdam.
- QA found and covered one runner gap: explicit risk-context `HOLD` now has a regression spec for Judge `trader_hold` -> gateway `not_submitted/judge_reject`.
- Mutation check passed: temporary old gateway ordering made the new runner spec fail with `Received: "hold"`; restored implementation.
- Local gate passed: `bun run lint:fix`; focused Trader/Judge/runner/replay specs 25/0; `bun test` 624/0; `bun run typecheck`; persona numeric grep/diff check clean; trader start placeholder exits 0.
- Next: commit `test(svc:trader/instance-pipeline)`, push, then hand [ANKA-339](/ANKA/issues/ANKA-339) to CodeReviewer.
