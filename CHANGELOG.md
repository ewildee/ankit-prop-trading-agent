# Changelog

All notable changes to this project. Newest first. Times are HH:MM 24-h **Europe/Amsterdam** (operator clock; this machine's local time). Service-runtime audit-log timestamps live in **Europe/Prague** (FTMO server clock) and are not the same axis.

## 0.4.0 — 2026-04-27 19:23 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing ANKA-14 (Phase 2.3 — the 14 hard rails).

**Why:** CEO unblocked ANKA-14 from ANKA-12: the §9 rails are pure business-rule logic that sit *behind* the gateway transport via a stable broker contract, so they can land mock-driven now and wire to the live socket once ANKA-13/15 ships. Ships every rail behind the same `RailDecision` shape that `@ankit-prop/contracts` v0.3.0 introduced, so the judge stage (advisory) and the gateway (binding) speak the same names (BLUEPRINT §9, §3.5, §8.3, §11.5–11.6).

**Added** — `@ankit-prop/ctrader-gateway` v0.1.0 (`svc:gateway/hard-rails`)

- `src/hard-rails/types.ts`: broker-contract surface (`BrokerSnapshot`, `OpenPosition`, `SymbolMeta`, `NewOrderIntent`/`AmendOrderIntent`/`CloseOrderIntent`), persistence interfaces (`IdempotencyStore`, `ThrottleStore`), `NewsClient` seam, `RailLogger` (pino-compatible signature), `RailContext`, `DEFAULT_RAIL_CONFIG`.
- `src/hard-rails/rail-1-daily-breaker.ts` … `rail-14-monotone-sl-amend.ts`: 14 pure decision functions, each returning a `RailDecision` (`allow | tighten | reject`) and emitting structured logs via `log-decision.ts` (`rail`, `symbol`, `outcome`, `reason`, `accountId`, `envelopeId`, `clientOrderId`, `detail`). Reject decisions log at `warn` so production pino can alert on level alone.
- `src/hard-rails/rail-11-defensive-sl.ts`: gateway tightens any trader-supplied SL looser than the envelope-floor permits. Two constraints, tighter wins: per-trade pct cap (§8.5) and daily-floor headroom (§8.3). Wrong-side SL → reject; zero headroom → reject.
- `src/hard-rails/idempotency-store.ts`: `IdempotencyStore` interface + `InMemoryIdempotencyStore` + `SqliteIdempotencyStore` (bun:sqlite, persists across restart).
- `src/hard-rails/throttle-store.ts`: token bucket with continuous refill (capacity / windowMs); per-account isolation; in-memory + bun:sqlite implementations. Restart picks up consumption from disk.
- `src/hard-rails/force-flat-scheduler.ts`: pre-flatten state machine (BLUEPRINT §11.6 decision M.2). `tick()` enqueues each open position once across {market_close, friday_close, restricted_event} lead-min windows; `isInsideForceFlatWindow()` is the helper rail 13 calls for new-entry rejection.
- `src/hard-rails/news-client.ts`: `NewsClient` interface + `InMemoryNewsClient` fixture (sorted-events impl) for matrix tests; real svc:news client lands with ANKA-9.
- `src/hard-rails/evaluator.ts`: composes the 14 rails in §9 catalog order; short-circuits at first reject so idempotency (rail 9) and throttle (rail 12) do not consume state on a failed verdict.
- `src/hard-rails/{matrix,rail-11-defensive-sl,idempotency-store,throttle-store,force-flat-scheduler}.spec.ts`: matrix has all 28 cases (14 × {positive: rail trips, negative: rail allows}) green; defensive-SL math is anchored to §8.3; persistence specs reopen the SQLite database to prove restart survival.

**Bumped**

- root `ankit-prop-umbrella` 0.3.0 → 0.4.0.
- `@ankit-prop/ctrader-gateway` 0.0.1 → 0.1.0 (private workspace; first version with substantive code).

**Verification**

- `bun test services/ctrader-gateway`: 54 pass / 0 fail / 423 expect() across 5 files (133 ms).
- `bun run lint:fix`: clean (3 pre-existing informational notes from `pkg:eval-harness`, untouched here).
- `bun run typecheck`: clean.

**Open**

- Live transport / OAuth / order-manager wiring are owned by ANKA-13 / ANKA-15. The rails will plug into the live socket via the same `RailContext` they already consume; no contract changes expected.
- Pino factory (`pinoLogger()`) is intentionally not yet shipped — the rails depend only on the `RailLogger` shape. Wiring lands in ANKA-15 alongside the gateway service entrypoint.
- A parallel run still has `packages/ctrader-vendor/{src,smoke,proto}/` untracked on disk (ANKA-12 7-step harness scaffold, captured in journal v0.3.1 entry); kept out of this commit. Their codec spec currently fails one round-trip case — pre-existing, untouched, not blocking ANKA-14.

## 0.3.0 — 2026-04-27 18:59 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing ANKA-7 (Phase 2 prep — offline-runnable contract surface).

**Why:** ANKA-12 (the §10.3 vendor smoke-test) remains blocked on ANKA-5 creds, but the §9 hard-rails contract surface can ship now without touching the broker. Defining `RailDecision` + `RailVerdict` + the canonical 14-rail catalog in `@ankit-prop/contracts` lets ANKA-14 (rails matrix) land on stable shapes the moment ANKA-12 unblocks, and lets services/judge wire the same rail names without forking strings (BLUEPRINT §9, §6.5, §6.6).

**Added** — `@ankit-prop/contracts` v0.3.0 (`pkg:contracts/hard-rails`)

- `hard-rails.ts`: canonical `HARD_RAIL_KEYS` literal-typed catalog (14 rails, ordered exactly per BLUEPRINT §9 table 1..14), `HARD_RAIL_NUMBER` lookup, `RAIL_OUTCOMES` enum (`allow | tighten | reject`), `RailDecision` and `RailVerdict` strict-Zod schemas, and a pure `composeRailVerdict` aggregator (`reject` dominates `tighten` dominates `allow`).
- `index.ts`: re-exports the new module so consumers `import { HARD_RAIL_KEYS, RailDecision, composeRailVerdict } from '@ankit-prop/contracts'`.
- `hard-rails.spec.ts`: 11 new cases — catalog count + numbering invariants, schema accept/reject (empty reason, unknown rail, extra keys), and verdict composition (all-allow, tighten dominates allow, reject dominates everything, empty list, round-trip through Zod).

**Repo**

- `.gitignore`: ignore `.tmp-*/` so transient vendor probe directories (e.g. `.tmp-ctrader-ts-inspect/` left by a parallel ANKA-12-prep session) do not pollute biome's lint walk.

**Bumped**

- root `ankit-prop-umbrella` 0.2.0 → 0.3.0.
- `@ankit-prop/contracts` 0.2.0 → 0.3.0 (additive — hard-rails module added; eval + health untouched).

**Verification**

- `bun run lint` clean (exit 0; 3 informational `useLiteralKeys` notes from `pkg:eval-harness` flagged as unsafe-fix only — left untouched here, owner of ANKA-8 to decide).
- `bun run typecheck` clean.
- `bun test` 106 pass / 0 fail / 185 expect() across 18 files.

## 0.2.0 — 2026-04-27 18:50 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing ANKA-8.

**Why:** Phase 3 of the BLUEPRINT.md roadmap — `pkg:eval-harness` is the canonical FTMO rule simulator + backtest/paper-replay/live-score library that gates every autoresearch mutation (BLUEPRINT §14, §15, §22 phase 3, §25 `pkg:eval-harness`). Exit gate: golden fixture suite trips simulator on bad strategies; 12-fold walk-forward harness functional; promotion gates implemented + unit-tested; library published; regression CI green.

**Added** — `@ankit-prop/contracts` v0.2.0 (`pkg:contracts/eval`)

- `eval.ts`: `EvalResult` shape per BLUEPRINT §14.2 verbatim — `metrics`, `ftmoBreaches`, `costBreakdown`, `diagnostics`, optional `walkForward.folds[12]`. New schemas: `FtmoBreach` (with `kind` ∈ all 11 §14.3 kinds, `scope` ∈ `{ftmo, internal}`, account/envelope/timestamp/message/detail), `EvalMetrics`, `StageCost`, `CostBreakdown`, `WalkForwardFold`, `FoldResult`, `WalkForwardSummary` (length-12 invariant enforced by Zod `.length(12)`), `StageName` (closed `analyst|trader|judge|reflector` enum).
- `index.ts`: re-exports the eval module alongside `health` so consumers `import { EvalResult, FtmoBreach } from '@ankit-prop/contracts'`.

**Added** — `@ankit-prop/eval-harness` v0.1.0 (`pkg:eval-harness`)

- `ftmo-rule-simulator` (`src/ftmo-rules.ts`): canonical offline rule semantics. Tracks day-start balance (locked at midnight), accumulates daily P&L, emits `daily_loss` / `overall_loss` against both internal margins (4% / 8%) AND the FTMO line (5% / 10%) per §8.2 / §8.3. Detects `min_hold` (sub-60s holds), `news_blackout_open` (entries inside ±5-min window AND inside the 2-h pre-news kill-switch — separate breach detail), `news_blackout_close`, `news_sl_tp_in_window` (bar-OHLC overlap approximation per §14.6), `weekend_hold` (per configured Friday-close timestamp), `ea_throttle_exceeded` (1 800 / day / account token-bucket), `hft_classification` (sub-min-hold share > threshold), `consistency_violation` (single-day P&L > 45% of total; off by default outside funded phase).
- `metrics` (`src/metrics.ts`): `sortinoRolling60d` (60-day window, downside-only stdev, 252 annualisation), `maxDrawdownPct` (peak-to-trough), `profitFactor` (Σwins / Σlosses), `winRate`, `averageRR`, `tradeCount`, plus `buildEquityCurve` and `emptyMetrics`.
- `slippage-model` (`src/slippage-model.ts`): `maxFillSlippage = max(2 × spread, 0.5 × ATR(14))` per §14.6 + decision X. `atr14` true-range averager over a 14-bar window; `effectiveSpreadPips` with news-window multiplier (default 5×); `applySlippage` price-direction-aware fill skew.
- `bar-data-cache` (`src/bar-data-cache.ts`): `bun:sqlite` reader/writer over `data/bars.db` with PK `(symbol, timeframe, ts_start)` per §14.5 schema. WAL journal mode. `BarFetcher` interface with default `NoFetcher` (cTrader live fetch belongs to gateway, Phase 2). Injectable fetcher fills cache on miss; subsequent reads hit cache.
- `walk-forward` (`src/walk-forward.ts`): `buildFolds` produces exactly `WALK_FORWARD_FOLD_COUNT = 12` folds (6-month train / 1-month score, 1-month step) per §14.7. `runWalkForward` orchestrates per-fold runners and applies pass criteria (no breaches, Sortino lift ≥ 5%, ≥ 40 trades, drawdown ≤ baseline) to produce `FoldResult[12]` + `passingFolds`.
- `promotion-gate` (`src/promotion-gate.ts`): `evaluatePromotionGate` mechanically applies §14.4 — no breaches, Sortino ≥ baseline × 1.05, ≥ 40 trades, drawdown ≤ baseline, ≥ 8 / 12 passing folds. Returns `PromotionDecision { promote, reasons[], failed[] }` for transparent autoresearch feedback. `isFoldPassing` + `summarizeFoldMetrics` helpers.
- `cost` (`src/cost.ts`): `CostMeter` per-stage USD accounting honoring §14.8 ceilings (default $50, prod $200, autoresearch per-mutation $50). `CostBudgetExceeded` typed error; `emptyCostBreakdown()` factory.
- `sim-engine` (`src/sim-engine.ts`): bar-granularity simulator (decision G). Drives `BarStrategy.onBar(bar, ctx)` per bar, honours SL/TP intra-bar, computes equity from realized + floating P&L, calls into `FtmoSimulator` for blackout/min-hold/weekend/EA/consistency checks, force-closes any survivors at end-of-window.
- Three entry points (`src/{backtest,paper-replay,live-score}.ts`): match BLUEPRINT §14.1 signatures. `backtest` runs strategy through bars with cost ledger; `paperReplay` rescores a recorded decision log without LLM; `liveScore` aggregates real trade history for live monitoring.
- `golden-fixtures` (`src/fixtures/index.ts`): six CI-gated fixtures per §14.9 — `flat` (HOLD, expects 0 trades / 0 breaches), `trivial` (BUY-then-exit, deterministic 1 trade), `bad-daily-loss` (forces 4% internal floor breach), `bad-news-window` (entry inside ±5-min window), `bad-min-hold` (sub-60s close), `bad-weekend-hold` (carry past Friday-close).
- `*.spec.ts` coverage: contracts (5 cases), metrics (8), slippage-model (5), promotion-gate (8), walk-forward (3), bar-data-cache (4), ftmo-rules (10), golden-fixtures end-to-end (7). Whole workspace: 95 tests / 172 expect() / 0 fails.

**Bumped**

- root `ankit-prop-umbrella` 0.1.0 → 0.2.0.
- `@ankit-prop/contracts` 0.1.0 → 0.2.0 (additive — eval module added).
- `@ankit-prop/eval-harness` 0.0.1 → 0.1.0 (initial public surface).

**Verification**

- `bun run lint` clean (3 informational notes, zero warnings or errors).
- `bun run typecheck` clean.
- `bun test` 95 pass / 0 fail / 172 expect() across 17 files (3.5 s).

## 0.1.0 — 2026-04-27 18:35 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing ANKA-6.

**Why:** Phase 1 of the BLUEPRINT.md roadmap — `@triplon/proc-supervisor` is the lifecycle manager for the process tree (BLUEPRINT §3, §17, §22 phase 1, §23.3, §23.4). The exit gate is "`bun run start` brings up fake services with all transitions verified".

**Added** — `@triplon/proc-supervisor` v0.1.0 (`pkg:supervisor`)

- `topo-sort`: Kahn-style dependency-ordered startup with parallel waves; rejects cycles, unknown deps, duplicate names. Reverse-topo for shutdown ordering.
- `restart-policy`: backoff (exponential, capped) + circuit-break (`maxCrashes` in `windowMs` → `circuit-broken`, BLUEPRINT §23.4 default 3-in-5-min).
- `health-poller`: HTTP `/health` poll with abort-controller timeouts; validates the full `HealthSnapshot` schema; status-class gating (`expectStatus`).
- `findproc-adapter`: `lsof`-backed real adapter + injectable `FakeFindProc` for hermetic tests; POSIX signal delivery via `process.kill`.
- `process-manager`: per-service state machine (`idle | starting | running | unhealthy | stopping | stopped | crashed | circuit-broken | adopted`). Implements adopt | replace | refuse semantics on port collision; `Bun.spawn` for spawn; SIGTERM-then-SIGKILL graceful stop with shutdown-timeout backstop; ring-buffered stdout/stderr capture.
- `aggregated-health`: `Bun.serve` on `port` (default 9100). Routes `GET /health` → `AggregatedHealth`, `GET /services` → `ServiceStatus[]`, `POST /services/<name>/restart`, `GET /services/<name>/logs`, `DELETE /supervisor` (graceful shutdown handle).
- `config-loader`: `Bun.YAML.parse` → Zod-validated `SupervisorCfg`; cross-validates `dependsOn` references and self-loops.
- CLI (`pkg:supervisor/cli`): `start | stop | status | restart <name> | logs <name> | --version`. SIGTERM/SIGINT → reverse-topo graceful shutdown.
- Top-level `Supervisor` orchestrator: parallel-wave start, reverse-topo stop, owns health-server lifecycle.

**Added** — `@ankit-prop/contracts` v0.1.0 (`pkg:contracts/health`)

- `HealthSnapshot` Zod schema (BLUEPRINT §19.0) — strict-object validation, every service uses this for `/health`.
- `AggregatedHealth`, `ServiceStatus`, `SUPERVISOR_SERVICE_STATES` schemas/enums for the supervisor's aggregator (BLUEPRINT §19.0.1).
- `loadVersionFromPkgJson` helper — runtime-load the `version` field from `package.json` so `/health` always reflects the actually-running build (no hard-coded version strings, BLUEPRINT §19.0).

**Tested**

- 8 unit suites: `topoSort`, `RestartPolicy`, `parseConfig`, `pollOnce` + `waitUntilHealthy`, `FakeFindProc`, `buildAggregatedHealth`, `HealthSnapshot` / `AggregatedHealth` / `loadVersionFromPkgJson`.
- 7 integration cases against the in-repo `fake-service` (BLUEPRINT §22 phase 1 exit gate): adopt, replace, refuse, restart-policy, topo-order, circuit-break, graceful shutdown — including aggregated `/health` round-trip.
- 45 tests / 79 expect() calls / 0 fails (`bun test` in 3.4 s on this host).

**Notes**

- `zod@4.3.6` (BLUEPRINT §5.2 pin) added to root + workspace `dependencies`. Bun built-ins used everywhere else (`Bun.spawn`, `Bun.serve`, `Bun.YAML.parse`, `Bun.file`, `Bun.env`, `bun:test`) per BLUEPRINT §5.1.
- `SupervisorCfg` is `loose()` at the top level so `config/supervisor.example.yaml` can carry future `recovery:` / `daily_summary:` / `operator:` blocks without breaking the supervisor loader. `ServiceCfg` stays strict.
- The 14 hard rails are out of scope for Phase 1 — they belong to `svc:gateway` (Phase 2, ANKA-7).
- This release also picks up the root-version bump that ANKA-10 (v0.0.3) explicitly deferred to "the Phase 1 (T002) session".

## 0.0.3 — 2026-04-27 18:31 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing ANKA-10 (parent
ANKA-9) under CEO direction.

