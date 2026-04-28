# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 14:47 Europe/Amsterdam — [ANKA-97](/ANKA/issues/ANKA-97) TwelveData XAUUSD saturation/root-dir remediation

- Wake reason: direct assignment; [ANKA-97](/ANKA/issues/ANKA-97) blocks [ANKA-76](/ANKA/issues/ANKA-76) live `--apply` rerun.
- BLUEPRINT §0.2 Bun-runtime proof: fetched `https://bun.com/llms.txt` at 14:21 Europe/Amsterdam (33,157 bytes) before editing Bun-runtime code.
- Re-read BLUEPRINT §0/§0.1/§0.2, §5.1-§5.3, §17, §22, and §25 before fixture work.
- Implemented planner/fetcher alignment: XAUUSD estimates now use 24h calendar days; dry-plan calls use the same 0.75 page-capacity margin as chunk sizing.
- Implemented exact chunk windows and a 3-page saturated/no-progress cap to abort runaway TD backfill cascades.
- Anchored default `td-fetch --root-dir` at repo-root `data/market-data/twelvedata/<fixtureVersion>` even when invoked with package `--cwd`.
- Added regression coverage for 90-day XAUUSD/1m latest-N TD saturation semantics, saturation cap, planner call math, and cwd-independent default root.
- Verification so far: `bun install` no changes; `bun run lint:fix` exits 0 with pre-existing warnings; `bun test --cwd packages/market-data-twelvedata` 41/0; `bun run typecheck` clean; `td-fetch plan` now estimates 61 credits (XAUUSD/1m 35 calls).
