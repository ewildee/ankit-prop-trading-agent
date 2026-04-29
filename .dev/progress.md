# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 13:05 Europe/Amsterdam — [ANKA-214](/ANKA/issues/ANKA-214) pre-news ALL mapper routing

- Wake payload reported blockers resolved: [ANKA-213](/ANKA/issues/ANKA-213) is done, so this issue is actionable.
- Fetched and read `https://bun.com/llms.txt` at 13:00 Europe/Amsterdam before Bun-runtime edits; no dependency surface changes.
- Created `.paperclip/worktrees/ANKA-214` on `refactor/anka-214-pre-news-all-sentinel`, based on `origin/feat/anka-164-pre-news` head `47398c4`.
- Re-read BLUEPRINT §0/§0.2/§5/§11.3/§17/§22/§25 and scoped implementation to `svc:news/pre-news-evaluator`.
- Removed the `ALL` global sentinel from `services/news/src/evaluator/pre-news.ts`; all pre-news instrument matching now routes through `resolveAffectedSymbols`.
- Added two pre-news regressions: unmapped `ALL` does not restrict, mapped `ALL` does restrict mapped instruments.
- Bumped `@ankit-prop/news` `0.3.3` → `0.3.4`.
- Verification so far: `bun install` clean; pre-news spec 18 pass / 23 expects; restricted-window spec 10 pass / 15 expects; `bun run lint:fix` exit 0 with pre-existing unrelated diagnostics; `bun run typecheck` clean.
- Service restart check: `services/news` still has only the placeholder start script and no long-running `/health` endpoint.
- Commit, push, and review handoff remain in progress.
