# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 05:28 Europe/Amsterdam — [ANKA-143](/ANKA/issues/ANKA-143) project config path regression

- Scoped Paperclip wake on [ANKA-143](/ANKA/issues/ANKA-143); no pending comments in the wake payload.
- Worktree-first: recreated `.paperclip/worktrees/ANKA-143` from `origin/anka-130-triplon-config` after catching the branch requirement before edits.
- Fetched `https://bun.com/llms.txt` at 05:28 Europe/Amsterdam before Bun-runtime edits; confirmed no new dependencies are needed.
- Fixed `defineAppConfig().paths.project()` to target `config/<name>.config.yaml`; added package and `svc:news` regressions.
- Green verification: targeted config/news tests, `bun run lint:fix`, `bun run config:codegen --check`, `bun run typecheck`, full `bun test` (353 pass).
- Next: commit, push to `origin/anka-130-triplon-config`, and comment on [ANKA-143](/ANKA/issues/ANKA-143) / [ANKA-130](/ANKA/issues/ANKA-130) with the SHA.
