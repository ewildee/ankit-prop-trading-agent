# Progress

- Current issue: [ANKA-339](/ANKA/issues/ANKA-339) — CodeReviewer BLOCK follow-up for replay default deps.
- Worktree: `.paperclip/worktrees/ANKA-318-svc-trader-v0-vertical-slice-on-xauusd-7d-replay`.
- Bun llms.txt fetched/read: 2026-04-30 12:22 Europe/Amsterdam.
- Replay in-loop state implemented: open position snapshot, UTC day reset, and daily/overall risk budget mirror from remaining per-trade cap.
- Default replay deps pass real open-position state into Trader and Judge; Judge open exposure uses live position pct and same-side pct.
- Regression specs omit `deps`, inject only a test analyst generator, and prove adjacent same-side OPEN signals submit once then `existing_position_aligned` HOLD / `judge_reject`.
- Local gate passed: `bun run lint:fix`; focused replay+judge specs 12/0; `bun test` 625/0; `bun run typecheck`; persona numeric grep/diff check clean; trader start placeholder exits 0.
- Next: commit `fix(svc:trader/replay-adapter)`, then hand [ANKA-339](/ANKA/issues/ANKA-339) to QAEngineer.
