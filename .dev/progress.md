# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 05:34 Europe/Amsterdam — [ANKA-144](/ANKA/issues/ANKA-144) review respin for [ANKA-137](/ANKA/issues/ANKA-137)

- Acknowledged CodeReviewer BLOCK: the `Merge pull request #...` exemption was spoofable by one-parent commits without the Paperclip trailer.
- Continued in `.paperclip/worktrees/ANKA-137` on branch `anka-137-commit-footer-check`; this [ANKA-144](/ANKA/issues/ANKA-144) review task respins the parent feature branch.
- No Bun-runtime code touched this heartbeat; prior `https://bun.com/llms.txt` fetch from 05:12 Europe/Amsterdam remains recorded for the branch session.
- Added `is_github_merge_commit` topology check (`parent_count >= 2`) before allowing the single GitHub merge-commit exemption.
- Added pure-bash regression coverage for one-parent merge-subject spoof failure and converted the allowed merge case to a real two-parent merge commit.
- Moved `T015` back to in-progress, bumped root version to 0.4.31, and added CHANGELOG/journal audit entries.
- Verification: `bash .github/workflows/__tests__/commit-footer-check.sh` 8 pass; `bun run lint:fix` exit 0 with existing warnings/no fixes; `bun test` 342 pass / 0 fail; `bun run typecheck` clean.
- Next: commit + push `anka-137-commit-footer-check`, then return [ANKA-144](/ANKA/issues/ANKA-144) to review for CodeReviewer and GitHub red/green smoke.
