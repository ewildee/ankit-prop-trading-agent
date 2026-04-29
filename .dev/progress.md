# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-30 00:29 Europe/Amsterdam — [ANKA-170](/ANKA/issues/ANKA-170) svc:news cassette replay / drift / DST / coverage gate

- Scoped wake reason: `issue_blockers_resolved`; ANKA-169 was already merged and this issue was checked out by the harness.
- Re-read BLUEPRINT §0 / §0.2 / §11 / §17 / §21 / §22 / §25 and fetched `https://bun.com/llms.txt` at 00:29 Europe/Amsterdam before finalizing Bun-runtime changes.
- Added full svc:news cassette replay coverage through fetcher persistence and calendar routes, contract drift detector tests, and Prague spring/fall DST integration tests.
- Added Bun-native coverage thresholds in `bunfig.toml`: 90% line/statement and 85% function coverage over `services/news/**` plus `packages/shared-contracts/src/news.ts`; documented the Bun branch-threshold limitation in `services/news/README.md`.
- Bumped root `0.4.48` and `@ankit-prop/news` `0.5.3`; changelog, journal, TODO, and progress records updated.
- Verification green: `bun run lint:fix`, `bun run typecheck`, `bun test` 552 pass / 0 fail / 2764 expects, `bun test --coverage` 552 pass with 99.24% funcs / 99.45% lines.
- Restart/health: `PORT=19270 NEWS_CALENDAR_DB_PATH=/tmp/anka-170-news-calendar.db bun run --cwd services/news start`; `/health` returned 200 with `version:"0.5.3"` and `status:"healthy"`.
