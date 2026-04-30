# DOC-BUG-FIXES

## DBF-001 — §11.4 / §19.2 RestrictedReply shape divergence

- **Issue:** [ANKA-80](/ANKA/issues/ANKA-80)
- **Implementing ticket:** [ANKA-75](/ANKA/issues/ANKA-75) (`svc:news` v0.1)
- **Symptom:** §11.4 declared `/calendar/restricted` and `/calendar/pre-news-2h`
  reply shape as `{ restricted: bool, reasons: string[] }`, while §19.2
  declared the same endpoints as `{ restricted: bool, reasons: { event,
  eta_seconds }[] }`. Two divergent canonical shapes for the same wire
  contract.
- **Resolution:** §19.2 wins. The richer object form is required by
  gateway rails 7 and 13 so the gateway can log/render the blocking
  event and ETA without re-querying news. §11.4 has been patched to
  reference `RestrictedReply` (canonical schema in `pkg:contracts/news`)
  and §19.2 carries an explicit pointer to the contract package.
- **Patch commit:** `docs(docs): reconcile §11.4 RestrictedReply shape with §19.2`
- **Reviewer:** BlueprintAuditor (sole reviewer per AGENTS.md doc-fix matrix).

## DBF-002 — §17 / §25 omit `pkg:market-data-twelvedata` and its checked-in fixture root

- **Issue:** [ANKA-201](/ANKA/issues/ANKA-201)
- **Implementing tickets:** [ANKA-67](/ANKA/issues/ANKA-67) (TwelveData adoption), [ANKA-68](/ANKA/issues/ANKA-68) (fetch & cache script), [ANKA-76](/ANKA/issues/ANKA-76) (live fetch)
- **Symptom:** Source-of-truth drift between BLUEPRINT and the working tree:
  - `packages/market-data-twelvedata/` is on `main` at `@ankit-prop/market-data-twelvedata@0.1.2` with 7 spec files (planner, fetcher, fixture-store, twelve-data-client, cli, rate-limiter, adversarial-windows) and a `td-fetch` Bun CLI.
  - 15 fixture files are checked-in under `data/market-data/twelvedata/v1.0.0-2026-04-28/...` (force-added past the `.gitignore` `data/` rule).
  - 4 commits already use the `pkg:market-data-twelvedata` scope tag (`96e6cfd`, `aceecfe`, `2e83033`, `99f63b1`); CHANGELOG entries name it as a new `pkg:market-data-twelvedata` package.
  - §17 packages/ listing (lines 1867–1871) names only `proc-supervisor`, `eval-harness`, `ctrader-vendor`, `shared-contracts`. `market-data-twelvedata/` is absent.
  - §17 data/ listing (lines 1887–1894) treats every entry as gitignored runtime state; the checked-in `data/market-data/twelvedata/<fixture-version>/` exception has no home in the doc.
  - §25.1 top-scopes table lists `pkg:supervisor`, `pkg:eval-harness`, `pkg:contracts`, `pkg:ctrader-vendor`. `pkg:market-data-twelvedata` is absent — so future commits have no canonical scope tag and risk inventing ad-hoc ones.
  - §25.2 sub-modules has no `#### pkg:market-data-twelvedata/...` block.
