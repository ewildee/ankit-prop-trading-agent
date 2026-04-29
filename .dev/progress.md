# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 05:49 Europe/Amsterdam — [ANKA-149](/ANKA/issues/ANKA-149) config precedence regression

- Scoped Paperclip wake on [ANKA-149](/ANKA/issues/ANKA-149); no pending comments in the wake payload.
- Worktree-first: created `.paperclip/worktrees/ANKA-149` from `origin/anka-130-triplon-config` as a detached worktree because the PR branch is already checked out by `.paperclip/worktrees/ANKA-130`.
- Fetched `https://bun.com/llms.txt` at 05:47 Europe/Amsterdam before Bun-runtime edits; confirmed no new dependencies are needed.
- Fixed `defineAppConfig()` layering so project config loads first and user config wins per BLUEPRINT §17.1.
- Added `defineAppConfig` regression coverage for overlapping `symbol-tag-map` project/user files.
- Green verification: `bun install --frozen-lockfile`, targeted config/news tests (21 pass), `bun run lint:fix`, `bun run typecheck`, `bun run config:codegen --check`, `git diff --check`, and debug grep.
- Next: commit, push HEAD to `origin/anka-130-triplon-config`, and confirm PR #5 is mergeable/clean.
