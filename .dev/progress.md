# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-27 18:42 Europe/Amsterdam — Phase 2 breakdown (ANKA-7)

- ANKA-7 (Phase 2 — ctrader-gateway against FTMO Free Trial, 14 hard rails) split into 4 bounded child issues per the issue's own ask:
  - **ANKA-12** §10.3 vendor 7-step smoke-test (FTMO Free Trial). Blocked by ANKA-5 (creds in `.env`) + ANKA-10 (FTMO Free Trial canonicalization landed).
  - **ANKA-13** transport + OAuth (AES-GCM refresh token) + reconciliation. Blocked by ANKA-12 (vendor decision).
  - **ANKA-14** the 14 hard rails (§9 matrix, 28 cases). Blocked by ANKA-12.
  - **ANKA-15** order-manager + execution-stream + SQLite persistence + crash recovery. Blocked by ANKA-12 + ANKA-13 + ANKA-14.
- Working tree still carries uncommitted parallel work: ANKA-10 (`BLUEPRINT.md`, `.env.example`, `README.md`, `config/accounts.example.yaml`) and untracked `packages/shared-contracts/src/eval.ts`+`eval.spec.ts` from another stream. Left untouched in this heartbeat.
- Next: once ANKA-10 and ANKA-5 land, ANKA-12 unblocks; first deliverable is the §10.3 smoke harness + ADR-012 vendor-vs-in-house verdict.
