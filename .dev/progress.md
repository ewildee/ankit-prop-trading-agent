# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 06:04 Europe/Amsterdam — [ANKA-150](/ANKA/issues/ANKA-150) / [ANKA-151](/ANKA/issues/ANKA-151) event-gated merge exception

- Scoped wake is [ANKA-150](/ANKA/issues/ANKA-150); no pending comments. Fetched and read `https://bun.com/llms.txt` at 05:51 Europe/Amsterdam.
- Created `.paperclip/worktrees/ANKA-150` on `anka-150-forged-merge-footer-check`, based on `origin/anka-137-commit-footer-check` because `origin/main` lacks the workflow files.
- Found completed [ANKA-151](/ANKA/issues/ANKA-151) had reintroduced a per-commit merge exemption on the PR branch for normal push-to-main merges.
- Reconciled both issues with ANKA-150's fallback path: merge-looking commits can skip only when `COMMIT_FOOTER_EVENT_NAME=push`; `pull_request`, `merge_group`, and direct shell runs fail closed.
- Added the exact forged two-parent regression from [ANKA-150](/ANKA/issues/ANKA-150), plus `pull_request` and `merge_group` rejection coverage; kept the normal push-merge pass regression.
- Updated workflow env, script, spec, `T015`, root version 0.4.33→0.4.34, CHANGELOG, and journal.
- Verification: shell suite 13 pass; `bun run lint:fix` exit 0 with existing warnings/no fixes; `bun test` 342 pass / 0 fail; `bun run typecheck` clean.
- Next: commit/push and return [ANKA-145](/ANKA/issues/ANKA-145) to SecurityReviewer.
