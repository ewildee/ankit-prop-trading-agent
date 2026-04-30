# Progress

- Current issue: [ANKA-339](/ANKA/issues/ANKA-339) — Trader policy v0 + Judge v0.
- Worktree: `.paperclip/worktrees/ANKA-318-svc-trader-v0-vertical-slice-on-xauusd-7d-replay`.
- Bun llms.txt fetched/read: 2026-04-30 11:44 Europe/Amsterdam.
- Implemented deterministic `createVAnkitClassicTrader` and `createVAnkitClassicJudge`.
- Trader emits only `HOLD | OPEN | CLOSE`; confidence, risk, RR, stop multiple, and judge threshold source from `params.yaml`.
- Runner now evaluates Judge for `HOLD` when explicit risk context is installed; default no-context actionable outputs still fail closed before Judge/Gateway.
- Replay default deps now wire real Trader/Judge for `v_ankit_classic` and build minimal risk/spread/exposure JudgeInput.
- Local gate passed: `bun run lint:fix`; focused Trader/Judge/runner/replay tests 24/0; `bun test` 623/0; `bun run typecheck`; diff/debug scans; service start placeholder.
- Persona-path numeric grep over `services/trader/src/trader/*.ts services/trader/src/judge/*.ts` returns no hits.
- Service check: `bun run --cwd services/trader start` exits 0 with the replay-adapter placeholder; no `/health` endpoint exists yet.
- Next: finish lint/typecheck/full test, commit scoped ANKA-339 changes, push, then hand to QAEngineer.
