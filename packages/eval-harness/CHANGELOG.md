# Changelog

All notable changes to `@ankit-prop/eval-harness`. Newest first.

## 0.2.2 — 2026-04-30 01:30 Europe/Amsterdam (PR #34 BLOCK follow-up)

**Initiated by:** FoundingEngineer, addressing CodeReviewer BLOCK on PR #34 (replay-harness branch → `main`) — `ANKA-287`.

**Why:** Reviewer reproduced a second-class fail-open on `replayWithProvider()`: a `CachedFixtureProvider` constructed without `instrumentSpecs` returns `SymbolMeta` rows with `pipSize: 0`, `contractSize: 0`, `typicalSpreadPips: 0`. With those zeros, the simulator runs but produces a clean-looking `realizedPnl: 0`, `initialRisk: 0`, `breaches: 0` `EvalResult` for `OPEN_HOLD_CLOSE_V1` over `XAUUSD`. That violates BLUEPRINT §0.2 fail-closed discipline on a risk-adjacent surface.

**Added** — `pkg:eval-harness/replay-driver`

- `ReplaySymbolMetaInvalid` error class + `InvalidSymbolMetaFinding` type, exported from the package barrel. Each finding lists the per-symbol invalid fields out of `pipSize` / `contractSize` / `typicalSpreadPips`.
- `assertSymbolMetaBrokerFields(input)` runs after `assertSymbolMetaCoverage(input)` and rejects any requested-symbol meta whose `pipSize` / `contractSize` / `typicalSpreadPips` is non-finite or `<= 0`.
- Spec `replay-driver.spec.ts`: regression case using a `CachedFixtureProvider` without `instrumentSpecs` proves the zeroed-meta path is now rejected with all three invalid fields reported. A second case exhaustively covers `NaN` / `Infinity` / negative on each field with direct `SymbolMeta` input.

**Verification**

- `bun test packages/eval-harness/src/replay-driver.spec.ts` → 9 pass / 0 fail / 8106 expects (was 7/8112 before; 2 new cases, large expect-count change is from the zeroed-meta probe + per-field assertions).

## 0.2.1 — 2026-04-30 00:45 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-285](/ANKA/issues/ANKA-285) under parent [ANKA-70](/ANKA/issues/ANKA-70).

**Added**

- Full-window replay baseline snapshots for `noop_v1` and `open_hold_close_v1` against `v1.0.0-2026-04-28` / `xauusd_5m`.
- Baseline spec coverage for the new `windowMode: 'full'` snapshots while retaining the existing smoke snapshot checks.
