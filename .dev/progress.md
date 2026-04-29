# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 06:11 Europe/Amsterdam — [ANKA-150](/ANKA/issues/ANKA-150) multi-commit forged merge regression

- Scoped wake is [ANKA-150](/ANKA/issues/ANKA-150); latest comment confirmed CodeReviewer and SecurityReviewer convergence and requested one extra multi-commit PR-range regression.
- Checked `origin/anka-137-commit-footer-check` at `79e114c`; event-gated merge exemption was present, but the requested clean-commit + forged-merge PR range regression was missing.
- Recreated `.paperclip/worktrees/ANKA-150` on `anka-150-forged-merge-footer-check` and kept the patch scoped to CI shell coverage plus audit metadata.
- Added a regression where `base..head` contains one clean PR commit followed by a forged two-parent `Merge pull request #999...` commit with no Paperclip trailer; `pull_request` context fails closed with `<missing>`.
- Updated spec, `T015`, root version 0.4.34→0.4.35, CHANGELOG, and journal.
- Verification: shell suite 14 pass; `bun run lint:fix` exit 0 with existing warnings/no fixes; first `bun test` failed on missing fresh-worktree links, then after `bun install` 342 pass / 0 fail; `bun run typecheck` clean.
- Next: return ANKA-150 to `done` and request reviewer re-checks on the pushed PR branch.