- **Resolution:** Catalog the package as a temporary, deletable library with explicit lifecycle and a distinct fixture-root carve-out under `data/`.

  **Proposed §17 patch — packages/ tree (replace lines 1867–1871):**
  ```
  ├── packages/
  │   ├── proc-supervisor/              # @triplon/proc-supervisor
  │   ├── eval-harness/                 # @ankit-prop/eval-harness  (LIBRARY)
  │   ├── ctrader-vendor/               # vendored ctrader-ts or in-house
  │   ├── shared-contracts/             # @ankit-prop/contracts (Zod schemas)
  │   └── market-data-twelvedata/       # @ankit-prop/market-data-twelvedata
  │                                     # ANKA-68 one-shot TwelveData fetcher;
  │                                     # deletable once cTrader-live history
  │                                     # subsumes the same windows
  ```

  **Proposed §17 patch — data/ tree (replace lines 1887–1894 and adjust the trailing comment):**
  ```
  └── data/                             # gitignored runtime state, except…
      ├── market-data/
      │   └── twelvedata/<fixture-version>/    # CHECKED IN (ANKA-67 / ANKA-68
      │                                        # TwelveData fixtures: bars/,
      │                                        # symbols/, manifest.json,
      │                                        # adversarial-windows.json,
      │                                        # fetch-log.jsonl). Force-added
      │                                        # past the data/ ignore rule;
      │                                        # version-pinned, immutable.
      ├── trader.db                     # decisions, trades, orders, executions, costs
      ├── audit-log/<account_id>.jsonl
      ├── trade-memory/<account_id>.jsonl
      ├── calendar.db
      ├── bars.db                       # eval-harness historical bars cache
      ├── secrets/<account_id>/refresh_token.enc
      └── state/control-state.json
  ```

  **Proposed §25.1 patch — append a new row to the top-scopes table after `pkg:ctrader-vendor`:**
  ```
  | `pkg:market-data-twelvedata` | Library (temporary, deletable) | `packages/market-data-twelvedata` | `@ankit-prop/market-data-twelvedata` | One-shot, resumable Bun fetcher for TwelveData REST historical bars (NAS100, XAUUSD; 1m/5m/15m/1h/1d). Writes versioned, checked-in fixtures under `data/market-data/twelvedata/<fixture-version>/` for `pkg:eval-harness/bar-data-cache` consumers. **Lifecycle:** delete the package, the scope tag, and the fixture tree together once `pkg:ctrader-vendor` live-history coverage subsumes the windows it fetches (parent ticket [ANKA-67](/ANKA/issues/ANKA-67)). **Owner:** FoundingEngineer; disposal trigger reviewed at every §22 phase boundary. |
  ```

  **Proposed §25.2 patch — insert a new sub-module block after `#### pkg:ctrader-vendor/...`:**
  ```
  #### `pkg:market-data-twelvedata/...`

  Lifecycle reminder: this package is explicitly temporary (see §25.1).
  When ANKA-67 disposes of the TwelveData fetch path, delete this block,
  the package, the `pkg:market-data-twelvedata` GitHub label, and the
  `data/market-data/twelvedata/` fixture tree in one commit.

  | Sub-module | Purpose |
  |------------|---------|
  | `cli` | `td-fetch plan` / `td-fetch fetch` Bun entrypoint |
  | `planner` | Window → call/credit budget; `--dry-run` first |
  | `twelve-data-client` | REST `time_series` adapter; auth, retries, rate-limit feedback |
  | `rate-limiter` | Grow-tier 55-credits-per-minute token bucket |
  | `fetcher` | Orchestrates planner + client + fixture-store; resumable; fail-closed ingestion |
  | `fixture-store` | Versioned write/read of `<fixture-version>/{bars,symbols,manifest,fetch-log}` |
  | `schema` | Zod schemas for fixture files (bar line, manifest, symbol-meta, adversarial-windows, fetch-log) |
  | `symbols` | NAS100 / XAUUSD identity capture (TD alias, exchange, calendar, DST) |
  | `timeframes` | Allowed 1m/5m/15m/1h/1d set + per-timeframe call sizing |
  | `adversarial-windows` | NFP / FOMC / ECB / market-holiday manifest builder |
  | `index` | Public re-exports for harness consumption |
  ```
- **Patch commit:** `docs(docs): apply DBF-002 — catalog pkg:market-data-twelvedata in §17 / §25`
- **Reviewer:** BlueprintAuditor (sole reviewer per AGENTS.md doc-fix matrix).
- **Out-of-scope drift surfaced incidentally** (file as separate audit follow-ups, not part of DBF-002):
  - `packages/market-data/` exists on disk but contains only `node_modules/` — appears to be an in-flight ANKA-69 placeholder. Either rename, populate, or remove; should not stay as a phantom. _Resolved under DBF-003 — package is populated and ADR-0008-bound._
  - `packages/triplon-config/` is a workspace package with its own `package.json` and `src/`, while §5/§17/§25 frame `@triplon/config` as an external private-registry consumer. Drift between vendored copy and external dep needs its own DBF. _Promoted to DBF-003._
  - `TODOS.md` Phase tree contains no entry for ANKA-67 / ANKA-68 / ANKA-69 historical-fixture work — Phase 0–7 layout is silent on this stream entirely. _Promoted to DBF-005 and closed in [ANKA-325](/ANKA/issues/ANKA-325) (TODOS.md T020 added under Phase 3)._

## DBF-003 — §5.2 / §17 / §25 omit `pkg:market-data` and `pkg:triplon-config`; `pkg:eval-harness/...` missing replay-driver block

