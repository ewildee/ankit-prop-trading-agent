# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 09:24 Europe/Amsterdam — [ANKA-163](/ANKA/issues/ANKA-163) restricted-window evaluator ready

- Worktree: `.paperclip/worktrees/ANKA-163`, branch `feat/anka-163-restricted-window`.
- Fetched and read `https://bun.com/llms.txt` at 2026-04-29 09:19 Europe/Amsterdam before Bun-runtime edits.
- Added `services/news/src/evaluator/restricted-window.ts`, `.spec.ts`, and barrel export. Uses DI for DB/mapper/clock, canonical `RestrictedReply`, `pragueDayBucket` window buckets, and inclusive ±5 min tier-1 filtering.
- Contract mismatch resolved in favor of [ANKA-78](/ANKA/issues/ANKA-78) / [ANKA-80](/ANKA/issues/ANKA-80) / BLUEPRINT §19.2: `rule: 'blackout_pm5'`, not the stale `restricted_window` fields in the generated child issue text.
- Bumped root to `0.4.34`, `@ankit-prop/news` to `0.2.1`, refreshed `bun.lock`, updated CHANGELOG/TODOS/journal.
- Verification: `bun run lint:fix` exit 0 (pre-existing unrelated warnings only); targeted news/contracts/time specs 30 pass / 60 expects; `bun run typecheck` clean.
- Next: move [ANKA-163](/ANKA/issues/ANKA-163) to CodeReviewer/QA review after the branch is published.
