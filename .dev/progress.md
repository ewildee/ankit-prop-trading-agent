# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 10:04 Europe/Amsterdam — [ANKA-194](/ANKA/issues/ANKA-194) PR #16 reviewer corrections ready

- Worktree: `.paperclip/worktrees/ANKA-163`, branch `feat/anka-163-restricted-window`, updating existing PR [#16](https://github.com/ewildee/ankit-prop-trading-agent/pull/16).
- Fetched and read `https://bun.com/llms.txt` at 2026-04-29 10:01 Europe/Amsterdam before Bun-runtime edits.
- Scoped fix: `/calendar/restricted` now only includes rows where `restriction === true`; `impact: 'high'` alone belongs to the separate 2-h pre-news tier-1 evaluator.
- Scoped fix: removed the `instrument === 'ALL'` global sentinel; all restricted-window symbol matching goes through the mapper.
- Version/audit trail: root `0.4.35`, `@ankit-prop/news` `0.2.2`, `bun.lock`, CHANGELOG, journal, and progress updated.
- Verification: targeted evaluator spec 7 pass / 11 expects; `bun run lint:fix` exit 0 (pre-existing unrelated warnings/infos); `bun test` 374 pass / 2158 expects; `bun run typecheck` clean.
- Next: commit with Paperclip footer and push `feat/anka-163-restricted-window` to update PR #16.