**Why:** Replace the IC Markets demo with the FTMO Free Trial as the
Phase 2 smoke-test target and the Phase 6.5 burn-in surface. The Free
Trial is free, gives us real broker data immediately, is
operator-resettable when guardrails trip, and aligns the smoke-test
environment with the eventual paid-challenge surface — pulling a real
broker integration onto the critical path much faster.

**Changed**

- `BLUEPRINT.md` — §0.1 onboarding interview, §10.3 (`ctrader-ts`
  smoke), §14 sim slippage calibration source, §21.1 / §21.3 / §21.7
  test pyramid + integration matrix, §22 phase table (Phase 2 / 4 /
  6.5), §24.1 / §24.2 / §24.3 pre-launch checklists, §26 open
  questions: every "IC Markets demo" / "IC demo" reference retargeted
  to "FTMO Free Trial". Paid FTMO 100k 2-step entry untouched.
- `.env.example` — `BROKER_*_IC_DEMO_1` → `BROKER_*_FTMO_TRIAL_1`;
  cTrader-app comment now points at the trial; `BROKER_*_FTMO_1`
  block kept verbatim for the future paid challenge.
- `config/accounts.example.yaml` — account `ic-demo-1` →
  `ftmo-trial-1`; `broker.provider` `ctrader-ic-demo` →
  `ctrader-ftmo-trial`; envelope `ic-demo-burn-in` →
  `ftmo-trial-burn-in`; commented that the slot is operator-resettable.
