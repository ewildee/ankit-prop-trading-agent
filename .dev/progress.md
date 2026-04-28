# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 05:22 Europe/Amsterdam — v0.4.12 ([ANKA-43](/ANKA/issues/ANKA-43) — QA regression coverage verified after blockers resolved)

- Fetched and read `https://bun.com/llms.txt` again at 2026-04-28 05:22 Europe/Amsterdam before resuming verification work.
- Blockers resolved in HEAD: [ANKA-40](/ANKA/issues/ANKA-40) commit `cec4a6a` covers rail 7 missing-fill fail-closed; [ANKA-41](/ANKA/issues/ANKA-41) commit `68cbdff` covers high-impact pre-news, Europe/Prague day buckets, and strategy-close balance.
- Focused ANKA-43 command: `bun test services/ctrader-gateway/src/hard-rails/pre-post-fill-split.spec.ts services/ctrader-gateway/src/hard-rails/rail-7-slippage-guard.spec.ts packages/eval-harness/src/backtest.spec.ts packages/eval-harness/src/sim-engine.spec.ts packages/eval-harness/src/prague-day.spec.ts` = 18 pass / 0 fail / 62 expects.
- Full gates: `bun run lint:fix` exit 0 (no fixes; only known unsafe suggestions / `ctrader-vendor` warning), `bun test` 246 pass / 0 fail / 1662 expects, `bun run typecheck` clean.
- Next: mark [ANKA-43](/ANKA/issues/ANKA-43) done; no extra commit needed because the regression files are already committed in the blocker-fix commits above.
