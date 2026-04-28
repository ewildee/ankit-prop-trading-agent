# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 18:00 Europe/Amsterdam — [ANKA-109](/ANKA/issues/ANKA-109) impossible ISO calendar dates

- Scoped wake had no pending comments; harness had already claimed [ANKA-109](/ANKA/issues/ANKA-109).
- Worked in existing `…-anka95` worktree on `anka-81-news-calendar-db`; primary checkout was still on `main`.
- Fetched/read `https://bun.com/llms.txt` at 2026-04-28 17:56 Europe/Amsterdam before Bun-runtime edits.
- Re-read BLUEPRINT §0, §0.2, §5, §11, §17, §21-§22, and §25 plus heartbeat context.
- Added shared strict ISO calendar/time validation in `services/news/src/calendar-db.ts` for `parseItemInstant` and `parseRangeInstant`.
- Added regressions for impossible days, month 13, invalid time components, and valid leap-day persistence/querying.
- Bumped `@ankit-prop/news` `0.2.5 → 0.2.6` and root `0.4.30 → 0.4.31`; CHANGELOG updated.
- Verification: frozen install clean; `bun run lint:fix` exit 0 with unrelated unsafe suggestions only; `bun test services/news/src/calendar-db.spec.ts` → 32 pass / 0 fail / 104 expects; `bun run typecheck` clean; source debug grep no matches.
- Next: append journal, commit, push `origin/anka-81-news-calendar-db`, then mark [ANKA-109](/ANKA/issues/ANKA-109) done with the commit SHA.
