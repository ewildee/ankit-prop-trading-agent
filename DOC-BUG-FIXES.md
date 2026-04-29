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
  - `packages/market-data/` exists on disk but contains only `node_modules/` — appears to be an in-flight ANKA-69 placeholder. Either rename, populate, or remove; should not stay as a phantom.
  - `packages/triplon-config/` is a workspace package with its own `package.json` and `src/`, while §5/§17/§25 frame `@triplon/config` as an external private-registry consumer. Drift between vendored copy and external dep needs its own DBF.
  - `TODOS.md` Phase tree contains no entry for ANKA-67 / ANKA-68 / ANKA-69 historical-fixture work — Phase 0–7 layout is silent on this stream entirely.

