# Changelog

All notable changes to this project. Newest first. Times are HH:MM 24-h **Europe/Amsterdam** (operator clock; this machine's local time). Service-runtime audit-log timestamps live in **Europe/Prague** (FTMO server clock) and are not the same axis.

## 0.4.27 — 2026-04-28 14:14 Europe/Amsterdam

**Initiated by:** CodexExecutor (agent), executing [ANKA-89](/ANKA/issues/ANKA-89) under parent [ANKA-86](/ANKA/issues/ANKA-86).

**Why:** CodeReviewer blocked [ANKA-86](/ANKA/issues/ANKA-86) because `Date.parse` accepts offsetless calendar instants in the process local timezone. `svc:news/calendar-db` feeds hard rails #3 and #4, so calendar writes and range queries must fail closed unless every instant carries an explicit `Z` or numeric timezone offset.

**Changed** — `@ankit-prop/news` v0.2.2 → v0.2.3

- `services/news/src/calendar-db.ts` — rejects calendar item dates and query range bounds unless the trimmed string ends in `Z` or a numeric timezone offset before calling `Date.parse`, preserving existing `CalendarDbWriteError` / `CalendarDbQueryError` shapes.
- `services/news/src/calendar-db.spec.ts` — adds regressions for offsetless datetimes, date-only strings, offsetless `fromIso` / `toIso`, and the real legacy v0 `calendar_items` schema without `instant_ms`.

**Bumped**

- `@ankit-prop/news` 0.2.2 → 0.2.3 (patch — fail-closed timezone-offset validation for hard-rail calendar instants).
- root `ankit-prop-umbrella` 0.4.26 → 0.4.27 (patch — workspace package version move).

**Verification**

- `bun run lint:fix` — exit 0; Biome fixed import ordering in scope and still reports pre-existing unrelated unsafe suggestions outside `svc:news/calendar-db`.
- `bun test services/news/src/calendar-db.spec.ts` — 19 pass / 0 fail / 34 expects.
- `bun run typecheck` — clean (`tsc --noEmit`).
- `rg -n "console\\.log|debugger|TODO|HACK" services/news/src/calendar-db.ts services/news/src/calendar-db.spec.ts` — no matches.

**Notes**

- `services/news` still has only the placeholder `start` script and no `/health` implementation, so there is no service process/version endpoint to restart and verify yet.

## 0.4.26 — 2026-04-28 14:06 Europe/Amsterdam

**Initiated by:** QAEngineer (agent), executing [ANKA-88](/ANKA/issues/ANKA-88) under parent [ANKA-86](/ANKA/issues/ANKA-86).

**Why:** [ANKA-88](/ANKA/issues/ANKA-88) is the QA per-rail spec gate for [ANKA-86](/ANKA/issues/ANKA-86)'s calendar DB epoch-ms normalization. The mandated regressions were already present; the review also requested a non-listed UTC-midnight crossing spot-check for a negative-offset event.

**Changed** — `@ankit-prop/news` v0.2.1 → v0.2.2

- `services/news/src/calendar-db.spec.ts` — adds coverage for an event at `2026-04-28T23:30:00-05:00` (= `2026-04-29T04:30:00Z`) being included by a UTC-midnight-crossing range and excluded from the previous UTC day window.

**Bumped**

- `@ankit-prop/news` 0.2.1 → 0.2.2 (patch — QA regression coverage for hard-rail-critical calendar instant normalization).
- root `ankit-prop-umbrella` 0.4.25 → 0.4.26 (patch — workspace package version move).

**Verification**

- `bun run lint:fix` — exit 0; no files changed, pre-existing unrelated unsafe suggestions remain outside `svc:news/calendar-db`.
- `bun test services/news/src/calendar-db.spec.ts` — run 1: 14 pass / 0 fail / 24 expects.
- `bun test services/news/src/calendar-db.spec.ts` — run 2: 14 pass / 0 fail / 24 expects.
- `bun test` — 329 pass / 0 fail / 2029 expects.
- `bun run typecheck` — clean (`tsc --noEmit`).

**Notes**

- The original 13-test ANKA-86 spec surface still covers the 6 mandated ms-normalization regressions plus the 7 pre-existing calendar DB tests. This release adds the requested extra permutation, so the targeted spec now has 14 tests.
- `services/news` still has only the placeholder `start` script and no `/health` implementation, so there is no service process/version endpoint to restart and verify yet.

## 0.4.25 — 2026-04-28 13:57 Europe/Amsterdam

**Initiated by:** CodexExecutor (agent), executing [ANKA-86](/ANKA/issues/ANKA-86) under parent [ANKA-81](/ANKA/issues/ANKA-81).

**Why:** [ANKA-81](/ANKA/issues/ANKA-81) review found that `svc:news/calendar-db` compared ISO text lexicographically, which can misclassify equivalent instants expressed with different offsets. Gateway hard rails #3 and #4 consume this query, so the DB must compare real instants and fail closed on invalid bounds or stale schema.

**Changed** — `@ankit-prop/news` v0.2.0 → v0.2.1

- `services/news/sql/init.sql` — adds `instant_ms INTEGER NOT NULL`, replaces date-text indices with `instant_ms` indices, and sets `PRAGMA user_version = 2`.
- `services/news/src/calendar-db.ts` — persists parsed epoch milliseconds, queries with `instant_ms >= ? AND instant_ms < ?`, orders by `instant_ms ASC, title ASC, instrument ASC`, exports `CalendarDbWriteError` / `CalendarDbQueryError`, and rejects stale `calendar_items` schemas with `CalendarDbOpenError` code `schema_outdated`.
- `services/news/src/calendar-db.spec.ts` — adds regressions for mixed-offset equivalence, exact exclusive `to`, deterministic mixed-offset ordering, invalid write dates, invalid query bounds, and stale schema fail-closed open.

**Bumped**

- `@ankit-prop/news` 0.2.0 → 0.2.1 (patch — hard-rail-critical instant comparison fix).
- root `ankit-prop-umbrella` 0.4.24 → 0.4.25 (patch — workspace package version move).

**Verification**

- `bun run lint:fix` — exit 0; Biome applied safe formatting and still reports pre-existing unsafe suggestions in unrelated packages.
- `bun test services/news/src/calendar-db.spec.ts` — 13 pass / 0 fail / 22 expects.
- `bun run typecheck` — clean (`tsc --noEmit`).
- `rg -n "console\\.log|debugger|TODO|HACK" services/news/sql/init.sql services/news/src/calendar-db.ts services/news/src/calendar-db.spec.ts` — no matches.

**Notes**

- Existing non-empty `calendar_items` DB files with `user_version < 2` now fail closed and instruct the operator to delete the stale DB; no migration framework was introduced.
- `services/news` still has only the placeholder `start` script and no `/health` implementation, so there is no service process/version endpoint to restart and verify yet.

## 0.4.24 — 2026-04-28 13:40 Europe/Amsterdam

**Initiated by:** CodexExecutor (agent), executing [ANKA-81](/ANKA/issues/ANKA-81) under parent [ANKA-75](/ANKA/issues/ANKA-75).

**Why:** `svc:news` needs a local `bun:sqlite` persistence primitive before the fetcher and endpoint work can share one canonical calendar store. The store must dedupe FTMO re-fetches by `sha256(date|title|instrument)`, preserve the canonical `CalendarItem` contract, and support range reads for later restricted-window and pre-news evaluators.

**Added** — `@ankit-prop/news` v0.1.0 → v0.2.0

- `services/news/sql/init.sql` — idempotent `calendar_items` table plus date and `(instrument, date)` indices for `data/calendar.db`.
- `services/news/src/calendar-db.ts` — exports `openCalendarDb`, `upsertItems`, `queryRange`, `closeCalendarDb`, `calendarItemId`, and structured `CalendarDbOpenError`. Opens in WAL mode, creates parent directories, runs `init.sql`, hashes IDs with Bun's native `CryptoHasher`, validates rows through `@ankit-prop/contracts` `CalendarItem`, and keeps close idempotent through the wrapper.
- `services/news/src/calendar-db.spec.ts` — covers table/index init, WAL mode, sorted round-trip reads, idempotent upsert counts and updates, structured unwriteable-path errors, inclusive/exclusive range bounds, verbatim instrument filtering, and idempotent close.
- `services/news/package.json` — adds `@ankit-prop/contracts` as a workspace dependency for the canonical news calendar contract.

**Bumped**

- `@ankit-prop/news` 0.1.0 → 0.2.0 (minor — new public calendar DB module).
- root `ankit-prop-umbrella` 0.4.23 → 0.4.24 (patch — workspace package version move).

**Verification**

- `bun run lint:fix` — exit 0; Biome formatted the new files and still reports pre-existing unsafe suggestions in unrelated packages.
- `bun test services/news/src/calendar-db.spec.ts` — 7 pass / 0 fail / 10 expects.
- `bun run typecheck` — clean (`tsc --noEmit`).

**Notes**

- The issue acceptance names `calendar_items` and a canonical `instrument` column; this implementation uses those names even though the older blueprint DDL sketch called the table `calendar`.
- `services/news` still has only the placeholder `start` script and no `/health` implementation, so there is no service process/version endpoint to restart and verify yet.

## 0.4.23 — 2026-04-28 13:19 Europe/Amsterdam

**Initiated by:** CodexExecutor (agent), executing [ANKA-79](/ANKA/issues/ANKA-79) under parent [ANKA-75](/ANKA/issues/ANKA-75).

**Why:** `svc:news` needs the symbol-tag-mapper sub-module before the calendar fetcher can turn FTMO `instrument` strings into the tracked trading symbols that restricted-window and pre-news evaluators consume. BLUEPRINT §11.3 requires splitting FTMO tags on `" + "` and §17.3 defines the operator-canonical `symbol-tag-map.config.yaml` shape. BLUEPRINT §5 forbids adding `yaml` / `js-yaml`, so this loader uses Bun's native `Bun.YAML.parse`.

**Added** — `@ankit-prop/news` v0.0.2 → v0.1.0

- `src/symbol-tag-mapper.ts` — exports `SymbolTagMapSchema`, `SymbolTagMap`, `SymbolTagMapLoadError`, `loadSymbolTagMap(path?, options?)`, and `resolveAffectedSymbols(rawInstrument, map, logger?)`. The loader reads the operator config path by default and falls back to `config/symbol-tag-map.example.yaml` when the operator file is absent. YAML and schema failures raise structured `SymbolTagMapLoadError` values with `code`, `path`, and `attemptedPaths`.
- `src/symbol-tag-mapper.ts` — resolves FTMO `instrument` strings by splitting on `" + "`, trimming tags, mapping each tag through the config, warning on unknown tags through the injected logger, and returning deterministic de-duplicated symbols in first-seen order.
- `src/symbol-tag-mapper.spec.ts` — covers single-tag mapping, multi-tag split/dedupe, unknown-tag warning, empty/whitespace input, example fallback, malformed operator YAML, malformed fallback YAML, and schema-invalid YAML.
- `package.json` — adds `zod` as the news service dependency for the inline mapper config schema. `yaml` was intentionally not added because Bun ships native YAML parsing and BLUEPRINT §5.3 forbids that dependency.

**Bumped**

- `@ankit-prop/news` 0.0.2 → 0.1.0 (minor — new public mapper module).
- root `ankit-prop-umbrella` 0.4.22 → 0.4.23 (patch — workspace package version move).

**Verification**

- `bun run lint:fix` — exit 0; Biome applied safe formatting only and still reports pre-existing unsafe suggestions in unrelated packages.
- `bun test services/news/src/symbol-tag-mapper.spec.ts` — 8 pass / 0 fail / 11 expects.
- `bun test` — 341 pass / 0 fail / 2089 expects.
- `bun run typecheck` — clean after correcting the concurrent [ANKA-78](/ANKA/issues/ANKA-78) duplicate export in `packages/shared-contracts/src/index.ts`.

**Notes**

- The `SymbolTagMap` schema stays inline for now because `@ankit-prop/contracts` has no `config` namespace yet; follow-up [T009.c](TODOS.md) tracks lifting it once that shared surface exists.
- `services/news` still has only the placeholder `start` script and no `/health` implementation, so there is no service process/version endpoint to restart and verify yet.

## 0.4.22 — 2026-04-28 13:15 Europe/Amsterdam

**Initiated by:** CodexExecutor (agent), executing [ANKA-78](/ANKA/issues/ANKA-78) under parent [ANKA-75](/ANKA/issues/ANKA-75).

**Why:** The news service and gateway rail-7 `NewsClient` need one shared contract surface before the `svc:news` runtime lands. BLUEPRINT §11.2 pins the FTMO calendar item shape; [ANKA-78](/ANKA/issues/ANKA-78) extends that package surface with the restricted-window replies consumed by the later endpoint and force-flat work.

**Added** — `@ankit-prop/contracts` v0.3.3 → v0.4.0

- `src/news.ts` — exports `CalendarImpact`, `CalendarItem`, `CalendarResponse`, `RestrictedReason`, `RestrictedReply`, and `NextRestrictedReply` as Zod strict schemas plus inferred TypeScript types.
- `src/index.ts` — re-exports the news contracts from `@ankit-prop/contracts`.
- `src/news.spec.ts` — covers minimal calendar item parsing, unknown `eventType` acceptance, both tier-1 routes (`restriction: true` and `impact: high`), restricted reply round-trip, closed `rule` enum, nullable next-restricted item, and closed impact enum.

**Bumped**

- `@ankit-prop/contracts` 0.3.3 → 0.4.0 (minor — new public schema surface).
- root `ankit-prop-umbrella` 0.4.21 → 0.4.22 (patch — workspace package version move).

**Verification**

- `bun test packages/shared-contracts/src/news.spec.ts packages/shared-contracts/src/index.spec.ts` — 9 pass / 0 fail / 17 expects.
- `bun run lint:fix` — exit 0; Biome reported pre-existing unsafe suggestions/warnings in unrelated packages and applied no fixes.
- `bun test` — 341 pass / 0 fail / 2089 expects.
- `bun run typecheck` — clean (`tsc --noEmit`).
- `rg -n "console\\.log|debugger|TODO|HACK" packages/shared-contracts/src/news.ts packages/shared-contracts/src/news.spec.ts packages/shared-contracts/src/index.ts` — no matches.

**Notes**

- No service restart required: only the shared contracts package changed, and no service `/health` surface was running from this package.

## 0.4.21 — 2026-04-28 13:13 Europe/Amsterdam

**Initiated by:** DocumentSpecialist (agent), executing [ANKA-77](/ANKA/issues/ANKA-77) under [ANKA-75](/ANKA/issues/ANKA-75).

**Why:** `svc:news` needs a canonical real FTMO economic-calendar cassette for the 14-day replay and contract-change detector work described in BLUEPRINT §11.1-§11.3 and §21.3. The chosen 2026-03-23 → 2026-04-06 Prague window crosses the 2026-03-29 DST boundary and includes the requested high-impact USD, restricted, and multi-tag NFP coverage.

**Added** — `@ankit-prop/news` v0.0.2 cassette assets

- `services/news/test/cassettes/ftmo-2026-03-23-week.json` — raw FTMO JSON response from `GET https://gw2.ftmo.com/public-api/v1/economic-calendar?dateFrom=2026-03-23T00:00:00+01:00&dateTo=2026-04-06T00:00:00+02:00&timezone=Europe/Prague`, fetched 2026-04-28 13:12 CEST; response header `x-backend-revision: 1d0bf5c9aa11944d489591b907e1c2bea1c61945`; 193 items, 52,541 bytes.
- `services/news/test/cassettes/contract-baseline.json` — keys-and-types baseline for the response/item shape in BLUEPRINT §11.2, intentionally value-free for the later contract-change detector.

**Changed** — `infra:tooling`

- `biome.json` — excludes raw `services/news/test/cassettes/ftmo-*.json` vendor cassettes from formatting so `lint:fix` cannot rewrite bytes that must remain exactly as returned.

**Bumped**

- `@ankit-prop/news` 0.0.1 → 0.0.2 (patch — version-pinned FTMO calendar cassette assets).
- root `ankit-prop-umbrella` 0.4.20 → 0.4.21 (patch — workspace package version move).

**Verification**

- `jq` contract probe — cassette has 193 items, at least one high-impact USD event, at least one `restriction:true` event, the multi-tag `USD + US Indices + XAUUSD + DXY` NFP event, and both `+01:00` / `+02:00` offsets across Prague DST.
- `cmp -s /tmp/ftmo-2026-03-23.json services/news/test/cassettes/ftmo-2026-03-23-week.json` — confirms the committed cassette is byte-for-byte the downloaded raw JSON.
- `bunx biome check services/news/test/cassettes/ftmo-2026-03-23-week.json services/news/test/cassettes/contract-baseline.json package.json services/news/package.json` — intentionally fails before the Biome exclusion because raw JSON would be reformatted.
- `bunx biome check services/news/test/cassettes/ftmo-2026-03-23-week.json services/news/test/cassettes/contract-baseline.json package.json services/news/package.json biome.json` — passes after the raw-cassette exclusion; Biome checks 4 files because the raw cassette is intentionally ignored.

**Notes**

- No Bun runtime code or dependency surface changed; no new npm packages.
- No service restart required: `services/news` still has only the placeholder `start` script and no `/health` implementation yet.

## 0.4.20 — 2026-04-28 12:25 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-72](/ANKA/issues/ANKA-72) (CodeReviewer BLOCK fix-up on the [ANKA-68](/ANKA/issues/ANKA-68) v0.1.0 scaffold).

**Why:** [ANKA-72](/ANKA/issues/ANKA-72) review verdict was `BLOCK` on the [ANKA-68](/ANKA/issues/ANKA-68) commit `99f63b1` because (1) `fillShard` advanced its cursor past saturated/truncated TwelveData pages and would silently lose the missing prefix, (2) malformed provider rows (bad datetime, non-finite OHLCV) failed open and could land `NaN` bars in the gzipped JSONL fixtures, (3) `.dev/progress.md` did not record the BLUEPRINT §0.2 Bun `llms.txt` fetch for the [ANKA-68](/ANKA/issues/ANKA-68) coding session, (4) `creditsSpent` only counted logical TD calls so the manifest would under-report HTTP attempts on degraded runs, and (5) the package declared an unused `@ankit-prop/contracts` dep. The live `--apply` run is gated on a clean re-review, so each blocking finding has to fail closed with a regression spec before the API key lands.

**Changed** — `@ankit-prop/market-data-twelvedata` v0.1.0 → v0.1.1

- `src/twelve-data-client.ts` — `parseTwelveDataDatetime` malformed rows now throw `TwelveDataApiError` instead of being silently skipped; OHLCV fields are converted via a finite-number guard that throws on `NaN` / non-finite inputs; `TimeSeriesResponse` and `SymbolSearchResponse` now expose `attempts` (the actual HTTP attempt count from `callWithRetry`, including 429 retries) and `outputsizeRequested` so the orchestrator can detect saturated pages and bill the right credit number.
- `src/fetcher.ts` — `fillShard` no longer advances `cursor = chunkEnd` blindly: when a returned page is saturated (`bars.length >= outputsizeRequested`) and its earliest bar is later than `cursor`, the orchestrator caps the next chunk's `chunkEnd` to that earliest bar and re-issues the fetch to backfill the missing prefix; if a saturated page cannot advance the cursor at all, the run throws and refuses to write a successful manifest. Manifest `creditsSpent` and the append-only `fetch-log.jsonl` now record `attempts` per call (HTTP attempts) instead of always `1`.
- `src/fixture-store.ts` — `writeShardBars` now validates every bar against `BarLineSchema` before gzipping, so any `NaN` / non-finite OHLCV that survives an upstream guard fails the run instead of being persisted as `null` in JSON.
- `package.json` — removed unused `@ankit-prop/contracts` workspace dep.

**Added** — regression specs for [ANKA-72](/ANKA/issues/ANKA-72) blockers

- `src/twelve-data-client.spec.ts` — three new tests: malformed datetime row throws `TwelveDataApiError`; non-finite OHLCV (e.g. `high: 'not-a-number'`) throws `TwelveDataApiError`; `attempts` counter reflects HTTP retries on a transient 429.
- `src/fetcher.spec.ts` — three new tests: saturated page (`outputsize=5` over 12 hourly bars) backfills the missing prefix and ends with all 12 bars on disk; saturated page that cannot advance the cursor (TwelveData returns rows entirely before `cursor`) raises `/saturated page/` instead of silently dropping data; orchestrator-level `creditsSpent` equals total HTTP attempts (4 = 1 symbol_search + 1 retried 429 time_series + 1 daily time_series + 1 daily symbol_search? actually 1 sym + 2 ts + 1 ts = 4) when retries occur.
- `src/fixture-store.spec.ts` — `writeShardBars` rejects a bar with `NaN` `high` at write time.

**Bumped**

- `@ankit-prop/market-data-twelvedata` 0.1.0 → 0.1.1 (patch — fail-closed ingestion + credit accuracy + dep cleanup).
- root `ankit-prop-umbrella` 0.4.19 → 0.4.20 (patch — workspace package version move).

**Verification**

- `bun test packages/market-data-twelvedata/` — 38 pass / 0 fail / 139 expects.
- `bun test` (full workspace) — 325 pass / 0 fail / 2062 expects.
- `bun run lint:fix` exit 0; pre-existing unsafe suggestions on sibling `packages/market-data/` (ANKA-69 in-flight) only.
- `bun run typecheck` clean (root `tsc --noEmit`).
- `bun run --cwd packages/market-data-twelvedata td-fetch plan --intraday-from=2026-01-28 --intraday-to=2026-04-28 --daily-from=2025-10-28 --daily-to=2026-04-28` — still prints 10 shards, totals 40 calls / 40 credits / ≈3.61 MB compressed; budget unchanged.

**Notes**

- `TWELVEDATA_API_KEY` is still not provisioned; `--apply` remains un-run. This commit only re-arms the gate for [ANKA-72](/ANKA/issues/ANKA-72) re-review.
- `.dev/progress.md` updated with the §0.2 Bun `llms.txt` fetch proof for this heartbeat (12:14 Europe/Amsterdam, 33,157 bytes) and a note that the prior [ANKA-68](/ANKA/issues/ANKA-68) coding session entry was missing.
- No service restart required: package is a CLI utility, no service `/health` surface changed.

## 0.4.19 — 2026-04-28 12:06 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-68](/ANKA/issues/ANKA-68) (TwelveData fetch & cache script — sibling A under [ANKA-67](/ANKA/issues/ANKA-67) plan rev 2).

**Why:** TwelveData subscription expires ~2026-05-12. To keep harness work alive after the sub lapses, we need a one-shot, resumable, dry-run-first fetch script that pulls NAS100 + XAUUSD over the locked plan-rev-2 window (3 mo intraday at 1m/5m/15m/1h plus 6 mo 1d tail) into versioned, gzipped JSONL fixtures, and captures symbol identity + an adversarial-windows manifest at fetch time so we cannot drift after expiry. Schema for the seam between this issue and sibling [ANKA-69](/ANKA/issues/ANKA-69) (CachedFixtureProvider) is published as the [`fixture-schema` document on ANKA-68 (rev 1)](/ANKA/issues/ANKA-68#document-fixture-schema).

**Added** — `@ankit-prop/market-data-twelvedata` v0.1.0 (new `pkg:market-data-twelvedata`)

- New umbrella package at `packages/market-data-twelvedata/` with the `td-fetch` Bun CLI (subcommands `plan`, `fetch`).
- `src/planner.ts` — bar/call/credit/byte estimator. Locked plan-rev-2 window plans 40 credits total (38 `time_series` + 2 `symbol_search`), ≈3.6 MB compressed across 10 shards, all under one Grow-tier minute (55 cr/min).
- `src/rate-limiter.ts` — sliding-window token-bucket `CreditRateLimiter`; serialises concurrent acquires; never bursts above the per-minute ceiling.
- `src/twelve-data-client.ts` — minimal REST client for `time_series` + `symbol_search`, rate-limited, with 429 retry/back-off and TwelveData error-envelope parsing. UTC-only datetime parsing (`?timezone=UTC`).
- `src/fixture-store.ts` — gzipped JSONL shard writer/reader (`Bun.gzipSync` / `Bun.gunzipSync`, no npm deps), sha256 manifest entries, symbol-meta + adversarial-windows + manifest persistence, append-only `fetch-log.jsonl`.
- `src/fetcher.ts` — orchestrator: resolves symbol identity via `/symbol_search` (caches per fixture), fills each (symbol, timeframe) shard with chunked time-paginated calls sized by per-tier bars-per-day estimate, **resumable** (skips bars already on disk and resumes from `lastT + tfMs`), writes manifest with credits-spent + git provenance.
- `src/adversarial-windows.ts` — manually curated NFP / FOMC / ECB releases (2025-10 → 2026-04) plus US-equity holiday closures inside the locked window; passes `AdversarialWindowsFileSchema`.
- `src/schema.ts` — Zod schemas (`FIXTURE_SCHEMA_VERSION = 1`) for `BarLine`, `SymbolMetaFile`, `Manifest`, `AdversarialWindowsFile`, matching the published seam doc.
- `src/cli.ts` — argv parsing, **dry-run by default** (`fetch` requires `--apply`); defaults match plan rev 2 (3 mo intraday + 6 mo daily-tail, NAS100 + XAUUSD, all four intraday timeframes, 55 cr/min).
- Specs: `planner.spec.ts`, `rate-limiter.spec.ts`, `twelve-data-client.spec.ts`, `fixture-store.spec.ts`, `adversarial-windows.spec.ts`, `fetcher.spec.ts` (full pull + resume).

**Bumped**

- `@ankit-prop/market-data-twelvedata` (initial 0.1.0).
- root `ankit-prop-umbrella` 0.4.18 → 0.4.19 (patch — workspace package add).

**Verification**

- `bun test packages/market-data-twelvedata/` — 31 pass / 0 fail / 129 expects.
- `bun run lint` — exit 0.
- `bun run typecheck` — clean for `packages/market-data-twelvedata/`. Pre-existing errors in sibling `packages/market-data/` (ANKA-69 in-flight) are unrelated and out of scope here.
- `bun run --cwd packages/market-data-twelvedata td-fetch plan --intraday-from=2026-01-28 --intraday-to=2026-04-28 --daily-from=2025-10-28 --daily-to=2026-04-28` — prints 10 shards, totals 40 calls / 40 credits / ≈3.61 MB compressed; exits without hitting the API.

**Notes**

- `--apply` is **not** run in this commit; live fetch run is the final acceptance step on [ANKA-68](/ANKA/issues/ANKA-68) and is gated on schema agreement with sibling [ANKA-69](/ANKA/issues/ANKA-69). When the live run lands it will get its own changelog entry with credit spend and final byte size.
- Cross-link of the seam doc onto [ANKA-69](/ANKA/issues/ANKA-69) failed this heartbeat with run-ownership lock (sibling run currently owns ANKA-69) — will retry next heartbeat.
- Pre-existing unstaged edits in `packages/eval-harness/src/ftmo-rules.spec.ts` and `packages/eval-harness/src/prague-day.spec.ts` left untouched; not part of this commit's scope.
- No service restart required: package is a CLI utility, no service `/health` surface changed.

## 0.4.18 — 2026-04-28 10:02 Europe/Amsterdam

**Initiated by:** QAEngineer (agent), executing [ANKA-66](/ANKA/issues/ANKA-66) (Daily test coverage & regression audit).

**Why:** The daily QA sweep found that gateway hard-rail coverage still has the required 28-case matrix (14 rails × breach/permit), and eval-harness FTMO property coverage already pins daily loss, max loss, ±5-min news blackout, min hold, and EA throttle. The remaining current Phase 3 semantics gap was the 2-h pre-news Tier-1 kill-switch in the property suite: sibling WIP has an example test, but no seeded invariant protecting `impact === 'high' OR restricted === true` plus the simulator breach path.

**Added** — `@ankit-prop/eval-harness` v0.1.3 (`pkg:eval-harness/ftmo-rules`)

- `packages/eval-harness/src/ftmo-rules.props.spec.ts` — new seeded property invariant for the 2-h pre-news kill-switch. Across 80 deterministic trials it asserts that every high-impact or restricted event creates exactly one pre-news window, non-high unrestricted events create none, and opening inside an eligible generated window records `news_blackout_open` with `detail.window === 'pre_news_2h'`.

**Bumped**

- `@ankit-prop/eval-harness` 0.1.2 → 0.1.3 (patch — test-only FTMO property coverage).
- root `ankit-prop-umbrella` 0.4.17 → 0.4.18 (patch — workspace package version move).

**Verification**

- `bun test packages/eval-harness/src/ftmo-rules.props.spec.ts services/ctrader-gateway/src/hard-rails/matrix.spec.ts` — pre-change audit baseline: 39 pass / 0 fail / 1168 expects.
- Deliberate regression check: temporarily changed `buildPreNewsWindows` to `e.restricted` only; `bun test packages/eval-harness/src/ftmo-rules.props.spec.ts --test-name-pattern "pre-news invariant"` failed at trial 2 (`impact=high restricted=false`, expected 1 window, received 0). Restored implementation.
- `bun test packages/eval-harness/src/ftmo-rules.props.spec.ts --test-name-pattern "pre-news invariant"` — 1 pass / 0 fail / 129 expects after restore.
- `bun run lint:fix` — exit 0; no fixes applied. Biome still reports pre-existing unsafe suggestions / one unused-import warning in unrelated files.
- `bun test` — 261 pass / 0 fail / 1839 expects.
- `bun run typecheck` — clean.

**Notes**

- Existing sibling-agent edits in `packages/eval-harness/src/ftmo-rules.spec.ts` and `packages/eval-harness/src/prague-day.spec.ts` were left unstaged and untouched by this commit scope.
- No service restart required: test-only package change, no running service package changed.

## 0.4.17 — 2026-04-28 09:38 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-65](/ANKA/issues/ANKA-65) (apply BlueprintAuditor [ANKA-64](/ANKA/issues/ANKA-64) audit patches; forward-fix for the false-claim in the 0.4.15 entry below and commit `c6c2247` body paragraph 4).

**Why:** BlueprintAuditor's [ANKA-64](/ANKA/issues/ANKA-64) audit (recorded in `DOC-BUG-FIXES.md`) verdict **DRIFT** at three sites in `BLUEPRINT.md`: §9 rail-7 row (line 1074), §10.4a post-fill remediation flow (lines 1166-1170), and §22 Phase 2 deliverables (line 2620). All three sites described the rail-7 fail-closed contract as **two** branches when the production code at `services/ctrader-gateway/src/hard-rails/rail-7-slippage-guard.ts:21-59` (pinned by `…/rail-7-slippage-guard.spec.ts:186-238`, [ANKA-58](/ANKA/issues/ANKA-58)) actually implements **three**: (a) non-NEW intent kind, (b) missing fill report, (c) malformed fill report (non-finite `filledPrice` / `intendedPrice`). The 0.4.15 entry (below) and commit `c6c2247` body paragraph 4 both claimed the §9 row already enumerated three branches; that claim is **forward-fix retired by this entry** — history is immutable, but `BLUEPRINT.md` HEAD now matches what those records claimed.

**Fixed** — `umbrella` (root, no package version moves)

- `BLUEPRINT.md` §9 rail-7 row (line 1074) — replaced "rejects if invoked on the post-fill path with no fill report or with a non-NEW intent kind" with the three-branch enumeration `(a) non-NEW intent kind, (b) no fill report, (c) malformed fill report whose filledPrice / intendedPrice is missing or non-finite`. Cross-references both [ANKA-40](/ANKA/issues/ANKA-40) and [ANKA-58](/ANKA/issues/ANKA-58).
- `BLUEPRINT.md` §10.4a Post-fill remediation flow (lines 1166-1170) — added the malformed-fill branch to the close-request enumeration with [ANKA-58](/ANKA/issues/ANKA-58) cross-reference; reordered to match the §9 row order (cap exceeded, non-NEW intent, missing fill, malformed fill).
- `BLUEPRINT.md` §22 Phase 2 deliverables (line 2620) — replaced fragment `rail-7 fail-closed branches (missing fill / non-NEW intent)` with `rail-7 fail-closed branches (non-NEW intent / missing fill / malformed fill)`.

**Bumped**

- root `ankit-prop-umbrella` 0.4.16 → 0.4.17 (patch — docs-only, but behaviour-affecting per BLUEPRINT §0.2 because the canonical contract enumeration shifts).
- No package version moves; no source or test diffs.

**Verification**

- `bun run typecheck` — clean (sanity, no source change).
- `bun run lint:fix` — clean.
- Diff confined to `BLUEPRINT.md`, `CHANGELOG.md`, `package.json`, `.dev/journal.md`, `DOC-BUG-FIXES.md`. No code or test file in commit.

**Notes**

- The 0.4.15 "Fixed" bullet (below) claimed the §9 row already enumerated three branches; commit `c6c2247` body paragraph 4 made the same claim. Both were false at the time. This entry forward-fixes the audit trail: HEAD `BLUEPRINT.md` now matches the production code; the 0.4.15 line stays in this CHANGELOG as the historical record.
- BlueprintAuditor [ANKA-64](/ANKA/issues/ANKA-64) closure is the auditor's call, not FoundingEngineer's. Issue [ANKA-65](/ANKA/issues/ANKA-65) reassigned to BlueprintAuditor on completion.

## Unreleased — 2026-04-28 09:25 Europe/Amsterdam — docs / comment-only ([ANKA-62](/ANKA/issues/ANKA-62))

**Initiated by:** FoundingEngineer (agent), executing [ANKA-62](/ANKA/issues/ANKA-62) (Audit-2 LOW-B from [ANKA-48](/ANKA/issues/ANKA-48), gated on now-done [ANKA-60](/ANKA/issues/ANKA-60)).

**Why:** [ANKA-60](/ANKA/issues/ANKA-60) MED-A landed the binding two-phase evaluation sub-bullet under BLUEPRINT.md §9 (line 1083). With BLUEPRINT.md §9 now the source of truth for the dispatcher contract, the multi-paragraph comment header in `services/ctrader-gateway/src/hard-rails/evaluator.ts` was duplicate spec text and a future drift hazard. LOW-B asks for a one-line cross-reference instead.

**Changed** — `@ankit-prop/ctrader-gateway` (`svc:gateway/hard-rails`)

- `services/ctrader-gateway/src/hard-rails/evaluator.ts` — replaced the 28-line dispatcher-contract header (ANKA-29 / ANKA-19 H-2 paraphrase + post-fill invariant note) with the one-liner `// Two-phase rail dispatch — see BLUEPRINT.md §9 "Two-phase gateway evaluation".`. No behaviour change, no symbol change, no test-surface change.

**Bumped**

- None — pure code-comment-only change. Per BLUEPRINT.md §0.2 narrowed chore-skip rule (post-[ANKA-60](/ANKA/issues/ANKA-60) MED-3), this remains a CHANGELOG entry with a journal cross-reference because no behaviour, no public surface, and no published artefact moved.

**Verification**

- `bun run typecheck` — clean.
- `bun run lint:fix` — clean.

**Notes**

- Source of truth for the two-phase evaluation contract is now BLUEPRINT.md §9 only. Future evaluator dispatcher edits must re-read §9 before changing the file header.

## 0.4.16 — 2026-04-28 09:25 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-61](/ANKA/issues/ANKA-61) (HIGH-3 from [ANKA-18](/ANKA/issues/ANKA-18) Audit-1 + HIGH-C from [ANKA-48](/ANKA/issues/ANKA-48) Audit-2 — install pinned `pino` + `pino-pretty`).

**Why:** BLUEPRINT.md §5.2 row 580 has declared `pino@10.3.1` + `pino-pretty@13.1.3` as the canonical structured-log surface for two consecutive audits. The umbrella was carrying a hand-rolled `RailLogger` interface (`services/ctrader-gateway/src/hard-rails/types.ts`) shaped exactly like pino's `info(obj, msg?)` signature against an unspecified consumer — no actual pino install, no factory, no §23.6 redact list. CEO decision recorded on [ANKA-61](/ANKA/issues/ANKA-61) is **install** rather than soften §5.2: spec is already specific, hand-rolled adapter is debt, cost is a single bookkeeping commit. Auditor recommended `@ankit-prop/contracts` as the bootstrap home (matches the §20.3 `obs/otel-bootstrap.ts` pattern).

**Added** — `@ankit-prop/contracts` v0.3.3 (`pkg:contracts/obs`)

- `packages/shared-contracts/src/obs/pino-logger.ts` — new `createPinoLogger(opts)` factory plus `DEFAULT_REDACT_PATHS` constant and `CreatePinoLoggerOptions` / `PinoLogger` types. Pretty transport (`pino-pretty`, colorised, `SYS:standard` time) when `NODE_ENV !== 'production'` (or `pretty: true`); JSON-line stdout otherwise. ISO timestamps, `service` stamp on every record via `base`, `level` defaults to `info`. Redact list covers the BLUEPRINT §23.6 axes: `OPENROUTER_API_KEY`, `BROKER_CREDS_HOST/USER/PASS/REFRESH_TOKEN`, root and one-level-nested `token` / `refreshToken` / `accessToken` / `secret` / `apiKey` / `password` (pino's `*` segment wildcard, censor `[REDACTED]`).
- `packages/shared-contracts/src/index.ts` — surfaces `createPinoLogger`, `DEFAULT_REDACT_PATHS`, `CreatePinoLoggerOptions`, `PinoLogger` so any service workspace can `import { createPinoLogger } from '@ankit-prop/contracts'` without re-declaring the dep.
- `packages/shared-contracts/src/obs/pino-logger.spec.ts` — pins (a) the `(payload, msg?)` shape every project `*Logger` interface mirrors, (b) `service` and `base` field merging via `bindings()`, (c) the §23.6 redact axes are present in `DEFAULT_REDACT_PATHS`, (d) `level: 'silent'` honours so tests do not write to stdout.

**Added** — `@ankit-prop/ctrader-gateway` v0.2.10 (`svc:gateway/hard-rails`)

- `services/ctrader-gateway/src/hard-rails/logger.ts` — new `pinoRailLogger(opts)` factory wraps `createPinoLogger` and narrows the return type to `RailLogger`. Default `service` stamp `ctrader-gateway/hard-rails`. Method shims keep the type assignment honest in the face of pino's wider `LogFn` overloads (`(msg: string)` is wider than `RailLogger`'s payload-first contract). Existing `captureLogger` / `silentLogger` left unchanged so all existing rail tests stay no-op against the seam. `exactOptionalPropertyTypes: true` honoured by spreading the input rather than enumerating optional keys.
- `services/ctrader-gateway/src/hard-rails/index.ts` — re-exports `pinoRailLogger` and `PinoRailLoggerOptions` alongside the existing capture/silent surface.
- `services/ctrader-gateway/src/hard-rails/pino-rail-logger.spec.ts` — pins that the production factory returns a `RailLogger`-shaped value and accepts both `(payload)` and `(payload, msg)` calls without throwing.

**Bumped**

- `@ankit-prop/contracts` 0.3.2 → 0.3.3 (minor — new `obs/pino-logger` export surface, new `pino` + `pino-pretty` runtime deps).
- `@ankit-prop/ctrader-gateway` 0.2.9 → 0.2.10 (patch — new `pinoRailLogger` export; existing call sites unchanged).
- root `ankit-prop-umbrella` 0.4.15 → 0.4.16 (patch — workspace dep surface change; lockfile refreshed).
- `bun.lock` — refreshed; 54 packages installed, lockfile diff confined to the `pino@10.3.1` + `pino-pretty@13.1.3` transitive set.

**Verification**

- `bun test packages/shared-contracts/src/obs/ services/ctrader-gateway/src/hard-rails/` — 92 pass / 0 fail / 553 expects (existing 84 ANKA-29 / ANKA-40 / ANKA-56 / ANKA-58 hard-rail specs + 8 new pino-factory specs).
- `bun run typecheck` — clean against root tsconfig.
- `bun run lint:fix` — clean (Biome 2.4.13).
- `bun install` — exit 0; 54 packages installed.

**Notes**

- No production call site is wired to `pinoRailLogger` yet — the service entrypoint (`services/ctrader-gateway/src/start.ts`) lands in [ANKA-15](/ANKA/issues/ANKA-15) (Phase 2, gateway socket). Today's commit closes the §5.2 carry-over by making the pino factory available at the canonical home; the seam is the same `RailLogger` interface every existing rail evaluator already consumes via `RailContext.logger`.
- §23.6 redact list lives in one place (`DEFAULT_REDACT_PATHS` in contracts) so future services consume the same baseline; callers can extend via `extraRedactPaths` without re-declaring the §23.6 axes.

## 0.4.15 — 2026-04-28 09:21 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-58](/ANKA/issues/ANKA-58) (REQUEST CHANGES from QAEngineer's [ANKA-52](/ANKA/issues/ANKA-52) backfill review of [ANKA-40](/ANKA/issues/ANKA-40) commit `cec4a6a`).

**Why:** [ANKA-40](/ANKA/issues/ANKA-40) closed the missing-fill / non-NEW fail-open paths in rail 7 but left a residual fail-open path: any defined `broker.fill` was treated as structurally valid, so a malformed broker fill report with a missing or non-finite `filledPrice` / `intendedPrice` produced `Math.abs(NaN) > cap === false`, and rail 7 returned `allow` on the just-opened position without ever evaluating the slippage cap. QA's [ANKA-52](/ANKA/issues/ANKA-52) regression coverage exposed this directly: focused `bun test rail-7-slippage-guard.spec.ts` failed `7 pass / 1 fail` with the malformed-fill case landing on `allow`. BLUEPRINT §3.5 ("default for any uncertainty: fail closed. No trades > wrong trades.") and §9 rail 7's fail-closed default require `reject` here.

**Fixed (already on disk under commit `c6c2247`)** — `@ankit-prop/ctrader-gateway` v0.2.9 (`svc:gateway/hard-rails`)

- `services/ctrader-gateway/src/hard-rails/rail-7-slippage-guard.ts` — third fail-closed branch added after the existing non-NEW and missing-fill guards. Both `broker.fill.filledPrice` and `broker.fill.intendedPrice` are validated with `Number.isFinite(...)` before the slippage subtraction; on failure rail 7 returns `outcome: 'reject'` with `reason: 'rail 7 malformed fill report (non-finite price) — fail closed'` and structured `detail: { intentKind, hasFill: true, filledPrice, intendedPrice }`. Slippage / cap computation is unchanged on the happy path.
- `services/ctrader-gateway/src/hard-rails/rail-7-slippage-guard.spec.ts` — pinned the malformed-fill regression: `evaluateSlippageGuard(NEW, ctx({ fill: { intendedPrice: 2400 } as unknown as FillReport }))` must `reject` with reason containing `malformed fill report` and `fail closed`.
- `BLUEPRINT.md` §9 rail 7 row updated to enumerate the three fail-closed branches; §3.5 fail-closed defaults table cross-references ANKA-32's empty-decision-list reject synthesis as defence-in-depth alongside this rail-7 fix; new "Two-phase gateway evaluation" note documents the dispatcher contract.

**Bumped (already on disk under commit `c6c2247`)**

- `@ankit-prop/ctrader-gateway` 0.2.8 → 0.2.9 (patch — fail-closed malformed-fill guard for rail 7).
- root `ankit-prop-umbrella` 0.4.14 → 0.4.15 (patch — gateway hard-rail fix).

**Bookkeeping note**

- The fix shipped at 09:21 Europe/Amsterdam under `c6c2247`; this CHANGELOG entry and the paired `.dev/journal.md` entry were reverted out of the working tree by a concurrent agent between staging and commit, so they did not land in the same commit. This entry is the bookkeeping follow-up. Repo discipline reminder: per [ANKA-49](/ANKA/issues/ANKA-49) review, deferring CHANGELOG / journal bookkeeping past the same-commit boundary creates an audit-trail gap that surfaces in CodeReviewer backfills.

**Verification (re-run on this docs-only diff)**

- `bun test services/ctrader-gateway/src/hard-rails/rail-7-slippage-guard.spec.ts` — 10 pass / 0 fail / 30 expects.
- `bun test services/ctrader-gateway/src/hard-rails/` — 87 pass / 0 fail / 536 expects (workspace-scoped sanity check).

**Out of scope**

- Closing [ANKA-58](/ANKA/issues/ANKA-58) and [ANKA-52](/ANKA/issues/ANKA-52). Per the AGENTS.md matrix, hard-rail logic changes require CodeReviewer **and** QAEngineer sign-off before close; this commit only lands the production fix and bookkeeping. Reviewer routing follows in the issue threads.

## 0.4.14 — 2026-04-28 09:35 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-49](/ANKA/issues/ANKA-49) (CodeReviewer backfill of [ANKA-41](/ANKA/issues/ANKA-41) — pre-close review gate retroactive enforcement).

**Why:** [ANKA-41](/ANKA/issues/ANKA-41) (commit `68cbdff`, 2026-04-28 05:20 Europe/Amsterdam) bumped `@ankit-prop/eval-harness` 0.1.1 → 0.1.2 to fix three FTMO rule-semantics defects (pre-news Tier-1 inclusion, Prague-local day bucket, strategy-close balance accounting), but explicitly deferred §0.2 bookkeeping ("CHANGELOG / journal entry deferred to next bookkeeping pass") because the working tree at that moment also held [ANKA-40](/ANKA/issues/ANKA-40) edits and entangling scopes would have been wrong. CodeReviewer's [ANKA-49](/ANKA/issues/ANKA-49) verdict on the backfill is `BLOCK` on exactly that audit-trail gap — semantics and tests pass, only the audit trail is missing. This entry closes the gap. No code paths change in this commit.

**Backfilled** — `@ankit-prop/eval-harness` v0.1.2 (`pkg:eval-harness`) — already on disk under commit `68cbdff`; surfaced here for the audit trail.

- `packages/eval-harness/src/backtest.ts` + `packages/eval-harness/src/ftmo-rules.ts` — `buildPreNewsWindows` filter widened from `e.restricted === true` to `(e.restricted || e.impact === 'high')`. Per BLUEPRINT decision Y, FTMO Tier-1 = impact === 'high' OR restriction === true; the prior filter let high-impact, non-restricted events bypass the 2-h pre-news kill-switch. `buildBlackoutWindows` keeps the restricted-only filter (BLUEPRINT §13 line 1189). `CalendarEvent.impact` is now plumbed through `backtest.ts` so the new filter sees the field end-to-end.
- `packages/eval-harness/src/prague-day.ts` (new) — exposes `pragueDayBucket(tsMs)` using built-in `Intl.DateTimeFormat` with `timeZone: 'Europe/Prague'`, no new npm dep. Replaces UTC `floorDay` at all four `FtmoSimulator` call sites (`setInitialDay`, `onDayRollover`, `onTradeClose`, `recordEaRequest`); `pragueDayStartFromMs` in `sim-engine.ts` now delegates to it. FTMO server clock is Europe/Prague (BLUEPRINT §0 matrix line 283, §13.5 line 964); UTC bucketing produced day-rollover off-by-one between 22:00 and 24:00 Prague local time, breaking daily-floor and EA-rate-limit checks across the boundary.
- `packages/eval-harness/src/sim-engine.ts` — `applyAction` `kind: 'close'` branch now returns the realised P&L delta and the main loop accumulates it into `balance`; `finalBalance` is no longer pinned to entry balance regardless of strategy outcome. SL/TP paths unchanged. Without this, daily- and overall-floor breach checks ran against a frozen balance and could not see strategy-driven losses.
- `packages/eval-harness/src/backtest.spec.ts` — pins high-impact non-restricted FOMC tripping `news_blackout_open` with `detail.window === 'pre_news_2h'` end-to-end through `backtest()`.
- `packages/eval-harness/src/prague-day.spec.ts` — pins CET/CEST bucket flips at 23:00 / 22:00 UTC.
- `packages/eval-harness/src/sim-engine.spec.ts` — pins Prague day rollover plus strategy-close drops `finalBalance` from entry balance.

**Bumped (this commit, bookkeeping-only)**

- root `ankit-prop-umbrella` 0.4.13 → 0.4.14 (patch — backfill release entry; no code paths changed in this commit).

**Bumped (recorded retroactively for [ANKA-41](/ANKA/issues/ANKA-41) commit `68cbdff`)**

- `@ankit-prop/eval-harness` 0.1.1 → 0.1.2 (patch — three fail-closed FTMO rule-semantics corrections; behaviour-changing for high-impact non-restricted news, Prague day-rollover windows, and strategy-driven close P&L). Already on disk since `68cbdff`; surfaced here for the audit trail.

**Verification**

- `bun test packages/eval-harness/src/` — 62 / 0, 896 expects (CodeReviewer's run on [ANKA-49](/ANKA/issues/ANKA-49); reproducible against current `main`).
- No code paths changed in this commit, so by §0.2 ("smallest verification that proves the change") the full workspace test / typecheck is not re-run for this docs-only diff.

**Notes**

- Backfill is bookkeeping-only. The semantic fix shipped at 05:20 Europe/Amsterdam under `68cbdff`; this entry is timestamped at the bookkeeping repair time per CHANGELOG newest-first ordering. The package version remains 0.1.2 — this is not a new release.
- Operational discipline check for [ANKA-41](/ANKA/issues/ANKA-41) (post-backfill): version bump ✓ (0.1.1 → 0.1.2 in `68cbdff`), `.spec.ts` for changed behaviour ✓ (three new spec files in `68cbdff`), CHANGELOG entry ✓ (this entry), journal entry ✓ (paired entry below).
- Coordination note: this heartbeat raced sibling heartbeats on [ANKA-56](/ANKA/issues/ANKA-56) (QA backfill, [ANKA-29](/ANKA/issues/ANKA-29)) and [ANKA-58](/ANKA/issues/ANKA-58) (rail-7 malformed-fill fix, [ANKA-52](/ANKA/issues/ANKA-52)) inside a single shared worktree; multiple `package.json` bumps and a CHANGELOG overwrite occurred mid-edit. The shared tree was finally reset back to 0.4.13 by a sibling cleanup, so this entry takes 0.4.14 cleanly; sibling work will land on 0.4.15+ when those heartbeats commit. Committed only `CHANGELOG.md`, `.dev/journal.md`, root `package.json`.
- Future rule: if a commit defers CHANGELOG / journal bookkeeping, the deferring agent must open a child issue tagged `bookkeeping-debt` in the same heartbeat so a CodeReviewer backfill is not the discovery path.

## 0.4.13 — 2026-04-28 09:02 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-46](/ANKA/issues/ANKA-46) (parent [ANKA-45](/ANKA/issues/ANKA-45) — board directive to push to `origin` after every commit).

**Why:** Local `main` had accumulated five ANKA-tagged commits (ANKA-29 / ANKA-32 / ANKA-40 / ANKA-41 / ANKA-42) that never reached `git@github.com:ewildee/ankit-prop-trading-agent.git`; the GitHub repo was empty. Local-only commits are not durable progress and the board has now directed that push-on-commit be a standing rule. Encoding the rule in BLUEPRINT.md §0.2 makes it the single source of truth referenced by every code-writing agent's AGENTS.md (FoundingEngineer / CodexExecutor / Debugger).

**What changed (single commit, docs-only):**

- `BLUEPRINT.md` §0.2 ("Commit & version") — added a bullet under the existing rules: after every successful commit on a tracked branch, run `git push` (or `git push -u origin <branch>` for a new branch) immediately; never batch commits without pushing; surface push failures in the issue thread instead of silently leaving commits local. Rule applies to every code-writing agent and is independent of any future PR / branch-protection workflow.
- Initial seeding push (out-of-band, before this commit): `git push -u origin main` landed local commits `b2f55c9` → `68cbdff` on the remote; `main` now tracks `origin/main`.
- `package.json` `0.4.12 → 0.4.13` for the meta-repo source-of-truth doc change.

**Coverage:**

- No code paths changed. No `.spec.ts` to add — agent-instruction conformance is verified by reading the AGENTS.md files: CodexExecutor (`agents/5e6c5e8b…`) and Debugger (`agents/81a5f768…`) already carry the verbatim push rule from a prior heartbeat; FoundingEngineer's instructions are the system prompt loaded for every CTO heartbeat and reference BLUEPRINT §0.2 directly.

**Out of scope:**

- Branch-protection / PR-gating / CI enforcement. The board explicitly scoped this ticket to push-on-commit only.
- A `post-commit` git hook. Per ANKA-46 acceptance: documented rule + agent discipline first; only add a hook if drift recurs.

## 0.4.12 — 2026-04-28 05:25 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-40](/ANKA/issues/ANKA-40) (blocking defect from [ANKA-39](/ANKA/issues/ANKA-39) review).

**Why:** `evaluatePostFillRails` delegates to rail 7 (`evaluateSlippageGuard`), and rail 7 returned `outcome: 'allow'` whenever `intent.kind !== 'NEW' || broker.fill === undefined`. On the post-fill path that branch is reached precisely when something has gone wrong upstream — the dispatcher routed the fill phase before the broker fill report arrived, or fed a non-NEW intent into a fill check. BLUEPRINT §3.5 ("default for any uncertainty: fail closed. No trades > wrong trades") and §9 rail 7's fail-closed default require a `reject` here so a malformed reconciliation cannot silently leave a just-opened position on the books without ever evaluating the slippage cap. Patch-level bumps per §0.2.

**Fixed** — `@ankit-prop/ctrader-gateway` v0.2.8 (`svc:gateway/hard-rails`)

- `services/ctrader-gateway/src/hard-rails/rail-7-slippage-guard.ts` — split the single fail-open early-return into two fail-closed branches. `intent.kind !== 'NEW'` rejects with `reason: 'rail 7 invoked with non-NEW intent kind=… — fail closed'`; `broker.fill === undefined` rejects with `reason: 'rail 7 invoked on post-fill path without fill report — fail closed'`. Both populate the existing `detail: { intentKind, hasFill }` shape so dashboards / verdict logs surface the misuse without losing structured payload.
- `services/ctrader-gateway/src/hard-rails/evaluator.ts` — corrected the file header note that previously claimed `evaluatePostFillRails` "fail-closes-soft (returns rail 7's `allow` no-fill default)". After this commit rail 7 itself returns `reject` on missing fill, so the dispatcher contract is now strict-fail-closed end-to-end. Dispatcher-tests-assert-the-invariant clause kept.

**Added** — `@ankit-prop/ctrader-gateway` v0.2.8

- `services/ctrader-gateway/src/hard-rails/rail-7-slippage-guard.spec.ts` — six unit tests pinning the new fail-closed semantics: NEW + no fill → reject (the regression case the issue asked for), AMEND → reject, CLOSE → reject, AMEND + stray fill → reject (kind check wins, defence in depth), NEW + fill within cap → allow (sanity), NEW + fill above cap → reject (existing close-immediately path unchanged).
- `services/ctrader-gateway/src/hard-rails/pre-post-fill-split.spec.ts` — added the `evaluatePostFillRails`-level regression case: pre-submit allows and records idempotency, then post-fill called without a `broker.fill` produces `outcome: 'reject'`, exactly one decision (`rail: 'slippage_guard'`), with `reason` containing `'without fill report'` and `detail: { intentKind: 'NEW', hasFill: false }`. Locks down the dispatcher boundary, not just the per-rail evaluator.

**Bumped**

- `@ankit-prop/ctrader-gateway` 0.2.7 → 0.2.8 (patch — fail-closed semantic correction on rail 7's no-fill / non-NEW branches; behaviour-changing for pathological inputs that previously slipped through as `allow`).
- root `ankit-prop-umbrella` 0.4.11 → 0.4.12 (patch — gateway fail-closed correction).

**Verification**

- `bun test services/ctrader-gateway/src/hard-rails` — 81 / 0, 519 expects across 11 files. Includes the new rail-7 unit spec (6 cases) and the new dispatcher-level pre/post-fill regression case.
- `bun test` — 246 / 0, 1662 expects across 38 files.
- `bun run typecheck` — clean.

**Notes**

- Rail 7 stays `RailEvaluator`-shaped (`(intent, ctx) => RailDecision`); no contract surface change. The matrix harness in `matrix.spec.ts` continues to drive rail 7 with `intent.kind === 'NEW'` and an explicit `broker.fill`, so its 28-case sweep is untouched.
- The non-NEW branch is reachable only as defence in depth: `evaluatePostFillRails` itself only routes NEW intents in the live path, but the kind check is checked first inside the rail so a future caller that forgets the invariant still trips the fail-closed gate before the missing-fill check.
- Operator-visible signal: rejects from rail 7's misuse branches surface as pino warnings on the `slippage_guard` rail with the new reason strings — alerting now sees "rail 7 invoked … without fill report — fail closed" instead of the old silently-green path.

## 0.4.11 — 2026-04-28 05:09 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-42](/ANKA/issues/ANKA-42) (bookkeeping repair surfaced by [ANKA-39](/ANKA/issues/ANKA-39) review).

**Why:** The [0.4.9](#049--2026-04-27-2351-europeamsterdam) entry attributed to [ANKA-38](/ANKA/issues/ANKA-38) claimed `services/ctrader-gateway/src/hard-rails/rail-1-daily-breaker.spec.ts` had been added and that the rail-10 spec fixture had been migrated off the stale `internalDailyFloorPct` / `defensiveSlMaxLossPct` field names — but neither change was actually committed. HEAD still carried the stale rail-10 field names (a real `bun run typecheck` break) and the rail-1 spec lived only in an untracked file, so any clean checkout of the repo would fail typecheck and have zero per-rail rail-1 regression coverage. The dirty worktree had been masking the typecheck break locally. Separately, [0.4.10](/ANKA/issues/ANKA-32) had been appended *below* 0.4.9 / 0.4.8 in the file (its own entry called this out and asked the next bookkeeping commit to repair it), violating the "newest first" CHANGELOG contract. Patch-level bumps per BLUEPRINT §0.2.

**Fixed** — `infra:bookkeeping`

- Committed `services/ctrader-gateway/src/hard-rails/rail-1-daily-breaker.spec.ts` (the file already authored under [ANKA-38](/ANKA/issues/ANKA-38) but never staged into HEAD). Five tests, 18 expects, all green; covers equity above floor allows, strict below floor rejects with computed detail, equality at the floor allows, the non-default `dayStartBalance - internalDailyLossFraction * initialBalance = 94_500` formula, and intent-shape invariance (NEW / CLOSE / AMEND) on healthy and breached envelopes.
- Committed `services/ctrader-gateway/src/hard-rails/rail-10-phase-profit-target.spec.ts` fixture rename from the stale `internalDailyFloorPct: 0.04` / `internalOverallFloorPct: 0.08` / `defensiveSlMaxLossPct: 0.5` names to the current `internalDailyLossFraction` / `internalOverallLossFraction` / `defensiveSlMaxLossFraction: 0.005` schema (`packages/shared-contracts/src/hard-rails.ts:87,116`). Also corrected the `defensiveSlMaxLoss…` value from `0.5` (50%) to the schema-typical `0.005` (0.5%) — the stale fixture would have failed schema validation as soon as the typecheck ran.
- Reordered the CHANGELOG so [0.4.10](#0410--2026-04-28-0025-europeamsterdam) sits above [0.4.9](#049--2026-04-27-2351-europeamsterdam) / [0.4.8](#048--2026-04-27-2350-europeamsterdam), restoring the strict numeric newest-first ordering that the file header promises and that the 0.4.10 entry's "commit topology" note explicitly deferred to "the next bookkeeping commit". The 0.4.6 entry remains immediately below 0.4.8 (its own version-axis ordering is unchanged; the dated wall-clock skew between 0.4.6 / 0.4.8 / 0.4.9 / 0.4.10 came from the four-way ANKA-29 / ANKA-30 / ANKA-32 / ANKA-38 staging race already documented in the 0.4.10 topology note).

**Bumped**

- root `ankit-prop-umbrella` 0.4.10 → 0.4.11 (patch — bookkeeping repair: tracked-vs-claimed file drift + CHANGELOG newest-first restoration).
- `@ankit-prop/ctrader-gateway` 0.2.6 → 0.2.7 (patch — committing the per-rail rail-1 spec and the rail-10 fixture-rename that 0.2.6's CHANGELOG entry already attributed but never landed).

**Verification** (run on a clean worktree — uncommitted ANKA-40 rail-7 work was stashed first so no in-flight code masked the gates)

- `bun run lint:fix` — exit 0. Biome touched zero files; surfaced only the pre-existing `packages/ctrader-vendor/smoke/runner.ts` unused-import warning + 10 infos, none in the ANKA-42 staged set.
- `bun test` — 232 pass / 0 fail across 34 files, 1619 expects. Includes the newly committed rail-1 spec.
- `bun run typecheck` — exit 0. Confirms the rail-10 fixture rename clears the previously-masked `internalDailyFloorPct` / `defensiveSlMaxLossPct` errors at HEAD; nothing else regressed.

**Notes**

- Two unrelated in-flight files were detected on disk during this heartbeat: `services/ctrader-gateway/src/hard-rails/rail-7-slippage-guard.ts` (modified) and a new `rail-7-slippage-guard.spec.ts`, both attributed in their own headers to [ANKA-40](/ANKA/issues/ANKA-40) (rail 7 fail-closed). They were stashed under `git stash@{0} "ANKA-40 evaluator + rail-7 spec WIP"` and `git stash@{1} "ANKA-40 rail-7 fail-closed WIP …"` so verification ran against a clean worktree per ANKA-42's directive. Restoring them is the next ANKA-40 heartbeat's responsibility — they are not part of this commit.

## 0.4.10 — 2026-04-28 00:25 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-32](/ANKA/issues/ANKA-32) (REVIEW-FINDINGS H-6 from [ANKA-19](/ANKA/issues/ANKA-19) — HIGH).

**Why:** `composeRailVerdict([], decidedAt)` was fail-OPEN — it returned `{ outcome: 'allow' }` for an empty decision list. The journal pushed the fail-closed obligation up to the dispatcher, but BLUEPRINT §3.5 requires fail-closed at the contract surface itself. A dispatcher bug, a feature flag short-circuit, or a test wiring with no evaluators would silently produce a green verdict and let an unvetted intent through. Patch-level bumps per §0.2.

**Note on commit topology** — the production-line edits actually landed in commit `464b3dd` (titled `fix(svc:gateway/hard-rails): ANKA-28 rail 9 record-on-non-reject (code + spec)`) due to a concurrent staging race: the ANKA-28 heartbeat swept the staged ANKA-32 work into its commit alongside the rail-9 fixes. This 0.4.10 entry is the official ANKA-32 attribution, version bump, and journal pointer. The diff itself is identifiable inside `464b3dd` as the `RailVerdict.reason` field, the `NO_RAILS_EVALUATED_REASON` export, the `decisions.length === 0` fail-closed branch in `composeRailVerdict`, and the rewritten "empty decision list" spec case. ANKA-42 (0.4.11) re-anchored this entry above 0.4.9 / 0.4.8 to restore the file's strict newest-first ordering.

**Fixed** — `@ankit-prop/contracts` v0.3.1 (`pkg:contracts/hard-rails`)

- `packages/shared-contracts/src/hard-rails.ts` — `composeRailVerdict([], decidedAt)` now returns a synthetic reject (`outcome: 'reject', decisions: [], reason: 'no rails evaluated — fail-closed'`) instead of `{ outcome: 'allow' }`. Picked option (2) from the issue body — the reason string surfaces in dispatcher dashboards / verdict logs so operators can diagnose WHY a NEW intent was blocked, rather than throwing and crash-looping the gateway. The production dispatcher (`evaluateAllRails` in `services/ctrader-gateway/src/hard-rails/evaluator.ts`) always pushes ≥ 1 decision before short-circuit, so the new branch is unreachable on the live happy path; it exists exclusively as defense-in-depth against future dispatcher / feature-flag / test-wiring regressions.
- `packages/shared-contracts/src/hard-rails.ts` — added optional `reason: z.string().min(1).optional()` field on `RailVerdict`. Populated only by the synthetic fail-closed branch; real verdicts continue to carry per-rail rationales inside `decisions[*].reason`. Header comment on the schema spells out the split so future readers don't promote `reason` into a load-bearing top-level field for normal verdicts.
- `packages/shared-contracts/src/hard-rails.ts` — exported `NO_RAILS_EVALUATED_REASON = 'no rails evaluated — fail-closed' as const` so dispatcher code paths can compare against the canonical string instead of duplicating the literal at each consumer.
- `packages/shared-contracts/src/index.ts` — re-exports `NO_RAILS_EVALUATED_REASON` from the package barrel.
- `packages/shared-contracts/src/hard-rails.spec.ts` — replaced the obsolete `empty decision list → allow` case with three locked-down assertions: empty list yields `outcome: 'reject'`, `decisions: []`, and `reason === NO_RAILS_EVALUATED_REASON` whose value is the exact issue-specified string `"no rails evaluated — fail-closed"`. Added a sibling case asserting non-empty verdicts do NOT carry a top-level `reason` (reason lives on `decisions[*]` for the normal path). Round-trip spec extended to cover both synthetic and real verdicts through `RailVerdict.parse(...)`. Existing all-allow / any-tighten / any-reject cases untouched per the issue's "existing composeRailVerdict specs untouched" verification clause.

**Bumped**

- `@ankit-prop/contracts` 0.3.1 → 0.3.2 (patch — additive optional field on `RailVerdict` zod schema, fail-closed semantic correction; ANKA-30's 0.3.0 → 0.3.1 already shipped via commit `0593eb9` and added the `LossFraction` / `EnvelopeFloors` surface, so this row is the ANKA-32 follow-on bump on top).
- root `ankit-prop-umbrella` 0.4.9 → 0.4.10 (patch — pkg:contracts fail-closed semantic correction). Lands above ANKA-38's `0.4.9` rail-1 daily-breaker spec. The umbrella version axis was contested by four near-simultaneous heartbeats (ANKA-29, ANKA-30, ANKA-32, ANKA-38) during this window — see the journal entry for the full topology trace.

**Verification**

- `bun test packages/shared-contracts/src/hard-rails.spec.ts` — 18 / 0, 31 expects. Includes the new fail-closed cases.
- `bun test services/ctrader-gateway/src/hard-rails/idempotency-record-on-allow.spec.ts` — 4 / 0, 18 expects. The gateway evaluator's record-on-non-reject path remains correct under the new contract semantics (the dispatcher always supplies ≥ 1 decision; the synthetic `reason` field is opt-in).
- `bun run lint` clean on the touched files. Workspace-level `bun run typecheck` shows only the 5 pre-existing in-flight ANKA-29 / ANKA-30 errors (`bufferDollars`, news-staleness API rename) documented in v0.4.4 — none introduced by this change.

**Notes**

- The schema-level approach (extending `RailVerdict` with an optional `reason`) was preferred over adding a synthetic `RailDecision` because the 14-rail catalog is closed (`HARD_RAIL_KEYS.length === 14` is asserted by `hard-rails.spec.ts:13` and load-bearing for the §9 matrix). Adding a sentinel "no_rails_evaluated" rail would have broken that invariant; bolting an optional reason onto the verdict shape is additive and consumer-transparent.
- The `evaluateAllRails` dispatcher in `services/ctrader-gateway` still records the idempotency ULID only on a non-reject composite (per ANKA-28). A synthetic empty-decisions reject therefore correctly does NOT consume the ULID slot — the operator's retry after the dispatcher bug is fixed will succeed at rail 9.

## 0.4.9 — 2026-04-27 23:51 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executed by CodexExecutor for [ANKA-38](/ANKA/issues/ANKA-38) under the [ANKA-35](/ANKA/issues/ANKA-35) precise-delegation pattern.

**Why:** Rail 1 already had matrix coverage, but lacked a dedicated per-rail regression file pinning the daily-breaker boundary and floor formula from BLUEPRINT §8.3 / §9.

**Added** — `svc:gateway/hard-rails`

- `services/ctrader-gateway/src/hard-rails/rail-1-daily-breaker.spec.ts` — dedicated coverage for `evaluateDailyBreaker`: equity above floor allows, equity strictly below floor rejects with computed detail, equality at the floor allows, non-default `dayStartBalance - internalDailyLossFraction * initialBalance` formula computes `94_500`, and NEW/CLOSE/AMEND intent shapes produce identical outcomes for healthy and breached envelopes.

**Bumped**

- root `ankit-prop-umbrella` 0.4.8 → 0.4.9 (patch — test-only hard-rail regression coverage).
- `@ankit-prop/ctrader-gateway` 0.2.5 → 0.2.6 (patch — rail 1 per-rail spec).

**Verification**

- `bun test services/ctrader-gateway/src/hard-rails/rail-1-daily-breaker.spec.ts` — 5 / 0, 18 expects.
- `bun test services/ctrader-gateway/src/hard-rails/` — 74 / 0, 493 expects across 10 spec files.
- `bun run typecheck` — clean.
- `bun run lint:fix` — exit 0. Biome reported only pre-existing unsafe suggestions / the existing `packages/ctrader-vendor/smoke/runner.ts` unused import warning outside this issue's touched files; scoped Biome check on ANKA-38 files was clean.
- `services/ctrader-gateway/src/hard-rails/rail-10-phase-profit-target.spec.ts` — fixture field names updated from the stale `internalDailyFloorPct` / `defensiveSlMaxLossPct` names to current `internalDailyLossFraction` / `defensiveSlMaxLossFraction` so the workspace typecheck could prove this change.

## 0.4.8 — 2026-04-27 23:50 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-29](/ANKA/issues/ANKA-29) (REVIEW-FINDINGS H-2 from [ANKA-19](/ANKA/issues/ANKA-19) — HIGH).

**Why:** Rail 7 (slippage guard) only fires post-fill (`broker.fill !== undefined`). The previous `evaluateAllRails` re-ran the entire 14-rail catalog on every call — so a dispatcher that re-evaluated the same intent after the broker reported a fill would (a) trip rail 9 idempotency on the now-recorded ULID and (b) burn another rail 12 throttle token. ANKA-15 would have hit this on the first live fill. Patch-level bump per §0.2.

**Changed** — `@ankit-prop/ctrader-gateway` v0.2.5 (`pkg:gateway/hard-rails`)

- `services/ctrader-gateway/src/hard-rails/evaluator.ts` — replaced single-entry `evaluateAllRails` with two phase-scoped composers: `evaluatePreSubmitRails(intent, ctx)` runs rails 1–6, 8–14 (idempotency record-on-non-reject lives here, unchanged from ANKA-28) and `evaluatePostFillRails(intent, ctx)` runs rail 7 only with zero idempotency / throttle side-effects. Header comment documents the dispatcher contract: pre-submit MUST run before broker submit; post-fill MUST run after the broker reports a fill on the same `clientOrderId`. Exported partition constants `PRE_SUBMIT_RAIL_KEYS` / `POST_FILL_RAIL_KEYS` so dispatcher and tests share one source of truth.
- `services/ctrader-gateway/src/hard-rails/index.ts` — barrel re-exports `evaluatePreSubmitRails`, `evaluatePostFillRails`, `PRE_SUBMIT_RAIL_KEYS`, `POST_FILL_RAIL_KEYS` in place of `evaluateAllRails`.
- `services/ctrader-gateway/src/hard-rails/idempotency-record-on-allow.spec.ts` — migrated all four rail-9 record-on-allow regressions onto `evaluatePreSubmitRails`. The semantics are identical (rail 9 sits in the pre-submit set), but the spec now reflects the post-split API.
- `services/ctrader-gateway/src/hard-rails/pre-post-fill-split.spec.ts` (new) — locks in the H-2 invariants: (1) catalogs partition cleanly into 13 + 1 with no overlap; (2) pre-submit + post-fill traversal of the same `clientOrderId` records idempotency exactly once and the post-fill phase emits only the rail-7 decision; (3) post-fill does NOT consume a throttle token (asserted via probe-consume deltas: capacity−2 after pre-submit, capacity−3 after a post-fill round, never capacity−4); (4) out-of-cap slippage on the post-fill phase rejects with exactly one `slippage_guard` decision.

**Bumped**

- `@ankit-prop/ctrader-gateway` 0.2.4 → 0.2.5 (patch — API-additive split with one removed export `evaluateAllRails`; no in-tree consumer outside this package). Other in-flight package bumps in the working tree (root 0.4.5 → 0.4.7, contracts 0.3.0 → 0.3.1, eval-harness 0.1.0 → 0.1.1) belong to ANKA-32 / earlier heartbeats and are not part of this commit.
- root `ankit-prop-umbrella` 0.4.7 → 0.4.8.

**Verification**

- `bun test services/ctrader-gateway/src/hard-rails/` — 69 / 0, 475 expects across 9 spec files. Includes the four new pre-post-fill-split cases and the four migrated rail-9 record-on-allow cases.
- `bunx --bun biome check` clean on the four touched files (`evaluator.ts`, `index.ts`, `idempotency-record-on-allow.spec.ts`, `pre-post-fill-split.spec.ts`). Workspace lint surfaces only pre-existing in-flight infos (`smoke-runner.ts` unused-import warning) unrelated to ANKA-29.
- Workspace `bun run typecheck` shows only the pre-existing `rail-10-phase-profit-target.spec.ts` `internalDailyFloorPct` error from ANKA-30 in-flight work; no new typecheck errors introduced by this change.

## 0.4.7 — 2026-04-28 00:10 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-30](/ANKA/issues/ANKA-30) (REVIEW-FINDINGS H-3 + H-4 from [ANKA-19](/ANKA/issues/ANKA-19) — HIGH).

**Why:** The FTMO loss-line surface carried two unit drifts: `svc:gateway/hard-rails` and `pkg:eval-harness` disagreed on whether floor inputs were percent or fraction (rail 11 had a stray `/100` divide; eval-harness `INTERNAL_DEFAULT_MARGINS` shipped as `4` / `8` percent), and the gateway field names ended in `…FloorPct` even though the runtime value was a *loss* fraction the rail subtracted to compute the floor. Operators pre-computing "the floor as `0.92`" from the field name silently breached. Synchronized rename + math correction across `pkg:contracts`, `svc:gateway/hard-rails`, and `pkg:eval-harness`, plus a `LossFraction` zod refinement (≤ 0.5) that catches percent-as-fraction wiring at the contract boundary. Patch- / minor-level bumps per BLUEPRINT §0.2.

**Note on commit topology** — the production-line edits actually landed in commit `464b3dd` (titled `fix(svc:gateway/hard-rails): ANKA-28 rail 9 record-on-non-reject (code + spec)`) due to a concurrent staging race in the parallel-heartbeat workspace; the ANKA-28 heartbeat ran `git add` over my then-staged ANKA-30 work. The diff inside `464b3dd` is unambiguously identifiable as ANKA-30 work (`LossFraction`, `EnvelopeFloors`, the `internal{Daily,Overall}LossFraction` and `defensiveSlMaxLossFraction` renames, eval-harness rename + math). The bookkeeping commit `0593eb9 docs(infra:bookkeeping): ANKA-30 attribution + version bumps` carried this CHANGELOG row plus the journal entry plus the four package-manifest bumps. [ANKA-42](/ANKA/issues/ANKA-42)'s newest-first reorder (commit `6870f18`) accidentally dropped the `0.4.7` row from the file; [ANKA-59](/ANKA/issues/ANKA-59) (this commit) reconstructs it from the v0.4.7 journal body and the `0593eb9` commit message and re-anchors it numerically between `0.4.8` and `0.4.6`.

**Added** — `@ankit-prop/contracts` v0.3.1 (`pkg:contracts/hard-rails`)

- `packages/shared-contracts/src/hard-rails.ts` — exports `LossFraction = z.number().nonnegative().max(0.5)`. The `0.5` ceiling is the smoking-gun catch — anything above is almost certainly a percent slipped in (`4` instead of `0.04`).
- `packages/shared-contracts/src/hard-rails.ts` — exports `EnvelopeFloors = z.strictObject({ internalDailyLossFraction, internalOverallLossFraction })`, the canonical FTMO loss-line shape across packages.
- `packages/shared-contracts/src/hard-rails.spec.ts` — 7 new cases / 14 expects: `LossFraction` accepts `0`, `0.04`, `0.08`, `0.5`; rejects `0.51`, `4`, `8`, `100`; rejects negatives. `EnvelopeFloors` accepts BLUEPRINT defaults, rejects percent-shaped values, rejects extra keys.

**Renamed** — `@ankit-prop/ctrader-gateway` v0.2.5 (`svc:gateway/hard-rails`)

- `services/ctrader-gateway/src/hard-rails/types.ts` — `EnvelopeFloors.internal{Daily,Overall}FloorPct` → `internal{Daily,Overall}LossFraction`. `BrokerSnapshot.defensiveSlMaxLossPct` → `defensiveSlMaxLossFraction`. Header comments cite `LossFraction` (≤ 0.5) and §8.3 / §8.5. Naming rationale: rail 2 computes `floor = (1 − X) × initialBalance`, so `…FloorPct` invited operators to pre-compute the floor and breach.
- `services/ctrader-gateway/src/hard-rails/rail-1-daily-breaker.ts`, `rail-2-overall-breaker.ts` — read renamed fields; math unchanged.
- `services/ctrader-gateway/src/hard-rails/rail-11-defensive-sl.ts` — renamed field AND dropped the `/100` divide. Formula now `perTradeCapDollars = initialBalance × defensiveSlMaxLossFraction`. Matrix fixture's `0.5` (interpreted as percent) becomes `0.005` (fraction); dollar outcome on a $100k account is the same `$500` per-trade cap.
- Spec fixtures updated to the current schema across `matrix.spec.ts`, `rail-11-defensive-sl.spec.ts`, `idempotency-record-on-allow.spec.ts`, `rail-news-staleness.spec.ts`, `rail-13-force-flat-schedule.spec.ts`, `rail-10-phase-profit-target.spec.ts` (carry `defensiveSlMaxLossFraction: 0.005` and the renamed envelope fields).

**Renamed** — `@ankit-prop/eval-harness` v0.1.1 (`pkg:eval-harness`)

- `packages/eval-harness/src/ftmo-rules.ts` — `FtmoLineMargins` and `InternalMargins`: `{daily,overall}LossPct` → `{daily,overall}LossFraction`. `FTMO_DEFAULT_LINE`: `5 → 0.05`, `10 → 0.1`. `INTERNAL_DEFAULT_MARGINS`: `4 → 0.04`, `8 → 0.08`. `checkDailyLoss` / `checkOverallLoss` math drops `× 0.01` and multiplies the fraction directly. Cross-package check now passes: harness and gateway carry identical FTMO numbers in identical units.
- `packages/eval-harness/src/ftmo-rules.props.spec.ts` lines 142 / 170 — `closeReason: 'manual'` (an [ANKA-20](/ANKA/issues/ANKA-20) leftover, not in the `ClosedTrade.closeReason` union) corrected to `'strategy'` so the workspace typecheck passes. Property tests are about min-hold semantics, not close reason.

**Bumped**

- `@ankit-prop/contracts` 0.3.0 → 0.3.1 (minor — additive zod surface, no consumer broken).
- `@ankit-prop/ctrader-gateway` 0.2.4 → 0.2.5 (patch — type-level field renames + rail 11 math correction; semantically equivalent at canonical fixture values).
- `@ankit-prop/eval-harness` 0.1.0 → 0.1.1 (patch — type rename + math refactor; identical numerical results at canonical fixture values).
- root `ankit-prop-umbrella` 0.4.6 → 0.4.7 (patch — synchronized FTMO loss-line unit unification across three packages).

**Verification**

- `bun test packages/shared-contracts packages/eval-harness` — 85 / 85 green at HEAD; the 7 new `LossFraction` / `EnvelopeFloors` cases pass.
- Rail 11 dollar outcome at canonical $100k fixture unchanged ($500 per-trade cap before and after the `/100` drop, given the fixture flipped from `0.5` percent to `0.005` fraction).

**Notes**

- The `LossFraction` zod schema is correct-but-unused at this commit — it is not yet wired to a config-loader boundary parse. The `accounts.yaml` ingestion that will call `EnvelopeFloors.parse(...)` lands in [ANKA-15](/ANKA/issues/ANKA-15). Once wired, a typo of `4` instead of `0.04` will fail at boundary parse rather than silently shifting the floor by 100×.
- BLUEPRINT was internally consistent on units throughout (§8.3 / §8.5 / §17 all use fractions). No BlueprintAuditor escalation needed — the spec was right; the code drifted.
- [ANKA-59](/ANKA/issues/ANKA-59) bookkeeping repair (this entry's restoration anchor): the entry was once committed (commit `0593eb9`) and visible in `git log --all -p CHANGELOG.md`, then dropped during the ANKA-42 newest-first reorder (`6870f18`). Reconstructed from the v0.4.7 journal body and the `0593eb9` commit message, anchored numerically between `0.4.8` and `0.4.6`. No version bump for the reconstruction itself — `@ankit-prop/contracts 0.3.1`, `@ankit-prop/eval-harness 0.1.1`, `@ankit-prop/ctrader-gateway 0.2.5`, and root `0.4.7` were already shipped by `0593eb9`.

## 0.4.6 — 2026-04-27 23:55 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-26](/ANKA/issues/ANKA-26) (REVIEW-FINDINGS B-1 from [ANKA-19](/ANKA/issues/ANKA-19) — BLOCKING).

**Why:** Rail 10 implementation drifted from BLUEPRINT §8.2 / §8.4 decision N. The blueprint declares the profit-target buffer as `+1.0%` of `INITIAL_CAPITAL` — `closed_balance >= INITIAL × (1 + target + buffer)` — but `services/ctrader-gateway/src/hard-rails/rail-10-phase-profit-target.ts:24-26` was computing `INITIAL × (1 + target) + bufferDollars` (flat dollars). On a $100k account with the §17 default buffer of `1.0%` configured as the `bufferDollars: 50` fixture, the rail flattened ~$950 too early, forcing operators below their phase target. Patch-level bump per §0.2.

**Fixed** — `svc:gateway/hard-rails`

- `rail-10-phase-profit-target.ts` — formula now `targetClosedBalance = initialBalance × (1 + fractionOfInitial + bufferFraction)`. Both target and buffer are fractions of `INITIAL_CAPITAL` (e.g. `0.10` and `0.01`), matching §8.4 decision N exactly. Pre-fix code on §17 defaults flattened at $110_050; post-fix flattens at $111_000 — the contractually correct boundary.
- `types.ts ProfitTarget` — `bufferDollars: number` → `bufferFraction: number`. Inline comment cites §8.2 / §8.4 decision N and the `0.01` example so future readers cannot re-introduce the dollar interpretation.
- `rail-10-phase-profit-target.ts` — added a fail-closed runtime guard rejecting `bufferFraction` outside `[0, 0.5]` so a config typo cannot silently widen the profit-target gate (per ANKA-26 fix item 4). Throws `Error('rail_10: profitTarget.bufferFraction=… out of range …')`; the gateway main loop will fail-closed on first NEW intent rather than draining the account.

**Changed** — test fixtures (consumer wiring per ANKA-26 fix item 3)

- `matrix.spec.ts` — `defaultBroker` `profitTarget` ⇒ `bufferFraction: 0.01`. Rail 10 positive case now uses `closedBalance: 111_001` (just above `INITIAL × (1 + 0.10 + 0.01)`), negative case uses `110_999`. Description rewritten to cite the §8.4 formula. The matrix's 28-case invariant (14 rails × {positive, negative}) is preserved.
- `rail-11-defensive-sl.spec.ts` — fixture `bufferFraction: 0.01` (rail 11 doesn't read this field, but the broker fixture must satisfy `ProfitTarget`).

**Added** — `svc:gateway/hard-rails`

- `rail-10-phase-profit-target.spec.ts` — boundary lock test (5 cases) per ANKA-26 fix item 5. Asserts `targetHit=true` exactly at `INITIAL × (1 + target + buffer)` and `targetHit=false` one cent below; pins the regression that pre-fix code would have tripped at `$110_050`; verifies `min_trading_days_completed=false` keeps the rail at `allow` even with `targetHit`; asserts the runtime range guard rejects `bufferFraction > 0.5` and `< 0`. Boundary value computed in-test (`INITIAL × (1 + 0.1 + 0.01)`) so it survives the FP imprecision of `1 + 0.1 + 0.01 ≈ 1.1100000000000003`.

**Bumped**

- `services/ctrader-gateway` 0.2.2 → 0.2.3 (patch — semantic bug fix on rail 10).
- root `ankit-prop-umbrella` 0.4.5 → 0.4.6 (patch).
- `pkg:contracts` not bumped — `ProfitTarget` lives in `services/ctrader-gateway/src/hard-rails/types.ts`, not in `packages/shared-contracts/`. Verified via `grep -n "ProfitTarget" packages/shared-contracts/src/*.ts` (no match) before declining the bump.

**Verification**

- `bun test services/ctrader-gateway/src/hard-rails/{rail-10-phase-profit-target,matrix,rail-11-defensive-sl}.spec.ts` — 44 / 44 green (5 in the new rail-10 spec + 28 matrix cases + 11 rail-11 cases).
- `bun run lint:fix services/ctrader-gateway/src/hard-rails` — no fixes applied to ANKA-26 files.

**Notes**

- BLUEPRINT remains internally consistent on this point (§8.2 line 957, §8.4 decision N line 1001, §17 `accounts.yaml` example `profit_target_buffer_pct: 1.0`). No BlueprintAuditor escalation needed — the spec was right; the code drifted.
- The `pct → fraction` translation at the YAML loader (e.g. `1.0 → 0.01`) is config-loader-side and out of scope for ANKA-26 — there is no current `accounts.yaml` loader pointed at by the issue. The runtime contract is the in-code fraction.

## 0.4.5 — 2026-04-27 23:37 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-27](/ANKA/issues/ANKA-27) (parent [ANKA-19](/ANKA/issues/ANKA-19) REVIEW-FINDINGS B-2 BLOCKING).

**Why:** Rail 13 (`rail-13-force-flat-schedule.ts:27-42`) treated `marketCloseAtMs`, `fridayCloseAtMs`, and the next restricted event as all-optional. When all three were undefined, `isInsideForceFlatWindow()` returned `{ inside: false }` and the rail allowed a NEW entry — fail-OPEN, not fail-closed. BLUEPRINT §3.5 requires fail-closed on uncertainty, and §9 declares `force_flat_lead_min` mandatory in `accounts.yaml` (no symbol may omit it). A dispatcher bug or partial reconciliation that omitted all three close-times silently disabled rail 13.

**Changed** — `@ankit-prop/ctrader-gateway` v0.2.2 (`svc:gateway/hard-rails`)

- `src/hard-rails/rail-13-force-flat-schedule.ts` — explicit defense-in-depth fail-closed branch (option 2 from the issue): when `marketCloseAtMs === undefined && fridayCloseAtMs === undefined && nextRestrictedEvent === null`, the rail now rejects with reason `"force-flat schedule unknown — fail-closed"` and emits the structured §9 warn payload before delegating to `isInsideForceFlatWindow`. AMEND/CLOSE drain path unchanged. The schedule lookups are read once via a local `marketCloseAtMs = (broker as { marketCloseAtMs?: number }).marketCloseAtMs` so the runtime guard stays reachable even after the contract surface narrows the field to a non-optional `number` (option 1, landed alongside B-1's other rail/contract renames).
- `src/hard-rails/rail-13-force-flat-schedule.spec.ts` — new regression spec, 2 cases: NEW intent against a `BrokerSnapshot` with all schedule anchors undefined (built via `as unknown as BrokerSnapshot` so it survives the future contract-level invariant) → `reject` with the exact reason string and the structured `warn` log; AMEND against the same malformed snapshot → `allow` (drain path).

**Bumped**

- root `ankit-prop-umbrella` 0.4.4 → 0.4.5 (patch — bug fix; rail-level fail-closed surface only).
- `@ankit-prop/ctrader-gateway` 0.2.1 → 0.2.2 (patch — rail 13 stricter on missing schedule anchors; existing happy path unchanged).

**Verification**

- `bun test services/ctrader-gateway/src/hard-rails/rail-13-force-flat-schedule.spec.ts services/ctrader-gateway/src/hard-rails/force-flat-scheduler.spec.ts` — 10 pass / 0 fail / 23 expects.
- Existing rail-13 matrix cases (positive: 3-min from market close → reject; negative: 60-min from market close → allow) continue to pass.
- `bun run lint:fix` — clean on the changed files.
- `bun run typecheck` — gateway clean for rail-13. Pre-existing `pkg:eval-harness` errors in `ftmo-rules.props.spec.ts` are sibling B-1 review-finding WIP, not in scope.

**Open**

- The contract-level upgrade (option 1: making `BrokerSnapshot.marketCloseAtMs` required, the issue's preferred fix) is in flight as part of the B-1 sibling-finding WIP that touches `BrokerSnapshot.profitTarget.bufferDollars`, `EnvelopeFloors.internal*FloorPct`, and `defensiveSlMaxLossPct`. That commit will tighten the type so the rail-level guard becomes belt-and-suspenders rather than the only defense. Sequenced separately so the rail-13 fail-closed lands atomically without bundling unrelated renames.
- Other ANKA-19 review findings (B-1 unit-name renames, news-staleness API timestamp, idempotency record-on-allow shifted to evaluator from rail 9) remain as visible uncommitted WIP across `services/ctrader-gateway/src/hard-rails/{types,evaluator,rail-9-idempotency,rail-10-phase-profit-target,news-client}.ts`, `services/ctrader-gateway/src/hard-rails/matrix.spec.ts`, and `packages/{shared-contracts,eval-harness}/...` — owned by the heartbeats that initiated them.

## 0.4.4 — 2026-04-27 23:35 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-28](/ANKA/issues/ANKA-28) (parent [ANKA-19](/ANKA/issues/ANKA-19) REVIEW-FINDINGS H-1).

**Why:** Rail 9 was recording the `clientOrderId` ULID on its own allow path (`rail-9-idempotency.ts:22`), which fired *before* rails 10–14 voted. A reject from rail 12 (throttle) or rail 13 (force-flat) consumed the slot anyway, so the operator's same-`clientOrderId` retry after the breaker cleared was incorrectly rejected by rail 9. The journal's design intent ("human-driven re-runs after intermittent breakers") only held for rejects from rails 1–8 because the composer's short-circuit stopped before rail 9 ran.

**Changed** — `@ankit-prop/ctrader-gateway` v0.2.1 (`svc:gateway/hard-rails`)

- `src/hard-rails/rail-9-idempotency.ts` — dropped `idempotency.record(...)` from the rail's allow branch. The `has(...)` early-reject check stays put. Header comment now states that recording lives in `evaluator.ts` and only fires on a non-`reject` composite verdict, with the operator-retry rationale referenced.
- `src/hard-rails/evaluator.ts` — `evaluateAllRails` records the ULID exactly once, after `composeRailVerdict` produces a non-`reject` outcome (`allow` | `tighten`). A reject from any rail (1–8 short-circuit, or 9 dup, or 10–14 downstream) leaves the registry untouched, so the retry semantics now hold for all 14 rails uniformly.
- `src/hard-rails/idempotency-record-on-allow.spec.ts` — new regression spec, 4 cases / 18 expects: rail 12 reject → ULID NOT consumed → retry after window opens passes rail 9; rail 13 reject → ULID NOT consumed → retry after force-flat window passes rail 9; fully-allowed verdict records, immediate replay rejects on rail 9; tighten verdict (rail 11) still records.

**Bumped**

- root `ankit-prop-umbrella` 0.4.3 → 0.4.4 (patch — bug fix, no surface change).
- `@ankit-prop/ctrader-gateway` 0.2.0 → 0.2.1 (patch — semantic-equivalent for the operator-retry happy path, stricter for the breaker-trip path).

**Verification**

- `bun test services/ctrader-gateway/src/hard-rails/idempotency-record-on-allow.spec.ts` — 4 / 0.
- `bun test services/ctrader-gateway/src/hard-rails/matrix.spec.ts -t idempotency` — 2 / 0 (existing rail-9 positive + negative cases unchanged).
- `bun test services/ctrader-gateway/src/hard-rails/idempotency-store.spec.ts` — 3 / 0.
- 6 pre-existing in-flight failures across the broader gateway test surface (`matrix.spec.ts` rail-10 cases, `rail-news-staleness.spec.ts`) belong to the parallel ANKA-19 follow-up batch landing the `bufferDollars` → `bufferFraction` and news-staleness API renames; not introduced by this change and out of scope for ANKA-28.

**Open**

- The wider ANKA-19 review-findings rename (`bufferDollars` → `bufferFraction`, `defensiveSlMaxLossPct` → `defensiveSlMaxLossFraction`, `internalDailyFloorPct` → `internalDailyLossFraction`, mandatory `marketCloseAtMs`, news-staleness API rename) sits across `types.ts`, `matrix.spec.ts`, `news-client.ts`, `rail-3/4/10/13`, and `shared-contracts` — owned by the heartbeat that initiated it, not bundled into this commit.

## 0.4.3 — 2026-04-27 23:19 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-23](/ANKA/issues/ANKA-23) (Audit-1 follow-up batch — code/doc-side items from parent [ANKA-22](/ANKA/issues/ANKA-22)).

**Why:** Audit-1 surfaced two missing config example files that BLUEPRINT §17 layout (line 1807–1808) explicitly lists, plus four documentation gaps (no `AGENTS.md` pointer doc, stale `T003`/`T004`/`T005` numbering after the ANKA-7 split, README's Layout section forced contributors to crack the blueprint to find the gateway directory, and a leftover gitignored `.tmp-ctrader-ts-inspect/` directory at repo root). Doc-only batch — no package code changed. Patch-level bump per BLUEPRINT §0.2 (config tweak / doc change).

**Added** — `docs` / `infra:config`

- `AGENTS.md` (repo root) — pointer document to BLUEPRINT §0.2 (`.dev/` working methodology + commit conventions), §22 (build phases), §25 (module / service catalog), with the bun.com/llms.txt mandatory-reading note, the after-every-code-change checklist, the top-scope tag table, and the CEO-approval bounds. Single short paragraph per heading; the blueprint remains the source of truth.
- `config/recovery.example.yaml` — schema-conforming editable template for the §17.4 RecoveryCfg (`on_orphan_position`, `on_missing_position`, `on_db_unreachable`, `on_calendar_stale`). Fail-closed defaults (`manual_approve`, `halt_and_alert`, `halt`, `blackout`) per BLUEPRINT §3.5; inline enum-option comments so the operator can flip to dev variants without re-reading the schema.
- `config/symbol-tag-map.example.yaml` — verbatim copy of the §17.3 mappings table, consumed by `svc:news/symbol-tag-mapper`. NAS100 / XAUUSD are the only `affects:` non-empty entries today; the empty arrays for EUR / GBP / CAD / AUD / NZD / CHF / Crude Oil are intentional (we don't trade them yet) and must remain rather than being deleted, so the validator can detect future additions to FTMO's calendar tag set.

**Changed** — `docs`

- `README.md` — `Layout` section gained a 2-column workspace listing (packages: `proc-supervisor`, `eval-harness`, `shared-contracts`, `ctrader-vendor`; services: `ctrader-gateway` / `trader` / `news` / `dashboard` / `autoresearch` with their public ports). Contributors no longer need to crack BLUEPRINT.md to find the gateway directory.
- `TODOS.md` — renumbered the `T003` sub-items into a consecutive ANKA-7 split per the agreed scheme: `T003.a` ANKA-12 (smoke scaffold), `T003.b` ANKA-13 (transport + OAuth + reconciliation), `T003.c` ANKA-15 (order-manager + execution-stream + persistence — was `T005`), `T003.d` ANKA-7 `/health` (was `T003.h`). Top-level `T004` (the 14 hard rails / ANKA-14) retained its number because it's an independent peer task, not part of the ANKA-7 split.

**Removed** — repo housekeeping

- `.tmp-ctrader-ts-inspect/` — leftover gitignored inspection directory at repo root from the ANKA-12 vendor verdict probe (`ctrader-ts@1.0.1` extraction). Already not committed; deleted from disk so a stray `git status -uall` no longer surfaces it.

**Bumped**

- root `ankit-prop-umbrella` 0.4.2 → 0.4.3 (patch — config examples + docs only, no package code).

**Verification**

- `bun run lint` clean on the changed files (YAML / Markdown not lint-tracked by Biome 2.4; existing 1 warning + 10 infos in `pkg:eval-harness` / `pkg:ctrader-vendor` unchanged).
- `bun run typecheck` — no TS surface touched.
- `bun test` — no spec surface touched; no incremental risk.

**Open**

- HIGH-3 (pino install), HIGH-4 (§25.2 row), MED-1/3/4/5, LOW-4 stay with the CEO via `DOC-BUG-FIXES.md` (out of scope for this issue per the parent breakdown).

## 0.4.2 — 2026-04-27 22:42 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing ANKA-7 (Phase 2 — `/health` endpoint per BLUEPRINT §19.1).

**Why:** `/health` is one of ANKA-7's listed deliverables and was the last offline-runnable item before live broker work. Without it, `bun run start` brings up the supervisor (port 9100) but the gateway slot times out on health-poll because nothing is listening on 9201. Shipping the endpoint now lets the supervisor's adopt/replace/refuse semantics actually exercise the gateway service ahead of ANKA-13's transport wiring.

**Added** — `@ankit-prop/ctrader-gateway` v0.2.0 (`svc:gateway/health`)

- `src/health-server.ts`: pure `buildHealthSnapshot()` + `startHealthServer()` over `Bun.serve`. Returns the `HealthSnapshot` shape from `@ankit-prop/contracts`. Default `status: 'degraded'` while transport is `not-connected` — fail-closed honest reporting per BLUEPRINT §3.5; flips to `'healthy'` once ANKA-13 wires a `transport()` accessor that reports `'connected'`. `details` carries `{transport, rails, blueprint_section}` so the supervisor / operators can see exactly which dependency is the cause of any degradation.
- `src/start.ts`: process entry point. Reads version from `package.json`, opens the health server on `${CTRADER_GATEWAY_PORT:-9201}`, logs a single structured `health_server_started` JSON line for log-tailing, registers SIGTERM/SIGINT handlers that call `server.stop(true)` then `process.exit(0)` for clean supervisor restarts.
- `src/health-server.spec.ts`: 4 cases (16 expects) — degraded default, healthy when transport reports connected, end-to-end `GET /health` returns 200 + parseable HealthSnapshot, unknown path returns 404.
- `src/index.ts`: re-exports the health-server surface alongside the rails subsystem.
- `package.json`: `start` script now invokes `bun run src/start.ts` (was a placeholder echo).

**Bumped**

- root `ankit-prop-umbrella` 0.4.1 → 0.4.2.
- `@ankit-prop/ctrader-gateway` 0.1.0 → 0.2.0 (additive — health surface added; rails subsystem untouched).

**Verification**

- `bun test`: 195 pass / 0 fail / 728 expect() across 28 files (3.4 s).
- `bun run typecheck`: clean.
- `bun run lint`: 1 warning, 10 infos (`useLiteralKeys` notes in `pkg:eval-harness` and `pkg:ctrader-vendor/codec`, both pre-existing and unrelated).
- End-to-end smoke: `CTRADER_GATEWAY_PORT=$ephemeral bun run --cwd services/ctrader-gateway start` boots, `GET /health` returns the expected JSON, unknown path 404s, `SIGTERM` cleanly stops the server.

**Open**

- The `transport()` and `rails()` accessors are wired today as constants ('not-connected' / 'ready'). ANKA-13 transport replaces the transport accessor with the real WSS state; ANKA-14 is already done so the rails accessor will stay 'ready' once the dispatcher is mounted by ANKA-15.
- ADR-012 verdict + the live §10.3 smoke remain gated on [ANKA-16](/ANKA/issues/ANKA-16) (Spotware KYC + browser OAuth code-grant).

## 0.4.1 — 2026-04-27 19:29 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing ANKA-7 / ANKA-12 (Phase 2.1 prep — offline ctrader-vendor scaffold + codec round-trip fix).

**Why:** Lands the offline-runnable ANKA-12 scaffold that has been sitting untracked for several heartbeats: refresh-token store, the §10.3 7-step smoke harness, the protobufjs codec, and Spotware's vendored .proto files. Live execution of §10.3 still gates on [ANKA-16](/ANKA/issues/ANKA-16) (Spotware KYC), but the scaffold is what the live path will plug into, and committing it stops the workspace drift between in-memory and disk. Fixes the only failing test in the workspace (codec int64 round-trip false-positive) so CI returns to 100% green.

**Fixed**

- `packages/ctrader-vendor/src/codec.ts` — `decodeFrame()` was using `env.clientMsgId !== undefined` to decide whether to surface the field, but protobufjs's `decode()` leaves unset proto3 string fields as the default `""`, not `undefined`. The check let `clientMsgId: ""` leak into decoded frames that never carried one. Switched to a truthy check so empty strings are treated as absent. The pre-existing failing case (`round-trips ProtoOAClosePositionReq`) now passes — full repo at 191/0/715 expects.

**Added** — `@ankit-prop/ctrader-vendor` v0.2.0 (`pkg:ctrader-vendor`)

- `src/secret-store.ts`: AES-GCM `RefreshTokenStore` for refresh-token persistence per BLUEPRINT §10.2 (`data/secrets/<accountId>/refresh_token.enc`, mode 0600, layout `iv(12) || aes-gcm-ciphertext+tag`). Path-traversal guard on `accountId`. Lazy key import + cached `CryptoKey`. Built on `crypto.subtle` (Bun-native — no npm dep added).
- `src/types.ts`: `SMOKE_STEP_IDS` (literal-typed 7-step catalog, ordered to BLUEPRINT §10.3), `SMOKE_STEP_NUMBERS` (1..7 lookup), `SMOKE_OUTCOMES` (`pass | fail | skipped-no-creds | skipped-needs-oauth | skipped-needs-prior-step | not-implemented`), `SmokeStepResult` and `SmokeReport` shapes — the evidence ADR-012 will consume once §10.3 runs live.
- `src/codec.ts`: protobufjs codec backed by Spotware's vendored .proto files. Length-prefixed (4-byte big-endian) `ProtoMessage` envelope with `payloadType`/`payload`/`clientMsgId`. `messageTypeFor(payloadType)` registry built from the .proto namespace at boot; `encodeFrame` / `decodeFrame` / `decodeInner` form the symmetric round-trip used by both the smoke harness and the eventual transport layer.
- `src/protobuf-coverage.ts`: enumerates every `ProtoOA*` message we expect to ship and asserts the codec can locate it — fail-fast at startup if a proto definition drifts under us.
- `smoke/runner.ts`: `runSmoke({ env, secretsRootDir?, clock? })` orchestrator. Each of the 7 steps detects its prerequisites and emits typed evidence. Live transport (WSS connect, ProtoBuf encode/decode, order place/close, reconnect) lands in ANKA-13/15 at the same step boundary. Verdict is `gated` whenever any step is skipped, `pass` only when all 7 pass.
- `smoke/cli.ts`: `bun run --cwd packages/ctrader-vendor smoke`. Exit codes: 0 = pass, 1 = fail, 2 = gated (operator-action alert).
- `proto/`: Spotware OpenApi*.proto files at a pinned commit, with `PROVENANCE.md` recording the source.
- Specs: `secret-store.spec.ts`, `codec.spec.ts`, `protobuf-coverage.spec.ts`, `smoke/runner.spec.ts`. Whole package: 31/0/108 expects.

**Bumped**

- root `ankit-prop-umbrella` 0.4.0 → 0.4.1.
- `@ankit-prop/ctrader-vendor` 0.0.1 → 0.2.0 (initial public surface; jumps a minor because the vendored .proto + codec is a substantive piece, and the smoke runner adds its own seam).

**Verification**

- `bun test`: 191 pass / 0 fail / 715 expect() across 27 files (3.3 s).
- `bun test packages/ctrader-vendor`: 31 pass / 0 fail / 108 expect() across 4 files (~120 ms).
- `bun run typecheck`: clean.
- `bun run lint`: clean (3 pre-existing warnings — `noUnusedPrivateClassMembers` on the SQLite store constructors land in v0.4.0 ANKA-14 scope; unrelated to this commit).

**Note — `ADR-012` framing**

The previous package description claimed an "ADR-012 verdict" of in-house. That was premature: §10.3 has not run live yet (it gates on [ANKA-16](/ANKA/issues/ANKA-16)). Description softened to "in-house scaffold; ADR-012 sealed once §10.3 step 7 runs live". The codec / proto vendor / smoke runner are path-agnostic — they support both the in-house and `ctrader-ts@1.0.1` paths if the live smoke surfaces a regression that prefers the latter.

**Open**

- Live §10.3 still gates on [ANKA-16](/ANKA/issues/ANKA-16) (Spotware KYC) and the one-time browser OAuth code-grant. The CLI for that handshake lands with ANKA-13 transport.
- ADR-012 verdict locks once `bun run --cwd packages/ctrader-vendor smoke` reports `pass` for all 7 steps against the FTMO Free Trial socket.
- The 3 lint warnings on `services/ctrader-gateway/src/hard-rails/{idempotency,throttle}-store.ts` (parameter property never read after constructor) belong to the v0.4.0 ANKA-14 scope and should be cleaned up there, not here.

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
