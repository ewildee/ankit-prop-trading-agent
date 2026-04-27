# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-27 23:35 Europe/Amsterdam — v0.4.4 ([ANKA-28](/ANKA/issues/ANKA-28) — rail 9 idempotency record-on-non-reject)

- Fixed [ANKA-19](/ANKA/issues/ANKA-19) H-1: rail 9 (`clientOrderId` ULID registry) was recording on its own allow path, so a rail 12 / rail 13 reject downstream consumed the slot. The operator's same-`clientOrderId` retry after the breaker cleared was being rejected by rail 9.
- Lifted `idempotency.record(...)` out of `rail-9-idempotency.ts` and into `evaluator.ts evaluateAllRails`, gated on `composeRailVerdict` outcome ≠ `reject`. The rail's `has(...)` early-reject stays put.
- Added `idempotency-record-on-allow.spec.ts` (4 cases / 18 expects): rail 12 reject + retry; rail 13 reject + retry; happy-path record + immediate replay rejects on rail 9; tighten verdict still records.
- `bun test services/ctrader-gateway/src/hard-rails/idempotency-record-on-allow.spec.ts` 4 / 0; existing `matrix.spec.ts -t idempotency` 2 / 0; `idempotency-store.spec.ts` 3 / 0.
- Versions handled by parallel ANKA-27 heartbeat (umbrella `0.4.3 → 0.4.5`, `@ankit-prop/ctrader-gateway` `0.2.0 → 0.2.2`); CHANGELOG carries my v0.4.4 entry below their v0.4.5 entry.
- Working-tree contains a parallel heartbeat's [ANKA-27](/ANKA/issues/ANKA-27) batch (rail-13 fail-closed) plus the broader ANKA-19 review-findings rename (`bufferDollars` / loss-fraction / news-staleness API). Not bundled into this commit.
- Next wake (`issue_blockers_resolved`): pick up next ANKA-19 review-finding ticket OR Phase 2 broker work depending on assignment.
