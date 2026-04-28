# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 18:38 Europe/Amsterdam — [ANKA-116](/ANKA/issues/ANKA-116) `svc:news/server` review fix

- Wake reason: `issue_assigned`; acknowledged CodeReviewer BLOCK and scoped this heartbeat to the two fail-open findings plus offsetless `at`.
- Fetched `https://bun.com/llms.txt` at 18:35 Europe/Amsterdam before Bun runtime edits.
- Re-read BLUEPRINT §0-§0.2, §5, §9, §11, §17, §22, §25 and inspected `server.ts`, `server.spec.ts`, `symbol-tag-mapper.ts`, and `calendar-db.ts`.
- Kept work in `../ankit-prop-trading-agent-paperclip-anka83`; primary checkout remains dirty on unrelated `anka-82-news-fetcher` files.
- Fixed route symbol matching to use `resolveAffectedSymbols()` and a tracked-symbol map, so `USD` now blocks `XAUUSD` / `NAS100`.
- Replaced Prague-day-key DB reads with the actual route evaluation window around `at`, covering the previous Prague-day ±5m overlap after midnight.
- Tightened `at` validation to require explicit `Z` or numeric offset.
- Added regressions for mapped tags, Prague-midnight blackout overlap, and offsetless `at`; bumped root `0.4.28 → 0.4.29` and `@ankit-prop/news 0.3.0 → 0.3.1`.
- Verification: `bun run lint:fix` exit 0 with unrelated warnings; focused specs 31 pass / 0 fail / 60 expects; `bun run typecheck` clean.
- Remaining: commit, push `anka-83-news-server`, and return [ANKA-116](/ANKA/issues/ANKA-116) for CodeReviewer.
