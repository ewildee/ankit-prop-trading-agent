# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 18:22 Europe/Amsterdam — [ANKA-83](/ANKA/issues/ANKA-83) `svc:news/server`

- Wake reason: `issue_blockers_resolved`; blocker [ANKA-78](/ANKA/issues/ANKA-78) is done, so server work resumed.
- Re-read BLUEPRINT §0.2, §5, §11.4-§11.8, §19.2, §22, §25 plus [ANKA-83](/ANKA/issues/ANKA-83) heartbeat context.
- Fetched `https://bun.com/llms.txt` at 18:22 Europe/Amsterdam before Bun runtime edits in the isolated worktree.
- Shared checkout was dirty on `anka-82-news-fetcher`; created clean worktree `../ankit-prop-trading-agent-paperclip-anka83` from `origin/anka-78-79-81-rebuild`.
- Added `services/news/src/server.ts` and `server.spec.ts` for `/calendar/restricted`, `/calendar/pre-news-2h`, `/health/details`, query validation, and fail-closed stale calendar responses.
- Added package subpath exports for `@ankit-prop/contracts/news` and `@ankit-prop/eval-harness/prague-day`; added `@ankit-prop/eval-harness` to `@ankit-prop/news`.
- Bumped root `0.4.27 → 0.4.28`, `@ankit-prop/news 0.2.3 → 0.3.0`, `@ankit-prop/contracts 0.4.0 → 0.4.1`, `@ankit-prop/eval-harness 0.1.3 → 0.1.4`.
- Verification: `bun run lint:fix` exit 0 with unrelated pre-existing unsafe suggestions; targeted specs 25 pass / 0 fail / 58 expects; `bun run typecheck` clean; modified-file debug grep clean.
- Remaining: commit, push `anka-83-news-server`, update [ANKA-83](/ANKA/issues/ANKA-83), and leave [ANKA-84](/ANKA/issues/ANKA-84) as the startup/health follow-up.
