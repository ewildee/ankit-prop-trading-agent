# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-27 19:23 Europe/Amsterdam — v0.4.0 (ANKA-14 — Phase 2.3 the 14 hard rails)

- `@ankit-prop/ctrader-gateway` 0.1.0: 14 pure rail evaluators under `services/ctrader-gateway/src/hard-rails/rail-1..14`, broker contract surface in `types.ts`, `evaluator.ts` composer that short-circuits on first reject, plus persisted SQLite stores for rails 9 (idempotency ULID registry) and 12 (per-account 1,800/day token bucket).
- §11.6 force-flat scheduler implemented as a separate `force-flat-scheduler.ts` state machine with a `NewsClient` seam (real svc:news client lands with ANKA-9). Earliest of {market_close, friday_close, restricted_event} wins.
- §8.3 / §8.5 defensive-SL math is unit-anchored: per-trade cap vs daily-floor headroom, tighter wins; wrong-side rejects; loose tightens to entry ± requiredSlDistance.
- `matrix.spec.ts` covers the full 28-case acceptance grid (14 × {positive, negative}); each row asserts outcome + presence of every §9 logger key. Persistence specs reopen the SQLite DB to prove restart survival.
- Bumps: root umbrella 0.3.0 → 0.4.0; `@ankit-prop/ctrader-gateway` 0.0.1 → 0.1.0.
- 54 tests / 0 fails in `services/ctrader-gateway`; lint + typecheck green.
- Status: ANKA-14 deliverables complete and ready for `done`. ANKA-13/15 (live transport + order manager) still gated on the cTrader OAuth handshake; rails contract is stable for that integration.
- Next wake (`issue_blockers_resolved` once ANKA-12 / ANKA-13 land): pick up ANKA-15 — wire `BrokerSnapshot` from the live cTrader event stream, bind a real pino logger to `RailContext`, ship the order manager.
