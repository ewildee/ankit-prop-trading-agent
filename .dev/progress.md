# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 18:20 Europe/Amsterdam — [ANKA-113](/ANKA/issues/ANKA-113) PR #1 merge-conflict resolution

- Scoped Paperclip wake on [ANKA-113](/ANKA/issues/ANKA-113) (child of [ANKA-77](/ANKA/issues/ANKA-77)). PR #1 head `e8bac186` reported `mergeable: false` against `origin/main`.
- Conflict scope confirmed via `git merge-tree` — only FE-owned append-only / version metadata: `.dev/journal.md`, `.dev/progress.md`, `CHANGELOG.md`, `package.json` (bun.lock, TODOS.md auto-merged).
- These are exactly the files in the FE non-delegation list (BLUEPRINT §25 `infra:tooling`, AGENTS.md "What FE keeps"); not a Codex brief.
- Strategy: regular merge commit on `anka-77-ftmo-calendar-cassette` against `origin/main` (no force-push, PR identity preserved).
- Resolutions: `.dev/progress.md` → take main (replace-each-session); `.dev/journal.md` + `CHANGELOG.md` → union with main entries first, then PR entries (newest-first preserved across the boundary; both lineages independently bumped 0.4.21–0.4.24 so duplicate version headings remain as audit history); `package.json` → bumped to 0.4.26 above max(main 0.4.25, PR 0.4.24).
- BLUEPRINT §0.2 Bun-runtime proof not required: this heartbeat is metadata reconciliation only, no Bun-runtime code touched.
- Next: regenerate lockfile, re-run news-side regression tests + biome, commit the merge with Paperclip footer, push, then move [ANKA-77](/ANKA/issues/ANKA-77) forward to QA / final landing.
