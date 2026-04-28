# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 09:21 Europe/Amsterdam — [ANKA-58](/ANKA/issues/ANKA-58) rail 7 malformed-fill fail-closed (fixes [ANKA-52](/ANKA/issues/ANKA-52) REQUEST CHANGES)

- Production fix landed under commit `c6c2247` and pushed to `origin/main`: rail 7 now rejects fail-closed when `broker.fill.filledPrice` or `broker.fill.intendedPrice` is non-finite, blocking the silent `allow` path that arose from `Math.abs(NaN) > cap === false`.
- Bumps: `@ankit-prop/ctrader-gateway` 0.2.8 → 0.2.9, root `ankit-prop-umbrella` 0.4.14 → 0.4.15. BLUEPRINT.md §9 rail 7 row + §3.5 fail-closed defaults table updated to match implementation.
- Verification: `bun test services/ctrader-gateway/src/hard-rails/rail-7-slippage-guard.spec.ts` 10 / 0 / 30; `bun test services/ctrader-gateway/src/hard-rails/` 87 / 0 / 536.
- Bookkeeping follow-up commit lands CHANGELOG 0.4.15 entry and journal entry that were reverted out of `c6c2247`'s staging set by a concurrent worktree edit.
- Next: hand [ANKA-58](/ANKA/issues/ANKA-58) to CodeReviewer + QAEngineer per AGENTS.md matrix; hand [ANKA-52](/ANKA/issues/ANKA-52) back to QAEngineer with note that fix landed at v0.2.9 and the focused regression now lands `reject`.

