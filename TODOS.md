# TODOS

_Durable, repo-tracked task list. Mirror entries into the runtime todo tool while a session is active. Prune completed items within a session or two — proof of completion lives in git + CHANGELOG + journal._

Status markers: `[ ]` open · `[~]` in progress · `[x]` done.

## Phase 0 — Scaffold (ANKA-2, ANKA-5)

- [x] **T001** Bootstrap umbrella monorepo skeleton (workspaces, lint/typecheck/test, .dev/, CHANGELOG, env, gitignore, CI gate). _Closes ANKA-2._
- [~] **T013** Onboarding interview (BLUEPRINT §0.1, ANKA-5). Scaffold + `ask_user_questions` interaction posted; awaiting operator answers + populated `.env` to run OpenRouter probe and cTrader OAuth verification.

## Phase 1 — `@triplon/proc-supervisor`

- [x] **T002** Implement supervisor adopt/replace/refuse semantics with `/health` aggregator on port 9100. Exit gate: `bun run start` brings up fake services with all transitions verified. _Closes ANKA-6._

## Phase 2 — `ctrader-gateway` (ANKA-7 split into 4 child issues)

- [x] **I002** Fix rails 3/4 news freshness fail-open on future or non-finite timestamps — _Closes [ANKA-103](/ANKA/issues/ANKA-103)_.
- [~] **T003** Vendor cTrader client + protobuf transport over `wss://*.ctraderapi.com:5035/`.
  - [~] **T003.a** §10.3 7-step smoke-test against FTMO Free Trial — _ANKA-12_; offline scaffold (AES-GCM `RefreshTokenStore`, typed 7-step orchestrator, protobufjs codec on Spotware vendored .proto, smoke runner CLI) shipped in `74913ed` v0.4.1. Live execution gated on _ANKA-16_ (Spotware KYC + one-time browser OAuth code-grant).
  - [ ] **T003.b** Transport + OAuth + reconciliation — _ANKA-13_; blocked by ANKA-12 (vendor verdict locks once `bun run --cwd packages/ctrader-vendor smoke` reports `pass` for all 7 steps live).
  - [ ] **T003.c** Order-manager + execution-stream + persistence; place + close + reconcile against FTMO Free Trial — _ANKA-15_; blocked by ANKA-12, ANKA-13, ANKA-14.
  - [x] **T003.d** §19.1 `/health` endpoint on `:9201` (`HealthSnapshot` JSON, 200/503 by status, SIGTERM-safe) — _ANKA-7_. Shipped in v0.4.2; supervisor health-polls now hit a real responder instead of timing out.
- [x] **T004** Implement the 14 hard rails (BLUEPRINT §9), each with a `.spec.ts` regression — _ANKA-14_, shipped in `2218862` v0.4.0. Pure decision functions in `services/ctrader-gateway/src/hard-rails/rail-1..14`, mock-driven against a stable broker contract; bun:sqlite-backed idempotency + throttle stores; force-flat scheduler with `NewsClient` seam. 28-case matrix.spec.ts green; live transport wiring deferred to ANKA-13/15.

## Phase 3 — `eval-harness`

- [x] **T006** Bar-granularity simulator (decision G). _Closes ANKA-8 (with T007)._
- [x] **T007** Walk-forward 12-fold runner (decision H). _Closes ANKA-8 (with T006)._

## Phase 4 — `trader`

- [ ] **T008** Modular monolith with N account loops (drop-on-overlap concurrency, decision A).

## Phase 5 — `news`

- [x] **T009.a** Shared news calendar contracts (`packages/shared-contracts/src/news.ts`) for [ANKA-78](/ANKA/issues/ANKA-78): port BLUEPRINT §11.2 schemas plus `RestrictedReply` / `NextRestrictedReply`.
- [ ] **T009** FTMO calendar fetcher with `timezone=Europe%2FPrague`; 2-h staleness blackout.
  - [x] **T009.b** `svc:news/symbol-tag-mapper` YAML loader + `instrument` multi-tag split for tracked symbols — _ANKA-79_.
  - [ ] **T009.c** Lift `SymbolTagMap` schema into `@ankit-prop/contracts/config` once the config package surface exists.

## Phase 6 — `dashboard`

- [ ] **T010** React 19 + Tailwind 4 cockpit; version matrix, control panel, hard-rail logs.

## Phase 6.5 — Burn-in

- [ ] **T011** 14-day FTMO Free Trial burn-in; meet all §21.7 criteria.

## Phase 7 — `autoresearch`

- [ ] **T012** Suggest-only mutation/eval loop, 30% acceptance threshold.

## Cross-cutting

- [x] **T014** Enforce Paperclip co-author footer with repo-local `commit-msg` hook — _ANKA-102_.
- [~] **T015** Enforce Paperclip co-author footer on GitHub PR/merge paths — _ANKA-137_; review respin under [ANKA-144](/ANKA/issues/ANKA-144) for merge-commit topology guard and GitHub red/green smoke.
- [~] **Q001** Choose cTrader Open API app credentials path (operator action — folded into ANKA-5 onboarding interaction).
- [ ] **IDEA-001** Backlog of trading-lab ideas tracked in BLUEPRINT §13.7 (decision CC).
