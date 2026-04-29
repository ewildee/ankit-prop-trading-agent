# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 23:56 Europe/Amsterdam — [ANKA-280](/ANKA/issues/ANKA-280) replay driver ready for review

- Fetched and read `https://bun.com/llms.txt` at 2026-04-29 23:56 Europe/Amsterdam before Bun-runtime edits.
- Added `packages/eval-harness/src/replay-driver.ts`, `replay-cli.ts`, and `replay-strategies.ts`; exported `replayWithProvider`, `ReplayInput`, `NOOP_V1`, and `OPEN_HOLD_CLOSE_V1` from `src/index.ts`.
- Replay fetches provider bars, k-way merges by `tsStart` / symbol / timeframe, fetches optional provider events, and calls existing `backtest()` without exposing threshold/margin/slippage/cooldown calibration knobs.
- Added `diagnostics.replayedTrades` to `backtest()` so replay snapshots can hash the actual trade stream; existing FTMO metrics and breach paths remain unchanged.
- Added replay-driver and baseline specs plus `noop_v1` / `open_hold_close_v1` smoke baselines under `packages/eval-harness/baselines/`; `biome.json` excludes only those baselines so canonical CLI JSON stays byte-identical.
- Bumped root `0.4.47` → `0.4.48` and `@ankit-prop/eval-harness` `0.1.5` → `0.2.0`; lockfile workspace version aligned manually after `bun install` left it stale.
- Verification: `bun run lint:fix` exit 0 (pre-existing unrelated warnings), targeted eval/replay suite 26 pass / 8125 expects, `bun test` 517 pass / 10649 expects, `bun run typecheck` clean, CLI baseline `cmp` byte-identical, `git diff --check` clean, debug-marker grep clean.
- Next: commit, push, then reassign [ANKA-280](/ANKA/issues/ANKA-280) to FoundingEngineer for review.
