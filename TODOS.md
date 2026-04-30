# TODOS

_Durable, repo-tracked task list. Mirror entries into the runtime todo tool while a session is active. Prune completed items within a session or two — proof of completion lives in git + CHANGELOG + journal._

Status markers: `[ ]` open · `[~]` in progress · `[x]` done.

## Phase 0 — Scaffold (ANKA-2, ANKA-5)

- [x] **T001** Bootstrap umbrella monorepo skeleton (workspaces, lint/typecheck/test, .dev/, CHANGELOG, env, gitignore, local gates). _Closes ANKA-2._
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
- [x] **T017** Migrate `svc:gateway/health` from `Bun.serve` to Elysia with a type-only Treaty `App` export — _[ANKA-133](/ANKA/issues/ANKA-133)_.

## Phase 3 — `eval-harness`

- [x] **T006** Bar-granularity simulator (decision G). _Closes ANKA-8 (with T007)._
- [x] **T007** Walk-forward 12-fold runner (decision H). _Closes ANKA-8 (with T006)._
- [x] **T019** Implement provider-agnostic `@ankit-prop/market-data` + `CachedFixtureProvider`, and re-export market-data primitives from `@ankit-prop/eval-harness` — _[ANKA-236](/ANKA/issues/ANKA-236), unblocks [ANKA-70](/ANKA/issues/ANKA-70)_.
- [x] **T019.a** Fix PR #24 market-data timestamp projection and fixture-integrity review regressions — _[ANKA-248](/ANKA/issues/ANKA-248)_.
- [x] **T019.b** Fix `CachedFixtureProvider.getEvents()` to filter news by projected `eventTsMs` with narrow NFP regression coverage — _[ANKA-266](/ANKA/issues/ANKA-266)_.
- [x] **T019.c** Implement eval-harness replay driver, replay CLI, deterministic replay strategies, and fixture baselines wired to `CachedFixtureProvider` — _[ANKA-280](/ANKA/issues/ANKA-280), advances [ANKA-70](/ANKA/issues/ANKA-70)_.
- [x] **T020** Historical-data fetch & provider interface umbrella — parents [ANKA-67](/ANKA/issues/ANKA-67) (TwelveData adoption, `pkg:market-data-twelvedata`), [ANKA-68](/ANKA/issues/ANKA-68) (one-shot resumable fetcher + `td-fetch` CLI), [ANKA-69](/ANKA/issues/ANKA-69) (provider-agnostic `@ankit-prop/market-data` interface, ADR-0008). In-flight regression history tracked under T019.{a,b,c}.

## Phase 4 — `trader`

- [ ] **T008** Modular monolith with N account loops (drop-on-overlap concurrency, decision A).
- [x] **T008.a** Materialize Analyst → Trader → Judge shared contract surface and `v_ankit_classic` params skeleton — _[ANKA-321](/ANKA/issues/ANKA-321)_.
- [x] **T008.b** Repair persona contract acceptance gaps after ANKA-321: analyst confluence score, actionable trader idempotency keys, pips-based open risk, required close target, and reflector/eval run aggregate metrics — _[ANKA-333](/ANKA/issues/ANKA-333), unblocks [ANKA-319](/ANKA/issues/ANKA-319)_.
- [x] **T008.c** Add `services/trader` vertical-slice skeleton, per-bar-close runner, in-process replay gateway double, persona loader, and eval-harness replay adapter — _[ANKA-335](/ANKA/issues/ANKA-335), advances [ANKA-318](/ANKA/issues/ANKA-318)_.
- [x] **T008.d** Implement `v_ankit_classic` Analyst v0: deterministic regime classifier, OpenRouter structured LLM call, confluence score, and replay-pipeline wiring — _[ANKA-338](/ANKA/issues/ANKA-338)_.
- [x] **T008.d.1** Fix Analyst structured-output schema so runtime-owned fields are injected after model generation without accepting unknown provider keys — _[ANKA-357](/ANKA/issues/ANKA-357), unblocks [ANKA-341](/ANKA/issues/ANKA-341)_.
- [x] **T008.e** Implement Reflector v0 aggregate reports: DecisionRecord JSONL ingestion, RunAggregate folding, Sortino-rolling-60d, Claude-rate LLM cost telemetry, report writer, replay/reflect commands — _[ANKA-340](/ANKA/issues/ANKA-340), unblocks [ANKA-341](/ANKA/issues/ANKA-341)_.
- [x] **T008.e.1** Source Reflector cost telemetry from OpenRouter provider metadata and flush replay decisions JSONL per bar — _[ANKA-361](/ANKA/issues/ANKA-361), unblocks [ANKA-341](/ANKA/issues/ANKA-341) replay retry_.
- [x] **T008.e.2** Retry Kimi no-object Analyst length failures and disclose neutral fallback bars in Reflector aggregates — _[ANKA-365](/ANKA/issues/ANKA-365), unblocks [ANKA-341](/ANKA/issues/ANKA-341) replay retry_.
- [x] **T008.e.3** Accumulate Analyst retry usage and OpenRouter cost telemetry across all billed attempts — _[ANKA-368](/ANKA/issues/ANKA-368), unblocks [ANKA-365](/ANKA/issues/ANKA-365) re-review_.
- [x] **T008.e.4** Skip Analyst LLM calls on deterministic `outside_active_window` bars and preserve zero-cost Reflector rollups — _[ANKA-371](/ANKA/issues/ANKA-371), unblocks [ANKA-341](/ANKA/issues/ANKA-341) replay retry_.
- [x] **T008.e.5** Add per-call Analyst `generateObject` timeout, retry hung requests, and emit zero-cost timeout fallbacks — _[ANKA-374](/ANKA/issues/ANKA-374), unblocks [ANKA-341](/ANKA/issues/ANKA-341) replay retry_.
- [x] **T008.e.6** Widen Analyst `reasoningSummary` contract and prompt guard to prevent 7d replay schema crashes — _[ANKA-391](/ANKA/issues/ANKA-391), unblocks [ANKA-341](/ANKA/issues/ANKA-341) replay retry_.
- [x] **T008.f** Implement deterministic `v_ankit_classic` Trader policy + Judge v0 allow-list gates, params-sourced thresholds, and runner/replay wiring — _[ANKA-339](/ANKA/issues/ANKA-339), advances [ANKA-318](/ANKA/issues/ANKA-318)_.

