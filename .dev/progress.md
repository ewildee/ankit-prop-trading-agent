# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 13:57 Europe/Amsterdam — [ANKA-86](/ANKA/issues/ANKA-86) `svc:news/calendar-db`

- Wake payload had no pending comments; harness had already checked out the issue.
- Switched from stale `anka-77-ftmo-calendar-cassette` worktree state to required branch `anka-81-news-calendar-db` before editing.
- BLUEPRINT §0.2 Bun-runtime proof: fetched `https://bun.com/llms.txt` at 13:57 Europe/Amsterdam (33,157 bytes) before editing Bun-runtime code.
- Re-read BLUEPRINT §0.2, §5, §11.5, §11.8, §17, §22, and §25 plus heartbeat context; scoped implementation to calendar DB only.
- Changed `calendar_items` to store `instant_ms`, compare/query/order by epoch ms, and fail closed on stale schema or invalid item/range instants.
- Added calendar-db regressions for mixed offsets, exact exclusive `to`, deterministic mixed-offset ordering, invalid writes/ranges, and stale schema open.
- Verification: `bun run lint:fix` exit 0 with pre-existing unrelated unsafe suggestions; `bun test services/news/src/calendar-db.spec.ts` 13 pass / 0 fail / 22 expects; `bun run typecheck` clean; modified-code debug grep clean.
- Remaining: commit, push, and move [ANKA-86](/ANKA/issues/ANKA-86) back for FoundingEngineer review.
