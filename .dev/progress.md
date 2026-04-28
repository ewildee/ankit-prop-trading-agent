# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 23:32 Europe/Amsterdam — [ANKA-124](/ANKA/issues/ANKA-124) SymbolTagMap contracts lift

- Scoped Paperclip wake on [ANKA-124](/ANKA/issues/ANKA-124); no pending comments, harness already checked out the issue.
- Fetched `https://bun.com/llms.txt` at 23:30 Europe/Amsterdam before Bun-runtime edits.
- Re-read BLUEPRINT §0, §0.1, §0.2, §5, §17, §22, §25 plus heartbeat context.
- Classified as Scoped: `SymbolTagMap` schema/type move from `svc:news` into `pkg:contracts/config`; mapper behavior remains unchanged.
- Added `packages/shared-contracts/src/config/symbol-tag-map.ts` and `src/config/index.ts`; exported `@ankit-prop/contracts/config`.
- Updated `services/news/src/symbol-tag-mapper.ts` to import and re-export the shared schema/type while keeping `@triplon/config` as the loader.
- Added contracts parse round-trip coverage and a news re-export guard; focused tests are green.
- Next: finish changelog/journal, run lint/full targeted verification, commit with Paperclip footer, push, then update [ANKA-124](/ANKA/issues/ANKA-124).
