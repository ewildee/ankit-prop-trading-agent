# Progress

- Current issue: [ANKA-381](/ANKA/issues/ANKA-381) — replay calendar/news rail wiring + v0 Judge persona rejection rules for [ANKA-378](/ANKA/issues/ANKA-378).
- Worktree: `.paperclip/worktrees/ANKA-378-12-hour-critical-review-of-merged-commits`.
- Bun llms.txt fetched/read: 2026-04-30 17:13 Europe/Amsterdam.
- Implemented required `JudgeInput.atrPips` contract surface and replay buildJudgeInput threading.
- Replay now reads provider calendar events, bounds lookahead by persona params, and passes the same context to the in-process gateway.
- In-process replay gateway now blocks approved/rejected OPENs on restricted news, 2 h pre-news, missing calendar provider, and outside active window before `submitted`.
- v0 Judge now enforces `outside_active_window` and `stop_inside_noise`; unimplemented declared persona rules fail closed.
- Local gate passed: `bun run lint:fix`; focused specs 44/0; `bun test` 633/0; `bun run typecheck`; diff/debug/numeric checks clean; trader start placeholder exits 0.
- Next: commit, push, then hand to [@FoundingEngineer](agent://4b1d307d-5e9b-4547-92a2-b5df512f5d80).
