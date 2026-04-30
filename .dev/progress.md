# Progress

- Current issue: [ANKA-374](/ANKA/issues/ANKA-374) — per-call Analyst `generateObject` timeout and retry.
- Worktree: `.paperclip/worktrees/ANKA-374-add-analyst-generateobject-timeout`.
- Bun llms.txt fetched/read: 2026-04-30 16:15 Europe/Amsterdam.
- AI SDK `generateObject` typings confirmed top-level `abortSignal` support in `node_modules/.bun/ai@6.0.168.../dist/index.d.ts`.
- Added optional `analyst.requestTimeoutMs` contract field; default remains code-only at `90_000`.
- Analyst retry attempts now race each generator call against a timeout, abort the SDK request signal, and treat `RequestTimeoutError` as retryable.
- Final timeout/no-object fallback remains neutral and now always carries explicit `costUsd: 0` when provider pricing is absent.
- Specs cover direct timeout rejection, timeout retry success, persistent timeout fallback, and a 30-bar replay with half of attempts hanging.
- Bumped root `0.4.64` -> `0.4.65`, `@ankit-prop/trader` `0.8.0` -> `0.9.0`, and `@ankit-prop/contracts` `3.3.0` -> `3.4.0`.
- Local gate passed: `bun run lint:fix`; `bun run lint`; `bun run --cwd services/trader test`; `bun test packages/shared-contracts/src`; `bun run --cwd services/trader typecheck`; `bun run typecheck`; `git diff --check`.
- Debug scan over changed source/spec/package files found no `console.log`, `debugger`, `TODO`, or `HACK`.
- `bun run --cwd services/trader start` exits 0 with replay-only placeholder; no live `/health` endpoint exists for this service entrypoint yet.
- Next: commit, push, then hand [ANKA-374](/ANKA/issues/ANKA-374) to CodeReviewer.
