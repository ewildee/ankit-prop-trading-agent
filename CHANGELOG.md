# Changelog

All notable changes to this project. Newest first. Times are HH:MM 24-h **Europe/Amsterdam** (operator clock; this machine's local time). Service-runtime audit-log timestamps live in **Europe/Prague** (FTMO server clock) and are not the same axis.

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
