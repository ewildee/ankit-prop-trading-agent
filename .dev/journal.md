# Journal

_Append-only, newest first. Never edit past entries._

## 2026-04-27 18:50 Europe/Amsterdam — v0.2.0

**What was done**

- Closed Phase 3 (ANKA-8): built `pkg:eval-harness` v0.1.0 end-to-end per BLUEPRINT §14, §15, §22 phase 3, §25 `pkg:eval-harness`, §26 acceptance threshold open item.
- New `pkg:contracts/eval` module (`packages/shared-contracts/src/eval.ts`) with the §14.2 `EvalResult` shape verbatim. `FtmoBreach` covers all 11 §14.3 kinds with `scope ∈ {ftmo, internal}` (authority order: §14.3) plus `account/envelope/timestamp/message/detail`. `WalkForwardSummary` enforces the 12-fold invariant via `z.array(FoldResult).length(12)`. `StageName` is closed-enum `analyst|trader|judge|reflector` so `costBreakdown.perStage` records key into the §13 pipeline canon.
- New eval-harness sub-modules under `packages/eval-harness/src/`: `ftmo-rules.ts` (canonical simulator), `metrics.ts` (Sortino/dd/PF/winrate/avgRR), `slippage-model.ts` (`max(2 × spread, 0.5 × ATR(14))` + news multiplier + ATR(14) true-range averager), `bar-data-cache.ts` (`bun:sqlite`-backed WAL store of bars per §14.5 schema with injectable `BarFetcher`), `walk-forward.ts` (12-fold orchestrator), `promotion-gate.ts` (§14.4 mechanics + per-fold pass), `cost.ts` (`CostMeter`, ceilings per §14.8), `sim-engine.ts` (bar-granularity strategy runner + intra-bar SL/TP + force-flat at end), `backtest.ts` / `paper-replay.ts` / `live-score.ts` (the three §14.1 entry points), `fixtures/index.ts` (6 golden fixtures).
- Test coverage: 8 spec files in eval-harness (`metrics.spec.ts`, `slippage-model.spec.ts`, `promotion-gate.spec.ts`, `walk-forward.spec.ts`, `bar-data-cache.spec.ts`, `ftmo-rules.spec.ts`, `golden.spec.ts`) + `eval.spec.ts` in contracts. 95 pass / 172 expect() / 0 fails / 3.5 s on this host. Golden fixtures trip the simulator end-to-end on every bad strategy listed in §14.9.
- `bun run lint`, `bun run typecheck`, `bun test` all green.
- Versions: root umbrella → 0.2.0; `@ankit-prop/contracts` 0.1.0 → 0.2.0 (additive, eval module added); `@ankit-prop/eval-harness` 0.0.1 → 0.1.0 (initial public surface). CHANGELOG entry on top.

**Findings**

- `z.array(...).length(N)` works in Zod 4.3.6 — used to encode the 12-fold invariant directly into `WalkForwardSummary` so any caller that hands a non-12 array fails at parse time, before we ever spend tokens on autoresearch.
- BLUEPRINT §14.2's `costBreakdown.perStage: z.record(StageName, ...)` is interpreted as a closed-enum record (one entry per stage), not a sparse map. `emptyCostBreakdown()` therefore seeds all 4 stage keys with zeros so the schema parses even on backtests with no LLM calls (Phase 3 fixtures don't run LLMs).
- Bun's `bun:sqlite` is plenty for the bar-data cache and ships natively per BLUEPRINT §5.1; no npm dependency. WAL mode chosen up front so the autoresearch nightly can read while the daily refresh job (§14.5) writes.
- `consistency_violation` (45% rule) only applies at funded-payout time per FTMO docs. Forcing it during Phase 1/2 backtests would false-positive on every short fixture (single-trade share = 100%). The simulator now defaults `consistencyCheckEnabled` from `account.phase === 'funded'` and gates further on `consistencyMinTrades` (default 10). Keeps the rule canonical without poisoning the golden suite.
- `weekend_hold` and the rest of FTMO Standard's "swing-only" gates (news SL-in-window, weekend carry) fire only when explicitly configured (`account.weekendCloseTimestamp`, `internalMargins.weekendHoldEnabled`, `enforceNewsBlackout` for the FTMO line). Matches FTMO Standard semantics; Swing accounts will toggle the flags via account config when they exist.

