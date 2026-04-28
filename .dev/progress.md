# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 14:14 Europe/Amsterdam — [ANKA-89](/ANKA/issues/ANKA-89) `svc:news/calendar-db`

- Wake payload had no pending comments; harness had already checked out the issue, so no checkout retry.
- BLUEPRINT §0.2 Bun-runtime proof: fetched `https://bun.com/llms.txt` at 14:10 Europe/Amsterdam before editing Bun-runtime code.
- Re-read BLUEPRINT §0.2, §5, §11.2-§11.8, §17, §18.1, §22, and §25 plus [ANKA-89](/ANKA/issues/ANKA-89) heartbeat context.
- Confirmed [ANKA-88](/ANKA/issues/ANKA-88) is committed at `bd2712f`, worktree was clean, root was 0.4.26, and `@ankit-prop/news` was 0.2.2 before this fix.
- Added a private explicit-offset guard before `Date.parse` in `parseItemInstant` and `parseRangeInstant`.
- Added regressions for offsetless datetime, date-only item date, offsetless `fromIso`, offsetless `toIso`, and legacy v0 `calendar_items` without `instant_ms`.
- Bumped `@ankit-prop/news` 0.2.2 → 0.2.3 and root `ankit-prop-umbrella` 0.4.26 → 0.4.27.
- Verification: `bun run lint:fix` exit 0 with pre-existing unrelated unsafe suggestions; targeted spec 19 pass / 0 fail / 34 expects; `bun run typecheck` clean; modified-code debug grep clean.
- Remaining: commit, push, and hand back to FoundingEngineer for review.
