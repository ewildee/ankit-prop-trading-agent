# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 07:41 Europe/Amsterdam — [ANKA-131](/ANKA/issues/ANKA-131) Elysia/Eden Treaty foundation

- Scoped wake on [ANKA-131](/ANKA/issues/ANKA-131) after CTO lifted the pre-implementation block; working in `.paperclip/worktrees/ANKA-131` on branch `anka-131-http-foundation`.
- Fetched `https://bun.com/llms.txt` at 07:38 Europe/Amsterdam before Bun-runtime edits; applying exact approved pins `elysia@1.4.28` and `@elysiajs/eden@1.4.9`.
- Added `packages/shared-contracts/src/treaty-client/`: thin `createTreatyClient<App>(baseUrl)`, static §19 `SERVICES`, source-level type-only `App` export assertion, README, and focused specs.
- Bumped root `ankit-prop-umbrella` 0.4.31 → 0.4.32 and `@ankit-prop/contracts` 0.4.0 → 0.5.0; CHANGELOG / journal / ADR updated.
- Verification so far: `bun install --frozen-lockfile`, `bun run lint:fix` (exit 0; pre-existing warnings/infos only), `bun run typecheck`, `bun test packages/shared-contracts/src/treaty-client`, `bun test`, and `bun audit --registry=https://registry.npmjs.org` all pass.
- Final local hygiene: `git diff --check` clean; code-file debug grep for `console.log|debugger|TODO|HACK` has no matches.
- Remaining gate: commit, push, Paperclip handoff to CodeReviewer/review state.