## Phase 5 — `news`

- [x] **T009.a** Shared news calendar contracts (`packages/shared-contracts/src/news.ts`) for [ANKA-78](/ANKA/issues/ANKA-78): port BLUEPRINT §11.2 schemas plus `RestrictedReply` / `NextRestrictedReply`.
- [x] **T009.d** `svc:news/pre-news-evaluator` 2 h tier-1 lookahead — _[ANKA-164](/ANKA/issues/ANKA-164)_.
- [ ] **T009** FTMO calendar fetcher with `timezone=Europe%2FPrague`; 2-h staleness blackout.
  - [x] **T009.b** `svc:news/symbol-tag-mapper` YAML loader + `instrument` multi-tag split for tracked symbols — _ANKA-79_.
  - [x] **T009.d** `svc:news/restricted-window-evaluator` pure ±5 min tier-1 evaluator — _[ANKA-163](/ANKA/issues/ANKA-163)_; QA gap coverage _[ANKA-207](/ANKA/issues/ANKA-207)_.
  - [x] **T009.e** `svc:news/calendar-db` Bun SQLite store + `init.sql` — _ANKA-161_.
  - [x] **T009.f** `svc:news/calendar-fetcher` Zod validation + 3-attempt 5xx retry + 30-minute cadence + CalendarItem→CalendarEvent persistence mapping — _[ANKA-162](/ANKA/issues/ANKA-162)_, _[ANKA-220](/ANKA/issues/ANKA-220)_.
    - [x] **T009.f.1** Map validated FTMO `CalendarItem` payloads to persisted `CalendarEvent` rows before DB upsert — _[ANKA-220](/ANKA/issues/ANKA-220)_.
    - [x] **T009.f.2** Reject offsetless and impossible `CalendarItem.date` values before deriving `eventTsUtc` — _[ANKA-231](/ANKA/issues/ANKA-231)_.
  - [x] **T009.g** `svc:news/next-restricted-locator` 48h restricted-event ETA helper — _[ANKA-166](/ANKA/issues/ANKA-166)_.
  - [x] **T009.h** `svc:news/freshness-monitor` pure 2 h staleness watchdog over fetch metadata, including fail-closed review fixes for future timestamps and unknown health markers — _[ANKA-167](/ANKA/issues/ANKA-167)_.
  - [x] **T009.i** `svc:news/health` Elysia `/health/details` route with news health contract and type-only Treaty `App` export — _[ANKA-168](/ANKA/issues/ANKA-168)_.
  - [x] **T009.j** `svc:news` Elysia app composition, calendar routes, `/metrics`, live `start.ts`, and full Treaty `App` export — _[ANKA-169](/ANKA/issues/ANKA-169)_.
  - [x] **T009.k** `svc:news` cassette replay, contract drift, Prague DST, and 90/85 coverage gate tests — _[ANKA-170](/ANKA/issues/ANKA-170)_.
  - [x] **T009.c** Migrate `SymbolTagMap` schema/loader ownership to `@triplon/config` generated artifacts — _Closes [ANKA-165](/ANKA/issues/ANKA-165)_.

## Phase 6 — `dashboard`

- [~] **T010** React 19 + Tailwind 4 cockpit; version matrix, control panel, hard-rail logs.
  - [x] **T010.a** Bun-served React 19 + Tailwind 4 shell with version-matrix banner, dashboard `/health` on the registry-canonical port `9204`, and a regression spec pinning `DEFAULT_VERSION_TARGET_SPECS` to `@ankit-prop/contracts#SERVICES` — _[ANKA-121](/ANKA/issues/ANKA-121)_.

## Phase 6.5 — Burn-in

- [ ] **T011** 14-day FTMO Free Trial burn-in; meet all §21.7 criteria.

## Phase 7 — `autoresearch`

- [ ] **T012** Suggest-only mutation/eval loop, 30% acceptance threshold.

## Cross-cutting

- [x] **T014** Enforce Paperclip co-author footer with repo-local `commit-msg` hook — _ANKA-102_.
- [x] **T015** Scaffold `@triplon/config` with Bun-native YAML loading, env-name derivation, SymbolTagMap schema/codegen artifacts, and freshness checks — _Closes [ANKA-130](/ANKA/issues/ANKA-130)_.
- [x] **T016** Adopt Elysia + Eden/Treaty as the workspace HTTP foundation — _Closes [ANKA-131](/ANKA/issues/ANKA-131)_.
- [x] **I003** Reverse `defineAppConfig` user/project precedence and add regression coverage — _[ANKA-149](/ANKA/issues/ANKA-149)_.
- [x] **T018** Extract Prague day-bucket helpers into `@ankit-prop/contracts/time` — _Closes [ANKA-129](/ANKA/issues/ANKA-129)_.
- [~] **Q001** Choose cTrader Open API app credentials path (operator action — folded into ANKA-5 onboarding interaction).
- [ ] **IDEA-001** Backlog of trading-lab ideas tracked in BLUEPRINT §13.7 (decision CC).
