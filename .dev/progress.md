# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 23:50 Europe/Amsterdam — [ANKA-126](/ANKA/issues/ANKA-126) worktree-first directive

- Scoped Paperclip wake on [ANKA-126](/ANKA/issues/ANKA-126); board chose Option 1 of [ANKA-98](/ANKA/issues/ANKA-98) (per-issue worktrees in `claude_local`); platform fix is out-of-company so this in-repo guard codifies the workaround.
- Authored from a fresh worktree `.paperclip/worktrees/ANKA-126` off `origin/main` on branch `anka-126-worktree-directive` to dogfood the directive (shared root was on `anka-121-dashboard-shell` with unrelated dashboard state).
- Edits: project `AGENTS.md` (new top-of-file section), per-agent `AGENTS.md` for FoundingEngineer/CodexExecutor/Designer (instance-local pointer block), `.gitignore` adds `.paperclip/worktrees/`, `CHANGELOG.md` 0.4.27 entry, root `package.json` 0.4.26→0.4.27, journal entry.
- Doc-only change. No Bun-runtime touched, so BLUEPRINT §0.2 `bun.com/llms.txt` proof not required; lint/test/typecheck not re-run for this change.
- Version note: parallel `anka-124-symbol-tag-map-contracts` also claims 0.4.27. Whichever PR merges first lands; the second rebase-bumps to 0.4.28 per the 0.4.26 merge-integration precedent.
- Next: commit + push, post issue summary, mark [ANKA-126](/ANKA/issues/ANKA-126) `done`. Cleanup of the worktree happens at the next heartbeat (or now if PR is in-flight; per directive, leaving it is fine).