- `README.md` — operating-contract bullet now says "FTMO Free Trial
  demo and FTMO challenge demo only".
- `TODOS.md` — T005 + T011 retargeted.

**Notes**

- ANKA-5 onboarding intake to be retargeted in the same heartbeat:
  cancel the in-flight `ask_user_questions` interaction (which still
  asks IC Markets demo fields) and repost with FTMO Free Trial fields.
  Cross-link comment posted on ANKA-5.
- No changes to risk numerics, hard rails, or pipeline content.
- No live broker calls in this commit. `bun run lint` + `bun run
  typecheck` pass against the working tree (Phase 1 in-flight changes
  also present and untouched).
- Root package version bump intentionally deferred — `package.json` is
  in-flight in the Phase 1 (T002) session and will be bumped there.

## 0.0.2 — 2026-04-27 18:21 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing ANKA-5.

**Why:** BLUEPRINT §0.1 onboarding scaffold. Make the credential/config
intake reproducible from blank slate so the operator can populate `.env`
once and the build continues autonomously.

**Added**

- `.env.example` rewritten as the canonical §17.5 + §0.1 template — covers
  cTrader app creds, IC demo account, FTMO slot, OpenRouter, alerting,
  telemetry, encryption key, and operating mode.
- `config/accounts.example.yaml` — committed editable template for
  BLUEPRINT §17.1 with `*_env` references only (zero inlined secrets).
