# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 09:11 Europe/Amsterdam — [ANKA-158](/ANKA/issues/ANKA-158) merged; [ANKA-129](/ANKA/issues/ANKA-129) closed; F1 of [ANKA-85](/ANKA/issues/ANKA-85) live

- PR [#4](https://github.com/ewildee/ankit-prop-trading-agent/pull/4) rebased onto `main` (was `CONFLICTING` against `4e3cd76`), version-slot collision on contracts `0.5.0` resolved by promoting to `0.6.0`; root `0.4.33`, eval-harness `0.1.4`.
- Merged at `0e5505a` after CodeReviewer APPROVE on the original head `ccecc67`. Local main fast-forwarded; worktree `.paperclip/worktrees/ANKA-158` removed; merged branch `anka-129-contracts-time` deleted.
- Post-rebase verification: `bun test` 367 pass / 0 fail / 2147 expects (now includes [ANKA-131](/ANKA/issues/ANKA-131) + [ANKA-133](/ANKA/issues/ANKA-133) suites), targeted Prague + sim/ftmo specs 30 pass / 974 expects, `bun run typecheck` clean, `bun run lint` exit 0.
- `@ankit-prop/contracts@0.6.0` now ships both the Treaty client surface (from [ANKA-131](/ANKA/issues/ANKA-131)) and the Prague day-bucket surface (from [ANKA-129](/ANKA/issues/ANKA-129)) on `main`.
- Next: re-scan [ANKA-85](/ANKA/issues/ANKA-85) plan for the next F-deliverable now that F1 is on `main` (F2/F3/F4 already shipped via [ANKA-130](/ANKA/issues/ANKA-130) / [ANKA-131](/ANKA/issues/ANKA-131) / [ANKA-133](/ANKA/issues/ANKA-133)); decide whether [ANKA-85](/ANKA/issues/ANKA-85) itself can fall to `done`.
