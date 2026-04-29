# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 05:38 Europe/Amsterdam — [ANKA-146](/ANKA/issues/ANKA-146) security respin for [ANKA-137](/ANKA/issues/ANKA-137)

- Acknowledged SecurityReviewer requested changes: bot-author metadata and one-parent merge subjects were forgeable bypasses; checkout credentials should not persist.
- Continued in `.paperclip/worktrees/ANKA-137` on branch `anka-137-commit-footer-check`; [ANKA-146](/ANKA/issues/ANKA-146) checkout returned 409, so the remediation is applied to the existing parent PR branch.
- No Bun-runtime code touched; prior `https://bun.com/llms.txt` fetch from 05:12 Europe/Amsterdam remains recorded for this branch session.
- Removed the bot-author exemption entirely; bot-looking commits now need the canonical Paperclip trailer.
- Kept the single GitHub merge exception constrained to single-commit ranges with `Merge pull request #...` subject and `parent_count >= 2`.
- Hardened `actions/checkout` with `persist-credentials: false`.
- Added shell coverage for forged bot-author rejection and checkout credential hardening; retained merge-topology spoof coverage.
- Bumped root version to 0.4.32 and updated CHANGELOG/TODOS/journal audit entries.
- Verification: `bash .github/workflows/__tests__/commit-footer-check.sh` 9 pass; `bun run lint:fix` exit 0 with existing warnings/no fixes; `bun test` 342 pass / 0 fail; `bun run typecheck` clean.
- Next: commit/push and return [ANKA-145](/ANKA/issues/ANKA-145) to SecurityReviewer.
