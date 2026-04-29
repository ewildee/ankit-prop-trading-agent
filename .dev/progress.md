# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 05:54 Europe/Amsterdam — [ANKA-151](/ANKA/issues/ANKA-151) follow-up for [ANKA-137](/ANKA/issues/ANKA-137)

- Inline wake had no pending comments; continued the existing `.paperclip/worktrees/ANKA-137` / `anka-137-commit-footer-check` branch as requested.
- Fetched and read `https://bun.com/llms.txt` at 05:53 Europe/Amsterdam; no Bun-runtime code or dependencies were added.
- Found uncommitted ANKA-150 "no exceptions" edits and superseded them with the ANKA-151 requested per-commit GitHub merge exemption.
- `.github/workflows/scripts/commit-footer-check.sh` now skips any real `Merge pull request #...` commit with `parent_count >= 2` inside the per-commit loop.
- Added the normal push-merge regression: clean PR commit with Paperclip trailer plus trailer-less GitHub merge commit in the same range.
- Updated the workflow spec plus root 0.4.33 CHANGELOG/journal audit entries.
- Verification pending, then commit/push and return [ANKA-144](/ANKA/issues/ANKA-144) to CodeReviewer.