**Decisions**

- Bar-granularity (decision G) is the v1 simulator. Sub-bar tick replay is deferred to the §14.6 mitigation policy review (30 days of live-vs-eval Sortino divergence > 20%).
- Authority order for FTMO breaches: gateway > simulator > FTMO docs (§14.3). The simulator emits both `internal` and `ftmo` scopes when both are crossed; this is so autoresearch sees the same shape live and offline (a `ftmo`-scope breach in eval = candidate dies; an `internal`-scope breach in eval = candidate also dies because tightening matters).
- `BarFetcher` is an interface, not a concrete fetch. Live cTrader pulls (`ProtoOAGetTrendbarsReq`) belong to the gateway and arrive in Phase 2 / Phase 4 wiring. Phase 3 ships the cache + a `NoFetcher` default; tests use static prefetch and a synthetic injected fetcher.
- The promotion-gate decision returns `failed[]` (typed enum) plus `reasons[]` (human strings). Autoresearch logs both; the typed array drives metrics ("60% of mutations failed `too_few_trades`"), the human strings drive the operator-facing dashboard cards.
- `pragueDayStartFromMs` in sim-engine is currently a UTC-day shim; switching to a proper `Europe/Prague`-anchored DST-aware bucketing belongs in Phase 4 (Q042 — first FTMO server-time observation answers whether we even need it). Documented as a hook so later swap is local.

**Adaptations**

- Initial Trivial fixture tripped `consistency_violation` because a single trade is 100% of total profit — see Findings. Resolved by phase-gating the rule, not by special-casing the fixture.
- Initial `bad-weekend-hold` fixture didn't fire because `FtmoSimulator.checkWeekend` is only invoked when sim-engine drives it. Wired `weekendCloseTimestampsMs` through `SimEngineCfg` and added an inline check at each bar boundary; the simulator dedupes per-position so the breach fires once per position even if multiple bars overlap the timestamp.
- Biome `noNonNullAssertion: warn` flagged a few test-only `!` after optional chains (`goodCandidate.walkForward!`); replaced with explicit `if (!wf) throw new Error('test setup error')` guards so the spec compiles cleanly under Biome's stricter view of correctness.
- `exactOptionalPropertyTypes: true` (Phase 0 choice) bites on `EvalResult.walkForward?: WalkForwardSummary` — assigning `undefined` is fine, but on `BacktestInput → SimEngineCfg.weekendCloseTimestampsMs` we conditionally spread instead of assigning `undefined`.

**Open endings**

- Phase 4 (`svc:trader`): consume `eval-harness.backtest()` from inside the trader's autoresearch wiring, plug the LLM-backed `BarStrategy` (Phase 4 builds the persona executor); cost ledger feeds straight into `CostMeter`.
- Phase 7 (`svc:autoresearch`): mutation generator → `eval-harness.backtest()` → `paperReplay()` → `liveScore()` → `walk-forward` → `evaluatePromotionGate()`. The whole gate is implemented; the consumer wiring lands in Phase 7.
- Phase 2 (`svc:gateway`) — once cTrader transport lands, the bar-data-cache `BarFetcher` gets a `CTraderTrendbarsFetcher` implementation that calls `ProtoOAGetTrendbarsReq` (§14.5). The cache itself is ready.
- BLUEPRINT §26 long-running open: simulator drift vs actual FTMO behaviour is now reviewable — when the first FTMO Free Trial fill produces real-world breach behaviour, fold it back into `ftmo-rules.ts`. The simulator's authority is §14.3 step 4 ("on disagreement, gateway wins; simulator is updated to match").
- Phase 2 child issues (ANKA-12..15) carried in working tree at heartbeat start; left untouched per the same convention used in v0.0.3 / v0.1.0 — those bumps and files belong to ANKA-7's own commit chain, not ANKA-8.

## 2026-04-27 18:42 Europe/Amsterdam — Phase 2 breakdown (ANKA-7)

**What was done**

