# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 14:44 Europe/Amsterdam — [ANKA-95](/ANKA/issues/ANKA-95) `svc:news/calendar-db`

- Wake payload had no pending comments and no fallback fetch requirement; [ANKA-95](/ANKA/issues/ANKA-95) is scoped CR rework for [ANKA-93](/ANKA/issues/ANKA-93).
- BLUEPRINT §0.2 Bun-runtime proof: fetched `https://bun.com/llms.txt` at 14:27 Europe/Amsterdam before editing Bun-runtime code.
- Re-read BLUEPRINT §0.2, §5, §9, §11.2-§11.8, §17, §18.1, §22, and §25 plus heartbeat context.
- Used linked worktree `ankit-prop-trading-agent-paperclip-anka95` on `anka-81-news-calendar-db` because `main` has unrelated dirty `.dev/progress.md` / `bun.lock` changes and lacks the target files.
- Replaced suffix-only timezone guard with full ISO instant validation before `Date.parse`.
- Added CR regressions for locale strings with offsets, second-precision offsets, and locale range bounds.
- Bumped `@ankit-prop/news` 0.2.3 → 0.2.4 and root `ankit-prop-umbrella` 0.4.27 → 0.4.28.
- Verification: `bun run lint:fix` exit 0 with pre-existing unrelated unsafe suggestions; targeted spec 26 pass / 0 fail / 56 expects; `bun run typecheck` clean; code debug grep clean.
- Remaining: commit, push `origin anka-81-news-calendar-db`, and comment back with the commit SHA.
