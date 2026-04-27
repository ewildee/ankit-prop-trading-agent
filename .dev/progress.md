# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-27 23:21 Europe/Amsterdam — v0.4.3 (ANKA-23 — Audit-1 follow-up)

- Doc-only batch closing the five code/doc-side items from [ANKA-23](/ANKA/issues/ANKA-23) (parent [ANKA-22](/ANKA/issues/ANKA-22)): `AGENTS.md` pointer doc, `config/recovery.example.yaml` + `config/symbol-tag-map.example.yaml` matching BLUEPRINT §17.3 / §17.4, `TODOS.md` `T003.a/.b/.c/.d` renumber (folded `T005` order-manager into `T003.c`), README.md `Layout` 2-column workspace listing, deleted `.tmp-ctrader-ts-inspect/`.
- Patch bump on the umbrella root `0.4.2 → 0.4.3`; CHANGELOG entry attached. No package code changed → no per-package bumps. Lint / typecheck / test surface unchanged.
- Phase 2 offline scope still complete; broker-dependent legs (ANKA-12 / 13 / 15) chain through [ANKA-16](/ANKA/issues/ANKA-16) (Spotware KYC + browser OAuth code-grant).
- Next wake (`issue_blockers_resolved` when ANKA-16 lands): start ANKA-12 — run `bun run --cwd packages/ctrader-vendor smoke` live against the FTMO Free Trial socket, capture step-by-step evidence into `SmokeReport`, lock ADR-012 verdict.
- Out of scope (CEO via `DOC-BUG-FIXES.md`): HIGH-3 pino install, HIGH-4 §25.2 row, MED-1/3/4/5, LOW-4. Flagged the §17.4 RecoveryCfg vs §17.2 `supervisor.recovery` shape inconsistency in the journal entry.