- Woke on `issue_blockers_resolved` for [ANKA-7](/ANKA/issues/ANKA-7) (Phase 1 → Phase 2 hand-off). Issue itself instructs the engineer to split sub-tasks into child issues; followed that.
- Created 4 bounded children under ANKA-7, each with explicit `blockedByIssueIds`:
  - **ANKA-12** Phase 2.1 — §10.3 cTrader vendor 7-step smoke-test against FTMO Free Trial. Blocked by ANKA-5 (creds in `.env`) and ANKA-10 (FTMO Free Trial canonicalization landing).
  - **ANKA-13** Phase 2.2 — transport (Bun-native WSS, 10 s heartbeat, 1→30 s backoff) + two-phase OAuth + AES-GCM refresh-token persistence + reconciliation (broker-wins, drift = 0). Blocked by ANKA-12.
  - **ANKA-14** Phase 2.3 — the 14 hard rails (§9), each with positive + negative test in a single matrix (28 cases). Blocked by ANKA-12.
  - **ANKA-15** Phase 2.4 — order-manager (place/amend/close), execution-stream (`ProtoOAExecutionEvent` ingest), SQLite persistence, crash-recovery per §23.4. Blocked by ANKA-12 + ANKA-13 + ANKA-14.
- Updated `TODOS.md` Phase 2 block to mirror the new ANKA-12..15 structure.
- Did **not** ship code in this heartbeat: working tree still carries uncommitted parallel-session work (ANKA-10 broker-target rename across `BLUEPRINT.md`, `.env.example`, `README.md`, `config/accounts.example.yaml`, plus untracked `packages/shared-contracts/src/eval.ts` + `eval.spec.ts`). Adding offline contract scaffolding now would either co-commit those changes or fork divergent contracts; cleaner to wait for those parallel commits to land.

**Findings**

- BLUEPRINT §10.3 framing — vendor smoke first, in-house only if it fails — is itself the first deliverable, not a side-quest. ANKA-12 must run end-to-end before ANKA-13/14/15 can begin in earnest, because the chosen tree determines every subsequent type signature.
- ANKA-7's pre-conditions for actually executing the smoke (live creds + FTMO Free Trial canonicalization) sit in two **other** assigned-to-me issues (ANKA-5 and ANKA-10) currently in flight via parallel runs. Phase 2 deliverable work is gated on those landing first; child blockers reflect that explicitly so the system wakes me again on `issue_blockers_resolved` rather than me polling.

**Decisions**

- Phase 2 child layout (ANKA-12 → 13 → {14 ‖ 15}) maps 1:1 onto BLUEPRINT §10 + §9 sub-systems and matches the issue description's recommended split. Recorded as the Phase 2 task graph in `TODOS.md`; no ADR needed yet (no design choice made — just decomposition).
- Hold offline scaffolding (rails contract surface, smoke harness skeleton) until parallel ANKA-10 / shared-contracts work lands. That keeps commits atomic and prevents accidental co-commit of someone else's untracked `eval.ts`.

**Surprises / contradictions**

- `packages/shared-contracts/src/index.ts` already imports from `./eval.ts` even though `eval.ts` is **untracked** in git. Tests evidently run because mtime is recent and Bun resolves the on-disk file. If anyone runs `git stash` or `git clean -fd` they'll break the tree. Not mine to fix this heartbeat — flagging in journal so it surfaces at next session.

**Open endings**

- ANKA-12 is now the next Phase 2 deliverable. It cannot start until ANKA-5 (creds) and ANKA-10 (broker-target canonicalization) finish.
- When woken on `issue_blockers_resolved` for ANKA-12, fetch the latest `.env` shape, sanity-check `BROKER_*_FTMO_TRIAL_1` are populated (without logging values), and start the 7-step harness scaffolding under `packages/ctrader-vendor/smoke/`.

## 2026-04-27 18:35 Europe/Amsterdam — v0.1.0

**What was done**

