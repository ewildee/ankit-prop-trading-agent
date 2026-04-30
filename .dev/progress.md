# Progress

- Current issue: [ANKA-398](/ANKA/issues/ANKA-398) — Analyst wrapper keys rejected by strict generation Zod.
- Worktree: `.paperclip/worktrees/ANKA-318-svc-trader-v0-vertical-slice-on-xauusd-7d-replay`.
- Bun llms.txt fetched/read: 2026-04-30 20:16 Europe/Amsterdam.
- Codebase retrieval returned HTTP 429 once; context came from the issue brief, BLUEPRINT §0/§5/§13/§17/§22/§25, and targeted Analyst source/spec reads.
- Implemented tight Option A+C: strip only `personaId`, `instrument`, `timeframe`, `decidedAt` before strict generation parse; warn on dropped wrapper keys; prompt says not to include wrapper/context fields.
- Canonical `packages/shared-contracts/src/personas.ts` `AnalystOutput` strictness remains untouched; arbitrary unknown generator keys still fail.
- Version staged: `@ankit-prop/trader` 0.9.4 -> 0.9.5; root `CHANGELOG.md` updated because no `services/trader/CHANGELOG.md` exists on this branch.
- Locked checks passed: trader `lint && typecheck && test` (69/0), targeted Analyst spec (20/0), `git diff --check`, and debug scan clean.
- Partial 7d replay smoke `anka398-codex-20260430T182012Z`: 161 decisions through `2026-04-21T13:25Z`, 18 active Analyst calls, 2 submitted actions, 0 rail breach entries, no `unrecognized_keys` crash.
- `bun run --cwd services/trader start` exits 0 with replay-only placeholder and no live `/health` endpoint in this phase.
- Next: commit/push and hand [ANKA-398](/ANKA/issues/ANKA-398) to CodeReviewer.
