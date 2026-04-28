# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 13:40 Europe/Amsterdam — [ANKA-81](/ANKA/issues/ANKA-81) `svc:news/calendar-db`

- Wake payload had no pending comments; harness had already checked out the issue.
- BLUEPRINT §0.2 Bun-runtime proof: fetched `https://bun.com/llms.txt` at 13:35 Europe/Amsterdam (33,157 bytes) before editing Bun-runtime code.
- Re-read BLUEPRINT §0.2, §5, §11.2-§11.3, §18.1, §21, §22, §25 plus heartbeat context; scoped implementation to `services/news` calendar persistence.
- Added `services/news/sql/init.sql`, `src/calendar-db.ts`, and `src/calendar-db.spec.ts`: WAL open/init, structured open errors, sha256 idempotent upsert, range query, verbatim instrument filter, idempotent close.
- Verification: `bun run lint:fix` exit 0 with pre-existing unrelated unsafe suggestions; `bun test services/news/src/calendar-db.spec.ts` 7 pass / 0 fail; `bun run typecheck` clean; modified-code debug grep clean.
- Remaining: commit, push, and move [ANKA-81](/ANKA/issues/ANKA-81) to CodeReviewer.