- `config/supervisor.example.yaml` — committed §17.2 template (services,
  recovery, daily summary, operator block).
- `~/.config/ankit-prop/accounts.config.yaml` and
  `~/.config/ankit-prop/supervisor.config.yaml` — operator-canonical
  copies written to host scope (gitignored).
- Local `.env` seeded with a freshly generated `SECRETS_ENCRYPTION_KEY`
  (32-byte hex via `crypto.randomBytes`); other fields blank for operator
  to drop secrets in.

**Notes**

- `.env` and host `*.config.yaml` are gitignored; `config/*.example.yaml`
  is whitelisted. Verified via `git check-ignore`.
- OpenRouter health probe and cTrader `application_auth` OAuth check
  remain pending — they require operator-supplied secrets and run as
  part of the `ask_user_questions` follow-up on ANKA-5.

## 0.0.1 — 2026-04-27 18:16 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing ANKA-2.

**Why:** Phase 0 of the BLUEPRINT.md roadmap — produce a working umbrella monorepo skeleton so subsequent phases (proc-supervisor, ctrader-gateway, …) have a stable, lintable, testable, version-tracked surface to land on.

**Added**

- Bun workspaces (`packages/*`, `services/*`) with placeholder package.json in each member.
- Pinned dev surface: Bun 1.3.13 (engines), Biome 2.4.13, TypeScript 6.0.3.
- Root scripts: `start`, `stop`, `status`, `lint`, `lint:fix`, `typecheck`, `test`, `db:migrate`, `backup`, `restore`, `secrets:rotate`.
- `tsconfig.json` (strict, `noUncheckedIndexedAccess`, bundler resolution, `bun` types).
- `biome.json`, `bunfig.toml`, `.gitignore`, `.env.example` per BLUEPRINT §17.5.
- `.dev/` skeleton: `progress.md`, `journal.md`, `decisions.md` (ADR-0001, ADR-0002), `ideas/`, `discussion/`, `specs/`.
- Seed `TODOS.md` covering the BLUEPRINT phasing.
- Smoke spec in `packages/shared-contracts/` so `bun test` has at least one assertion to run.
- GitHub Actions CI gate (`.github/workflows/ci.yml`): lint + typecheck + test.

**Notes**

- No business code in this release — Phase 0 is intentionally a skeleton, per ADR-0001.
