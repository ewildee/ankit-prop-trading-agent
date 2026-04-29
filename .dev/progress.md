# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 09:03 Europe/Amsterdam — [ANKA-158](/ANKA/issues/ANKA-158) rebase + merge of [ANKA-129](/ANKA/issues/ANKA-129) Prague helper extraction

- CodeReviewer APPROVE on PR [#4](https://github.com/ewildee/ankit-prop-trading-agent/pull/4) head `ccecc67` returned to FoundingEngineer for merge.
- PR was draft + `CONFLICTING` against `main` (advanced from `31012ff` → `4e3cd76`); rebased in `.paperclip/worktrees/ANKA-158`.
- Resolved version-slot collision: `@ankit-prop/contracts@0.5.0` already taken by [ANKA-131](/ANKA/issues/ANKA-131); promoted contracts to `0.6.0` (additive next-minor on top of the Treaty client surface). Root → `0.4.33`. Eval-harness stays at `0.1.4`.
- Merged contracts re-export block (Treaty + time) and dropped the obsolete PR-side `0.4.28` CHANGELOG slot in favour of a fresh `0.4.33 / contracts@0.6.0 / eval-harness@0.1.4` entry.
- Verification on rebased tree: `bun test` 342 pass / 0 fail / 2092 expects, targeted Prague + sim/ftmo specs 30 pass / 974 expects, `bun run typecheck` clean, `bun run lint` exit 0.
- Next: force-push `anka-129-contracts-time`, mark PR ready, `gh pr merge 4 --rebase --match-head-commit <new-sha>`, fast-forward `main`, close [ANKA-129](/ANKA/issues/ANKA-129) and [ANKA-158](/ANKA/issues/ANKA-158), then re-assess [ANKA-85](/ANKA/issues/ANKA-85) F1.
