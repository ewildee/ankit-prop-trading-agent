# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-27 18:59 Europe/Amsterdam — v0.3.0 (ANKA-7 prep — §9 hard-rails contract surface)

- `@ankit-prop/contracts` 0.3.0: new `hard-rails.ts` exporting `HARD_RAIL_KEYS` (14-entry catalog ordered to BLUEPRINT §9), `HARD_RAIL_NUMBER`, `RAIL_OUTCOMES`, `RailDecision`/`RailVerdict` Zod schemas, and pure `composeRailVerdict`. 11 spec cases including catalog/numbering invariants and reject>tighten>allow precedence.
- Stable rail-name surface lets ANKA-14 land directly on the matrix without forking strings, and lets the judge stage (BLUEPRINT §6.5) advise on the same names the gateway binds (§6.6).
- `.gitignore`: `.tmp-*/` ignored so vendor probes (ANKA-12 prep by another session) don't poison biome.
- Bumps: root umbrella 0.2.0 → 0.3.0, `@ankit-prop/contracts` 0.2.0 → 0.3.0.
- 106 tests / 0 fails; lint + typecheck green.
- Status: ANKA-12 still blocked on ANKA-5 (creds). ANKA-7 going back to `blocked` until then; ANKA-13/14/15 transitively gated on ANKA-12.
- Next wake (`issue_blockers_resolved` when ANKA-5 lands): start ANKA-12 — `packages/ctrader-vendor/smoke/` 7-step harness against FTMO Free Trial and the ADR-012 verdict.