- **Issue:** [ANKA-322](/ANKA/issues/ANKA-322) (daily blueprint & docs drift audit, 2026-04-30 deep pass — first run of ISO week 18)
- **Implementing tickets already merged:**
  [ANKA-69](/ANKA/issues/ANKA-69) (provider-agnostic `@ankit-prop/market-data` interface, ADR-0008),
  [ANKA-130](/ANKA/issues/ANKA-130) (`@triplon/config` workspace package, T015),
  [ANKA-236](/ANKA/issues/ANKA-236) / [ANKA-248](/ANKA/issues/ANKA-248) / [ANKA-266](/ANKA/issues/ANKA-266) (market-data + CachedFixtureProvider regressions),
  [ANKA-280](/ANKA/issues/ANKA-280) / [ANKA-287](/ANKA/issues/ANKA-287) (eval-harness replay driver, replay CLI, deterministic strategies, fixture baselines, fail-closed broker-spec validation).
- **Symptom:** Source-of-truth drift between BLUEPRINT and the working tree:
  - `packages/market-data/` is on `main` at `@ankit-prop/market-data` with 7 source files (`provider.ts`, `cached-fixture-provider.ts`, `fixture-schema.ts`, `types.ts`, `index.ts`, plus 2 `.spec.ts`). ADR-0008 binds the package to BLUEPRINT, but §17, §25.1, and §25.2 do not catalog it. New commits have no canonical scope tag.
  - `packages/triplon-config/` is a workspace package at `@triplon/config` with its own `package.json`, `src/`, and `CHANGELOG.md`. §5.2 still lists `@triplon/config` as `(private Triplon registry) … latest from registry`, and §25.1's `infra:config` row gives the path as parenthetical `(uses @triplon/config)`. The workspace-package shape contradicts both lines.
  - `pkg:eval-harness/...` sub-module table (§25.2 lines 2915–2927) lists `backtest`, `paper-replay`, `live-score`, `ftmo-rule-simulator`, `bar-data-cache`, `slippage-model`, `walk-forward`, `metrics`, `golden-fixtures`. The merged ANKA-280 / ANKA-287 work landed `replay-driver`, `replay-cli`, `replay-strategies`, and `baselines/` in the same package; none are in the sub-module table. Future commits to the replay surface have no canonical sub-module tag.