- Closed Phase 1 (ANKA-6): built `@triplon/proc-supervisor` v0.1.0 end-to-end per BLUEPRINT §3, §17, §22 phase 1, §23.3, §23.4.
- New submodules under `packages/proc-supervisor/src/`: `topo-sort.ts`, `restart-policy.ts`, `health-poller.ts`, `findproc-adapter.ts` (real `lsof`-backed + `FakeFindProc`), `spawner.ts` (real `Bun.spawn` + injectable `ProcSpawner`), `process-manager.ts`, `aggregated-health.ts` (`Bun.serve` on 9100, routes `/health`, `/services`, `/services/:name/{restart,logs}`, `DELETE /supervisor`), `config-loader.ts` (`Bun.YAML.parse` → Zod), `supervisor.ts` (top-level orchestrator), `cli.ts` (`start | stop | status | restart | logs | --version`).
- New shared-contracts module: `packages/shared-contracts/src/health.ts` exporting `HealthSnapshot`, `AggregatedHealth`, `ServiceStatus`, `SUPERVISOR_SERVICE_STATES`, `loadVersionFromPkgJson`. BLUEPRINT §19.0 / §19.0.1 honoured.
- Test fixtures in `packages/proc-supervisor/test/`: `fake-service.ts` (env-driven Bun.serve emitting full `HealthSnapshot`), `test-utils.ts` (port-allocator, `fakeServiceCfg`, `poll`).
- Test coverage:
  - Unit: `topoSort`, `RestartPolicy`, `parseConfig`, `pollOnce` + `waitUntilHealthy`, `FakeFindProc`, `buildAggregatedHealth`, `HealthSnapshot` / `AggregatedHealth` / `loadVersionFromPkgJson`.
  - Integration (BLUEPRINT §22 phase 1 exit gate): all 7 cases — adopt, replace, refuse, restart-policy, topo-order, circuit-break, graceful shutdown — pass against real Bun-spawned fake services.
  - 45 tests / 79 expect() / 0 fails / 3.4 s on this host.
- `bun run lint`, `bun run typecheck`, `bun test` all green.
- Versions bumped: root umbrella → 0.1.0; `@triplon/proc-supervisor` 0.0.1 → 0.1.0; `@ankit-prop/contracts` 0.0.1 → 0.1.0. CHANGELOG entry on top.
- Added `zod@4.3.6` (BLUEPRINT §5.2 pin) to root + workspaces.

**Findings**

- Bun's built-in `Bun.YAML.parse` (1.2.18+) handles the §17.2 example cleanly; no `js-yaml`/`yaml` dependency needed (BLUEPRINT §5.1).
- Zod 4 changed `.default()` typing on object schemas: passing `{}` no longer satisfies the inner default's required-fields type even though it works at runtime. Resolved by `Schema.default(() => Schema.parse({}))` — keeps the inner-defaults contract single-sourced and TypeScript happy under `exactOptionalPropertyTypes: true`.
- Bun's `Server` type is generic over `WebSocketData`; rather than fight the ambient generic, the supervisor now infers it via `type BunServer = ReturnType<typeof Bun.serve>`.
- `exactOptionalPropertyTypes: true` in `tsconfig.json` (Phase 0 choice) bites on `cwd?: string` once you try to pass `undefined` through. Fixed by spreading conditionally: `...(cfg.cwd ? { cwd: cfg.cwd } : {})`.
- Working tree carried concurrent ANKA-10 edits (IC demo → FTMO Free Trial terminology) at heartbeat start; my CHANGELOG and journal entries inserted above the in-progress 0.0.3 block without disturbing it.

**Decisions**

- `SupervisorCfg` top-level is `z.object({...}).loose()` (allows extra keys like `recovery`, `daily_summary`, `operator`) so `config/supervisor.example.yaml` round-trips through the loader without losing future blocks. `ServiceCfg` stays `z.strictObject` to catch typos in service definitions.
- Service "adopt" semantics: the supervisor probes `/health` of whatever owns the port, marks `state=adopted`, and starts the running-state health loop, but does **not** own the process's lifecycle (no auto-restart on crash). When `stop()` is called on an adopted service, the supervisor releases its tracking and leaves the foreign process alone — explicit, conservative behaviour to avoid killing operator-launched debug processes.
- "Replace" first sends SIGTERM then escalates to SIGKILL after the per-service `shutdown.timeoutMs` if the port stays held. Same backstop is wired into `ProcessManager.stop()` for self-spawned services. This matches BLUEPRINT §23.3.
- Circuit-break threshold uses `> maxCrashes` so the default 3-in-5-min trips on the **4th** crash, matching BLUEPRINT §23.4 ("three crashes → manual recovery only").
- Did not bring in `@triplon/config` for this phase — supervisor's YAML is read directly via `Bun.YAML.parse` + Zod. The shared loader is a deliberate Phase 4+ pull (when multiple services need a single env-resolution layer).

