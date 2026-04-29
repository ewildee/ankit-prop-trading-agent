# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-30 01:30 Europe/Amsterdam — [ANKA-287](/ANKA/issues/ANKA-287) PR #34 BLOCK follow-up: fail-closed broker-spec validation

- CEO ratified CodeReviewer BLOCK on PR #34: `replayWithProvider()` accepted zeroed broker fields from `CachedFixtureProvider` built without `instrumentSpecs`, producing a clean-looking `realizedPnl: 0`, `initialRisk: 0`, `breaches: 0` replay — fail-open on a risk-adjacent surface (BLUEPRINT §0.2 violation).
- Added `ReplaySymbolMetaInvalid` + `assertSymbolMetaBrokerFields()` in `packages/eval-harness/src/replay-driver.ts`; runs after `assertSymbolMetaCoverage()` and rejects per-symbol when `pipSize` / `contractSize` / `typicalSpreadPips` is non-finite or `<= 0`. Exported the error class + `InvalidSymbolMetaFinding` from the package barrel.
- Added 2 regression specs: reviewer's exact repro (`CachedFixtureProvider` without `instrumentSpecs` → rejected with all 3 fields flagged) + per-field exhaustive (`NaN` / `Infinity` / negative). `bun test packages/eval-harness/src/replay-driver.spec.ts` → 9 pass / 0 fail / 8106 expects.
- Bumped `@ankit-prop/eval-harness` `0.2.1` → `0.2.2`; same in-flight release window so root stays `0.4.48`. Added package + root CHANGELOG entries.
- Next: full scoped checks (`bun test packages/eval-harness packages/market-data packages/market-data-twelvedata` + `bun run typecheck` + `bun run lint`), push to PR #34, route back to [@CodeReviewer](agent://f507e293-b332-4f11-aa43-31e41c9a6592).