- **Resolution:** Catalog both packages and the new eval-harness replay surface. `pkg:triplon-config` becomes a workspace-package scope; `@triplon/config` stays the public name. `pkg:market-data` becomes a permanent Library scope (sibling to `pkg:market-data-twelvedata`'s temporary scope).

  **Proposed §5.2 patch — replace the `Config loader` row:**
  ```
  | Config loader | `@triplon/config` (workspace package, `packages/triplon-config/`; `infra:config` cross-cutting tag) | n/a |
  ```

  **Proposed §17 patch — packages/ tree (replace lines 1867–1875, keep the surrounding `├──` ordering):**
  ```
  ├── packages/
  │   ├── proc-supervisor/              # @triplon/proc-supervisor
  │   ├── triplon-config/               # @triplon/config (workspace package; loader, schema codegen, freshness checks)
  │   ├── shared-contracts/             # @ankit-prop/contracts (Zod schemas)
  │   ├── eval-harness/                 # @ankit-prop/eval-harness  (LIBRARY)
  │   ├── ctrader-vendor/               # vendored ctrader-ts or in-house
  │   ├── market-data/                  # @ankit-prop/market-data (provider-agnostic
  │   │                                 # IMarketDataProvider + CachedFixtureProvider;
  │   │                                 # ADR-0008. cTrader live history slot-in lands here.)
  │   └── market-data-twelvedata/       # @ankit-prop/market-data-twelvedata
  │                                     # ANKA-68 one-shot TwelveData fetcher;
  │                                     # deletable once cTrader-live history
  │                                     # subsumes the same windows
  ```

  **Proposed §25.1 patch — append two rows after `pkg:ctrader-vendor`, before `pkg:market-data-twelvedata`; rewrite the `infra:config` Path column:**
  ```
  | `pkg:market-data` | Library | `packages/market-data` | `@ankit-prop/market-data` | Provider-agnostic `IMarketDataProvider` (listSymbols / resolveSymbol / listAvailability / getBars / getEvents) plus `CachedFixtureProvider` over the `data/market-data/twelvedata/<fixture-version>/` fixture seam. Permanent home for sibling providers including the future `CTraderHistoryProvider` (ADR-0008 cTrader slot-in). |
  | `pkg:triplon-config` | Library (workspace) | `packages/triplon-config` | `@triplon/config` | Workspace home for the config loader, YAML schema, env-var derivation, and codegen artifacts (`infra:config` is the cross-cutting tag for the *concept*; this row is for changes to the *package source*). |
  ```
  ```
  | `infra:config` | Cross-cutting | `packages/triplon-config` (loader source) + `config/*.example.yaml` + `~/.config/<app>/*.config.yaml` (consumer paths) | — | Config loading, env-var resolution, schema emission |
  ```

  **Proposed §25.2 patch — insert a new sub-module block before `#### pkg:market-data-twelvedata/...` and append four rows to `pkg:eval-harness/...`:**
  ```
  #### `pkg:market-data/...`

  | Sub-module | Purpose |
  |------------|---------|
  | `provider` | `IMarketDataProvider` interface + canonical `Bar` / `SymbolMeta` / `CalendarEvent` types (ADR-0008) |
  | `cached-fixture-provider` | Reads `data/market-data/twelvedata/<fixture-version>/`; loader-derived `tsEnd`; broker-side specs via `instrumentSpecs` injection |
  | `fixture-schema` | Zod schemas for the on-disk fixture wire (`manifest.json`, symbol meta, JSONL bars, adversarial-windows) — duplicated v1 with `pkg:market-data-twelvedata/schema` until reconciled |
  | `types` | Public canonical record shapes shared across consumers |
  | `index` | Re-exports for harness, trader, future cTrader-history slot-in |
  ```
  ```
  | `replay-driver` | Wires an `IMarketDataProvider` into `backtest()` for deterministic eval replay; fail-closed broker-spec validation (ANKA-287) |
  | `replay-cli` | Bun CLI entrypoint for `runReplaySnapshot()` over committed baselines |
  | `replay-strategies` | Deterministic replay strategies (`NOOP_V1`, `OPEN_HOLD_CLOSE_V1`) |
  | `baselines` | Committed 3-month full-window snapshot fixtures used as regression anchors |
  ```

  **Proposed §25.2 patch — add a `pkg:triplon-config/...` block after `pkg:contracts/...`:**
  ```
  #### `pkg:triplon-config/...`

  | Sub-module | Purpose |
  |------------|---------|
  | `loader` | Bun-native YAML loading + user/project precedence (ANKA-141 / ANKA-149) |
  | `schema` | Schema definitions consumed by emitters and validators |
  | `codegen` | `bun run config:codegen` producing typed loaders for SymbolTagMap and friends |
  | `env-derivation` | Env-var name derivation from schema paths |
  | `freshness` | `--check` mode for codegen artifact drift |
  ```
- **Patch commit:** `28279b0` (`docs(docs): apply DBF-003 — catalog pkg:market-data + pkg:triplon-config + eval-harness replay surface in §5.2 / §17 / §25 (ANKA-326)`).
- **Status:** Closed under [ANKA-326](/ANKA/issues/ANKA-326).
- **Reviewer:** BlueprintAuditor (sole reviewer per AGENTS.md doc-fix matrix); post-land verification only because the patches are CEO-accepted verbatim.
- **Carries over from DBF-002 incidental drifts:** the `packages/market-data/` "phantom" note is now resolved (the package is populated and ADR-0008-bound); the `packages/triplon-config/` external-vs-vendored note is the §5.2 patch above; the TODOS.md ANKA-67 / ANKA-68 / ANKA-69 phase-tree silence remains a separate FoundingEngineer-owned task (out of scope here — see DBF-005 candidate below).

## DBF-004 — §22 phase ordering vs landed code: Phase 6 (`svc:dashboard`) shipped before Phase 4 (`svc:trader`)

- **Issue:** [ANKA-322](/ANKA/issues/ANKA-322) (daily blueprint & docs drift audit, 2026-04-30)
- **Symptom:** §22 build phases say verbatim `Phase 6 after 4.` But:
  - Phase 4 (`svc:trader`) deliverable is "End-to-end through gateway against FTMO Free Trial for 1 hour"; TODOS.md T008 is `[ ]` open. `services/trader/` directory is empty of source.
  - Phase 6 (`svc:dashboard`) deliverable is "Smoke + visual regression"; TODOS.md T010 is `[~]` in progress and T010.a is `[x]` shipped (ANKA-121, commit `1885b6c` `feat(svc:dashboard): scaffold React shell + version-matrix banner pinned to SERVICES registry`). The `services/dashboard/` shell is on `main` and version-matrix-pinned to `pkg:contracts#SERVICES`.
  - Phase 5 (`svc:news`) is also already substantially shipped (ANKA-75 closed, `services/news/` is on `main` at v0.1 with calendar-fetcher, evaluators, freshness-monitor, /health, /metrics, Treaty App). §22 says "phase 4 may overlap with phase 5 once contracts mergeable" — that line covers 4↔5 but not 4↔6.
- **Resolution (proposed — CEO judgement call):** Either (a) re-order §22 to allow `svc:dashboard` shell-and-banner work to start before Phase 4 ends because the dashboard's regression coverage of `pkg:contracts#SERVICES` is a *contract* dependency rather than a *runtime* dependency; or (b) re-classify the ANKA-121 deliverable as a Phase 4 prerequisite (operator cockpit chrome) and move the substantive views (decision feed, hard-rail logs, kill switch) to Phase 6 proper. (a) reads truer to what landed; (b) preserves the current §22 wording.

  **Proposed §22 patch (option a, preferred — replace the trailing paragraph after the table):**
  ```
  Phases 1–3 sequential; Phase 4 may overlap with Phase 5 once contracts
  mergeable. Phase 6's *shell-and-banner* scaffolding (version-matrix banner
  pinned to `pkg:contracts#SERVICES`, `/health` on the registry-canonical
  port, no live decision/control surfaces) may run in parallel with Phases
  4–5 because it depends only on the contracts package, not on running
  trader/news/gateway runtimes. Phase 6's substantive views (decision feed,
  hard-rail log viewer, controls, kill switch) MUST come after Phase 4.
  Phase 7 cannot start before live data exists.
  ```

  **Proposed §22 patch (option b, alternative — split the Phase 6 row):**
  ```
  | **6a** | `dashboard` shell + version-matrix banner | Smoke spec pins `DEFAULT_VERSION_TARGET_SPECS` to `pkg:contracts#SERVICES` | Shell renders + banner regression spec green |
  | **6** | `dashboard` substantive views (decision feed, controls, kill switch) | Smoke + visual regression | All views render against running stack |
  ```
- **Patch commit:** `60d4b55` (`docs(docs): apply DBF-004 — §22 reconcile Phase 6 dashboard scaffold landing before Phase 4 trader (option a) (ANKA-326)`). CEO chose option (a) on [ANKA-326](/ANKA/issues/ANKA-326): re-reads true to what landed, keeps the Phase 6 row monolithic, avoids retroactively reshaping the phase table around a single deliverable.
- **Status:** Closed under [ANKA-326](/ANKA/issues/ANKA-326).
- **Reviewer:** BlueprintAuditor (sole reviewer per AGENTS.md doc-fix matrix); post-land verification only because the patch is CEO-accepted verbatim.
- **Note:** This is a contradiction between BLUEPRINT and code state, not a code defect. The dashboard scaffold was approved on its merits per ANKA-121; §22 just needs to acknowledge the landing pattern.

## DBF-005 — `TODOS.md` Phase tree silent on `pkg:market-data-twelvedata` historical-fixture work (ANKA-67 / ANKA-68 / ANKA-69)

- **Issue:** [ANKA-322](/ANKA/issues/ANKA-322) (daily blueprint & docs drift audit, 2026-04-30); first surfaced as DBF-002 incidental, now broken out for separate closure.
- **Symptom:** `TODOS.md` Phase 0–7 layout has no entry that names ANKA-67 (TwelveData adoption parent), ANKA-68 (fetcher), or ANKA-69 (provider-agnostic `@ankit-prop/market-data` interface). The Cross-cutting block doesn't name them either. T019 covers the same territory by deliverable but cites only ANKA-236 / ANKA-248 / ANKA-266 / ANKA-280 — the parent tickets are invisible.
- **Owner:** FoundingEngineer (`TODOS.md` is FE-owned; this is a code/process drift, not a blueprint patch).
- **Resolution:** Add either (a) a Phase 3 sub-bullet `T020 — Historical-data fetch & provider interface (ANKA-67 / ANKA-68 / ANKA-69)` that lists the three parents and points at T019.{a,b,c} for the in-flight regressions, or (b) retag T019 to cite ANKA-67 / ANKA-68 / ANKA-69 as parents alongside the existing ANKA-236 / 248 / 266 / 280. Option (b) is the smaller diff and more honest to history; option (a) is more discoverable.
- **Status:** **CLOSED** under [ANKA-325](/ANKA/issues/ANKA-325). Applied option (a): TODOS.md Phase 3 now carries `T020 — Historical-data fetch & provider interface umbrella` naming ANKA-67 / ANKA-68 / ANKA-69 as parents and pointing at T019.{a,b,c} for in-flight regressions. The matching DBF-002 incidental bullet now annotates "Promoted to DBF-005 and closed in ANKA-325."
- **Reviewer:** BlueprintAuditor verifies the patch lands and removes the DBF-002 incidental note in the same edit.

