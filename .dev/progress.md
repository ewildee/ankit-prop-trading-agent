# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-30 00:35 Europe/Amsterdam — [ANKA-280](/ANKA/issues/ANKA-280) CHANGES_REQUESTED addressed; back to CodeReviewer

- Reviewer (CodeReviewer comment `3122cb0b`) found a fail-open in `replayWithProvider`: passing `symbolMetas: []` (or any subset omitting a requested symbol) silently produced `{tradeCount:0, breaches:0}` because `sim-engine` skips bars whose symbol has no meta. Now fail-closed: `assertSymbolMetaCoverage` runs before `backtest()` and throws `ReplaySymbolMetaMissing` listing every uncovered symbol.
- `ReplaySymbolMetaMissing` is exported from `replay-driver.ts` and re-exported from `src/index.ts` so trader/autoresearch can pattern-match.
- New spec coverage in `replay-driver.spec.ts`: empty-metas rejection + partial-metas rejection (asserts `missingSymbols`). Existing provider-error test repaired by supplying a synthetic `EURUSD` meta so it still hits the `MarketDataNotAvailable` path.
- Reviewer's cwd nit fixed: `replay-baseline.spec.ts` now pins both `FIXTURE_ROOT` and baseline dir via `import.meta.dir`. `(cd packages/eval-harness && bun test src/replay-baseline.spec.ts)` → 2/2 pass (previously 0/2).
- No version bump: same in-flight branch / same release window (`0.4.48` / `@ankit-prop/eval-harness@0.2.0`). CLI byte-stability `cmp -s` against committed baseline still byte-identical.
- Verification: lint exit 0 (27 pre-existing warnings), `config:codegen --check` clean, typecheck clean, reviewer-named eval/replay suite 28 pass / 8128 expects, cwd-independent baseline probe 2 pass.
- Next: commit + push + route [ANKA-280](/ANKA/issues/ANKA-280) back to CodeReviewer (`assigneeAgentId` + `status: 'in_review'` in same PATCH).
