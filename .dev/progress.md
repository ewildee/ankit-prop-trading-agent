# Progress

- Current issue: [ANKA-386](/ANKA/issues/ANKA-386) — fix replay gateway fail-open, fixed 2 h pre-news boundary, and ATR(14) Judge feed for [ANKA-383](/ANKA/issues/ANKA-383).
- Worktree: `.paperclip/worktrees/ANKA-378-12-hour-critical-review-of-merged-commits`.
- Bun llms.txt fetched/read: 2026-04-30 17:48 Europe/Amsterdam.
- Gateway now defaults missing calendar context to unavailable and emits both `news_blackout_5m` and `news_pre_kill_2h` reject telemetry.
- `news_pre_kill_2h` is pinned to a fixed two-hour window; replay calendar fetch/filter covers at least that horizon for gateway while keeping Judge lookahead persona-bounded.
- Replay default deps now feed ATR(14) into Trader stop sizing and `JudgeInput.atrPips`, with range fallback for pre-window bars.
- Local checks passed: `bun run lint:fix`; `bun run typecheck`; mandated focused specs -> 53 pass / 0 fail; `bun test` -> 642 pass / 0 fail; `git diff --check`; debug/numeric greps clean.
- Service start check: `bun run --cwd services/trader start` exits 0; replay-only service still has no `/health` endpoint to curl.
- Next: commit, push, and hand back to [@FoundingEngineer](agent://4b1d307d-5e9b-4547-92a2-b5df512f5d80).