**Adaptations**

- Replaced `import type { Server } from 'bun'` with `type BunServer = ReturnType<typeof Bun.serve>` after Biome rejected the bare `Server` (missing generic argument under TS 6 strict).
- Removed an unused `private exitListener` field on `ProcessManager` flagged by Biome's `noUnusedPrivateClassMembers`. The async exit-watcher is now `void handle.exited.then(...)` since we don't need a handle on it.

**Open endings**

- BLUEPRINT.md, README.md, `.env.example`, `config/accounts.example.yaml` carry uncommitted ANKA-10 terminology changes; left in working tree for ANKA-10 to commit independently.
- Phase 2 (ANKA-7) — `svc:gateway` against the FTMO Free Trial demo with the 14 hard rails. Pre-condition: cTrader app credentials populated in `.env` (handled by the open ANKA-5 interaction).
- `@triplon/proc-supervisor` is a graduate-able library (BLUEPRINT §25.1). When/if the Triplon registry is wired up, this package can be published independently — the `@triplon/` scope is already in place.

## 2026-04-27 18:31 Europe/Amsterdam — v0.0.3

**What was done**

- Executed ANKA-10 (parent ANKA-9): retargeted Phase 2 smoke-test +
  Phase 6.5 burn-in broker from IC Markets demo to FTMO Free Trial.
- Patched `BLUEPRINT.md` everywhere "IC Markets demo" / "IC demo"
  appeared as the smoke/burn-in target — §0.1 interview, §10.3
  smoke-test gate, §14 slippage calibration, §21.1 / §21.3 / §21.7
  test pyramid + integration matrix, §22 phase table (Phase 2 / 4 /
  6.5), §24.1 / §24.2 / §24.3 pre-launch checklists, §26 open
  questions. Paid FTMO 100k 2-step block untouched.
- Renamed env vars `BROKER_*_IC_DEMO_1` → `BROKER_*_FTMO_TRIAL_1` in
  `.env.example`, retargeted the cTrader-app comment, kept
  `BROKER_*_FTMO_1` block intact for the future paid challenge.
- `config/accounts.example.yaml`: account `ic-demo-1` → `ftmo-trial-1`;
  `broker.provider` `ctrader-ic-demo` → `ctrader-ftmo-trial`; envelope
  `ic-demo-burn-in` → `ftmo-trial-burn-in`; documented operator-reset
  semantics inline.
- `README.md` operating-contract bullet retargeted.
- `TODOS.md` T005 / T011 retargeted.
- `CHANGELOG.md` v0.0.3 entry appended.

**Findings**

- `packages/shared-contracts` exposes no broker-provider union/enum
  yet, so no schema work was needed today. When that union lands
  (Phase 2 contracts work), the value is `ctrader-ftmo-trial`.
- Phase 1 (T002) work-in-progress is sitting in the working tree
  (`packages/proc-supervisor/src/`, `packages/proc-supervisor/test/`,
  `packages/shared-contracts/src/health.ts`,
  `packages/shared-contracts/src/health.spec.ts`, plus version bumps
  in three `package.json` files and a zod dep added to root). Left
  untouched per the same convention used in v0.0.2 — that bump and
  these files belong to the Phase 1 commit, not ANKA-10.

**Decisions**

- BLUEPRINT §0.1 §24.3 reworded so the FT phase requirement is
  "reset & re-arm the FTMO Free Trial slot" rather than "configure
  fresh FT credentials" — the trial is operator-resettable, so we
  reuse the same `*_env` references across phases 2 → 6.5 → FT and
  only need new creds at P1 (paid 100k 2-step).
- Root `package.json` version bump deferred to the Phase 1 commit
  rather than steal half its diff under ANKA-10. CHANGELOG calls
  this out explicitly.

**Open endings**

- ANKA-5 onboarding intake: the in-flight `ask_user_questions`
  interaction still asks IC Markets demo fields. Need to cancel +
  repost with FTMO Free Trial fields, and leave a cross-link comment
  on ANKA-5. Doing this in the same heartbeat next.
- After commit + ANKA-5 retarget, ANKA-10 is ready to move to `done`
  with a summary comment.

## 2026-04-27 18:21 Europe/Amsterdam — v0.0.2

**What was done**

