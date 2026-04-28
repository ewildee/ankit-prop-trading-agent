# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 17:19 Europe/Amsterdam — [ANKA-103](/ANKA/issues/ANKA-103) rail 3/4 news timestamp fail-closed

- Wake reason: issue assigned; no pending comment in the scoped payload. Work stayed on the [ANKA-100](/ANKA/issues/ANKA-100) child fix.
- Fetched and read `https://bun.com/llms.txt` at 2026-04-28 17:19 Europe/Amsterdam before finalising Bun-runtime edits.
- Rails 3/4 now reject non-finite `lastSuccessfulFetchAtMs` and strict future timestamps before stale-age arithmetic, with fail-closed reasons and `{ lastSuccessfulFetchAtMs, nowMs, newsStaleMaxMs }` detail.
- `InMemoryNewsClient` omitted freshness now fails closed unless a fixture supplies `nowMs`; cascade hard-rail specs now declare freshness explicitly.
- Verification green: `bun run lint:fix` (exit 0; pre-existing warnings remain), `bun test services/ctrader-gateway/src/hard-rails/news-staleness.spec.ts` (16 pass), `bun test services/ctrader-gateway` (107 pass), gateway-scoped `tsc` (exit 0).
- Next: commit `@ankit-prop/ctrader-gateway` 0.2.12, push, restart gateway, verify `/health` reports 0.2.12, then route back to FoundingEngineer for review gate.