- Executed ANKA-5 onboarding scaffold (BLUEPRINT §0.1).
- Rewrote `.env.example` as the canonical §17.5 + §0.1 template covering
  cTrader app creds, IC demo account, FTMO slot, OpenRouter, alerting,
  telemetry, encryption key, and operating mode.
- Wrote committed templates: `config/accounts.example.yaml` (§17.1) and
  `config/supervisor.example.yaml` (§17.2). Both use only `*_env`
  references — secrets never live in YAML.
- Wrote operator-canonical copies at `~/.config/ankit-prop/accounts.config.yaml`
  and `~/.config/ankit-prop/supervisor.config.yaml` (gitignored host scope).
- Generated a fresh `SECRETS_ENCRYPTION_KEY` via
  `crypto.randomBytes(32).toString('hex')` and seeded `./.env` with
  it; left every other secret blank for the operator to drop in.
- Verified gitignore: `.env` and host `*.config.yaml` ignored, in-repo
  `config/*.example.yaml` whitelisted (via `git check-ignore -v`).

**Findings**

- §0.1 mandates one-pass interview with the operator; the issue
  description further constrains us to never ask for secret values via
  comments. Resolved by splitting: ask non-secret config knobs through a
  single `ask_user_questions` interaction, and use it to confirm the
  operator has populated the secret slots in `./.env` directly.
- OpenRouter probe and cTrader `application_auth` flow are deferred to a
  follow-up heartbeat once the operator returns secret-populated `.env`.
  They require the actual creds and cannot be shadow-tested.

**Decisions**

- Host-scope configs (`~/.config/ankit-prop/*.config.yaml`) are
  generated as `*_env`-only references (no inlined secrets); operator
  edits `.env` to swap real values without touching YAML.
- Bumped umbrella root to `0.0.2` to mark the onboarding-scaffold
  release independently of the in-flight `proc-supervisor` /
  `shared-contracts` work-in-progress.

**Open endings**

- ANKA-5 awaits operator response on the `ask_user_questions`
  interaction. After response: run OpenRouter health probe + cTrader
  OAuth verification, mark T-task closed, return ANKA-5 to `done`.
- Existing untracked supervisor/contracts files (Phase 1 prep, T002) are
  left for that session to commit; not in scope for ANKA-5.

## 2026-04-27 18:16 Europe/Amsterdam — v0.0.1

**What was done**

- Bootstrapped the umbrella monorepo per BLUEPRINT §17 + §0.2 (ANKA-2 Phase 0).
- Wrote root config: `package.json` (Bun workspaces, pinned Biome 2.4.13 + TS 6.0.3, all required scripts), `tsconfig.json` (TS 6 strict, bundler resolution, `bun` types), `biome.json`, `bunfig.toml`, `.gitignore`, `.env.example` per §17.5.
- Created `.dev/` skeleton: `progress.md`, `journal.md`, `decisions.md`, `ideas/`, `discussion/`, `specs/`.
- Seeded `TODOS.md` and `CHANGELOG.md` at v0.0.1.
- Added placeholder package.json files for the four packages and five services from §17 so Bun workspaces resolve cleanly on first `bun install`.
- Added GitHub Actions CI gate (`.github/workflows/ci.yml`) running lint + typecheck + test on push/PR.

**Findings**

- Bun 1.3.13 is the host runtime; matches BLUEPRINT §5.2 pin.
- `https://bun.com/llms.txt` confirms native HTTP/SQLite/cron/glob/spawn/password/test/shell — no npm dependency required for those layers (§5.1).

**Decisions**

- Defer all real package code to later phases. Phase 0 only delivers the skeleton, scripts, and a green CI gate, exactly per the issue's acceptance bullets.
- Workspace placeholders use `private: true` and a no-op `start` script so the supervisor wire-up can land cleanly in Phase 1 without retro-fitting names.
- Co-locate Bun's `bun:test` smoke spec in `packages/shared-contracts/` so `bun test` has at least one assertion to run on first `bun install`.

**Adaptations**

- None. Followed the §17 layout verbatim.

**Open endings**

- Phase 1 (`@triplon/proc-supervisor`) requires the real supervisor implementation; tracked in `TODOS.md` as `T002`.
- `@triplon/config` is a private-registry dependency and is not installed yet; first phase that needs config wiring will pull it in.
