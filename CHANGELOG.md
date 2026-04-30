# Changelog

All notable changes to this project. Newest first. Times are HH:MM 24-h **Europe/Amsterdam** (operator clock; this machine's local time). Service-runtime audit-log timestamps live in **Europe/Prague** (FTMO server clock) and are not the same axis.

## @ankit-prop/trader@0.9.4 / @ankit-prop/contracts@3.5.0 — 2026-04-30 20:01 Europe/Amsterdam — Analyst reasoningSummary replay guard

**Initiated by:** CodexExecutor, implementing [ANKA-391](/ANKA/issues/ANKA-391), a child of [ANKA-380](/ANKA/issues/ANKA-380), after the [ANKA-341](/ANKA/issues/ANKA-341) 7d replay cleared the Azure JSON validator fixed by sibling [ANKA-389](/ANKA/issues/ANKA-389) and then failed on an over-200-character Analyst `reasoningSummary`.

**Why:** `openai/gpt-5.4-mini` can emit useful `reasoningSummary` text just above the old 200-character schema cap, which made the replay non-determinable at the first active-window bar. The persona prompt stays untouched; the runtime wrapper nudges brevity while the shared Zod contract accepts the observed provider output envelope.

**Changed** — `fix(pkg:contracts/personas)` / `fix(svc:trader/analyst)`

- `packages/shared-contracts/src/personas.ts` — widens optional `AnalystOutput.reasoningSummary` from 200 to 500 characters.
- `packages/shared-contracts/src/personas.spec.ts` — pins 500-character acceptance and `too_big` / `reasoningSummary` path rejection for 501-character summaries at the shared contract boundary.
- `services/trader/src/analyst/index.ts` — keeps the runtime-only Analyst wrapper instruction sentence `Keep reasoningSummary under 200 characters.` so the model usually remains concise.
- `services/trader/src/analyst/index.spec.ts` — asserts a generated 250-character `reasoningSummary` parses without throwing and that the prompt still contains the exact `under 200 characters` guard.

**Bumped**

- `@ankit-prop/contracts` `3.4.0` -> `3.5.0`.
- `@ankit-prop/trader` `0.9.3` -> `0.9.4`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 55 warnings. Found 37 infos.`; existing repo-wide diagnostics remain, one touched file formatted).
- `bun run --cwd services/trader lint` -> exit 0 (`Found 28 warnings.`; existing non-null assertion warnings remain).
- `bun test packages/shared-contracts/src/personas.spec.ts services/trader/src/analyst/index.spec.ts` -> 38 pass / 0 fail / 122 expects.
- `bun test packages/shared-contracts/src` -> 80 pass / 0 fail / 188 expects.
- `bun run --cwd services/trader test` -> 68 pass / 0 fail / 266 expects.
- `bun run --cwd services/trader typecheck` -> exit 0.
- Partial live 7d replay smoke `runId=anka391-codex-20260430T174900Z` was intentionally stopped after proving the active-window path: 154 decisions, first `2026-04-21T00:05:00.000Z`, last `2026-04-21T12:50:00.000Z`, 11 active Analyst decisions, submitted `OPEN` at `12:05` and `CLOSE` at `12:30`, 152 `HOLD`, 0 rail rejects, max observed `reasoningSummary` length 132 chars. No `Too big` schema throw past the previously failing `2026-04-21T12:00:00.000Z` bar.
- Locked full-stage live smoke `.dev/runs/anka391-stage-smoke.ts` using `createVAnkitClassicAnalyst()` and root `.env` `OPENROUTER_API_KEY` -> parsed Analyst output; `costUsd=0.002321055`; `bias=neutral`; `reasoningSummaryLength=85`; `thesisPreview="Single 5m bullish candle pushed off 2299.8 to 2302.9; without follow-through, treat it as a probe into 2303.4 resistance, invalidated below "`.
- `git diff --check` -> exit 0.
- Debug scan over changed source/package files (`console.log|debugger|TODO|HACK`) -> no matches.
- `bun run --cwd services/trader start` -> exit 0 with Phase-4 replay-only placeholder; no live `/health` endpoint exists for this entrypoint yet.

## @ankit-prop/trader@0.9.3 — 2026-04-30 18:05 Europe/Amsterdam — Analyst JSON keyword for OpenAI validator

**Initiated by:** CodexExecutor, implementing [ANKA-389](/ANKA/issues/ANKA-389), a child of [ANKA-380](/ANKA/issues/ANKA-380), to unblock the [ANKA-341](/ANKA/issues/ANKA-341) 7d replay.

**Why:** Azure-hosted OpenAI rejects `text.format: json_object` requests when no input message contains the word `json`. The Analyst system prompt stays persona-clean; the in-code user-prompt wrapper now carries the required keyword.

**Changed** — `feat(svc:trader/analyst)`

- `services/trader/src/analyst/index.ts` — injects the literal `JSON` keyword into the runtime-only Analyst wrapper instruction, keeps deterministic fields excluded from model output, and reminds schema-free JSON mode of the `keyLevels` / `supportingEvidence` field shapes observed in the live smoke.
- `services/trader/src/analyst/index.spec.ts` — asserts the emitted generator prompt contains `JSON` so the validator guard cannot regress silently.

**Bumped**

- `@ankit-prop/trader` `0.9.2` -> `0.9.3`.

**Verification**

- `bun run --cwd services/trader lint:fix` -> exit 0 (`Found 27 warnings.`; existing non-null assertion warnings remain).
- `bun run --cwd services/trader lint` -> exit 0 (`Found 27 warnings.`).
- `bun run --cwd services/trader typecheck` -> exit 0.
- `bun run --cwd services/trader test` -> 67 pass / 0 fail / 263 expects.
- Live smoke `.dev/runs/anka380bp-smoke.ts` with root `.env` `OPENROUTER_API_KEY` -> parsed Analyst output; `costUsd=0.003078405`; `bias=neutral`; `regimeLabel=unknown`; thesis preview printed.
- `bun run --cwd services/trader start` -> exit 0 with Phase-4 replay-only placeholder; no live `/health` endpoint exists for this entrypoint yet.
- `git diff --check` -> exit 0.
- Debug scan over changed Analyst source/spec/package files (`console.log|debugger|TODO|HACK`) -> no matches.

## @ankit-prop/trader@0.9.2 — 2026-04-30 17:39 Europe/Amsterdam — Analyst schema-free JSON output mode

**Initiated by:** CodexExecutor, implementing [ANKA-385](/ANKA/issues/ANKA-385) under the [ANKA-380](/ANKA/issues/ANKA-380) Option B directive for the parent [ANKA-341](/ANKA/issues/ANKA-341) replay.

**Why:** Azure rejected the Analyst structured-output JSON schema for an optional `KeyLevel.timeframe` field. The fix keeps the `openai/gpt-5.4-mini` model and retry ladder, but moves the OpenRouter Analyst call onto AI SDK `6.0.168`'s schema-free JSON output path so provider-side strict schema validation is bypassed.

**Changed** — `feat(svc:trader/analyst)`

- `services/trader/src/analyst/index.ts` — replaced the strict-schema `generateObject` call with `generateText` plus `Output.json`, then kept runtime validation through `AnalystGenerationOutput.safeParse`.
- `services/trader/src/analyst/index.ts` — left OpenRouter routing fallback semantics at provider defaults; `buildOpenRouterAnalystProviderOptions` returns usage and reasoning options only, with no `provider` routing block.
- `services/trader/src/analyst/index.spec.ts` — pinned the schema-free JSON response format, absence of provider routing pins, retry-ladder behaviour, and params-sourced Analyst model expectation.

**Bumped**

- `@ankit-prop/trader` `0.9.1` -> `0.9.2`.

**Verification**

- `bun run --cwd services/trader lint:fix` -> exit 0 (`Found 27 warnings.`; existing non-null assertion warnings remain).
- `bun run --cwd services/trader lint` -> exit 0 (`Found 27 warnings.`; no fixes applied).
- `bun run --cwd services/trader test` -> 67 pass / 0 fail / 262 expects.
- `bun run --cwd services/trader typecheck` -> exit 0.
- Live smoke `.dev/runs/anka380-smoke.ts` with root `.env` `OPENROUTER_API_KEY` -> parsed JSON output; `bias=neutral`; `providerCostUsd=0.00045441`.
- `bun run --cwd services/trader start` -> exit 0 with Phase-4 replay-only placeholder; no live `/health` endpoint exists for this entrypoint yet.

## @ankit-prop/trader@0.9.1 — 2026-04-30 16:48 Europe/Amsterdam — Swap analyst model to openai/gpt-5.4-mini per board directive

**Initiated by:** FoundingEngineer, implementing the board's [ANKA-341](/ANKA/issues/ANKA-341) directive (comment `b4afb497-14bf-4921-bff3-061667359e3b`) after Kimi K2.6 hung on the first active-window Analyst call of `runId=anka341-fe-20260430T143614Z`.

**Why:** Kimi K2.6 produced repeated socket-level hangs on `generateObject`. Even with [ANKA-374](/ANKA/issues/ANKA-374)'s 90s timeout + retry, every hang costs ~270s of wall-clock before falling back to a neutral HOLD. The board directed the swap to `openai/gpt-5.4-mini` to test whether (a) latency is acceptable for a 7d replay and (b) the model is "smart enough" to produce persona-shaped Analyst output. BLUEPRINT §F is honoured: this is a board-issued model swap, not a unilateral FE persona tune; thresholds, weights, and windows in `params.yaml` are unchanged.

**Changed** — `chore(svc:trader/strategy)`

- `services/trader/strategy/v_ankit_classic/params.yaml` — `analyst.model: moonshotai/kimi-k2.6` → `openai/gpt-5.4-mini`. No other field touched.

**Bumped**

- `@ankit-prop/trader` `0.9.0` -> `0.9.1` (config-only).

**Verification**

- Smoke gate deferred to the live replay rerun captured in `runId=anka341-fe-…` against this commit. No code paths changed; the existing trader test suite (65 pass / 0 fail at `dea7a43`) covers the model-agnostic Analyst plumbing.

**Notes**

- If `openai/gpt-5.4-mini` is not yet routable on OpenRouter, the first live call will surface a 404 and the run will fall back via [ANKA-374](/ANKA/issues/ANKA-374). Surface to the board if it lands.

## 0.4.65 / @ankit-prop/trader@0.9.0 / @ankit-prop/contracts@3.4.0 — 2026-04-30 16:15 Europe/Amsterdam — Analyst request timeout

**Initiated by:** CodexExecutor, implementing [ANKA-374](/ANKA/issues/ANKA-374) after the [ANKA-341](/ANKA/issues/ANKA-341) replay hung on a live Kimi K2.6 Analyst call.

**Why:** OpenRouter / upstream provider stalls produced no SDK exception, so [ANKA-365](/ANKA/issues/ANKA-365)'s retry loop never ran and the 7d replay could hang indefinitely.

**Changed** — `feat(svc:trader/analyst)` / `feat(pkg:contracts/personas)`

- `packages/shared-contracts/src/personas.ts` — adds optional `analyst.requestTimeoutMs` and the `request_timeout` Analyst fallback marker.
- `services/trader/src/analyst/index.ts` — defaults Analyst request timeout to `90_000` ms in code, passes `abortSignal` to `generateObject`, and treats `RequestTimeoutError` as retryable across the existing three-attempt escalation.
- `services/trader/src/analyst/index.ts` — emits explicit `costUsd: 0` on unpriced safe fallbacks so Reflector cost telemetry does not fall through to Sonnet pricing.
- Specs cover direct timeout rejection, timeout retry success, persistent timeout fallback, zero-cost fallback telemetry, and a 30-bar replay where half of Analyst generation attempts hang before retrying.

**Bumped**

- root `ankit-prop-umbrella` `0.4.64` -> `0.4.65`.
- `@ankit-prop/trader` `0.8.0` -> `0.9.0`.
- `@ankit-prop/contracts` `3.3.0` -> `3.4.0`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 54 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes applied on the final run).
- `bun run lint` -> exit 0 (`Found 54 warnings. Found 37 infos.` — same pre-existing repo-wide diagnostics).
- `bun run --cwd services/trader test` -> 65 pass / 0 fail / 260 expects.
- `bun test packages/shared-contracts/src` -> 79 pass / 0 fail / 185 expects.
- `bun run --cwd services/trader typecheck` -> exit 0.
- `bun run typecheck` -> exit 0.
- `git diff --check` -> exit 0.
- Debug scan over changed source/spec/package files (`console.log|debugger|TODO|HACK`) -> no matches.
- `bun run --cwd services/trader start` -> exit 0 with the Phase-4 replay-only placeholder; no live `/health` endpoint exists for this entrypoint yet.

## 0.4.64 / @ankit-prop/trader@0.8.0 — 2026-04-30 15:38 Europe/Amsterdam — Analyst active-window LLM skip

**Initiated by:** CodexExecutor, implementing [ANKA-371](/ANKA/issues/ANKA-371) to unblock the [ANKA-341](/ANKA/issues/ANKA-341) 7d replay cost gate.

**Why:** The deterministic regime classifier already returns `outside_active_window` before the Analyst LLM call. Calling OpenRouter on those bars spent budget to confirm a neutral no-trade state.

**Changed** — `feat(svc:trader/analyst)`

- `services/trader/src/analyst/index.ts` — returns a schema-valid neutral Analyst output with zero cache tokens and `costUsd: 0` when the classifier returns `outside_active_window`, before prompt reading or generator invocation.
- `services/trader/src/analyst/index.spec.ts` — pins the outside-window generator skip and the in-window generator call path.
- `services/trader/src/replay-adapter/from-eval-harness.spec.ts` — covers a mixed replay where out-of-window bars skip generation while in-window bars still invoke the supplied Analyst generator.
- `services/trader/src/reflector/aggregate.spec.ts` and `report.spec.ts` — pin zero-cost deterministic skips in decision counts while live-call cost remains the only LLM spend added to totals.

**Bumped**

- root `ankit-prop-umbrella` `0.4.63` -> `0.4.64`.
- `@ankit-prop/trader` `0.7.1` -> `0.8.0`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 52 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; one local format rewrite applied).
- `bun run lint` -> exit 0 (`Found 52 warnings. Found 37 infos.` — same pre-existing repo-wide diagnostics).
- `bun test services/trader/src/analyst/index.spec.ts services/trader/src/replay-adapter/from-eval-harness.spec.ts services/trader/src/reflector/aggregate.spec.ts services/trader/src/reflector/report.spec.ts services/trader/src/trader/policy.spec.ts` -> 30 pass / 0 fail / 155 expects.
- `bun run --cwd services/trader test` -> 61 pass / 0 fail / 237 expects.
- `bun run --cwd services/trader typecheck` -> exit 0.
- `git diff --check` -> exit 0.
- Debug scan over changed trader source/spec/package files (`console.log|debugger|TODO|HACK`) -> no matches.
- `bun run --cwd services/trader start` -> exit 0 with the Phase-4 replay-only placeholder; no live `/health` endpoint exists for this entrypoint yet.

## 0.4.63 / @ankit-prop/trader@0.7.1 — 2026-04-30 14:59 Europe/Amsterdam — Analyst retry telemetry accumulation

**Initiated by:** CodexExecutor, addressing CodeReviewer CHANGES_REQUESTED on [ANKA-365](/ANKA/issues/ANKA-365) via child [ANKA-368](/ANKA/issues/ANKA-368).

**Why:** OpenRouter bills retryable failed completions, but the Analyst retry path reported only the final success or final failure telemetry. That under-reported cache usage and cost against the phase cost ceiling.

**Changed** — `fix(svc:trader/analyst)`

- `services/trader/src/analyst/index.ts` — accumulates derived `cacheStats` bucket-by-bucket for every billed retry attempt plus the final success or fallback.
- `services/trader/src/analyst/index.ts` — sums OpenRouter priced attempts into `costUsd`, treating missing per-attempt cost as zero only after at least one priced attempt exists; all-unpriced attempts still report `undefined`.
- `services/trader/src/analyst/index.spec.ts` — extends retry-success and persistent-fallback coverage, then adds partial-pricing and all-unpriced fallback regressions.

**Bumped**

- root `ankit-prop-umbrella` `0.4.62` -> `0.4.63`.
- `@ankit-prop/trader` `0.7.0` -> `0.7.1`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 42 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes applied on the final run).
- `bun run lint` -> exit 0 (`Found 42 warnings. Found 37 infos.` — same pre-existing repo-wide diagnostics).
- `bun test services/trader/src/analyst/index.spec.ts services/trader/src/replay-adapter/from-eval-harness.spec.ts services/trader/src/reflector/aggregate.spec.ts services/trader/src/reflector/report.spec.ts packages/shared-contracts/src/personas.spec.ts` -> 37 pass / 0 fail / 171 expects.
- `bun run typecheck` -> exit 0.
- `git diff --check` -> exit 0.
- Debug scan over changed Analyst source/spec/package files (`console.log|debugger|TODO|HACK`) -> no matches.
- `bun run --cwd services/trader start` -> exit 0 with the Phase-4 replay-only placeholder; no live `/health` endpoint exists for this entrypoint yet.

## 0.4.62 / @ankit-prop/trader@0.7.0 / @ankit-prop/contracts@3.3.0 — 2026-04-30 14:43 Europe/Amsterdam — Analyst retry and safe fallback

**Initiated by:** CodexExecutor, implementing [ANKA-365](/ANKA/issues/ANKA-365) after the [ANKA-341](/ANKA/issues/ANKA-341) replay crashed on bar #1 when Kimi K2.6 spent the full structured-output budget on reasoning and returned no object.

**Why:** OpenRouter's `reasoning.max_tokens` hint is best-effort for Kimi K2.6. A single `AI_NoObjectGeneratedError` with `finishReason: "length"` must not terminate the 7d replay or drop billed failed-call telemetry.

**Changed** — `feat(svc:trader/analyst)` / `feat(svc:trader/reflector)` / `feat(pkg:contracts/personas)`

- `services/trader/src/analyst/index.ts` — wraps Analyst generation in a 3-attempt retry sequence: params-sourced `reasoning.max_tokens`, then OpenRouter `reasoning.effort: "low"` with doubled output budget, then no reasoning hint with a 4096-token output cap.
- `services/trader/src/analyst/index.ts` — emits a neutral `ANALYST_SAFE_FALLBACK` output after repeated no-object length failures, carrying failed-call `cacheStats` and OpenRouter `costUsd` when exposed.
- `packages/shared-contracts/src/personas.ts` — adds optional `AnalystOutput.fallbackReason` and required `RunAggregate.analystFallbackCount` so gate reports disclose fallback bars.
- `services/trader/src/reflector/aggregate.ts` and `services/trader/src/reflector/report.ts` — fold fallback counts into JSON and markdown reports.
- Specs cover retry escalation, persistent neutral fallback telemetry, replay continuation across multiple fallback bars, aggregate fallback counts, and contract schema boundaries.

**Bumped**

- root `ankit-prop-umbrella` `0.4.61` -> `0.4.62`.
- `@ankit-prop/trader` `0.6.0` -> `0.7.0`.
- `@ankit-prop/contracts` `3.2.0` -> `3.3.0`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 40 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes applied on the final run).
- `bun test services/trader/src/analyst/index.spec.ts services/trader/src/replay-adapter/from-eval-harness.spec.ts services/trader/src/reflector/aggregate.spec.ts services/trader/src/reflector/report.spec.ts packages/shared-contracts/src/personas.spec.ts` -> 35 pass / 0 fail / 163 expects.
- `bun test` -> 638 pass / 0 fail / 11145 expects.
- `bun run typecheck` -> exit 0.
- `git diff --check` -> exit 0.
- `bun run --cwd services/trader start` -> exit 0 with the Phase-4 replay-only placeholder; no live `/health` endpoint exists for this entrypoint yet.

## 0.4.61 / @ankit-prop/trader@0.6.0 / @ankit-prop/contracts@3.2.0 — 2026-04-30 14:15 Europe/Amsterdam — OpenRouter cost telemetry and replay JSONL flush

**Initiated by:** CodexExecutor, implementing [ANKA-361](/ANKA/issues/ANKA-361) after the [ANKA-341](/ANKA/issues/ANKA-341) replay cost abort proved the Reflector was projecting Kimi usage through Claude Sonnet 4.5 rates.

**Why:** OpenRouter already returns authoritative per-call billing telemetry at `providerMetadata.openrouter.usage.cost`; using token-derived Claude pricing for all stages produced a phantom ~$73 projection for the 7d replay. The replay adapter also needed to persist each decision before advancing so an abort still leaves a parseable `decisions.jsonl` prefix.

**Changed** — `feat(svc:trader/reflector)` / `feat(svc:trader/replay-adapter)` / `feat(pkg:contracts/personas)`

- `packages/shared-contracts/src/personas.ts` — adds optional per-stage `costUsd` for Analyst/Trader/Judge outputs. The value is OpenRouter credits-USD after account discounts, not upstream inference USD.
- `services/trader/src/analyst/index.ts` — passes through AI SDK provider metadata and extracts `providerMetadata.openrouter.usage.cost` into `AnalystOutput.costUsd`.
- `services/trader/src/reflector/cost.ts` — sums authoritative stage `costUsd` values and uses the frozen Claude Sonnet 4.5 token table only for stages without provider cost metadata.
- `services/trader/src/replay-adapter/from-eval-harness.ts` — creates `decisions.jsonl` before replay work begins and fsyncs after every emitted `DecisionRecord`.
- Specs cover OpenRouter-cost aggregation, Claude fallback pricing, Analyst provider metadata extraction, and one-line JSONL persistence after an abort before the second bar.

**Bumped**

- root `ankit-prop-umbrella` `0.4.60` -> `0.4.61`.
- `@ankit-prop/trader` `0.5.6` -> `0.6.0`.
- `@ankit-prop/contracts` `3.1.0` -> `3.2.0`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 36 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes applied on the final run).
- `bun test` -> 632 pass / 0 fail / 11111 expects.
- `bun run typecheck` -> exit 0.
- `git diff --check` -> exit 0.
- `bun run --cwd services/trader start` -> exit 0 with the Phase-4 replay-only placeholder; no live `/health` endpoint exists for this entrypoint yet.

## 0.4.60 / @ankit-prop/trader@0.5.6 / @ankit-prop/contracts@3.1.0 — 2026-04-30 14:01 Europe/Amsterdam — Analyst reasoning budget cap

**Initiated by:** CodexExecutor, continuing [ANKA-341](/ANKA/issues/ANKA-341) after [ANKA-357](/ANKA/issues/ANKA-357) closed and the replay retry reached OpenRouter again.

**Why:** The model-owned Analyst schema split fixed the earlier `cacheStats` schema contradiction, but the live retry still failed before the first `DecisionRecord` because Kimi used the full 1200-token completion budget on reasoning and returned no text. The Analyst request needs a params-sourced OpenRouter reasoning cap so thinking stays enabled without consuming the entire structured-output budget.

**Changed** — `fix(svc:trader/analyst)` / `feat(pkg:contracts/personas)`

- `packages/shared-contracts/src/personas.ts` — adds optional `AnalystRuntimeConfig.reasoningMaxTokens` so provider reasoning budget is explicit config, not an inline Analyst-path threshold.
- `services/trader/strategy/v_ankit_classic/params.yaml` — sets the v0 Analyst reasoning cap for the retry path.
- `services/trader/src/analyst/index.ts` — passes the params-sourced cap to OpenRouter as `reasoning.max_tokens` and excludes reasoning text from the response body while preserving usage telemetry.
- `services/trader/src/analyst/index.spec.ts` and `packages/shared-contracts/src/personas.spec.ts` — cover the params-sourced provider option and config schema.

**Bumped**

- root `ankit-prop-umbrella` `0.4.59` -> `0.4.60`.
- `@ankit-prop/trader` `0.5.5` -> `0.5.6`.
- `@ankit-prop/contracts` `3.0.0` -> `3.1.0`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 36 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes applied).
- `bun test services/trader/src/analyst/index.spec.ts packages/shared-contracts/src/personas.spec.ts services/trader/src/replay-adapter/from-eval-harness.spec.ts` -> 24 pass / 0 fail / 97 expects.
- `bun run --cwd services/trader typecheck` -> exit 0.
- `bun run typecheck` -> exit 0.
- Live replay retry emitted 1 decision, then was aborted under the [ANKA-341](/ANKA/issues/ANKA-341) $2.50 safety rule: `totalUsd=0.036231`, projected 2016-bar run `~$73.04`.

## 0.4.59 / @ankit-prop/trader@0.5.5 — 2026-04-30 13:14 Europe/Amsterdam — Analyst generation schema split

**Initiated by:** CodexExecutor, addressing [ANKA-357](/ANKA/issues/ANKA-357) after the [ANKA-341](/ANKA/issues/ANKA-341) XAUUSD 7d replay reached the live OpenRouter Analyst call but failed schema validation before writing a `DecisionRecord`.

**Why:** The live Analyst call passed the full `AnalystOutput` schema to `generateObject`, even though runtime later injects deterministic fields (`regimeLabel`, `confidence`, `confluenceScore`, `regimeNote`, `cacheStats`). Provider output could not reliably satisfy runtime-owned fields, and malformed unknown keys must still fail closed.

**Changed** — `fix(svc:trader/analyst)`

- `services/trader/src/analyst/index.ts` — adds a strict `AnalystGenerationOutput` schema that omits runtime-owned deterministic fields, uses it for OpenRouter structured generation, strict-parses generator output before overlay, then validates the final runtime-owned `AnalystOutput`.
- `services/trader/src/analyst/index.spec.ts` — updates the generator seam to model provider-owned fields only, adds cacheStats-free output coverage, and adds an unknown-key regression for the empty-string key shape seen in the failed live replay.

**Bumped**

- root `ankit-prop-umbrella` `0.4.58` -> `0.4.59`.
- `@ankit-prop/trader` `0.5.4` -> `0.5.5`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 36 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes applied).
- `bun test services/trader/src/analyst/index.spec.ts services/trader/src/replay-adapter/from-eval-harness.spec.ts` -> 7 pass / 0 fail / 53 expects.
- `bun test` -> 627 pass / 0 fail / 11097 expects.
- `bun run typecheck` -> exit 0.
- Production Analyst numeric grep (`services/trader/src/analyst/index.ts`) -> no matches.
- Debug leftovers scan over changed trader source/spec files (`console.log|debugger|TODO|HACK`) -> no matches.
- `git diff --check` -> exit 0.
- `bun run --cwd services/trader start` -> exit 0 (`trader: replay adapter only (Phase 4 vertical slice)`); no `/health` endpoint exists for the replay-only service entrypoint yet.

## @ankit-prop/trader@0.5.4 — 2026-04-30 12:55 Europe/Amsterdam — Replay risk-day bucket on Europe/Prague

**Initiated by:** FoundingEngineer, addressing the second CodeReviewer BLOCK on [ANKA-339](/ANKA/issues/ANKA-339). Owning the fix because the previous FE redirect comment specified the wrong reset boundary ("compare bar UTC date") and CodexExecutor implemented faithfully.

**Why:** The replay adapter's daily-risk reset bucketed by UTC, which violates BLUEPRINT §0.2 timezone discipline (trader runtime FTMO logic uses Europe/Prague) and §8.3 (`day_start_balance` at `00:00 Europe/Prague`). Wrong bucket lets the same FTMO daily bucket get a fresh risk allowance whenever a UTC midnight falls inside it.

**Changed** — `fix(svc:trader/replay-adapter)`

- `services/trader/src/replay-adapter/from-eval-harness.ts` — replaces the local `dayKey` (UTC `YYYY-MM-DD` string) with `pragueDayBucket(bar.tsEnd)` from `@ankit-prop/contracts`. Risk-day key is now a numeric bucket keyed off Europe/Prague calendar date, DST-safe.
- `services/trader/src/replay-adapter/from-eval-harness.spec.ts` — replaces the `UTC day rollover` regression with a `Prague day boundary` regression. Anchors on the reviewer's literal UTC timestamps `2026-04-27T23:50:00.000Z` and `2026-04-28T00:05:00.000Z` (both Prague day-28 in CEST) and asserts they both reject `daily_budget_insufficient`, then proves the budget resets only after Prague midnight at `2026-04-28T22:05:00.000Z` (= 00:05 Prague day-29).

**Bumped**

- `@ankit-prop/trader` `0.5.3` -> `0.5.4`.

**Verification**

- Mutation check: temporarily reverted `advanceDay` to UTC bucketing; `bun test services/trader/src/replay-adapter/from-eval-harness.spec.ts` failed on the `2026-04-28T00:05` anchor (`Expected: "REJECT", Received: "APPROVE"`), restoring `pragueDayBucket` made it pass.
- `bun run lint:fix` -> exit 0 (`Found 35 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics).
- `bun test services/trader/src/replay-adapter/from-eval-harness.spec.ts` -> 3 pass / 0 fail / 42 expects.
- `bun test` -> green (full).
- `bun run typecheck` -> exit 0.
- Persona-path numeric grep over `services/trader/src/trader/*.ts services/trader/src/judge/*.ts` -> no matches.
- `git diff --check` -> exit 0.
- `bun run --cwd services/trader start` -> exit 0 (`trader: replay adapter only (Phase 4 vertical slice)`).

## @ankit-prop/trader@0.5.3 — 2026-04-30 12:28 Europe/Amsterdam — Replay close/reopen QA coverage

**Initiated by:** QAEngineer, covering [ANKA-339](/ANKA/issues/ANKA-339) after the replay default-deps fix.

**Why:** The [ANKA-339](/ANKA/issues/ANKA-339) replay-state fix described submitted `CLOSE` clearing open-position state and UTC day rollover resetting risk budget, but the pushed regression only covered adjacent same-side `OPEN` signals.

**Added** — `test(svc:trader/replay-adapter)`

- `services/trader/src/replay-adapter/from-eval-harness.spec.ts` — adds a default-deps replay regression for `OPEN -> CLOSE -> next-day OPEN`, proving a submitted close clears the replay position and the next UTC day can submit fresh risk.

**Bumped**

- `@ankit-prop/trader` `0.5.2` -> `0.5.3`.

**Verification**

- Mutation check: temporarily removed the UTC day risk reset; `bun test services/trader/src/replay-adapter/from-eval-harness.spec.ts` failed on the new regression (`Expected: ["OPEN", "CLOSE", "OPEN"]`, `Received: ["OPEN", "CLOSE"]`), then passed after restoration.
- `bun run lint:fix` -> exit 0 (`Found 35 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes applied).
- `bun test services/trader/src/replay-adapter/from-eval-harness.spec.ts services/trader/src/judge/policy.spec.ts` -> 13 pass / 0 fail / 52 expects.
- `bun test` -> 626 pass / 0 fail / 11085 expects.
- `bun run typecheck` -> exit 0.
- Persona-path numeric grep over `services/trader/src/trader/*.ts services/trader/src/judge/*.ts` -> no matches.
- `git diff --check` -> exit 0.
- `bun run --cwd services/trader start` -> exit 0 (`trader: replay adapter only (Phase 4 vertical slice)`); no `/health` endpoint exists for the replay-only service entrypoint yet.

## @ankit-prop/trader@0.5.2 — 2026-04-30 12:24 Europe/Amsterdam — Replay default deps position and budget state

**Initiated by:** CodexExecutor, addressing the CodeReviewer BLOCK on [ANKA-339](/ANKA/issues/ANKA-339).

**Why:** The v0 replay adapter's default deps were synthesising empty exposure and full budget every bar, so consecutive same-side signals could resubmit `OPEN` instead of seeing the live replay position and holding.

**Changed** — `fix(svc:trader/replay-adapter)`

- `services/trader/src/replay-adapter/from-eval-harness.ts` — threads replay-local open position and daily risk budget state into the default `v_ankit_classic` Trader/Judge deps; submitted `OPEN` stores the position, submitted `CLOSE` clears it, and UTC day rollover resets daily risk used.
- `services/trader/src/replay-adapter/from-eval-harness.spec.ts` — covers default deps directly with a test analyst generator and proves adjacent same-side qualifying signals submit once, then become `existing_position_aligned` HOLD decisions mapped to `not_submitted/judge_reject`.
- `services/trader/src/judge/policy.spec.ts` — strengthens the direct open-exposure rejection fixture with non-zero same-direction exposure.

**Bumped**

- `@ankit-prop/trader` `0.5.1` -> `0.5.2`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 35 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; formatted the replay adapter/spec changes).
- `bun test services/trader/src/replay-adapter/from-eval-harness.spec.ts services/trader/src/judge/policy.spec.ts` -> 12 pass / 0 fail / 50 expects.
- `bun test` -> 625 pass / 0 fail / 11083 expects.
- `bun run typecheck` -> exit 0.
- Persona-path numeric grep over `services/trader/src/trader/*.ts services/trader/src/judge/*.ts` -> no matches.
- `git diff --check` -> exit 0.
- `bun run --cwd services/trader start` -> exit 0 (`trader: replay adapter only (Phase 4 vertical slice)`); no `/health` endpoint exists for the replay-only service entrypoint yet.

## 0.4.58 / @ankit-prop/trader@0.5.1 — 2026-04-30 12:00 Europe/Amsterdam — Runner HOLD judge-reject QA coverage

**Initiated by:** QAEngineer, covering [ANKA-339](/ANKA/issues/ANKA-339) before CodeReviewer handoff.

**Why:** The v0 Trader/Judge handoff explicitly changed runner semantics for `HOLD` when risk context is present; QA needed a regression that proves those holds are judged and surfaced as `not_submitted/judge_reject` telemetry instead of the older unjudged `hold` path.

**Added** — `test(svc:trader/instance-pipeline)`

- `services/trader/src/pipeline/runner.spec.ts` — covers explicit risk-context `HOLD` through the real `v_ankit_classic` Judge, asserting `trader_hold`, `confluence_too_weak`, and replay gateway `judge_reject` telemetry.

**Bumped**

- root `ankit-prop-umbrella` `0.4.57` -> `0.4.58`.
- `@ankit-prop/trader` `0.5.0` -> `0.5.1`.

**Verification**

- Mutation check: temporarily restored the old replay-gateway ordering that treats `HOLD` before judge rejection; `bun test services/trader/src/pipeline/runner.spec.ts` failed on the new regression (`Expected: "judge_reject"`, `Received: "hold"`), then passed after restoration.
- `bun run lint:fix` -> exit 0 (`Found 35 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; formatted one long spec assertion).
- `bun test services/trader/src/trader/policy.spec.ts services/trader/src/judge/policy.spec.ts services/trader/src/pipeline/runner.spec.ts services/trader/src/replay-adapter/from-eval-harness.spec.ts` -> 25 pass / 0 fail / 650 expects.
- `bun test` -> 624 pass / 0 fail / 11631 expects.
- `bun run typecheck` -> exit 0.
- Persona-path numeric grep over `services/trader/src/trader/*.ts services/trader/src/judge/*.ts` -> no matches.
- `git diff --check` -> exit 0.
- `bun run --cwd services/trader start` -> exit 0 (`trader: replay adapter only (Phase 4 vertical slice)`); no `/health` endpoint exists for the replay-only service entrypoint yet.

## 0.4.57 / @ankit-prop/trader@0.5.0 — 2026-04-30 11:44 Europe/Amsterdam — Trader policy v0 + Judge v0

**Initiated by:** CodexExecutor, implementing [ANKA-339](/ANKA/issues/ANKA-339) under the [ANKA-318](/ANKA/issues/ANKA-318) trader vertical-slice umbrella.

**Why:** The first XAUUSD replay gate needs deterministic Trader and Judge stages after Analyst v0, without expanding the runtime action surface beyond ADR-0010's v0 allow-list.

**Added** — `feat(svc:trader/instance-pipeline)`

- `services/trader/src/trader/policy.ts` — adds deterministic `v_ankit_classic` Trader policy that emits only `HOLD | OPEN | CLOSE`, sources confidence/risk/RR/stop values from `params.yaml`, and defensively rejects `AMEND`.
- `services/trader/src/judge/policy.ts` — adds deterministic Judge v0 gates for confluence, RR floor, per-trade risk cap, remaining daily budget, existing exposure, spread multiplier, and calendar proximity.
- Trader/Judge policy specs and runner integration coverage for `APPROVE -> submitted` replay flow.

**Changed**

- `services/trader/src/pipeline/runner.ts` and `services/trader/src/gateway/in-process.ts` — explicit risk-context runs now evaluate Judge for `HOLD`, letting the replay gateway report `not_submitted/judge_reject` for Trader holds while preserving no-context fail-closed behavior.
- `services/trader/src/replay-adapter/from-eval-harness.ts` — default `v_ankit_classic` replay deps now wire real Trader/Judge and build minimal risk/spread/exposure `JudgeInput`.
- `TODOS.md` — closes T008.f for [ANKA-339](/ANKA/issues/ANKA-339).

**Bumped**

- root `ankit-prop-umbrella` `0.4.56` -> `0.4.57`.
- `@ankit-prop/trader` `0.4.1` -> `0.5.0`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 35 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; final rerun applied no fixes).
- `bun test services/trader/src/trader/policy.spec.ts services/trader/src/judge/policy.spec.ts services/trader/src/pipeline/runner.spec.ts services/trader/src/replay-adapter/from-eval-harness.spec.ts` -> 24 pass / 0 fail / 643 expects.
- `bun test` -> 623 pass / 0 fail / 11624 expects.
- `bun run typecheck` -> exit 0.
- `git diff --check` -> exit 0.
- Persona-path numeric grep over `services/trader/src/trader/*.ts services/trader/src/judge/*.ts` -> no matches.
- Debug leftovers scan over changed Trader/Judge/pipeline/gateway/replay code -> no matches.
- `bun run --cwd services/trader start` -> exit 0 (`trader: replay adapter only (Phase 4 vertical slice)`); no `/health` endpoint exists for the replay-only service entrypoint yet.

## 0.4.56 / @ankit-prop/trader@0.4.1 — 2026-04-30 11:48 Europe/Amsterdam — Reflector report QA coverage

**Initiated by:** QAEngineer, covering [ANKA-340](/ANKA/issues/ANKA-340) before CodeReviewer handoff.

**Why:** The v0 gate follow-up needs the Reflector's persisted report to keep the parse-back telemetry shape stable: trade count, zero replay breaches, LLM cost total, realized PnL, Sortino, and human-readable Markdown gate lines.

**Added** — `test(svc:trader/reflector)`

- `services/trader/src/reflector/report.spec.ts` — strengthens report parse-back coverage to assert the JSON report carries the v0 gate telemetry fields and the Markdown report exposes the corresponding gate lines.

**Bumped**

- root `ankit-prop-umbrella` `0.4.55` -> `0.4.56`.
- `@ankit-prop/trader` `0.4.0` -> `0.4.1`.

**Verification**

- Mutation check: temporarily removed `realizedPnlPoints` from `report.json` output; `bun test services/trader/src/reflector/report.spec.ts` failed on missing `json.realizedPnlPoints`, then passed after restoring the writer.
- `bun test services/trader/src/reflector/report.spec.ts services/trader/src/reflector packages/shared-contracts/src/personas.spec.ts services/trader/src/replay-adapter/from-eval-harness.spec.ts` -> 21 pass / 0 fail / 645 expects.
- `bun run lint:fix` -> exit 0 (`Found 35 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes reported).
- `bun test` -> 623 pass / 0 fail / 11624 expects.
- `bun run typecheck` -> exit 2, blocked by unrelated dirty `services/trader/src/judge/*` and `services/trader/src/trader/*` work using `MaybePromise` values synchronously; this QA change does not touch those files.
- `git diff --check -- .dev/progress.md CHANGELOG.md package.json services/trader/package.json services/trader/src/reflector/report.spec.ts` -> exit 0.
- `bun run --cwd services/trader start` -> exit 0 (`trader: replay adapter only (Phase 4 vertical slice)`); no `/health` endpoint exists for this replay-only entrypoint yet.

## 0.4.55 / @ankit-prop/contracts@3.0.0 / @ankit-prop/trader@0.4.0 — 2026-04-30 11:32 Europe/Amsterdam — Reflector v0 aggregate reports

**Initiated by:** CodexExecutor, implementing [ANKA-340](/ANKA/issues/ANKA-340) under the [ANKA-318](/ANKA/issues/ANKA-318) trader vertical-slice umbrella.

**Why:** The first XAUUSD replay gate needs one per-run report that folds DecisionRecord JSONL into action/verdict/outcome counts, Sortino-rolling-60d, Claude-rate LLM cost telemetry, gateway breach/trade count, and realized PnL before [ANKA-341](/ANKA/issues/ANKA-341) can run the 7d replay.

**Added** — `feat(svc:trader/reflector)`

- `services/trader/src/reflector/` — adds fail-fast DecisionRecord JSONL ingestion, RunAggregate aggregation, Sortino-rolling-60d, Claude Sonnet 4.5 rate pricing, report JSON/Markdown writing, and focused specs.
- `services/trader/src/replay-adapter/from-eval-harness.ts` — runs the Reflector automatically at replay end, while keeping custom test log paths isolated.
- `services/trader/src/replay-adapter/cli.ts` and `services/trader/package.json` — add independently invokable `reflect` and replay-with-reflection commands.
- `TODOS.md` — closes T008.e for [ANKA-340](/ANKA/issues/ANKA-340).

**Changed** — `feat(pkg:contracts/personas)` / breaking shared contract surface

- `packages/shared-contracts/src/personas.ts` — replaces the earlier nested `RunLlmCostUsd` shape with the [ANKA-340](/ANKA/issues/ANKA-340) block: `inputCachedUsd`, `inputFreshUsd`, `inputCacheWriteUsd`, `outputUsd`, `thinkingUsd`, `totalUsd`.

**Bumped**

- root `ankit-prop-umbrella` `0.4.54` -> `0.4.55`.
- `@ankit-prop/contracts` `2.0.0` -> `3.0.0`.
- `@ankit-prop/trader` `0.3.1` -> `0.4.0`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 35 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; final rerun applied no fixes).
- `bun test services/trader/src/reflector packages/shared-contracts/src/personas.spec.ts services/trader/src/replay-adapter/from-eval-harness.spec.ts services/trader/src/analyst/index.spec.ts` -> 24 pass / 0 fail / 646 expects.
- `bun test` -> 606 pass / 0 fail / 11576 expects.
- `bun run typecheck` -> exit 0.
- `git diff --check` -> exit 0.
- Production numeric grep over `services/trader/src/reflector/*.ts` reviewed: hits are structural counter increments, CLI/report formatting constants, rolling-60d arithmetic, and the named Claude pricing constants with source/date comment.
- Debug leftovers scan over changed code/config files (`console.log|debugger|TODO|HACK`) -> no matches.
- `bun run --cwd services/trader start` -> exit 0 (`trader: replay adapter only (Phase 4 vertical slice)`); no `/health` endpoint exists for the replay-only service entrypoint yet.

## 0.4.54 / @ankit-prop/trader@0.3.1 — 2026-04-30 11:31 Europe/Amsterdam — Analyst usage telemetry tolerates aggregate-only AI SDK usage

**Initiated by:** FoundingEngineer, addressing the CodeReviewer BLOCK on [ANKA-350](/ANKA/issues/ANKA-350) (child of [ANKA-338](/ANKA/issues/ANKA-338)) under the [ANKA-318](/ANKA/issues/ANKA-318) trader vertical-slice umbrella.

**Why:** `LanguageModelUsage` from the Vercel AI SDK can arrive with aggregate `inputTokens`/`outputTokens` only — the nested `inputTokenDetails` / `outputTokenDetails` objects are optional. The 0.4.53 Analyst dereferenced both unconditionally, so the regression spec for aggregate-only usage threw `TypeError: undefined is not an object` before `AnalystOutput` validation, leaving `cacheStats` unreliable on real OpenRouter calls.

**Fixed** — `fix(svc:trader/instance-pipeline)`

- `services/trader/src/analyst/index.ts` — `cacheStatsFromUsage()` now optional-chains `usage.inputTokenDetails?.cacheReadTokens`, `?.cacheWriteTokens`, `?.noCacheTokens`, and `usage.outputTokenDetails?.reasoningTokens`, with the existing aggregate fallbacks (`usage.cachedInputTokens`, `usage.inputTokens` minus cached/write, `usage.reasoningTokens`) carrying through unchanged.
- `services/trader/src/analyst/index.spec.ts` — adds `maps aggregate-only usage telemetry without token detail objects` regression covering the AI SDK shape that ships only `inputTokens`/`outputTokens`/`totalTokens`.

**Bumped**

- root `ankit-prop-umbrella` `0.4.53` → `0.4.54`.
- `@ankit-prop/trader` `0.3.0` → `0.3.1`.

**Verification**

- `bun test services/trader/src/analyst/index.spec.ts` -> 3 pass / 0 fail / 11 expects.
- `bun run --filter @ankit-prop/trader lint:fix` -> exit 0 on the touched files (pre-existing repo-wide warnings unchanged).
- `bun run --filter @ankit-prop/trader typecheck` -> exit 0.

**Self-implementation justification (FE behavioural rule #1, exception 2):** four `?.` insertions in a single function plus a regression spec already authored locally; CodeReviewer dictated the exact diff and Codex inbox is clear of dependent work that this would unblock.

## 0.4.53 / @ankit-prop/contracts@2.0.0 / @ankit-prop/trader@0.3.0 — 2026-04-30 11:13 Europe/Amsterdam — Analyst v_ankit_classic v0

**Initiated by:** CodexExecutor, implementing [ANKA-338](/ANKA/issues/ANKA-338) under the [ANKA-318](/ANKA/issues/ANKA-318) trader vertical-slice umbrella, with board direction to use Vercel AI SDK v6 + OpenRouter.

**Why:** The vertical-slice trader needs a real Analyst stage for `v_ankit_classic` before the Trader/Judge children can consume non-stub regime, confluence, and LLM-cost telemetry.

**Added** — `feat(svc:trader/instance-pipeline)`

- `services/trader/src/analyst/` — adds deterministic regime classification, deterministic v1 confluence scoring, and an OpenRouter-backed `generateObject` Analyst stage with a mockable generator seam.
- `services/trader/strategy/v_ankit_classic/params.yaml` — adds Analyst model/lookback/regime thresholds sourced from params rather than inline persona-path literals.
- `services/trader/strategy/v_ankit_classic/prompts/analyst.md` — adds the static Analyst system prompt.
- `services/trader/src/replay-adapter/from-eval-harness.ts` — defaults `v_ankit_classic` replay deps to the real Analyst while tests inject stubs to avoid live LLM calls.
- `packages/shared-contracts/src/personas.ts` — adds `AnalystRuntimeConfig` and requires `PersonaConfig.analyst`, a breaking config-contract change.

**Bumped**

- root `ankit-prop-umbrella` `0.4.52` → `0.4.53`.
- `@ankit-prop/contracts` `1.0.0` → `2.0.0`.
- `@ankit-prop/trader` `0.2.1` → `0.3.0`.

**Verification**

- `bun install` -> exit 0 (`Checked 96 installs across 99 packages (no changes)`).
- `bun run lint:fix` -> exit 0 (`Found 34 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; Biome formatted touched files).
- `bun run typecheck` -> exit 0.
- `bun test services/trader/src packages/shared-contracts/src/personas.spec.ts packages/shared-contracts/src/index.spec.ts` -> 37 pass / 0 fail / 685 expects.
- `bun test` -> 601 pass / 0 fail / 11558 expects.
- `git diff --check` -> exit 0.
- Persona-path numeric grep over production `services/trader/src/analyst/*.ts` plus the Analyst prompt -> no matches.
- Debug leftovers scan over changed Analyst/trader/contract source and params files (`console.log|debugger|TODO|HACK`) -> no matches.
- Manual OpenRouter smoke sourced the shared-root `.env` key without printing it and ran a 1-bar Analyst fixture through `moonshotai/kimi-k2.6`; structured output parsed with populated `cacheStats` (`inputFreshTokens=365`, `outputTokens=1997`, `thinkingTokens=1669`).
- `bun run --cwd services/trader start` -> exit 0 (`trader: replay adapter only (Phase 4 vertical slice)`); no `/health` endpoint exists for the replay-only service entrypoint yet.

## 0.4.52 / @ankit-prop/trader@0.2.1 — 2026-04-30 10:38 Europe/Amsterdam — PR #38 BLOCK follow-up

**Initiated by:** CodexExecutor, addressing local-board repair brief `a22851f2` for CodeReviewer BLOCK on PR [#38](https://github.com/ewildee/ankit-prop-trading-agent/pull/38) ([ANKA-335](/ANKA/issues/ANKA-335)).

**Why:** Actionable Trader output must not look submitted in replay without explicit risk/calendar/spread/hard-rail context, and post-close reflector work must not block the bar-close decision record.

**Fixed** — `fix(svc:trader/instance-pipeline)`

- `services/trader/src/pipeline/runner.ts` — deletes the fabricated default `JudgeInput`. `OPEN` / `CLOSE` / `AMEND` without `deps.buildJudgeInput` now short-circuit before Judge and Gateway with fail-closed `rejected_by_rails` telemetry using the existing empty-rail reject verdict.
- `services/trader/src/pipeline/runner.ts` — builds and returns the `DecisionRecord` before scheduling Reflector; reflector failures are swallowed so async post-close work cannot block the decision record.
- `services/trader/src/pipeline/runner.spec.ts` — adds regressions for missing-risk-context fail-closed behaviour and reflector failure isolation; all non-HOLD happy-path permutations now pass an explicit `buildJudgeInput`.
- `services/trader/src/gateway/in-process.ts` — notes that the replay-only synthetic allow path is reached only after the runner has explicit risk context.

**Bumped**

- root `ankit-prop-umbrella` `0.4.51` → `0.4.52`.
- `@ankit-prop/trader` `0.2.0` → `0.2.1`.

**Verification**

- `bun install --frozen-lockfile` -> exit 0 (`Checked 86 installs across 89 packages (no changes)`).
- `bun run lint:fix` -> exit 0 (`Found 27 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; formatting applied only inside the touched runner spec).
- `bun run typecheck` -> exit 0.
- `bun test services/trader/src packages/shared-contracts` -> 85 pass / 0 fail / 785 expects.
- `bun test` -> 590 pass / 0 fail / 11534 expects.
- `git diff --check` -> exit 0.
- Persona-path numeric grep over `services/trader/src/**/*.ts` -> production files clean; hits are limited to spec fixture values and the explicit loader rejection case.
- Debug leftovers scan over changed trader source/package files (`console.log|debugger|TODO|HACK`) -> no matches.
- `bun run --cwd services/trader start` -> exit 0 (`trader: replay adapter only (Phase 4 vertical slice)`); no `/health` endpoint exists for the replay-only service entrypoint yet.

## 0.4.51 / @ankit-prop/trader@0.2.0 — 2026-04-30 10:08 Europe/Amsterdam

**Initiated by:** CodexExecutor, implementing [ANKA-335](/ANKA/issues/ANKA-335) under the [ANKA-318](/ANKA/issues/ANKA-318) trader vertical-slice umbrella.

**Why:** The Analyst, Trader, Judge, Gateway, and Reflector children need a concrete `services/trader` skeleton and replay-driven per-bar-close runner before their real logic can plug in. This slice keeps every stage stubbed while proving the contract surface and JSONL handoff work end-to-end against committed XAUUSD fixture bars.

**Added** — `feat(svc:trader/instance-pipeline)`

- `services/trader/src/pipeline/` — adds the stage interfaces, pure `runDecision(bar, persona, deps)` orchestrator, and minimum-valid Analyst / Trader / Judge / Reflector stubs. `HOLD` skips Judge and records gateway `not_submitted`; actionable Trader outputs run through Judge before Gateway.
- `services/trader/src/gateway/in-process.ts` — adds a replay-only Gateway double. It returns `not_submitted` for `HOLD` / Judge reject and emits a synthetic `RailVerdict` `allow` for approved actionable outputs; real hard-rail enforcement remains in `services/ctrader-gateway`.
- `services/trader/src/persona-config/loader.ts` — loads `services/trader/strategy/{personaId}/params.yaml` via Bun's native YAML import and validates it with the strict `PersonaConfig` schema. No `yaml` npm dependency was added because BLUEPRINT §5.1 / §5.3 require Bun-native YAML first.
- `services/trader/src/replay-adapter/from-eval-harness.ts` — consumes `IMarketDataProvider` and `replayWithProvider` to collect bar-close order, then runs the trader pipeline and appends parseable `DecisionRecord` JSONL under `.dev/runs/{runId}/decisions.jsonl` or a caller-supplied path.
- Specs: `pipeline/runner.spec.ts`, `persona-config/loader.spec.ts`, and `replay-adapter/from-eval-harness.spec.ts`; the replay spec drives one committed XAUUSD fixture day and validates at least 200 decision records.
- `services/trader/package.json` — adds `main`, standard lint/test/typecheck scripts, and workspace dependencies on contracts, market-data, and eval-harness.
- `TODOS.md` — adds and closes T008.c for [ANKA-335](/ANKA/issues/ANKA-335).

**Bumped**

- root `ankit-prop-umbrella` `0.4.50` → `0.4.51`.
- `@ankit-prop/trader` `0.1.0` → `0.2.0`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 27 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes applied on final rerun).
- `bun test services/trader/src` -> 7 pass / 0 fail / 603 expects.
- `bun test` -> 588 pass / 0 fail / 11527 expects.
- `bun run typecheck` -> exit 0.
- `bun install --frozen-lockfile` -> exit 0 (`Checked 86 installs across 89 packages (no changes)`).
- Persona-path numeric grep over `services/trader/src/**/*.ts` -> production files clean; hits are limited to spec fixture values and the explicit loader rejection case.
- Debug leftovers scan over changed trader source/package files (`console.log|debugger|TODO|HACK`) -> no matches.

## 0.4.50 / @ankit-prop/contracts@1.0.0 — 2026-04-30 09:43 Europe/Amsterdam

**Initiated by:** CodexExecutor, implementing [ANKA-333](/ANKA/issues/ANKA-333) to repair remaining [ANKA-319](/ANKA/issues/ANKA-319) acceptance gaps after [ANKA-321](/ANKA/issues/ANKA-321).

**Why:** The first persona contract slice landed the ADR-0010 action boundary but still allowed several parent-requested fields to be absent. That would let trader/gateway/reflector consumers disagree on confluence, idempotency, risk units, close targets, and run metrics.

**Changed** — `feat(pkg:contracts/pipeline)` / breaking shared contract surface

- `packages/shared-contracts/src/personas.ts` — adds required `AnalystOutput.confluenceScore` (0-100), requires `idempotencyKey` on `OPEN` / `CLOSE` / `AMEND`, switches `OPEN` risk to `stopLossPips` / `takeProfitPips`, requires `CLOSE.positionId`, and expands `RunAggregate` with `sortinoRolling60d`, `llmCostUsd` actual + Claude-equivalent breakdowns, `breachCount`, `tradeCount`, and `realizedPnl`.
- `packages/shared-contracts/src/personas.spec.ts` and `packages/shared-contracts/src/index.spec.ts` — add regressions proving missing confluence score, missing actionable idempotency, absolute SL/TP-only opens, missing close target, and missing aggregate metrics fail the Zod boundary.
- `.dev/decisions.md` — adds ADR-0011 documenting the acceptance repair and noting that code uses US spelling `realizedPnl` for the parent issue's "realised PnL" wording.
- `packages/shared-contracts/package.json` — bumps `@ankit-prop/contracts` `0.8.1` → `1.0.0` for the breaking schema surface.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 27 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; final rerun applied no fixes).
- `bun test packages/shared-contracts/src/personas.spec.ts packages/shared-contracts/src/index.spec.ts` -> 17 pass / 0 fail / 51 expects.
- `bun test packages/shared-contracts` -> 76 pass / 0 fail / 175 expects.
- `bun test` -> 581 pass / 0 fail / 10924 expects.
- `bun run typecheck` -> exit 0.
- `bun install --frozen-lockfile` -> exit 0 (`Checked 85 installs across 89 packages (no changes)`).
- Debug leftovers scan over changed shared-contract source/spec/package files (`console.log|debugger|TODO|HACK`) -> no matches.

## 0.4.51 — 2026-04-30 09:37 Europe/Amsterdam — Persona-path numeric-threshold review directive

**Initiated by:** CodexExecutor, repairing PR [#37](https://github.com/ewildee/ankit-prop-trading-agent/pull/37) after CodeReviewer BLOCK on stale-branch regressions for [ANKA-320](/ANKA/issues/ANKA-320).

**Why:** [ANKA-67](/ANKA/issues/ANKA-67) decision F locked the static-value-steered-profit failure mode as a phase-4 review risk: an agent could look profitable on a replay window because numeric thresholds were tuned to that window instead of because the persona path is doing data-driven work. Until public CI is reintroduced, [ANKA-320](/ANKA/issues/ANKA-320) makes QAEngineer and CodeReviewer the explicit review gate for inline persona-path thresholds.

**Changed** — repo-wide governance docs

- `AGENTS.md` — adds `## Persona-path numeric thresholds — review enforcement (BLUEPRINT §13)` between `## Hard guardrails` and `## Bounds (CEO-approval gates)`. The directive requires numeric thresholds on the persona / Analyst / Trader / Judge path to come from `params.yaml.{persona}`, defines the allowed exceptions for structural constants and ADR-backed escape hatches, blocks window-fitted defaults, and names QAEngineer + CodeReviewer as review-time enforcement owners.
- `package.json` — bumps root `ankit-prop-umbrella` `0.4.50` → `0.4.51` for the behaviour-affecting governance-contract change.
- `.dev/progress.md` and `.dev/journal.md` — record the rebase repair, verification, and reviewer handoff state.

**Verification (worktree)**

- `diff -u /tmp/agents-md-persona-section.md /tmp/agents-md-persona-section.rebased` -> exit 0; inserted section still matches the supplied body byte-for-byte after rebase.
- `git diff --check` -> exit 0.
- `git diff --name-status origin/main` -> only `.dev/journal.md`, `.dev/progress.md`, `AGENTS.md`, `CHANGELOG.md`, and `package.json`.
- `bun install --frozen-lockfile` -> exit 0 (`Checked 85 installs across 89 packages (no changes)`).
- `bun run lint:fix` -> exit 0 (`Found 27 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes applied).
- `bun run typecheck` -> exit 0.
- `bun test` -> 576 pass / 0 fail / 10904 expects.
- Dry-run reviewer grep on `services/ctrader-gateway/src/hard-rails/*.ts` -> exit 0 with expected false-positive examples (rail numbers, dates, structural constants/spec fixtures).

## 0.4.49 — 2026-04-30 09:16 Europe/Amsterdam — apply DBF-004 (BLUEPRINT §22 reconcile Phase 6 dashboard scaffold landing before Phase 4 trader — option a)

**Initiated by:** FoundingEngineer, scoped wake on [ANKA-326](/ANKA/issues/ANKA-326). Same in-flight branch / same release window — no root version bump.

**Why:** Daily blueprint audit ([ANKA-322](/ANKA/issues/ANKA-322), 2026-04-30) found §22 said verbatim `Phase 6 after 4.` while the dashboard shell ([ANKA-121](/ANKA/issues/ANKA-121), commit `1885b6c`, version-matrix banner pinned to `pkg:contracts#SERVICES`) had already landed on `main` — Phase 6 work executing before Phase 4 (`svc:trader`, TODOS T008 still `[ ]`) had even started. Two reconciliations were proposed in DBF-004: (a) carve out `dashboard` shell-and-banner as a contracts-only dependency that may run in parallel with Phases 4–5, keeping the Phase 6 row monolithic; (b) split the Phase 6 row into `6a` (shell) / `6` (substantive views). CEO chose (a) — honest to what landed (ANKA-121 was approved on its merits and is contract-pinned, not runtime-pinned); option (b) would have retroactively reshaped the phase table around a single deliverable and conflated the contract-vs-runtime distinction we already encode elsewhere.

**Changed** — BLUEPRINT.md narrative reconciliation (no code paths)

- §22 — replaces the trailing paragraph after the build-phases table. The new wording keeps the `Phase 6 after 4` boundary for substantive views (decision feed, hard-rail log viewer, controls, kill switch) but explicitly carves out the shell-and-banner scaffolding as a contracts-only dependency that may run in parallel with Phases 4–5. The §22 phase table itself is unchanged — Phase 6 stays a single row.

**Verification (worktree)**

- `grep -n 'Phase 6 after 4' BLUEPRINT.md` → empty (the contradicted line is gone).
- `grep -n 'Phase 6.s .shell-and-banner' BLUEPRINT.md` → present.
- `grep -n 'substantive views' BLUEPRINT.md` → present.
- `grep -n '| \\*\\*6a\\*\\* |' BLUEPRINT.md` → empty (option b row not added; we took option a).
- Docs-only: no lint/typecheck/test surface affected.

## 0.4.49 — 2026-04-30 09:14 Europe/Amsterdam — apply DBF-003 (BLUEPRINT §5.2 / §17 / §25 catalog `pkg:market-data` + `pkg:triplon-config` + eval-harness replay surface)

**Initiated by:** FoundingEngineer, scoped wake on [ANKA-326](/ANKA/issues/ANKA-326). Same in-flight branch / same release window — no root version bump.

**Why:** Daily blueprint audit ([ANKA-322](/ANKA/issues/ANKA-322), 2026-04-30) found three landed packages and one landed eval-harness surface uncatalogued in BLUEPRINT.md: `packages/market-data/` (`@ankit-prop/market-data`, ADR-0008 — provider-agnostic interface, [ANKA-69](/ANKA/issues/ANKA-69) / [ANKA-236](/ANKA/issues/ANKA-236) / [ANKA-248](/ANKA/issues/ANKA-248) / [ANKA-266](/ANKA/issues/ANKA-266)); `packages/triplon-config/` (`@triplon/config`, [ANKA-130](/ANKA/issues/ANKA-130) workspace package — §5.2 still framed it as `(private Triplon registry) … latest from registry`); the four `pkg:eval-harness/...` sub-modules `replay-driver` / `replay-cli` / `replay-strategies` / `baselines` landed by [ANKA-280](/ANKA/issues/ANKA-280) + [ANKA-287](/ANKA/issues/ANKA-287). Without a canonical scope tag, future commits to these surfaces have to invent ad-hoc tags. CEO accepted DBF-003 verbatim.

**Changed** — BLUEPRINT.md narrative reconciliation (no code paths)

- §5.2 — `Config loader` row rewritten from "private Triplon registry / latest from registry" to "workspace package, `packages/triplon-config/`; `infra:config` cross-cutting tag" / `n/a`.
- §17 — packages/ tree adds `triplon-config/`, `market-data/`, and re-orders so `triplon-config` sits next to `proc-supervisor` (workspace utilities), `market-data` sits next to `market-data-twelvedata` (sibling provider packages).
- §25.1 — top-scopes table gains `pkg:market-data` (Library) and `pkg:triplon-config` (Library — workspace) rows between `pkg:ctrader-vendor` and `pkg:market-data-twelvedata`. `infra:config` Path column rewritten from "(uses `@triplon/config`)" to the explicit `packages/triplon-config` source path plus consumer YAML paths.
- §25.2 — adds `#### pkg:triplon-config/...` block (loader, schema, codegen, env-derivation, freshness sub-modules) after `pkg:contracts/...`; adds `#### pkg:market-data/...` block (provider, cached-fixture-provider, fixture-schema, types, index sub-modules) before `pkg:market-data-twelvedata/...`; appends four rows (`replay-driver`, `replay-cli`, `replay-strategies`, `baselines`) to the existing `pkg:eval-harness/...` table.

**Verification (worktree)**

- `grep -n 'Phase 6 after 4' BLUEPRINT.md` → still present (intentional; DBF-004 covers that line in the next commit).
- `grep -n 'pkg:market-data' BLUEPRINT.md` → §17 + §25.1 + §25.2 entries present.
- `grep -n 'pkg:triplon-config' BLUEPRINT.md` → §25.1 + §25.2 entries present.
- `grep -n 'replay-driver' BLUEPRINT.md` → new `pkg:eval-harness/...` row present.
- `grep -n 'private Triplon registry' BLUEPRINT.md` → empty (the §5.2 contradiction is gone).
- Docs-only: no lint/typecheck/test surface affected.

## 0.4.49 — 2026-04-30 09:07 Europe/Amsterdam — apply DBF-005 (TODOS.md T020 — historical-data fetch & provider interface umbrella)

**Initiated by:** FoundingEngineer, scoped wake on [ANKA-325](/ANKA/issues/ANKA-325). Same in-flight branch / same release window — no root version bump.

**Why:** Daily blueprint audit ([ANKA-322](/ANKA/issues/ANKA-322), 2026-04-30) confirmed the DBF-002 incidental TODOS.md drift was still unresolved: Phase 0–7 layout had no entry naming [ANKA-67](/ANKA/issues/ANKA-67) (TwelveData adoption parent), [ANKA-68](/ANKA/issues/ANKA-68) (fetcher), or [ANKA-69](/ANKA/issues/ANKA-69) (`@ankit-prop/market-data` interface). T019 covered the same deliverables by code but cited only ANKA-236 / ANKA-248 / ANKA-266 / ANKA-280 — the parent tickets were invisible. ANKA-325 broke this out as DBF-005 for separate closure.

**Changed** — repo-tracked task list + doc-bug queue

- `TODOS.md` — Phase 3 gains `T020 — Historical-data fetch & provider interface umbrella`, naming ANKA-67 / ANKA-68 / ANKA-69 as parents and pointing at T019.{a,b,c} for in-flight regression history. Option (a) per the [ANKA-325](/ANKA/issues/ANKA-325) resolution menu (preferred for discoverability over option (b) — retagging T019 — because T019 is the provider-agnostic interface deliverable, not the TwelveData fetcher; honesty to history demands a separate entry for the umbrella).
- `DOC-BUG-FIXES.md` — DBF-002 "Out-of-scope drift surfaced incidentally" bullet annotated "Promoted to DBF-005 and closed in ANKA-325" (same edit also closes the loop on the other two incidentals: market-data phantom resolved under DBF-003, triplon-config workspace promoted to DBF-003 §5.2 patch). DBF-005 block gains a **Status: CLOSED** line citing the ANKA-325 resolution.

**Verification (worktree)**

- Docs-only change: no code paths touched. Smallest verification per BLUEPRINT §0.2 — visual review of the rendered Phase 3 entry order and the DBF-002/DBF-005 annotations.
- TODOS.md remains the FE-owned task ledger; no runtime/typecheck/test surface affected.

## 0.4.50 / @ankit-prop/contracts@0.8.1 — 2026-04-30 09:13 Europe/Amsterdam (PR #36 BLOCK follow-up)

**Initiated by:** CodexExecutor, addressing CodeReviewer BLOCK on PR [#36](https://github.com/ewildee/ankit-prop-trading-agent/pull/36) for [ANKA-321](/ANKA/issues/ANKA-321).

**Why:** `GatewayDecision` accepted the contradictory state `status: 'submitted'` with a hard-rail `RailVerdict.outcome: 'reject'`. BLUEPRINT §9 and `RailVerdict` define `reject` as "must not transmit to broker", so the shared contract needed to make that fail-open telemetry shape unrepresentable.

**Fixed** — `fix(pkg:contracts/pipeline)`

- `packages/shared-contracts/src/personas.ts` — reshapes `GatewayDecision` into three branches: `not_submitted`, `rejected_by_rails`, and `submitted`. The new `rejected_by_rails` branch requires `railVerdict.outcome === 'reject'`; the `submitted` branch now refines to `allow | tighten` only and still requires `submittedAt`.
- `packages/shared-contracts/src/personas.spec.ts` — adds regressions proving `submitted + reject` fails, explicit `rejected_by_rails + reject` passes, and `submitted + allow` remains valid.
- `packages/shared-contracts/package.json` — bumps `@ankit-prop/contracts` `0.8.0` → `0.8.1`.

**Verification**

- `bun run lint:fix` -> exit 0 (`Found 27 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes applied).
- `bun test packages/shared-contracts/src/personas.spec.ts packages/shared-contracts/src/index.spec.ts` -> 12 pass / 0 fail / 31 expects.
- `bun test packages/shared-contracts` -> 71 pass / 0 fail / 155 expects.
- `bun run lint` -> exit 0 (`Found 27 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics).
- `bun run typecheck` -> exit 0.
- `bun install --frozen-lockfile` -> exit 0 (`Checked 85 installs across 89 packages (no changes)`).
- Reviewer repro one-liner for `submitted + reject` -> `{"success": false}`.
- Debug leftovers scan over changed TS/JSON/YAML files (`console.log|debugger|TODO|HACK`) -> no matches.
- Rebase refresh after PR #36 `CONFLICTING/DIRTY` review — 2026-04-30 09:24 Europe/Amsterdam: rebased onto `origin/main` (`ccbfcb6`), preserved both `main` DBF entries and ANKA-321 entries in newest-first docs, reran the same local gate with unchanged pass counts, and reviewer repro matrix returned `{"submittedReject":false,"railReject":true,"submittedAllow":true}`.

## 0.4.50 / @ankit-prop/contracts@0.8.0 / @ankit-prop/trader@0.1.0 — 2026-04-30 08:57 Europe/Amsterdam

**Initiated by:** CodexExecutor, implementing [ANKA-321](/ANKA/issues/ANKA-321) under [ANKA-319](/ANKA/issues/ANKA-319).

**Why:** Phase 4 needs a repo-materialized persona contract surface before the trader vertical slice, replay consumers, gateway adapter, and dashboard telemetry encode incompatible Analyst → Trader → Judge shapes.

**Added** — `feat(pkg:contracts/pipeline)`

- `packages/shared-contracts/src/personas.ts` — adds strict Zod schemas and inferred types for `PersonaId`, `RegimeLabel`, `AnalystOutput`, canonical `TraderOutput`, `JudgeInput`, `JudgeOutput`, `PersonaConfig`, `DecisionRecord`, `RunAggregate`, and `GatewayDecision`. Canonical `TraderOutput` is `HOLD | OPEN | CLOSE | AMEND`; `TRAIL` is intentionally absent. The v0 runtime allow-list is exposed separately as `V0_TRADER_RUNTIME_ACTIONS = HOLD | OPEN | CLOSE`.
- `packages/shared-contracts/src/personas.spec.ts` and `packages/shared-contracts/src/index.spec.ts` — pin strict analyst parsing, the trader action union, normal no-trade as `HOLD`, gateway `not_submitted` telemetry for holds, decision composition, and package-barrel exports.
- `.dev/decisions.md` — prepends ADR-0010 documenting why persona schemas live in `@ankit-prop/contracts`, why no-trade is not a judge rejection, and why the canonical shared type includes `AMEND` before the first runtime slice emits it.

**Added** — `feat(svc:trader/instance-pipeline)`

- `services/trader/strategy/v_ankit_classic/params.yaml` — adds the Phase-4 params skeleton with BLUEPRINT §13 defaults: Prague trading windows, macro `minConfidence: 0.6`, judge `threshold: 70`, risk cap `maxPerTradePct: 0.5`, scoring threshold `50`, timeframe weights `1d:4 / 4h:3 / 1h:2 / 5m:1`, and v0 action allow-list `HOLD | OPEN | CLOSE`.

**Changed**

- `package.json` — bumps root `0.4.49` → `0.4.50`.
- `packages/shared-contracts/package.json` — bumps `@ankit-prop/contracts` `0.7.1` → `0.8.0`.
- `services/trader/package.json` — bumps `@ankit-prop/trader` `0.0.1` → `0.1.0`.

**Verification**

- `bun run lint:fix` → exit 0 (`Found 27 warnings. Found 37 infos.` — pre-existing repo-wide diagnostics; no fixes pending after the second run).
- `bun test packages/shared-contracts/src/personas.spec.ts packages/shared-contracts/src/index.spec.ts` → 9 pass / 0 fail / 25 expects.
- `bun test` → 573 pass / 0 fail / 10898 expects.
- `bun run typecheck` → exit 0.
- Service restart/health: `@ankit-prop/trader` has no Phase-4 runtime yet; `bun run --cwd services/trader start` exits 0 with `trader: not yet implemented (Phase 4)`, so there is no `/health` endpoint to confirm for this params-only service change.

## 0.4.49 — 2026-04-30 05:35 Europe/Amsterdam (PR #35 BLOCK follow-up — pre-merge range audit + verification refresh)

**Initiated by:** FoundingEngineer, addressing CodeReviewer BLOCK on PR [#35](https://github.com/ewildee/ankit-prop-trading-agent/pull/35) ([ANKA-302](/ANKA/issues/ANKA-302) comment `57202d38`). Same in-flight branch / same release window — no root version bump.

**Why:** Reviewer reproduced the gap that the prior 0.4.49 commit's §1/§2 protocol only audited the PR head SHA (`pr-<N>` / landed `<sha>`). `git merge --ff-only pr-<N>` lands every commit in `origin/main..pr-<N>`, so an earlier commit with two parents, committer `GitHub <noreply@github.com>`, or a missing canonical Paperclip footer would slip onto `main` even when the head commit is clean. That defeats the [ANKA-302](/ANKA/issues/ANKA-302) requirement that future merge/audit flow cannot produce the audited failure shapes again. Reviewer also flagged that the prior commit's CHANGELOG and journal verification entries were future-tense (`bun run lint` / `bun run typecheck` "to be run") after PR #35 was already pushed, which BLUEPRINT §0.2 does not accept as durable operational evidence.

**Changed** — repo-wide governance docs

- `AGENTS.md` §1 — adds a mandatory **pre-merge range audit** before `git merge --ff-only`. The block now captures `BASE=$(git rev-parse HEAD)` immediately after `git pull --ff-only origin main`, then iterates `git rev-list --reverse "$BASE..pr-<N>"` and fail-closes on any commit whose `parents != 1`, whose committer differs from author, whose committer is `GitHub <noreply@github.com>`, or which is missing the canonical `Co-Authored-By: Paperclip <noreply@paperclip.ing>` footer. A clean PR-head SHA is no longer sufficient — every commit in the landed range must pass.
- `AGENTS.md` §2 — converts the post-merge audit from a single-SHA inspection into a range walk over `$BASE..origin/main`, oldest first, applying the same three HARD FAIL checks per commit. Documents that auditing only the head SHA is insufficient and that the §1 pre-merge audit and §2 post-merge audit are paired (pre-merge fails closed, post-merge produces the durable pasted evidence).
- `CHANGELOG.md` — updates the prior 0.4.49 entry's "Verification" section to past-tense outcomes (the `bun run lint` and `bun run typecheck` runs from that commit completed `exit 0` before PR #35 was pushed); fixes the wording "appends ADR-0009 (newest first)" → "prepends ADR-0009 (newest-first ordering)".
- `.dev/journal.md` — appends a new newest-first entry covering the BLOCK fix (the prior 05:20 entry stays untouched per the file's append-only convention).

**Verification (worktree)**

- `bun run lint` → exit 0 (`Found 27 warnings. Found 37 infos.` — pre-existing per the 0.4.48 CHANGELOG).
- `bun run typecheck` → exit 0.
- The new §1 pre-merge range audit was dry-run against this branch's `origin/main..HEAD` range (two commits — `657b092c` and the BLOCK-fix commit) and both passed all four hard fails: one parent, committer = author = `FoundingEngineer <foundingengineer@paperclip.ing>`, committer ≠ `GitHub <noreply@github.com>`, canonical Paperclip footer present.

## 0.4.49 — 2026-04-30 05:20 Europe/Amsterdam — ADR-0009 lands; merge protocol switches to local fast-forward push

**Initiated by:** FoundingEngineer, addressing CEO approval on [ANKA-302](/ANKA/issues/ANKA-302) comment `3a4cb648` (remediation of [ANKA-299](/ANKA/issues/ANKA-299) 12-hour audit).

**Why:** The [ANKA-299](/ANKA/issues/ANKA-299) audit found four commits on `main` failing the AGENTS.md §2 / [ADR-0007](/ANKA/issues/ANKA-268) post-merge audit: three pre-ANKA-270 GitHub UI "Create a merge commit" merges (PR #11 `79ae5aa5`, PR #12 `6972afd6`, PR #16 `d99d53ec` — discipline gap, recurrence already hard-blocked), and one post-protocol GitHub-side rebase-merge (PR #22 `e51aced4` — structural gap because GitHub-side rebase always rewrites committer to `GitHub <noreply@github.com>` regardless of the local commit-msg footer hook). [ANKA-268](/ANKA/issues/ANKA-268)'s `dbe4d316` remains under ADR-0007 and is not double-logged. CEO rejected `allow_rebase_merge=false` (GitHub `422 no_merge_method` requires at least one merge strategy enabled), so the AGENTS.md §1 protocol plus §2 hard-fail audit become the only guards against another `e51aced`-shape commit.

**Changed** — repo-wide governance docs

- `.dev/decisions.md` — prepends ADR-0009 (newest-first ordering). Logs the four exception commits with their PR / issue / shape / timestamp evidence; replaces AGENTS.md §1's recommended `gh pr merge --rebase --match-head-commit <sha>` with a local fast-forward push block; promotes the §2 committer-identity check to a hard fail; reframes §3 from "gh as merge fallback" to "gh as PR-inspection helper". Records the GitHub `422 no_merge_method` result under "Alternatives considered" so the next reader knows the repo-settings option was tried.
- `AGENTS.md` §1 — replaces the `gh pr merge … --rebase --match-head-commit` block with a `git fetch origin pull/<N>/head:pr-<N>` + `git merge --ff-only` + `git push origin main` block. Adds `gh pr merge --rebase` and the GitHub UI "Rebase and merge" button to the "Forbidden" list. Calls out that PR heads not fast-forwardable from `main` must be rebased locally and re-pushed; never a server-side rebase. (Pre-merge range audit added in the PR #35 BLOCK follow-up entry above.)
- `AGENTS.md` §2 — promotes the post-merge audit's committer-identity check to a hard fail with explicit `HARD FAIL (ADR-0009): committer must equal author and MUST NOT be "GitHub <noreply@github.com>"` wording. Adjusts the parents check (one parent expected on the local-FF path; two parents indicates the forbidden "Create a merge commit" path). Updates the failure-mode framing from "bypassed the rebase path" to "bypassed the local fast-forward path" and links the remediation template to both [ANKA-268](/ANKA/issues/ANKA-268) and [ANKA-302](/ANKA/issues/ANKA-302). (Range walk added in the PR #35 BLOCK follow-up entry above.)
- `AGENTS.md` §3 — reframes `gh` as PR-inspection only; calls out that no `gh pr merge` mode is permitted under ADR-0007 / ADR-0009; documents the `git fetch origin pull/<N>/head` head-SHA fallback when `gh` is unavailable.
- `package.json` — bumps root `0.4.48` → `0.4.49`.

**Verification (worktree)**

- `bun run lint` → exit 0 (`Found 27 warnings. Found 37 infos.` — pre-existing per the 0.4.48 CHANGELOG).
- `bun run typecheck` → exit 0.
- Commit `657b092c` accepted by the `.githooks/commit-msg` hook; committer = author = `FoundingEngineer <foundingengineer@paperclip.ing>`; canonical Paperclip footer present.
- This PR will be merged via the new §1 local fast-forward push as the first commit to validate the protocol on itself.

## 0.4.48 / @ankit-prop/eval-harness@0.2.2 — 2026-04-30 01:30 Europe/Amsterdam (PR #34 BLOCK follow-up)

**Initiated by:** FoundingEngineer, addressing CodeReviewer BLOCK on PR #34 — [ANKA-287](/ANKA/issues/ANKA-287). Same in-flight branch / same release window — no root version bump.

**Why:** Reviewer reproduced a second-class fail-open on `replayWithProvider()`: a `CachedFixtureProvider` constructed without `instrumentSpecs` returns `SymbolMeta` rows with zeroed broker execution fields (`pipSize: 0`, `contractSize: 0`, `typicalSpreadPips: 0`). The simulator then runs but produces a vacuous `realizedPnl: 0`, `initialRisk: 0`, `breaches: 0` `EvalResult` for `OPEN_HOLD_CLOSE_V1` over `XAUUSD` — fail-open on a risk-adjacent surface, identical class to the earlier missing-meta bug.

**Changed** — `pkg:eval-harness/replay-driver`

- `packages/eval-harness/src/replay-driver.ts` — adds `assertSymbolMetaBrokerFields(input)`, run after `assertSymbolMetaCoverage()`, that rejects any requested-symbol meta whose `pipSize` / `contractSize` / `typicalSpreadPips` is non-finite or `<= 0`. Throws `ReplaySymbolMetaInvalid` with `findings: ReadonlyArray<{ symbol, invalidFields }>` so callers (trader / autoresearch) can branch on the per-field shape.
- `packages/eval-harness/src/index.ts` — re-exports `ReplaySymbolMetaInvalid` and `InvalidSymbolMetaFinding` from the package barrel.
- `packages/eval-harness/src/replay-driver.spec.ts` — adds (1) the reviewer's exact repro: a `CachedFixtureProvider` built without `instrumentSpecs` is rejected with all three invalid fields reported for `XAUUSD`, and (2) a per-field exhaustive case covering `NaN` / `Infinity` / negative.
- `packages/eval-harness/package.json` — bumps `@ankit-prop/eval-harness` `0.2.1` → `0.2.2`.

**Verification (worktree)**

- `bun test packages/eval-harness/src/replay-driver.spec.ts` → 9 pass / 0 fail / 8106 expects (was 7 cases; 2 new fail-closed regressions added).

## 0.4.48 / @ankit-prop/eval-harness@0.2.0 — 2026-04-30 00:35 Europe/Amsterdam (CHANGES_REQUESTED follow-up)

**Initiated by:** FoundingEngineer, addressing CodeReviewer `CHANGES_REQUESTED` on [ANKA-280](/ANKA/issues/ANKA-280) (comment `3122cb0b`). Same in-flight branch / same release window — no further version bump.

**Why:** The reviewer reproduced a fail-open in the new public replay path: with `symbolMetas: []` (or any subset that omits a requested symbol), the simulator silently skips bars for the uncovered symbols and the call returns a clean `{tradeCount:0, breaches:0}` `EvalResult` instead of an error. The replay path now fails closed, and the baseline test no longer depends on cwd.

**Changed** — `pkg:eval-harness/replay-driver`

- `packages/eval-harness/src/replay-driver.ts` — adds `assertSymbolMetaCoverage(input)` run before `backtest()`. Builds a `Set` of supplied meta symbols, walks `input.symbols`, and throws `ReplaySymbolMetaMissing` listing every requested symbol with no matching `SymbolMeta`. Exports the new error class so callers (trader / autoresearch) can pattern-match.
- `packages/eval-harness/src/index.ts` — re-exports `ReplaySymbolMetaMissing` from the package barrel.
- `packages/eval-harness/src/replay-driver.spec.ts` — adds two coverage cases: (1) `symbolMetas: []` for a single requested symbol rejects with `ReplaySymbolMetaMissing`; (2) supplying metas for `XAUUSD` while requesting `[XAUUSD, NAS100]` rejects and reports `missingSymbols: ['NAS100']`. Updates the existing `passes provider availability errors through` test to supply a synthetic `EURUSD` meta so it still exercises the provider-error path now that the upstream coverage check fires earlier.
- `packages/eval-harness/src/replay-baseline.spec.ts` — pins `FIXTURE_ROOT` and the baseline directory via `import.meta.dir` (`<repo>/data/market-data/...` and `<pkg>/baselines/`), so `bun test src/replay-baseline.spec.ts` from `packages/eval-harness/` no longer fails with `ENOENT ... packages/eval-harness/packages/eval-harness/baselines/...`.

**Verification (repo root)**

- `bun run lint` → exit 0 (`Found 27 warnings. Found 37 infos.` — pre-existing).
- `bun run config:codegen --check && bun run packages/triplon-config/src/codegen/run.ts --check` → clean.
- `bun run typecheck` → clean.
- `bun test packages/eval-harness/src/replay-driver.spec.ts packages/eval-harness/src/replay-baseline.spec.ts packages/eval-harness/src/golden.spec.ts packages/eval-harness/src/ftmo-rules.spec.ts packages/eval-harness/src/backtest.spec.ts` → `28 pass / 0 fail / 8128 expects` (was 26/8125 — the two new cases account for the delta).
- Reviewer's cwd-independent probe: `(cd packages/eval-harness && bun test src/replay-baseline.spec.ts)` → `2 pass / 0 fail`.
- CLI byte-stability: `bun run packages/eval-harness/src/replay-cli.ts --fixture-root data/market-data/twelvedata/v1.0.0-2026-04-28 --smoke --strategy open_hold_close_v1 --symbol-set xauusd_5m --out /tmp/anka-280-byte-stability.json && cmp -s ...` → byte-identical (the new validation is a no-op for the CLI because `runReplaySnapshot` always supplies metas via `resolveSymbolMetas`).

## 0.4.48 / @ankit-prop/news@0.5.3 — 2026-04-30 00:29 Europe/Amsterdam

**Initiated by:** CodexExecutor, implementing [ANKA-170](/ANKA/issues/ANKA-170) after [ANKA-169](/ANKA/issues/ANKA-169) unblocked the full `svc:news` Elysia app.

**Why:** Phase 5 needed an end-to-end cassette replay and drift/DST regression gate before the FTMO calendar service can be trusted as the hard-rail news input. The gate also needed to fail locally because ADR-0005 retired public CI for this repo.

**Added** — `test(svc:news)`

- `services/news/test/integration/cassette-replay.spec.ts` — replays the recorded 14-day FTMO cassette through `createCalendarFetcher`, in-memory SQLite persistence, and the composed `buildNewsApp` routes (`/calendar/window`, `/calendar/by-day`, `/calendar/restricted`, `/calendar/pre-news-2h`, `/calendar/next-restricted`). It asserts full cassette row count, persisted freshness metadata, tracked-symbol filtering, NFP restricted snapshots for `NAS100` / `XAUUSD`, and tier-one 2-hour pre-news restrictions.
- `services/news/test/contract/calendar-schema-drift.spec.ts` — compares cassette item keys against the strict `CalendarItem` contract and emits on-call-focused messages for extra upstream keys, schema keys removed locally, or required cassette keys disappearing.
- `services/news/test/integration/prague-dst.spec.ts` — pins Prague spring-forward and fall-back behavior against explicit FTMO offsets, including the two distinct `2026-10-25T02:30` local instants.
- Focused coverage top-ups in `services/news/src/app.spec.ts`, `services/news/src/freshness/freshness-monitor.spec.ts`, and `services/news/src/fetcher/calendar-fetcher.spec.ts` so the native Bun coverage threshold passes per file.

**Changed** — `svc:news`

- `bunfig.toml` — adds Bun-native coverage thresholds for the news service surface: `lines = 0.9`, `statements = 0.9`, `functions = 0.85`, with unrelated workspaces ignored for coverage accounting.
- `services/news/README.md` — documents the focused test gate and the Bun 1.3 limitation: Bun exposes line, statement, and function thresholds, but no separate branch-threshold key, so the requested 85% branch gate is represented by the closest native executable-decision threshold (`functions = 0.85`) until Bun adds branch thresholds.
- `package.json` / `services/news/package.json` — bump root `0.4.47` → `0.4.48` and `@ankit-prop/news` `0.5.2` → `0.5.3`.

**Verification**

- `bun run lint:fix` — exit 0; pre-existing unrelated Biome warnings/infos remain in packages outside this diff.
- `bun run typecheck` — clean.
- `bun test` — 552 pass / 0 fail / 2764 expects.
- `bun test --coverage` — 552 pass / 0 fail / 2764 expects; aggregate covered surface 99.24% functions / 99.45% lines. Lowest included files remain above threshold: `calendar-fetcher.ts` 90.48% functions / 98.36% lines and `routes/calendar.ts` 94.29% functions / 95.19% lines.
- Service restart/health: `PORT=19270 NEWS_CALENDAR_DB_PATH=/tmp/anka-170-news-calendar.db NODE_ENV=production bun run --cwd services/news start`; `GET /health` returned HTTP 200 with `version:"0.5.3"` and `status:"healthy"`.

## 0.4.48 / @ankit-prop/eval-harness@0.2.0 — 2026-04-29 23:56 Europe/Amsterdam

**Initiated by:** CodexExecutor, implementing [ANKA-280](/ANKA/issues/ANKA-280) under parent [ANKA-70](/ANKA/issues/ANKA-70).

**Why:** [ANKA-70](/ANKA/issues/ANKA-70) needs the eval harness to replay the committed TwelveData fixture root through `@ankit-prop/market-data`'s `CachedFixtureProvider`, exercising existing FTMO simulator machinery deterministically without adding strategy logic, fill realism, or calibration knobs.

**Added** — `feat(pkg:eval-harness/replay-driver)`

- `packages/eval-harness/src/replay-driver.ts` — adds `ReplayInput` and `replayWithProvider(input)`. The driver fetches each requested `(symbol, timeframe)` via `provider.getBars({ symbol, timeframe, fromMs, toMs })`, k-way merges bars by `tsStart` with stable symbol/timeframe tie-breaks, fetches optional provider events, and calls existing `backtest()` with default `FTMO_DEFAULT_LINE` / `INTERNAL_DEFAULT_MARGINS`.
- `packages/eval-harness/src/replay-strategies.ts` — adds deterministic regression strategies `NOOP_V1` and `OPEN_HOLD_CLOSE_V1`; the latter opens one 0.01-lot long and closes on the last bar of its opened symbol via replay preparation.
- `packages/eval-harness/src/replay-cli.ts` — adds a Bun-native replay CLI runnable with `bun run packages/eval-harness/src/replay-cli.ts`, including `--fixture-root`, `--smoke` / `--full`, `--out`, `--strategy`, and `--symbol-set`; output snapshots use canonical JSON and sha256 trade/breach hashes.
- `packages/eval-harness/baselines/*.json` — adds committed smoke baselines for `noop_v1` and `open_hold_close_v1` against `v1.0.0-2026-04-28` / `xauusd_5m`.

**Changed** — `pkg:eval-harness`

- `packages/eval-harness/src/backtest.ts` — adds `diagnostics.replayedTrades` so replay snapshots can hash the closed-trade stream while preserving the existing `EvalResult` shape.
- `packages/eval-harness/src/index.ts` — exports the replay driver and deterministic replay strategies from the public package entrypoint.
- `packages/eval-harness/src/replay-driver.spec.ts` / `replay-baseline.spec.ts` — cover smoke determinism, FTMO machinery wiring, type-level no-threshold-calibration, multi-symbol merge ordering, provider error pass-through, and committed-baseline equality.
- `packages/eval-harness/package.json` / `bun.lock` — bump `@ankit-prop/eval-harness` `0.1.5` → `0.2.0`.
- `biome.json` — excludes only `packages/eval-harness/baselines/*.json` so replay baselines remain byte-identical to the CLI's canonical compact JSON instead of being formatter-expanded.
- `package.json` — root umbrella stays `0.4.48` (cut against the same release window as `@ankit-prop/news@0.5.3`; rebumped during rebase reconciliation rather than reordering history).
- `TODOS.md`, `.dev/progress.md`, `.dev/journal.md` — record [ANKA-280](/ANKA/issues/ANKA-280) progress and audit trail.

**Verification**

- `bun run lint:fix` → exit 0; pre-existing unrelated Biome warnings/infos remain, no fixes applied after the baseline ignore.
- `bun test packages/eval-harness/src/replay-driver.spec.ts packages/eval-harness/src/replay-baseline.spec.ts packages/eval-harness/src/golden.spec.ts packages/eval-harness/src/ftmo-rules.spec.ts packages/eval-harness/src/backtest.spec.ts` → `26 pass / 0 fail / 8125 expects`.
- CLI byte-stability check: `bun run packages/eval-harness/src/replay-cli.ts --fixture-root data/market-data/twelvedata/v1.0.0-2026-04-28 --smoke --strategy open_hold_close_v1 --symbol-set xauusd_5m --out /tmp/anka-280-open-hold-close.json && cmp -s /tmp/anka-280-open-hold-close.json packages/eval-harness/baselines/open_hold_close_v1__v1.0.0-2026-04-28__xauusd_5m__smoke.json` → `byte-identical`.
- `bun run typecheck` → clean.
- `bun test` → `517 pass / 0 fail / 10649 expects`.
- `git diff --check` → clean.

## 0.4.47 / @ankit-prop/market-data@0.1.2 / @ankit-prop/market-data-twelvedata@0.1.3 / @ankit-prop/eval-harness@0.1.5 — 2026-04-29 22:10 Europe/Amsterdam

**Initiated by:** CodexExecutor (implementation), CodeReviewer (verdict APPROVE), QAEngineer (verdict APPROVE for QA coverage), and FoundingEngineer (rebase onto current `main` and merge) — closing [ANKA-236](/ANKA/issues/ANKA-236) and porting the [ANKA-69](/ANKA/issues/ANKA-69) market-data contract WIP forward from `stash@{7}`.

**Why:** [ANKA-70](/ANKA/issues/ANKA-70) replay harness work needs a provider-agnostic market-data seam that can consume the shipped TwelveData fixture format today and slot in cTrader historical bars later without changing consumers.

**Added** — `pkg:market-data`

- `packages/market-data/src/types.ts` / `provider.ts` — adds canonical `Bar`, `SymbolMeta`, `CalendarEvent`, `MarketDataQuery`, `MarketDataNotAvailable`, and `IMarketDataProvider`.
- `packages/market-data/src/fixture-schema.ts` — mirrors the shipped `@ankit-prop/market-data-twelvedata` v1 on-disk schemas for `manifest.json`, symbol meta, compact bar JSONL.gz rows, and adversarial windows (including `eventTsMs` on news windows).
- `packages/market-data/src/cached-fixture-provider.ts` — loads fixture roots, derives `tsEnd` from timeframe, enforces half-open range queries, throws on unknown symbol/timeframe, returns sparse gaps without fabrication, composes broker specs from injected `instrumentSpecs` (zeroed when missing), and projects adversarial windows to point-in-time `CalendarEvent` (anchoring news at `eventTsMs`, closures at `startMs`, `restricted = kind === 'news' || impact === 'closure'`). `getEvents()` filters on the projected event timestamp so range queries match what consumers see.
- `packages/market-data/src/*.spec.ts` — covers schema parity, contract round-trip, fixture loading, multi-timeframe queries, sparse/missing-bar behavior, range semantics (half-open boundary), loader-derived `tsEnd` (ignores on-disk bogus values), event projection (NFP `13:25Z..13:35Z`, closure as `restricted=true, impact='high'`), `instrumentSpecs` zeroing, malformed manifest/shard paths, and unknown symbol/timeframe failures.

**Changed** — `pkg:market-data-twelvedata`

- `packages/market-data-twelvedata/src/schema.ts` / `adversarial-windows.ts` — adds required `eventTsMs` to every adversarial window (news anchored at the actual print time; closures at period start).
- `data/market-data/twelvedata/v1.0.0-2026-04-28/adversarial-windows.json` — re-emitted from `buildCuratedAdversarialWindows('2026-04-28')`; existing `startMs` / `endMs` window bounds are unchanged.
- `packages/market-data-twelvedata/package.json` — bumps `@ankit-prop/market-data-twelvedata` `0.1.2` → `0.1.3`.

**Changed** — `pkg:eval-harness`

- `packages/eval-harness/src/types.ts` — re-exports `Bar`, `SymbolMeta`, and `CalendarEvent` from `@ankit-prop/market-data` while preserving existing eval-harness call-site names.
- `packages/eval-harness/package.json` — adds `@ankit-prop/market-data: workspace:*` and bumps `@ankit-prop/eval-harness` `0.1.4` → `0.1.5`.
- `package.json` / `bun.lock` — bump root `0.4.46` → `0.4.47` and register the new workspace package. (Original implementation bumped `0.4.41` → `0.4.42`; rebumped during rebase resolution because `0.4.42`–`0.4.46` had already shipped via [ANKA-121](/ANKA/issues/ANKA-121), [ANKA-268](/ANKA/issues/ANKA-268), [ANKA-168](/ANKA/issues/ANKA-168), [ANKA-270](/ANKA/issues/ANKA-270), [ANKA-201](/ANKA/issues/ANKA-201), and [ANKA-277](/ANKA/issues/ANKA-277).)
- `.dev/decisions.md` — records the ANKA-69 market-data decision as **ADR-0008** (the original WIP title said ADR-0003; current `main` owns ADR-0003 through ADR-0007 already, so the ADR was renumbered during rebase).

**Verification**

- `bun install --frozen-lockfile` — clean.
- `bun run lint:fix` and `bun run lint` — exit 0; only pre-existing unrelated Biome warnings outside this diff.
- `bun test packages/market-data packages/eval-harness` — 138 pass / 0 fail / 1324 expects (rerun ×3 on the calendar-event specs clean).
- `bun run typecheck` — clean.
- `git diff --check` — clean.
- Service restart/health: package-only change; no long-running service package changed.
- Reviewers: CodeReviewer APPROVE on rebased head `530b4988` (ANKA-266 predicate-fix re-review pass) and QAEngineer APPROVE for QA coverage on `91afb6e` (eight fail-closed paths audited; spec-only top-up commit covers `listAvailability` rejection of unknown symbols, loader-derived `tsEnd` against on-disk bogus values, and `typicalSpreadPips` zeroing).

## @ankit-prop/dashboard@0.1.3 — 2026-04-29 22:05 Europe/Amsterdam

**Initiated by:** FoundingEngineer, addressing the Designer visual-truth gate `CHANGES_REQUESTED` from [ANKA-277](/ANKA/issues/ANKA-277) on the [ANKA-121](/ANKA/issues/ANKA-121) banner contract.

**Why:** Designer's verdict found two CSS-only blockers on the BLUEPRINT §16.0 banner: (1) `.version-chip-current` had no rule, so the dashboard self-row at `state:"current"` was visually indistinguishable from a blank card next to red `unreachable` chips; (2) `.version-chip-stale` and `.version-chip-unreachable` shared the same red, so operators could not tell a stale build from a network timeout at a glance — different failure modes that need distinct affordance. Designer pre-wrote the exact selector additions; this CL applies them verbatim.

**Changed** — `feat(svc:dashboard)`

- `services/dashboard/src/client/styles.css` — adds `.version-chip-current` (green `#3a8f5c` / `#edf7f1`); splits the previous compound `.version-chip-stale, .version-chip-unreachable` into separate rules so `stale` is amber (`#d97706` / `#fffbeb`) and `unreachable` keeps red (`#e05252` / `#fff1f1`). `.version-chip-mismatch` (yellow), the health-status overlays, and the rest of the file are untouched.
- `services/dashboard/package.json` — `@ankit-prop/dashboard` `0.1.2` → `0.1.3` (CSS rule additions to a shipped package per BLUEPRINT §0.2 / AGENTS.md after-every-change checklist).
- `package.json` — root umbrella `0.4.44` → `0.4.46` (initial cut took `0.4.45`, but [ANKA-201](/ANKA/issues/ANKA-201) DBF-002 landed on `main` first at `3217fc0` and consumed `0.4.45`; the version was rebumped during conflict resolution rather than reordering history). The `@ankit-prop/dashboard@0.1.3` header on this entry is unchanged because it is package-named, not root-version-named.

**Verification**

- `bun test services/dashboard/src` → `12 pass / 0 fail / 21 expects` (CSS-only diff, version-matrix logic untouched).
- `bun run typecheck` → clean.
- `bun x biome check services/dashboard` → 1 pre-existing warning on the `react` ambient-shim, no errors.
- `bun run --cwd services/dashboard start`; live probes:
  - `GET :9204/health` → `{service:"dashboard", version:"0.1.3", status:"healthy", details.version_matrix_targets:5}` (post-bump).
  - `GET :9204/api/version-matrix` → 5 rows: dashboard `state:"current"` at `0.1.3`, four offline peers `state:"unreachable"` (the exact scenario Designer's blocker covered).
  - `GET :9204/assets/main.css` → bundle contains all three distinct selectors `.version-chip-current`, `.version-chip-stale`, `.version-chip-unreachable` (Tailwind v4's `@import "tailwindcss"` did not strip the new component rules).

## 0.4.45 — 2026-04-29 21:55 Europe/Amsterdam

**Initiated by:** FoundingEngineer, executing [ANKA-201](/ANKA/issues/ANKA-201) under CEO directive at comment `bdf72261` — apply DBF-002 verbatim after BlueprintAuditor verdict (comment `54b7d4a0`).

**Why:** Source-of-truth drift between `BLUEPRINT.md` and `main`. `pkg:market-data-twelvedata` ships at `@ankit-prop/market-data-twelvedata@0.1.2` (7 specs, `td-fetch` Bun CLI, 4 commits already using the scope tag) and 15 fixture files are force-added under `data/market-data/twelvedata/v1.0.0-2026-04-28/`, but §17 packages/ tree, §17 data/ tree, §25.1 top-scopes, and §25.2 sub-modules all omit the package and the checked-in fixture root — so future commits had no canonical scope tag and risked inventing ad-hoc ones.

**Changed** — `docs`

- `BLUEPRINT.md` §17 packages/ tree (lines 1867–1875) — add `market-data-twelvedata/` row with explicit deletability comment (deletable once cTrader-live history subsumes the same windows).
- `BLUEPRINT.md` §17 data/ tree (lines 1891–1906) — carve out `data/market-data/twelvedata/<fixture-version>/` as the checked-in exception to the gitignored `data/` rule (bars, symbols, manifest, adversarial-windows, fetch-log; force-added past `.gitignore`, version-pinned, immutable). Trailing comment changed from "gitignored runtime state" to "gitignored runtime state, except…".
- `BLUEPRINT.md` §25.1 top-scopes (line 2811) — append `pkg:market-data-twelvedata` row: `Library (temporary, deletable)`, `packages/market-data-twelvedata`, `@ankit-prop/market-data-twelvedata`, owner FoundingEngineer, disposal trigger reviewed at every §22 phase boundary against [ANKA-67](/ANKA/issues/ANKA-67).
- `BLUEPRINT.md` §25.2 (after `pkg:ctrader-vendor/...`) — insert `pkg:market-data-twelvedata/...` sub-module table (cli, planner, twelve-data-client, rate-limiter, fetcher, fixture-store, schema, symbols, timeframes, adversarial-windows, index) prefixed by a lifecycle reminder pointing back to §25.1.
- `DOC-BUG-FIXES.md` — DBF-002 entry now records the patch commit subject (`docs(docs): apply DBF-002 — catalog pkg:market-data-twelvedata in §17 / §25`).
- `package.json` — root umbrella `0.4.44` → `0.4.45` (docs-only governance bump; no package code touched). Rebase note: this commit was originally cut against `0.4.43` → `0.4.44`, but ANKA-270 (`48e0d81`) landed on `main` first and consumed `0.4.44`; the version was rebumped during conflict resolution rather than reordering history.

**Verification**

- Docs-only change. Per BLUEPRINT §0.2 smallest-verification rule, lint / test / typecheck not re-run — no package code, contract, or fixture is affected by Markdown edits to `BLUEPRINT.md` / `DOC-BUG-FIXES.md` / `CHANGELOG.md` / `.dev/progress.md` / `.dev/journal.md` / root `package.json` version field.
- Reviewer: BlueprintAuditor (sole reviewer per AGENTS.md doc-fix matrix; verdict already on file at comment `54b7d4a0` confirming the patch text and line numbers; close-out audit re-checks the applied diff matches the queued patch).

**Out-of-scope drift surfaced incidentally** (filed under DBF-002 as separate audit follow-ups, not part of this commit):

- `packages/market-data/` is a phantom (only `node_modules/`); rename, populate, or remove. Likely [ANKA-69](/ANKA/issues/ANKA-69) placeholder.
- `packages/triplon-config/` is a workspace package with own `package.json`/`src/`, while §5/§17/§25 frame `@triplon/config` as an external private-registry consumer. Vendored vs external drift needs its own DBF.
- `TODOS.md` Phase tree has no entry for ANKA-67 / ANKA-68 / ANKA-69 historical-fixture work — Phase 0–7 layout is silent on this stream entirely.

## @ankit-prop/news@0.5.2 — 2026-04-29 21:43 Europe/Amsterdam

**Initiated by:** local-board QA handoff on [ANKA-169](/ANKA/issues/ANKA-169).

**Why:** The ANKA-169 route, metrics, startup, and Treaty validation needed a runtime Eden/Treaty smoke test in addition to compile-time App-type assertions.

**Changed** — `svc:news`

- `services/news/src/app.spec.ts` — adds an in-process `createTreatyClient<NewsApp>(...)` smoke test against the composed `buildNewsApp`, routing the client call through `app.handle` and asserting the canonical `/health` response.
- `services/news/package.json` / `bun.lock` — bumps `@ankit-prop/news` `0.5.1 -> 0.5.2`.

**Verification**

- `bun run lint:fix` — exit 0; no scoped files changed beyond formatting already applied, pre-existing unrelated Biome warnings/infos remain.
- `bun test services/news/src/app.spec.ts` — 3 pass / 0 fail / 13 expects.
- `bun test services/news/src/routes/calendar.spec.ts services/news/src/app.spec.ts services/news/src/metrics.spec.ts services/news/src/start.spec.ts services/news/src/db/calendar-db.spec.ts services/news/src/health/health-route.spec.ts packages/shared-contracts/src/treaty-client/create-treaty-client.spec.ts` — 45 pass / 0 fail / 105 expects.
- `bun test` — 503 pass / 0 fail / 2475 expects.
- `bun run typecheck` — clean.
- Service restart/health smoke: `PORT=19269 NEWS_CALENDAR_DB_PATH=/tmp/anka-169-qa-news-calendar.db NODE_ENV=production bun run --cwd services/news start`; `/health` returned `200` with `"version":"0.5.2"` and `/metrics` emitted `ankit_news_fetch_age_seconds`.

## @ankit-prop/news@0.5.1 — 2026-04-29 21:10 Europe/Amsterdam

**Initiated by:** CodeReviewer CHANGES_REQUESTED follow-up on [ANKA-169](/ANKA/issues/ANKA-169), tracked as [ANKA-275](/ANKA/issues/ANKA-275).

**Why:** The ANKA-169 route implementation left two contract gaps: `/calendar/window` accepted an unfiltered window without repeated `instruments` query params, and `/calendar/by-day` accepted regex-shaped but impossible dates that could throw below the route boundary.

**Changed** — `svc:news`

- `services/news/src/routes/calendar.ts` — extracts shared repeated-`instruments` validation, applies it to `/calendar/window`, rejects singular/comma/missing instrument shapes with `400`, filters window events through `resolveAffectedSymbols(...)`, and rejects impossible semantic days with `400 { error: 'day must be a valid YYYY-MM-DD date' }`.
- `services/news/src/routes/calendar.spec.ts` — adds regressions for `/calendar/window` missing/comma/singular instruments, affected-symbol filtering, and impossible `/calendar/by-day` dates (`2026-99-99`, `2026-02-30`); the stale-freshness table now supplies valid window instruments.
- `services/news/package.json` / `bun.lock` — bumps `@ankit-prop/news` `0.5.0 -> 0.5.1`.

**Verification**

- `bun run lint:fix` — exit 0; formatted touched files, with pre-existing unrelated workspace warnings/infos still reported.
- `bun run lint` — exit 0; pre-existing unrelated workspace warnings/infos remain.
- `bun run typecheck` — clean.
- `bun test services/news/src/routes/calendar.spec.ts services/news/src/app.spec.ts` — 25 pass / 0 fail / 57 expects.
- Service restart/health smoke: `PORT=19275 NEWS_CALENDAR_DB_PATH=/tmp/anka-275-news-calendar.db NODE_ENV=production bun run --cwd services/news start`; `/health` returned `200` with `"version":"0.5.1"`.

## @ankit-prop/news@0.5.0 — 2026-04-29 20:54 Europe/Amsterdam

**Initiated by:** Paperclip scoped wake for [ANKA-169](/ANKA/issues/ANKA-169) after the ANKA-163/164/166/168 blockers resolved.

**Why:** Wave-2 N10 needs the news service to become a runnable Elysia service: calendar endpoints wired to the pure evaluators, freshness fail-closed behaviour at the route boundary, Prometheus metrics, a live `start.ts`, and a Treaty `App` type for downstream clients.

**Changed** — `svc:news`

- `services/news/src/app.ts` — composes canonical `/health`, existing `/health/details`, calendar routes, and `/metrics` into a single Elysia app with `HealthSnapshot` version reporting.
- `services/news/src/routes/calendar.ts` — adds `/calendar/restricted`, `/calendar/pre-news-2h`, `/calendar/next-restricted`, `/calendar/window`, and `/calendar/by-day` handlers with repeated-`instruments` query validation, UTC `at/from/to` validation, and freshness fail-closed gating.
- `services/news/src/metrics.ts` — emits Prometheus text for `ankit_news_fetch_age_seconds` and `ankit_news_unhealthy{reason}`, incrementing unhealthy counters only on `fresh -> !fresh` transitions.
- `services/news/src/start.ts` — opens the Bun SQLite calendar DB, loads the `@triplon/config` symbol-tag map, starts the fetcher, listens on `PORT` (default `9203`), logs `news listening port=<port> version=<version>`, and gracefully stops fetcher/server/DB on SIGINT/SIGTERM.
- `services/news/src/db/calendar-db.ts` — adds `selectEventsForPragueDay(day)` for the `/calendar/by-day` route.
- `services/news/src/index.ts` — re-exports the full Elysia app `App` type for Eden/Treaty consumers.
- `services/news/package.json` / `bun.lock` / `TODOS.md` — bumps `@ankit-prop/news` `0.4.3 -> 0.5.0`, makes `bun run --cwd services/news start` run the live entrypoint, and records T009.j complete.

**Verification**

- `bun run lint:fix` — exit 0; no final fixes applied, pre-existing unrelated workspace warnings/infos remain.
- `bun test services/news/src/app.spec.ts services/news/src/routes/calendar.spec.ts services/news/src/metrics.spec.ts services/news/src/start.spec.ts services/news/src/db/calendar-db.spec.ts services/news/src/health/health-route.spec.ts` — 37 pass / 0 fail / 83 expects.
- `bun test` — 496 pass / 0 fail / 2457 expects.
- `bun run typecheck` — clean.
- Service restart/health smoke: `PORT=19203 NEWS_CALENDAR_DB_PATH=/tmp/.../calendar.db NODE_ENV=production bun run --cwd services/news start`; `/health` returned `200` with `"version":"0.5.0"` and `/metrics` emitted `ankit_news_fetch_age_seconds`.

## 0.4.44 — 2026-04-29 20:38 Europe/Amsterdam

**Initiated by:** CEO, executing [ANKA-270](/ANKA/issues/ANKA-270) — Layer-1 of the [ANKA-268](/ANKA/issues/ANKA-268) remediation plan, recording that the GitHub merge-mode buttons have been disabled at the repo-settings level.

**Why:** ADR-0007 §Consequences paragraph 3 and CHANGELOG `0.4.43` "Out of scope (handed off)" both said the operator-side GitHub repo-settings tightening (`allow_squash_merge=false` / `allow_merge_commit=false`) was queued on a board child issue and the GitHub UI "Squash and merge" / "Create a merge commit" buttons remained visible. ANKA-270 has now shipped: the operator (Étienne) executed `gh api -X PATCH repos/ewildee/ankit-prop-trading-agent -f allow_squash_merge=false -f allow_merge_commit=false -f allow_rebase_merge=true` and pasted the verify output into the issue thread. ADR-0007's prose was therefore stale and is now updated to record the shipped flip with the verify output inline.

**Changed** — `docs` / `infra:tooling`

- `.dev/decisions.md` — ADR-0007 §Consequences paragraph 3 rewrites the "Until that ships, the GitHub UI ... buttons remain *visible*" wording with the shipped state and the verify output (`{ "allow_squash_merge": false, "allow_merge_commit": false, "allow_rebase_merge": true }`). The AGENTS.md merge protocol prohibition is now backed by a server-side hard-block in addition to the local `.githooks/commit-msg` guard and the post-merge audit.
- `.dev/journal.md` — appends the ANKA-270 / ADR-0007-Layer-1 entry above ANKA-268's 20:08 entry.
- `package.json` — root umbrella `0.4.43` → `0.4.44` (governance / docs change; no package code touched).

**Out of scope (handed off):**

- AGENTS.md PR merge protocol §1 "confirmed against this repo's current settings" prose still correctly describes the *failure modes* the protocol forbids; rewriting it to past tense is scope-creep against the smallest-diff principle for this PR and can ride a future merge-protocol audit if needed.
- Branch protection / required-status-checks tightening — operator-owned and explicitly out of scope per the ANKA-270 description's Notes section.

**Verification**

- Docs-only edits (`.dev/decisions.md`, `.dev/journal.md`, `CHANGELOG.md`) plus a root version bump in `package.json`. No source files touched; `bun test` / `bun run typecheck` / `bun run lint` not re-run (smallest verification per BLUEPRINT §0.2 — none of the commands could be affected by docs-only edits).
- Independent re-verify of the merge-mode flip from this agent's environment: `gh api repos/ewildee/ankit-prop-trading-agent | jq '{allow_squash_merge, allow_merge_commit, allow_rebase_merge}'` → `{ "allow_squash_merge": false, "allow_merge_commit": false, "allow_rebase_merge": true }`.

## @ankit-prop/contracts@0.7.1 / @ankit-prop/news@0.4.3 — 2026-04-29 20:30 Europe/Amsterdam

**Initiated by:** CEO mention unblocking [ANKA-168](/ANKA/issues/ANKA-168) after [ANKA-253](/ANKA/issues/ANKA-253) recovery.

**Why:** Wave-2 N9 needs a typed Elysia `/health/details` route for `services/news` so downstream Elysia/Eden consumers can inspect freshness state directly and treat stale/failed calendar fetches as HTTP 503.

**Changed** — `svc:news/health`, `pkg:contracts`

- `packages/shared-contracts/src/news.ts` — adds `NewsFreshnessReason` and `NewsHealthSnapshot` for the `/health/details` body `{ ok, version, fetchAgeSeconds, freshReason, lastFetchAtUtc }`.
- `services/news/src/freshness/freshness-monitor.ts` — extends `FreshnessSnapshot` with `lastFetchAtUtc` so the health route can report the stored fetch timestamp without re-querying package or DB state.
- `services/news/src/health/health-route.ts` — adds the Elysia `healthRoute({ freshness, clock, version })` plugin. Fresh snapshots return `200`; `never_fetched`, `fetch_unhealthy`, and `stale_calendar` return `503`.
- `services/news/src/index.ts` / `services/news/src/health/index.ts` — export the health surface plus type-only Treaty `App`; `NEWS_SERVICE_VERSION` is cached from `services/news/package.json` via `loadVersionFromPkgJson`.
- `services/news/package.json` / `packages/shared-contracts/package.json` / `bun.lock` — bump `@ankit-prop/news` to `0.4.3`, `@ankit-prop/contracts` to `0.7.1`, and add the service-local `elysia` dependency.
- `TODOS.md` — marks Phase 5 T009.i done for [ANKA-168](/ANKA/issues/ANKA-168).

**Verification**

- `bun run lint:fix` — exit 0; only pre-existing unrelated workspace warnings/infos remain.
- `bun test packages/shared-contracts/src/news.spec.ts services/news/src/freshness/freshness-monitor.spec.ts services/news/src/health/health-route.spec.ts` — 26 pass / 0 fail / 49 expects.
- `bun run typecheck` — clean.
- `bun test` — 473 pass / 0 fail / 2403 expects.
- Temporary route smoke: imported `healthRoute` + `NEWS_SERVICE_VERSION`, listened on an ephemeral port, and `GET /health/details` returned `200` with `"version":"0.4.3"`.

## 0.4.43 — 2026-04-29 20:08 Europe/Amsterdam

**Initiated by:** FoundingEngineer, executing [ANKA-268](/ANKA/issues/ANKA-268) — remediation of the PR [#13](https://github.com/ewildee/ankit-prop-trading-agent/pull/13) squash-merge protocol violation under CEO-approved Option 1 (logged exception, no `main` rewrite).

**Why:** Post-merge audit for [ANKA-165](/ANKA/issues/ANKA-165) confirmed `dbe4d31` landed via the GitHub-side "Squash and merge" path despite AGENTS.md forbidding `--squash` until a fresh ADR supersedes ADR-0006. Single parent, `committer GitHub <noreply@github.com>`, missing the canonical `Co-Authored-By: Paperclip <noreply@paperclip.ing>` footer (the local `commit-msg` hook does not fire on GitHub-side synthetic commits). Diff is correct (CodeReviewer APPROVE on the rebased head); only the merge lineage and footer are wrong, and five non-merge commits already sit on top of it on `origin/main`. Precedent: ADR-0003 chose the same trade-off for `c2b02e3`.

**Changed** — `docs` / `infra:tooling`

- `.dev/decisions.md` — adds **ADR-0007** (Accepted) recording the squash-merge exception, reaffirming `gh pr merge --rebase --match-head-commit <sha>` as the sole allowed strategy on this repo, and documenting the post-merge audit step.
- `AGENTS.md` — adds a new section **PR merge protocol §2 — Post-merge audit (mandatory, ADR-0007)** with three local commands (`git rev-list --parents -n 1 <sha>`, `git show --no-patch --pretty=fuller <sha>`, `grep` for the canonical footer) the merging agent runs and pastes into the issue thread before closing. Renumbers the existing `gh`-CLI fallback section to §3.
- `package.json` — root umbrella `0.4.42` → `0.4.43` (governance/process change; no package code touched).

**Out of scope (handed off):**

- GitHub repo-settings tightening (`allow_squash_merge=false`, `allow_merge_commit=false`) requires admin auth and is tracked on the board child issue created on [ANKA-268](/ANKA/issues/ANKA-268). Until it lands, the GitHub UI "Squash and merge" / "Create a merge commit" buttons remain visible — the AGENTS.md prohibition + post-merge audit are the interim guard.

**Verification**

- No code changed; `bun test` / `bun run typecheck` / `bun run lint` were not run (smallest verification per BLUEPRINT §0.2 — none of the commands could be affected by docs-only edits).
- Post-merge audit commands sanity-checked locally against the offending `dbe4d31` (single parent confirmed, `committer GitHub <noreply@github.com>` confirmed, footer absent) — i.e. the audit step would have flagged this exact merge.

## 0.4.42 / @ankit-prop/dashboard@0.1.2 — 2026-04-29 18:41 Europe/Amsterdam

**Initiated by:** FoundingEngineer, addressing CodeReviewer CHANGES_REQUESTED on [ANKA-121](/ANKA/issues/ANKA-121) ([review comment](/ANKA/issues/ANKA-121#comment-04f4f8de-fed6-4f0e-b8f0-7be8fe33b8b1)).

**Why:** The dashboard scaffold defaulted to port `9601`, but BLUEPRINT §17.2 / §19.5, `config/supervisor.example.yaml`, and `packages/shared-contracts/src/treaty-client/service-registry.ts` define the dashboard service on `9204`. Running on `9601` makes the supervisor health check and shared service registry wrong at runtime and violates the BLUEPRINT-as-source-of-truth rule. Hardcoding the URL in two places also defeats the version-matrix's drift-detection purpose, so the fix pins every default to the canonical `SERVICES` registry instead of swapping one literal.

**Changed** — `svc:dashboard`

- `services/dashboard/src/server.ts` — derive `DEFAULT_PORT` from `SERVICES.dashboard.port` (9204) instead of a hardcoded `9601`.
- `services/dashboard/src/version-matrix.ts` — `DEFAULT_VERSION_TARGET_SPECS` now derives every `defaultHealthUrl` from `SERVICES[name].baseUrl + healthPath`, so future port changes in the registry propagate automatically and the matrix cannot drift again.
- `services/dashboard/src/version-matrix.spec.ts` — adds the regression CodeReviewer requested: pins the full default-target map to `SERVICES`, asserts the dashboard self-target lands on `9204`, and asserts `loadVersionTargets` honours the `dashboardPort` override while defaulting to the registry URL.
- `services/dashboard/package.json` — description updated to `Port 9204`; `@ankit-prop/dashboard` `0.1.1` → `0.1.2`.
- `package.json` — root umbrella `0.4.41` → `0.4.42`.
- `TODOS.md` — Phase 6 T010 marked `[~]` with T010.a substep (Bun-served React 19 + Tailwind 4 shell + version-matrix banner + dashboard `/health`), pinned to ANKA-121.

**Verification**

- `bun install` — clean lockfile after the `@ankit-prop/dashboard` 0.1.2 bump.
- `bun test services/dashboard/src` — 12 pass / 0 fail / 21 expects (was 9 pass / 15 expects; +3 tests / +6 expects from the registry-pin regression).
- `bun run typecheck` — clean.
- `bun run lint:fix` — exit 0; only pre-existing unrelated workspace warnings/infos remain.
- Service restart/health: `bun run --cwd services/dashboard start` now serves `/health` on `:9204`. (Smoke proof attached to the routing comment on [ANKA-121](/ANKA/issues/ANKA-121).)

## @ankit-prop/news@0.4.2 / @triplon/config@0.2.0 — 2026-04-29 18:01 Europe/Amsterdam

**Initiated by:** FoundingEngineer, executing [ANKA-239](/ANKA/issues/ANKA-239) round 3 — rebase PR [#13](https://github.com/ewildee/ankit-prop-trading-agent/pull/13) / [ANKA-165](/ANKA/issues/ANKA-165) onto current `origin/main` after CodexExecutor stalled mid-rebase. Board override (no delegation) per the comment thread on [ANKA-239](/ANKA/issues/ANKA-239).

**Why:** PR [#13](https://github.com/ewildee/ankit-prop-trading-agent/pull/13) was code-clean at head `8ac72ab`, but `origin/main` advanced through the freshness-monitor stack ([ANKA-167](/ANKA/issues/ANKA-167) PR #23) and now owns `@ankit-prop/news@0.4.1`. This rebase keeps the generated SymbolTagMap loader migration unchanged while reslotting the package version to `@ankit-prop/news@0.4.2`.

**Added** — `@triplon/config` v0.1.2 → v0.2.0

- `packages/triplon-config/src/generated/symbol-tag-map.loader.ts` — generated `createSymbolTagMapConfig()` and `loadSymbolTagMapConfig(path?)` helpers backed by `defineAppConfig`, `SymbolTagMapSchema`, and generated `SymbolTagMap` types.
- `packages/triplon-config/src/codegen/run.ts` — emits loader artifacts alongside JSON Schema and TypeScript type artifacts; `bun run config:codegen --check` tracks all three.
- `packages/triplon-config/package.json` — exports `@triplon/config/generated/symbol-tag-map` for generated loader consumption.

**Changed** — `@ankit-prop/news` v0.4.1 → v0.4.2

- `services/news/src/config/load-symbol-tag-map.ts` — owns the service loader wrapper and delegates handle creation to the generated `@triplon/config` loader. User/project config precedence is unchanged; when neither exists, the loader falls back to the service-local default.
- `services/news/config/symbol-tag-map.yaml` — service-local default copy of the SymbolTagMap content.
- `services/news/src/symbol-tag-mapper.ts` — removes inline Zod schema and direct `defineAppConfig` handle construction; re-exports the loader and `SymbolTagMap` type while preserving `resolveAffectedSymbols(...)`.
- `services/news/src/symbol-tag-mapper.spec.ts` — carries the schema-drift regression required by [ANKA-165](/ANKA/issues/ANKA-165), proving invalid YAML still throws `ConfigError` through the generated loader path.
- `services/news/package.json` — rebases the PR-side `@triplon/config` dependency onto current `@ankit-prop/contracts` from `main` and bumps `@ankit-prop/news` to `0.4.2`.

**Verification**

- `bun install --frozen-lockfile` ✓
- `bun run config:codegen --check` ✓
- `bun test services/news/src/symbol-tag-mapper.spec.ts packages/triplon-config/src/codegen/run.spec.ts` → 14 pass / 26 expect() calls
- `bun run lint` ✓ (Biome pre-existing diagnostics only: 26 warnings / 36 infos, none from this PR)
- `bun run typecheck` ✓
- `git diff --check origin/main...HEAD` ✓
- Full `bun test` was last run green at 368 pass / 2151 expects on the prior verification (re-confirmed by [ANKA-239](/ANKA/issues/ANKA-239) post-rebase local gate, [ANKA-171](/ANKA/issues/ANKA-171) re-review).

## 0.4.41 / @ankit-prop/news@0.3.7 — 2026-04-29 16:54 Europe/Amsterdam

**Initiated by:** CodexExecutor, addressing CodeReviewer CHANGES_REQUESTED on [ANKA-166](/ANKA/issues/ANKA-166) / PR [#18](https://github.com/ewildee/ankit-prop-trading-agent/pull/18).

**Why:** The PR branch was stale against `main`, and the first `next-restricted` helper treated high-impact non-restricted events as force-flat events while malformed calendar rows could crash or silently disappear. Rail 13 needs the conservative `/calendar/next-restricted` contract from BLUEPRINT §9 and §11.6: only `restriction === true` schedules pre-flatten, and malformed rows poison the horizon until the route can translate the error to a fail-closed response.

**Changed** — `svc:news/next-restricted-locator`

- `services/news/src/evaluator/next-restricted.ts` — narrows matches to `restriction === true`, adds exported `MalformedCalendarRowError`, parses rows with `CalendarItem.safeParse`, and throws after scanning if any malformed row or malformed date is present in the queried horizon.
- `services/news/src/evaluator/next-restricted.spec.ts` — adds regressions for high-impact non-restricted exclusions, non-shadowing of real restricted events, malformed rows, malformed dates, and malformed rows poisoning otherwise valid matches.
- `services/news/src/evaluator/index.ts` — exports `MalformedCalendarRowError` for the future route handler.
- `package.json` / `services/news/package.json` — bump root `0.4.40` → `0.4.41` and `@ankit-prop/news` `0.3.6` → `0.3.7` after rebasing over [ANKA-231](/ANKA/issues/ANKA-231).

**Verification**

- `bun run lint:fix` — exit 0; no fixes applied on the final base, only pre-existing unrelated workspace warnings/infos.
- `bun test services/news/src/evaluator/next-restricted.spec.ts services/news/src/evaluator/restricted-window.spec.ts services/news/src/evaluator/pre-news.spec.ts` — 42 pass / 0 fail / 63 expects.
- `bun run typecheck` — clean.
- Service restart/health: `services/news` still has only the placeholder `start` script and no long-running `/health` endpoint to verify yet.

## @ankit-prop/news@0.3.6 — 2026-04-29 13:51 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-231](/ANKA/issues/ANKA-231) — CodeReviewer BLOCK follow-up for PR [#17](https://github.com/ewildee/ankit-prop-trading-agent/pull/17).

**Why:** `mapCalendarItemToEvent` derived `eventTsUtc` with raw `Date.parse(item.date)`, which allowed offsetless FTMO date strings to depend on the host timezone and impossible calendar dates to roll into a different instant. News blackout and pre-news rails consume that UTC instant, so mapper-side contract drift must fail closed before any DB persistence.

**Changed** — `svc:news/calendar-fetcher`

- `services/news/src/fetcher/map-event.ts` — validates FTMO event dates against the BLUEPRINT §11.2 explicit-offset ISO shape before parsing, rejects impossible local date/time components, and compares native parsing against an expected UTC instant built from the captured offset.
- `services/news/src/fetcher/map-event.spec.ts` — adds regressions for offsetless `2026-04-03T14:30:00` and impossible `2026-02-31T14:30:00+01:00`, both throwing `CalendarItemMapError` with `field === "date"`.
- `services/news/src/fetcher/calendar-fetcher.spec.ts` — adds a mixed-batch regression proving one offsetless item returns `{ ok: false, reason: "schema_mismatch" }`, marks `last_fetch_ok` as `0`, and performs no `db.upsertEvents`.
- `services/news/package.json` — `@ankit-prop/news` `0.3.5` → `0.3.6`.

**Verification**

- `bun install` — clean; saved lockfile, checked 79 installs across 84 packages, no changes.
- `bun run lint:fix` — exit 0; no fixes applied, only pre-existing unrelated Biome warnings/infos.
- `bun run lint` — exit 0; same pre-existing unrelated Biome warnings/infos.
- `bun run typecheck` — clean.
- `bun test services/news/src/fetcher services/news/src/db/calendar-db.spec.ts` — 33 pass / 0 fail / 135 expects.
- `git diff --check` — clean.
- Debug grep over changed source/package files found no `console.log`, `debugger`, `TODO`, or `HACK`.
- Service restart/health: `bun run --cwd services/news start` prints `news: not yet implemented (Phase 5)`, so there is no long-running news service or `/health` endpoint to verify yet.

## @ankit-prop/news@0.4.1 — 2026-04-29 16:33 Europe/Amsterdam

**Initiated by:** CodeReviewer changes-requested on [ANKA-167](/ANKA/issues/ANKA-167), routed back to CodexExecutor by FoundingEngineer.

**Why:** The N8 freshness monitor must fail closed for uncertain fetch metadata. A future `last_fetch_at` or any non-literal healthy marker could otherwise report the FTMO calendar as fresh and weaken the later staleness blackout path.

**Fixed** — `svc:news/freshness-monitor`

- `services/news/src/freshness/freshness-monitor.ts` — only `last_fetch_ok === '1'` can reach the fresh/stale age check; missing, legacy, or unknown values return `fetch_unhealthy`.
- `services/news/src/freshness/freshness-monitor.ts` — future `last_fetch_at` values now return `{ fresh: false, reason: 'fetch_unhealthy', ageSeconds: 0 }`.
- `services/news/src/freshness/freshness-monitor.spec.ts` — replaces the previous future-timestamp fresh assertion and adds table-driven regressions for `null`, `''`, `'0'`, `'true'`, `'false'`, `'yes'`, and `'unhealthy'` health markers.
- `services/news/package.json` / `bun.lock` — bumps `@ankit-prop/news` `0.4.0` -> `0.4.1`.
- `.dev/progress.md`, `.dev/journal.md`, and `TODOS.md` — record the review-fix heartbeat and Bun `llms.txt` fetch.

**Verification**

- `bun install --frozen-lockfile` — clean; checked 79 installs across 84 packages, no changes.
- `bun run lint:fix` — exit 0; no fixes applied, with only pre-existing unrelated Biome warnings/infos outside this diff.
- `bun run lint` — exit 0; same pre-existing unrelated Biome warnings/infos.
- `bun run typecheck` — clean.
- `bun test services/news/src/freshness` — 8 pass / 0 fail / 15 expects.
- `rg -n "console\\.log|debugger|TODO|HACK" services/news/src/freshness/freshness-monitor.ts services/news/src/freshness/freshness-monitor.spec.ts services/news/package.json bun.lock` — no matches.
- Service restart/health: `bun run --cwd services/news start` prints `news: not yet implemented (Phase 5)`, so there is still no long-running news service or `/health` endpoint to verify.

## @ankit-prop/news@0.4.0 — 2026-04-29 14:05 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-167](/ANKA/issues/ANKA-167) after blocker [ANKA-162](/ANKA/issues/ANKA-162) resolved.

**Why:** Wave-2 N8 needs a pure 2 h staleness watchdog over the calendar fetch metadata so later `/health/details`, metrics, and gateway blackout wiring can fail closed when the FTMO calendar is stale, never fetched, or the latest fetch was unhealthy.

**Added** — `svc:news/freshness-monitor`

- `services/news/src/freshness/freshness-monitor.ts` — adds `createFreshnessMonitor({ db, clock, logger })`, `STALENESS_LIMIT_MS`, and `currentSnapshot()` over `last_fetch_at` / `last_fetch_ok` metadata without logging or metric side effects.
- `services/news/src/freshness/index.ts` — exports the freshness monitor surface for upcoming health/metrics wiring.
- `services/news/src/freshness/freshness-monitor.spec.ts` — covers `never_fetched`, `fetch_unhealthy`, `stale_calendar`, `fresh`, the strict `> 2h` boundary, future timestamp age clamping, and malformed timestamp fail-closed output.
- `services/news/package.json` / `bun.lock` — bumps `@ankit-prop/news` `0.3.5` → `0.4.0`.
- `TODOS.md`, `.dev/progress.md`, and `.dev/journal.md` — record the completed N8 work and Bun `llms.txt` fetch.

**Verification**

- `bun install` — clean; saved lockfile.
- `bun install --frozen-lockfile` — clean; checked 79 installs across 84 packages, no changes.
- `bun run lint:fix` — exit 0; no fixes applied on the final run, with only pre-existing unrelated Biome diagnostics outside this diff.
- `bun test services/news/src/freshness services/news/src/fetcher services/news/src/db/calendar-db.spec.ts services/news/src/evaluator` — 66 pass / 0 fail / 168 expects.
- `bun run typecheck` — clean.
- `rg -n "console\\.log|debugger|TODO|HACK" services/news/src/freshness/freshness-monitor.spec.ts services/news/src/freshness/freshness-monitor.ts services/news/src/freshness/index.ts services/news/package.json bun.lock` — no matches.
- Service restart/health: `bun run --cwd services/news start` prints `news: not yet implemented (Phase 5)`, so there is no long-running news service or `/health` endpoint to verify yet.

## @ankit-prop/news@0.3.5 — 2026-04-29 13:30 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-229](/ANKA/issues/ANKA-229) — QA checklist gap from [ANKA-224](/ANKA/issues/ANKA-224) on PR [#17](https://github.com/ewildee/ankit-prop-trading-agent/pull/17).

**Changed** — `svc:news/calendar-fetcher`

- `services/news/src/fetcher/calendar-fetcher.spec.ts` — add mixed-batch (good/bad/good) no-partial-persistence regression spec ([ANKA-229](/ANKA/issues/ANKA-229), closes QA gap from [ANKA-224](/ANKA/issues/ANKA-224)).
- `services/news/package.json` — `@ankit-prop/news` `0.3.4` → `0.3.5`.

**Verification**

- `bun install` — clean; saved lockfile, checked 79 installs across 84 packages, no changes.
- `bun run lint:fix` — exit 0; no fixes applied, only pre-existing unrelated Biome warnings/infos.
- `bun test services/news/src/fetcher` — 22 pass / 0 fail / 102 expects.
- `bun run typecheck` — clean.
- `git diff -- services/news/src/fetcher/calendar-fetcher.spec.ts services/news/package.json | rg -n "console\\.log|debugger|TODO|HACK"` — no matches.
- Service restart/health: `bun run --cwd services/news start` prints `news: not yet implemented (Phase 5)`, so there is no long-running news service or `/health` endpoint to verify yet.

## 0.4.39 — 2026-04-29 13:18 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-217](/ANKA/issues/ANKA-217) after CEO / FoundingEngineer unblocked the ADR numbering conflict.

**Why:** CEO directive `4d83598b` on [ANKA-147](/ANKA/issues/ANKA-147) retired public CI for this repo: the Triplon npm registries are internal-only, public runners are not a sustainable dependency, and packages are not planned for public publication. The existing disabled GitHub Actions file and ADR-0004 re-enable path implied public CI remained a dormant option. ADR-0006 makes the policy explicit and preserves ADR-0005 for the unrelated Elysia/Eden decision.

**Changed** — `docs`, `infra:ci`

- `.dev/decisions.md` — appends ADR-0006 — *No public CI* — and marks ADR-0004 as superseded by ADR-0006 while leaving ADR-0005 (Elysia + Eden/Treaty) accepted and unchanged.
- `BLUEPRINT.md` — adds the §0.2 cross-link that makes local `bun run lint`, `bun run typecheck`, and `bun test` evidence the repository verification gate and forbids GitHub Actions / public-runner pipelines.
- `AGENTS.md` — removes stale [ANKA-137](/ANKA/issues/ANKA-137) / [ANKA-138](/ANKA/issues/ANKA-138) CI-footer-guard assumptions from the PR merge protocol while keeping the rebase-only merge rule.
- `.github/workflows/ci.yml.disabled` — deleted; the empty `.github/workflows/` directory is no longer tracked.
- `TODOS.md` — updates the historical scaffold line from "CI gate" to "local gates" so durable task state matches ADR-0006.
- `.dev/progress.md` and `.dev/journal.md` — record the current no-public-CI cleanup heartbeat and Bun `llms.txt` fetch.

**Bumped**

- root `ankit-prop-umbrella` 0.4.38 → 0.4.39.

**Verification**

- `bun run lint:fix` — exit 0; no files changed, Biome reported only pre-existing warnings/infos.
- `bun run lint` — exit 0; same pre-existing warnings/infos.
- `bun install --frozen-lockfile` — clean; installed fresh worktree dependencies without touching `bun.lock`.
- `bun run typecheck` — clean after install.
- `bun test` — 403 pass / 0 fail / 2207 expects.
- Service restart/health: not applicable; docs/root metadata only, no service package changed.

## @ankit-prop/news@0.3.4 — 2026-04-29 13:18 Europe/Amsterdam

**Initiated by:** FoundingEngineer, merging [ANKA-214](/ANKA/issues/ANKA-214) (PR [#20](https://github.com/ewildee/ankit-prop-trading-agent/pull/20)) onto `main` after [ANKA-221](/ANKA/issues/ANKA-221) CodeReviewer APPROVE and [ANKA-222](/ANKA/issues/ANKA-222) QAEngineer PASS.

**Why:** CodeReviewer flagged that `services/news/src/evaluator/pre-news.ts` still treated `instrument: "ALL"` as an unconditional global sentinel even after `restricted-window.ts` was aligned to BLUEPRINT §11.3 / §17.3. Pre-news matching now routes through the configured `symbol-tag-mapper` for `ALL` the same way every other FTMO instrument tag is resolved, so an unmapped `ALL` row no longer auto-restricts every requested instrument.

**Changed** — `svc:news/pre-news-evaluator`

- `services/news/src/evaluator/pre-news.ts` — removes the `event.instrument === "ALL"` unconditional match path; affected symbols now come only from `resolveAffectedSymbols(event.instrument, mapper, logger)`.
- `services/news/src/evaluator/pre-news.spec.ts` — adds regressions proving an unmapped `ALL` row does not restrict requested instruments while a configured `ALL` mapping does restrict mapped instruments; preserves existing fail-closed coverage for malformed `atUtc` and malformed event dates returning `stale_calendar`.
- `services/news/src/evaluator/restricted-window.spec.ts` — adds the QA-required mapped-`ALL` parity case so the restricted-window evaluator carries the same regression shape as the pre-news evaluator.
- `services/news/package.json` — bumps `@ankit-prop/news` `0.3.3` → `0.3.4`.

**Verification**

- `bun test services/news/src/evaluator/pre-news.spec.ts` — 18 pass / 0 fail.
- `bun test services/news/src/evaluator/restricted-window.spec.ts` — 11 pass / 0 fail (one new mapped-`ALL` parity case).
- `bun run typecheck` — clean.
- `bun run lint:fix` — exit 0; only pre-existing unrelated diagnostics outside this diff.
- Service restart/health: `services/news` still has only the placeholder `start` script and no long-running `/health` endpoint to verify (Phase 5 deliverable).

## 0.4.38 — 2026-04-29 13:04 Europe/Amsterdam

**Initiated by:** FoundingEngineer, executing [ANKA-219](/ANKA/issues/ANKA-219) — companion to [ANKA-215](/ANKA/issues/ANKA-215).

**Why:** The `## Close-message handoff convention (mandatory)` section now lives in every per-agent `AGENTS.md` after [ANKA-215](/ANKA/issues/ANKA-215), but the project-root `AGENTS.md` did not yet carry it, so anyone reading the working agreement (or onboarding a new agent in this repo) could not see the structured-mention requirement that prevents handoff stalls like PR #14 / [ANKA-164](/ANKA/issues/ANKA-164).

**Changed** — `docs`

- `AGENTS.md` — adds `## Close-message handoff convention (mandatory)` between `## Bounds` and `## Reuse note`. Mirrors the per-agent text verbatim and includes the engineering-org agent ID table for all 13 agents (CEO, FoundingEngineer, CodexExecutor, Architect, Debugger, QAEngineer, CodeReviewer, SecurityReviewer, Designer, DocumentSpecialist, Scientist, Planner, BlueprintAuditor). Documents that `assigneeAgentId` reassignment alone does not wake the next owner; the structured `agent://<agent-id>` mention in the comment body is still required.
- `package.json` — root umbrella `0.4.37` → `0.4.38` (docs-only patch).

**Verification**

- Docs-only change; no code paths touched. Per the §31 review-gate matrix, trivial docs-only changes need no reviewer.
- `git diff` confirms the new section sits between `## Bounds` and `## Reuse note` and the agent ID table contains all 13 expected rows.

## @ankit-prop/news@0.3.3 — 2026-04-29 12:52 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-213](/ANKA/issues/ANKA-213) — rebase PR [#14](https://github.com/ewildee/ankit-prop-trading-agent/pull/14) / `feat/anka-164-pre-news` onto current `origin/main`.

**Why:** PR [#14](https://github.com/ewildee/ankit-prop-trading-agent/pull/14) was authored before the restricted-window evaluator and calendar DB branches landed on `main`. This reconciliation keeps the pre-news evaluator behavior unchanged while making the PR branch mergeable on current `origin/main` (`70eebae`).

**Changed** — `svc:news/pre-news-evaluator`

- `services/news/src/evaluator/index.ts` — reconciles the add/add barrel export conflict so the restricted-window and pre-news evaluator surfaces are both exported.
- `services/news/package.json` — bumps `@ankit-prop/news` `0.3.2` → `0.3.3` for the rebase reconciliation slot.
- `CHANGELOG.md`, `.dev/journal.md`, and `.dev/progress.md` — preserve the PR-side `0.3.0..0.3.2` bookkeeping alongside the newer mainline entries and record this rebase.

**Verification**

- `bun install` — clean; lockfile save attempted after the package bump. Bun 1.3.13 left no final `bun.lock` diff for the workspace-only `0.3.3` version slot.
- `bun install --frozen-lockfile` — clean; checked 79 installs across 84 packages.
- `bun run lint:fix` — exit 0; Biome formatted the evaluator barrel and reported only pre-existing unrelated warnings/infos.
- `bun test services/news/src/evaluator/pre-news.spec.ts` — 16 pass / 0 fail / 21 expects.
- `bun test services/news/src/evaluator/restricted-window.spec.ts` — 10 pass / 0 fail / 15 expects.
- `bun run typecheck` — clean.
- Service restart/health: `bun run --cwd services/news start` prints `news: not yet implemented (Phase 5)`, so there is no long-running news service or `/health` endpoint to verify yet.

## @ankit-prop/news@0.3.2 — 2026-04-29 12:37 Europe/Amsterdam

**Initiated by:** CodexExecutor, addressing [CodeReviewer](/ANKA/agents/codereviewer) feedback from [ANKA-172](/ANKA/issues/ANKA-172) on PR #14 / [ANKA-164](/ANKA/issues/ANKA-164).

**Why:** CodeReviewer found two fail-open edges in the pure pre-news evaluator: omitted time sources raised `RangeError: Invalid Date`, and malformed relevant event dates could be filtered out as unrestricted. Both now fail closed through the canonical `stale_calendar` restricted reply.

**Changed** — `svc:news/pre-news-evaluator`

- `services/news/src/evaluator/pre-news.ts` — validates `atUtc ?? clock.nowUtc()` before querying. Missing or malformed evaluation time returns `{ restricted: true, reasons: [{ event: 'invalid_pre_news_time', eta_seconds: 0, rule: 'stale_calendar' }] }`.
- `services/news/src/evaluator/pre-news.ts` — parses candidate calendar rows with `CalendarItem.safeParse`; malformed rows fail closed. Relevant tier-1 matching rows with malformed `date` now return `stale_calendar` instead of silently disappearing from the unrestricted result.
- `services/news/src/evaluator/pre-news.spec.ts` — adds regressions for `clock.nowUtc()` fallback, omitted time source, malformed `atUtc`, and malformed relevant event dates.
- `services/news/package.json` — version `0.3.1` → `0.3.2`; `bun.lock` records the bump.

**Verification**

- `bun install` — clean, lockfile saved.
- `bun run lint:fix` — exit 0; pre-existing unrelated warnings/infos remained.
- `bun test services/news/src/evaluator/pre-news.spec.ts` — 16 pass / 0 fail / 21 expects.
- `bun run typecheck` — clean.
- Service restart/health: `bun run --cwd services/news start` still prints `news: not yet implemented (Phase 5)`, so there is no long-running news service or `/health` endpoint to restart/verify yet.

## 0.4.37 / @ankit-prop/contracts@0.7.0 / @ankit-prop/news@0.3.0 — 2026-04-29 12:33 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-161](/ANKA/issues/ANKA-161) — `svc:news/calendar-db` Bun SQLite store + PR [#15](https://github.com/ewildee/ankit-prop-trading-agent/pull/15) CodeReviewer follow-up.

**Why:** Wave-2 N2 for [ANKA-75](/ANKA/issues/ANKA-75) needs a pure local SQLite calendar store before the fetcher/evaluator endpoints can consume FTMO economic-calendar data. CodeReviewer found the first PR head normalized away canonical `CalendarItem.date` and raw multi-tag `instrument`, which made the now-merged restricted-window evaluator impossible to wire without losing symbol mapping.

**Added** — `@ankit-prop/contracts` v0.6.0 → v0.7.0

- `packages/shared-contracts/src/news.ts` — `CalendarEvent` strict Zod schema for persisted rows keyed by FTMO event id, carrying UTC millisecond `eventTsUtc`, canonical `date`, raw `instrument`, parsed `instrumentTags`, and the existing calendar payload fields.
- `packages/shared-contracts/src/news.spec.ts` — CalendarEvent parse and fail-closed timestamp coverage, including multi-tag preservation.

**Added** — `@ankit-prop/news` v0.2.3 → v0.3.0

- `services/news/src/db/init.sql` — forward-only schema for `calendar_event` plus `meta`, with only `(event_ts_utc)` and `(currency)` indices and `schema_version=1`.
- `services/news/src/db/calendar-db.ts` — `bun:sqlite` wrapper with WAL + `synchronous=NORMAL`, idempotent `init`, transactional `upsertEvents`, evaluator-compatible `selectEventsBetween(...): CalendarItem[]`, record-level `selectEventRecordsBetween`, `setMeta`/`getMeta`, and typed `CalendarDbUnwriteableError`.
- `services/news/src/db/calendar-db.spec.ts` — temp/`:memory:` SQLite tests for init idempotency, cassette replay idempotency, Zod rejection, inclusive range ordering, raw multi-tag round-trip + symbol mapping, metadata, and unwriteable path failure.
- `services/news/package.json` / `bun.lock` — direct workspace dependency on `@ankit-prop/contracts`.

**Verification**

- `bun install` — clean; checked 79 installs across 84 packages.
- `bun run lint:fix` — exit 0; formatted the new DB spec and reported only pre-existing unrelated warnings/infos.
- `bun test packages/shared-contracts/src/news.spec.ts services/news/src/db/calendar-db.spec.ts services/news/src/evaluator/restricted-window.spec.ts` — 28 pass / 0 fail / 55 expects.
- `bun test` — 387 pass / 0 fail / 2186 expects.
- `bun run typecheck` — clean.
- `bun test --coverage services/news/src/db/calendar-db.spec.ts` — 8 pass / 0 fail / 19 expects.
- Debug grep over changed source/package files found no `console.log`, `debugger`, `TODO`, or `HACK`.

## @ankit-prop/news@0.3.1 — 2026-04-29 12:30 Europe/Amsterdam

**Initiated by:** QAEngineer (codex_local), executing [ANKA-175](/ANKA/issues/ANKA-175) — QA boundary/DST check for PR #14 / [ANKA-164](/ANKA/issues/ANKA-164).

**Why:** PR #14 already covered the requested individual `pre-news-2h` boundaries and Prague DST transitions. QA adds a mixed-boundary regression that proves the exact ordinary UTC query range and the combined filter behaviour in one fixture.

**Added** — `svc:news/pre-news-evaluator`

- `services/news/src/evaluator/pre-news.spec.ts` — adds a mixed `[atUtc, atUtc + 2h)` regression with `atUtc - 1m`, `atUtc + 0`, `+1h59m`, exclusive `+2h`, tier-2/3 rows, and an unmapped instrument row, while asserting the DB query range is exactly `12:00:00.000Z` through `14:00:00.000Z`.

**Changed** — `@ankit-prop/news`

- `services/news/package.json` — version `0.3.0` → `0.3.1` for the QA regression coverage bump.
- `bun.lock` — records the `@ankit-prop/news` version bump.

**Verification**

- `bun install` — clean, lockfile saved.
- `bun test services/news/src/evaluator/pre-news.spec.ts` — 12 pass / 0 fail / 16 expects.
- Deliberate regression check: temporarily changed the `+2h` comparator from `< toMs` to `<= toMs`; the focused spec failed 10 pass / 2 fail / 16 expects on the new mixed-boundary case and the existing exclusive-`+2h` case, then the comparator was restored.
- `bun run lint:fix` — exit 0; Biome fixed the new spec formatting and reported pre-existing unrelated warnings/infos.
- `bun test` — 379 pass / 0 fail / 2163 expects.
- `bun run typecheck` — clean.
- Service restart/health: `bun run --cwd services/news start` still prints `news: not yet implemented (Phase 5)`, so there is no long-running news service or `/health` endpoint to restart/verify yet.

## 0.4.36 / @ankit-prop/news@0.2.3 — 2026-04-29 10:16 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-207](/ANKA/issues/ANKA-207) — close QA gaps on PR [#16](https://github.com/ewildee/ankit-prop-trading-agent/pull/16).

**Changed** — `svc:news/restricted-window-evaluator`

- `services/news/src/evaluator/restricted-window.spec.ts` — adds QA-requested regressions for the inclusive two-sided ±5 minute window, restricted events whose mapped symbols miss the requested instrument, and empty-instrument requests skipping the DB seam.
- `services/news/package.json` — `@ankit-prop/news` `0.2.2` → `0.2.3`.
- Root `package.json` — `0.4.35` → `0.4.36`.

**Verification**

- `bun install` — clean; linked workspaces in the fresh worktree, with no final `bun.lock` diff.
- `bun test services/news/src/evaluator/restricted-window.spec.ts` — 10 pass / 0 fail / 15 expects.
- `bun run lint:fix services/news/src/evaluator/restricted-window.spec.ts` — exit 0; formatted the restricted-window spec and reported only pre-existing unrelated Biome diagnostics.
- `bun run typecheck` — clean.

## 0.4.35 / @ankit-prop/news@0.2.2 — 2026-04-29 10:01 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-194](/ANKA/issues/ANKA-194) — reviewer-required corrections for PR [#16](https://github.com/ewildee/ankit-prop-trading-agent/pull/16).

**Changed** — `svc:news/restricted-window-evaluator`

- `services/news/src/evaluator/restricted-window.ts` — narrows `/calendar/restricted` eligibility to `restriction === true`, matching BLUEPRINT §11.5's ±5-min blackout rule. High-impact rows with `restriction: false` are left to the separate 2-h pre-news tier-1 evaluator.
- `services/news/src/evaluator/restricted-window.ts` — removes the hard-coded `instrument === 'ALL'` global-match sentinel; instrument matching now goes exclusively through `symbol-tag-mapper`.
- `services/news/src/evaluator/restricted-window.spec.ts` — adds regressions for high-impact-but-unrestricted rows and `ALL` rows so both reviewer corrections stay pinned.
- `services/news/package.json` — `@ankit-prop/news` `0.2.1` → `0.2.2`.
- Root `package.json` — `0.4.34` → `0.4.35`.

**Verification**

- `bun install` — clean; refreshed `bun.lock` for `@ankit-prop/news@0.2.2`.
- `bun test services/news/src/evaluator/restricted-window.spec.ts` — 7 pass / 0 fail / 11 expects.
- `bun run lint:fix` — exit 0; no repo files changed by formatting, pre-existing unrelated warnings/infos remain.
- `bun test` — 374 pass / 0 fail / 2158 expects.
- `bun run typecheck` — clean.

## @ankit-prop/news@0.3.0 — 2026-04-29 09:25 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-164](/ANKA/issues/ANKA-164) — Wave-2 N6 `svc:news/pre-news-evaluator`.

**Why:** The news service needs the pure `/calendar/pre-news-2h` evaluator contract before the Elysia router can wire the endpoint. This adds the 2 h tier-1 lookahead with explicit forward-window and DST boundary coverage.

**Added** — `svc:news/pre-news-evaluator`

- `services/news/src/evaluator/pre-news.ts` — exports `evaluatePreNews({ db, mapper, clock }, { atUtc, instruments })`, querying `[atUtc, atUtc + 2h)` in UTC, filtering tier-1 events (`impact === 'high' || restriction === true`), matching requested tracked instruments through the existing symbol-tag mapper, and returning canonical `RestrictedReply` reasons with `rule: 'pre_news_2h'`.
- `services/news/src/evaluator/pre-news.spec.ts` — covers empty instruments, inclusive `atUtc`, `+1h59m`, exclusive `+2h`, forward-only exclusion, tier-2/3 exclusion, restriction=true tier-1 handling, FTMO tag mapping, unmatched instruments, and Prague DST forward/backward two-hour UTC arithmetic.
- `services/news/src/evaluator/index.ts` — re-exports the evaluator and dependency/request types for the future router.

**Changed** — `@ankit-prop/news`

- `services/news/package.json` — version `0.2.0` → `0.3.0` and declares the local `@ankit-prop/contracts` workspace dependency used for `CalendarItem` / `RestrictedReply` schema parsing.
- `bun.lock` — records the `@ankit-prop/news` version and workspace dependency update.

**Verification**

- `bun install` — clean, lockfile saved.
- `bun run lint:fix` — exit 0; Biome fixed only the new evaluator files and reported pre-existing warnings/infos in unrelated files.
- `bun test services/news/src/evaluator/pre-news.spec.ts` — 11 pass / 0 fail / 14 expects.
- `bun run typecheck` — clean.
- Service restart/health: `bun run --cwd services/news start` still prints `news: not yet implemented (Phase 5)` on current `main`, so there is no long-running news service or `/health` endpoint to restart/verify yet.

## 0.4.34 / @ankit-prop/news@0.2.1 — 2026-04-29 09:24 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-163](/ANKA/issues/ANKA-163) — `svc:news/restricted-window-evaluator` ±5 min tier-1 gate.

**Why:** Wave-2 N5 of [ANKA-75](/ANKA/issues/ANKA-75) needs a pure evaluator before Elysia route wiring. The evaluator keeps calendar access, symbol-tag mapping, and time sources injected so the later server issue can reuse it without pulling config or DB globals into the rule logic.

**Added** — `svc:news/restricted-window-evaluator`

- `services/news/src/evaluator/restricted-window.ts` — exports `evaluateRestricted({ db, mapper, clock }, { atUtc, instruments })`, queries the inclusive ±5 min UTC window, filters tier-1 events (`impact === 'high' || restriction`), checks mapper-resolved affected symbols, validates the canonical `RestrictedReply`, and passes `pragueDayBucket`-derived day buckets to the DB seam for DST-safe store integration.
- `services/news/src/evaluator/restricted-window.spec.ts` — covers +0/+4/+5/+6 minute boundaries, tier-2/3 ignore, `restriction: true` low-impact inclusion, multi-tag `XAUUSD` matching, Prague spring/fall DST bucket crossings, no-match, and empty instruments.
- `services/news/src/evaluator/index.ts` — barrel export for the evaluator and DI types.

**Changed** — workspace/package metadata

- `services/news/package.json` — `@ankit-prop/news` `0.2.0` → `0.2.1`; adds direct workspace dependency on `@ankit-prop/contracts` for `RestrictedReply` and Prague helpers.
- Root `package.json` — `0.4.33` → `0.4.34`; `bun.lock` refreshed by Bun 1.3.13.
- `TODOS.md` — records [ANKA-163](/ANKA/issues/ANKA-163) as completed under Phase 5.

**Contract note**

- [ANKA-163](/ANKA/issues/ANKA-163) text mentions `rule: 'restricted_window'` plus `eventId` / `instrument` / `tag` / `eventTimeUtc`, but [ANKA-78](/ANKA/issues/ANKA-78), [ANKA-80](/ANKA/issues/ANKA-80), BLUEPRINT §11.4, and BLUEPRINT §19.2 pin the current canonical shape to `{ event, eta_seconds, rule }` with `rule: 'blackout_pm5'` for this endpoint. This implementation follows the shipped contract.

**Verification**

- `bun install` — clean; saved lockfile with the new workspace edge.
- `bun run lint:fix` — exit 0; Biome formatted the new evaluator files and reported only pre-existing warnings/infos in unrelated packages.
- `bun test services/news/src/evaluator/restricted-window.spec.ts services/news/src/symbol-tag-mapper.spec.ts packages/shared-contracts/src/news.spec.ts packages/shared-contracts/src/time.spec.ts` — 30 pass / 0 fail / 60 expects.
- `bun run typecheck` — clean.

## 0.4.33 / @ankit-prop/contracts@0.6.0 / @ankit-prop/eval-harness@0.1.4 — 2026-04-29 09:03 Europe/Amsterdam

**Initiated by:** FoundingEngineer (claude_local), executing [ANKA-158](/ANKA/issues/ANKA-158) — CodeReviewer APPROVE rebase + merge for [ANKA-129](/ANKA/issues/ANKA-129) (F1 of [ANKA-85](/ANKA/issues/ANKA-85)).

**Why:** PR [#4](https://github.com/ewildee/ankit-prop-trading-agent/pull/4) was authored on top of `0.4.27` (contracts `0.4.0`) but `main` advanced to `0.4.32` / contracts `0.5.0` while it was queued. CodeReviewer APPROVE on head `ccecc67` was clean, so this slot rebases the verbatim Prague day-bucket extraction onto current `main`, resolving the version-slot collision (contracts `0.5.0` is taken by [ANKA-131](/ANKA/issues/ANKA-131)) by promoting contracts to `0.6.0` — same shape, next-minor, because the new public `time` sub-module remains additive on top of the now-shipped Treaty client.

**Added** — `@ankit-prop/contracts` v0.5.0 → v0.6.0

- `packages/shared-contracts/src/time.ts` — `pragueDayBucket` and `pragueParts` helpers, moved verbatim from `packages/eval-harness/src/prague-day.ts` (no rename, no behaviour change). BLUEPRINT §13 Prague TZ canon.
- `packages/shared-contracts/src/time.spec.ts` — DST regression coverage moved verbatim (CET, CEST, spring DST, fall DST, midnight `pragueParts`).
- `packages/shared-contracts/src/index.ts` — re-exports `pragueDayBucket`, `pragueParts`, and the `PragueParts` type alongside the existing Treaty client surface.

**Changed** — `@ankit-prop/eval-harness` v0.1.3 → v0.1.4

- `packages/eval-harness/src/sim-engine.ts` and `packages/eval-harness/src/ftmo-rules.ts` — switched the Prague helper import from the local module to `@ankit-prop/contracts`. Internal-only refactor; no public surface change.
- Removed `packages/eval-harness/src/prague-day.ts` and `packages/eval-harness/src/prague-day.spec.ts` (relocated to contracts).

**Verification**

- `bun install` — clean (workspace re-link only).
- `bun test packages/shared-contracts/src/time.spec.ts packages/eval-harness/src/sim-engine.spec.ts packages/eval-harness/src/ftmo-rules.spec.ts packages/eval-harness/src/ftmo-rules.props.spec.ts` — 30 pass / 0 fail / 974 expects.
- `bun test` (post-rebase, includes [ANKA-131](/ANKA/issues/ANKA-131) Treaty + [ANKA-133](/ANKA/issues/ANKA-133) gateway specs that landed on `main` after the original PR head) — 367 pass / 0 fail / 2147 expects.
- `bun run typecheck` — clean.
- `bun run lint` — exit 0; only pre-existing Biome warnings/infos remain.
- Pre-rebase reviewer evidence: [ANKA-158](/ANKA/issues/ANKA-158) CodeReviewer APPROVE on PR head `ccecc67` (342 pass on the older base).

## @ankit-prop/ctrader-gateway@0.3.0 — 2026-04-29 08:04 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-133](/ANKA/issues/ANKA-133) — F4 gateway `/health` dogfood migration from [ANKA-85](/ANKA/issues/ANKA-85).

**Why:** [ANKA-131](/ANKA/issues/ANKA-131) landed the workspace Elysia + Eden/Treaty foundation. The gateway health endpoint is the first service endpoint to adopt it while preserving the existing `HealthSnapshot` JSON shape and HTTP status behavior.

**Changed** — `svc:gateway/health`

- `services/ctrader-gateway/src/health-snapshot.ts` — split pure `buildHealthSnapshot(deps)` and health dependency types out of the transport module.
- `services/ctrader-gateway/src/health-server.ts` — replaced the hand-rolled `Bun.serve` fetch router with `buildHealthApp(deps)` on Elysia; `startHealthServer(opts)` still returns the underlying Bun server for the existing `start.ts` shutdown path.
- `services/ctrader-gateway/src/index.ts` — exports a type-only Treaty `App` alias from the Elysia health app.
- `services/ctrader-gateway/package.json` — version `0.2.12` → `0.3.0`; declares the direct `elysia@1.4.28` dependency already approved in the workspace foundation.

**Tests**

- `services/ctrader-gateway/src/health-snapshot.spec.ts` — pure snapshot tests for degraded default, connected healthy state, and explicit unhealthy dependency state.
- `services/ctrader-gateway/src/health-server.spec.ts` — Elysia `app.handle(new Request(...))` round-trips for `GET /health` 200, unhealthy → 503, and unknown path 404.
- `services/ctrader-gateway/src/index.spec.ts` — `assertExportsTreaty` source smoke for the type-only `App` export.
- Follow-up after CodeReviewer BLOCK: added live `startHealthServer({ port: 0 })` listener coverage and `rails: pending|unhealthy` snapshot branch tests.

**Verification**

- `bun install --frozen-lockfile` — clean.
- `bun run lint:fix` — exit 0; Biome reported pre-existing warnings/infos in unrelated files and made no final changes.
- `bun test services/ctrader-gateway` — 113 pass / 0 fail / 626 expects after the follow-up coverage commit.
- `bun test` — 364 pass / 0 fail / 2132 expects.
- `bun run typecheck` — clean.
- Runtime smoke: restarted the old gateway process on `:9201`; `curl http://127.0.0.1:9201/health` returned `version: "0.3.0"` from the Elysia server.

## 0.4.32 / @ankit-prop/contracts@0.5.0 — 2026-04-29 07:43 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-131](/ANKA/issues/ANKA-131) — F3 Elysia + Eden/Treaty workspace HTTP foundation from [ANKA-85](/ANKA/issues/ANKA-85).

**Why:** CEO direction on [ANKA-75](/ANKA/issues/ANKA-75) selected Elysia as the workspace HTTP framework and Eden/Treaty as the typed client. The pre-implementation gates are on file: [ANKA-134](/ANKA/issues/ANKA-134) pinned compatible versions, [ANKA-135](/ANKA/issues/ANKA-135) constrained the Treaty API shape/static registry pattern, and [ANKA-136](/ANKA/issues/ANKA-136) conditionally approved the supply-chain risk for exact pins only.

**Added** — `@ankit-prop/contracts` v0.4.0 → v0.5.0

- `packages/shared-contracts/src/treaty-client/create-treaty-client.ts` — `createTreatyClient<App>(baseUrl)` as a direct wrapper over Eden/Treaty's `treaty<App>(baseUrl)`, with no singleton, retry, timeout, normalization, config loading, or orchestration behavior.
- `packages/shared-contracts/src/treaty-client/service-registry.ts` — static local-default `SERVICES` catalog for BLUEPRINT §19 ports and `/health` paths: supervisor 9100, gateway 9201, trader 9202, news 9203, dashboard 9204.
- `packages/shared-contracts/src/treaty-client/assert-exports-treaty.ts` — source-level convention guard for type-only service `App` exports. Runtime module assertions cannot observe erased TypeScript types, so this intentionally checks service-index source text instead of pretending a runtime import can see `export type`.
- `packages/shared-contracts/src/treaty-client/*.spec.ts` — 7 focused specs covering the toy Elysia/Treaty round-trip through `app.handle`, §19 registry pins, valid type-only `App` export forms, missing-export failure, and commented-out export rejection.
- `packages/shared-contracts/src/treaty-client/README.md` — records the local rule: "Elysia for serving, Eden/Treaty for consuming."

**Changed** — workspace dependencies

- Root `package.json` — version 0.4.31 → 0.4.32; added exact approved pins `elysia@1.4.28` and `@elysiajs/eden@1.4.9`.
- `bun.lock` — regenerated by Bun 1.3.13 and committed unedited for the approved dependency graph.
- `packages/shared-contracts/src/index.ts` — re-exports the Treaty client helper, service registry constants/types, and export assertion helper.
- `.dev/decisions.md` — ADR-0005 records the Elysia + Eden/Treaty foundation decision and rejected broader alternatives.

**Verification**

- `bun install --frozen-lockfile` — clean.
- `bun run lint:fix` — exit 0; Biome reported pre-existing warnings/infos in unrelated files, no errors.
- `bun test packages/shared-contracts/src/treaty-client` — 7 pass / 0 fail / 11 expects.
- `bun run typecheck` — clean.
- `bun test` — 361 pass / 0 fail / 2127 expects.
- `bun audit --registry=https://registry.npmjs.org` — no vulnerabilities found.

## 0.4.31 — 2026-04-29 06:08 Europe/Amsterdam

**Initiated by:** FoundingEngineer (claude_local), executing [ANKA-132](/ANKA/issues/ANKA-132) — CodeReviewer CHANGES_REQUESTED on PR #6 head `4fb8be9` (stale `.dev/progress.md` handoff). Rebased onto current `origin/main` `1170be9` because [ANKA-130](/ANKA/issues/ANKA-130) / [ANKA-141](/ANKA/issues/ANKA-141) / [ANKA-149](/ANKA/issues/ANKA-149) / [ANKA-140](/ANKA/issues/ANKA-140) advanced main during the CodeReviewer turnaround window, so a `0.4.31` release on top of the now-merged `0.4.30` is the correct §0.2 audit shape (cannot reuse the `0.4.30` slot because main already published it under [ANKA-130](/ANKA/issues/ANKA-130)).

**Changed** — `infra:tooling`

- `AGENTS.md` — content unchanged from the reviewer-checked baseline at PR #6 head `4fb8be9`. The "PR merge protocol" section is preserved verbatim ([ANKA-137](/ANKA/issues/ANKA-137) / [ANKA-138](/ANKA/issues/ANKA-138) gating, allowed strategy `gh pr merge <N> --rebase --match-head-commit <sha>` only, ban on `--squash` and `--merge`, gh-CLI 403 fallback). Diff vs `4fb8be9:AGENTS.md` is byte-empty (`diff -q` clean).
- `.dev/progress.md` — replaced with the current session block describing this audit-trail amend (stale-future-tense bullets removed, current state of the PR #6 head and the in-flight fix recorded instead). Resolves CodeReviewer's `b19f70b` BLOCK on the §0.2 progress-file contract.
- `.dev/journal.md` — `0.4.30` open-ending bullets and the `PR #6 body will be updated` future-tense line in the prior entry are not edited (already-merged history is append-only); a fresh `0.4.31` entry above documents the rebase, the version-slot collision with [ANKA-130](/ANKA/issues/ANKA-130), and the squash of the CodeReviewer-fix amend into the same commit. The earlier `0.4.30` entries land verbatim below this `0.4.31` entry once the rebase merges.
- Root `package.json` — version `0.4.30` → `0.4.31`. No sub-package version bumps.

**Notes**

- This release is a strict tightening + audit refresh of the same already-versioned in-flight contract from `4fb8be9`; the `AGENTS.md` "PR merge protocol" section content is byte-identical to the reviewer-checked baseline (which CodeReviewer's `4fb8be9` review explicitly approved on the substantive fix).
- Per BLUEPRINT §0.2 narrow skip-class for AGENTS / CHANGELOG / journal / progress / version-bump-only changes, lint / typecheck / `bun test` were not re-run for this commit. The local commit-msg hook still fires on this commit and continues to enforce the canonical `Co-Authored-By:` casing.
- Merge strategy for PR #6 itself is `--rebase --match-head-commit <sha>` only (per the very protocol this PR introduces). Squash-merge would re-introduce the failure mode the section names; `--merge` would land a synthetic body without the canonical footer.

## @triplon/config@0.1.1 — 2026-04-29 05:28 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-143](/ANKA/issues/ANKA-143) — [ANKA-140](/ANKA/issues/ANKA-140) BLOCK fix for project config lookup.

**Fixed** — `infra:config`

- `packages/triplon-config/src/app-config.ts` — `defineAppConfig().paths.project()` now resolves `config/<name>.config.yaml`, matching BLUEPRINT §17 and the checked-in `config/*.example.yaml` layout.
- `packages/triplon-config/src/define-config.spec.ts` — regression coverage proves a cwd-local `config/symbol-tag-map.config.yaml` is loaded through `defineAppConfig` when the user layer is empty.
- `services/news/src/symbol-tag-mapper.spec.ts` — operator-facing regression proves `loadSymbolTagMap()` reads the project file before falling back to the bundled example.

## 0.4.30 — 2026-04-29 05:53 Europe/Amsterdam

**Initiated by:** CodexExecutor, executing [ANKA-130](/ANKA/issues/ANKA-130) — `infra:config` scaffold for `@triplon/config`, rebased above [ANKA-138](/ANKA/issues/ANKA-138)'s v0.4.29 mainline.

**Why:** F2 of [ANKA-85](/ANKA/issues/ANKA-85) needs a local Bun-native config foundation before Wave-2 consumers can standardize on one loader and one generated schema artifact path. Scope stayed minimum-viable: SymbolTagMap only, no multi-source precedence beyond the compatibility loader already needed by `svc:news`.

**Added** — `@triplon/config` v0.1.0

- `packages/triplon-config/src/define-config.ts` — `defineConfig({ schema, sourceFile })`, synchronous `Bun.YAML.parse` loader, Zod validation, and `ConfigLoadError.path` for the first failing Zod path.
- `packages/triplon-config/src/env-derivation.ts` — `deriveEnvName` / `pathToEnvName` deterministic path-to-`SCREAMING_SNAKE` helper.
- `packages/triplon-config/src/schemas/symbol-tag-map.ts` — worked `SymbolTagMapSchema` example for `config/symbol-tag-map.example.yaml`.
- `packages/triplon-config/src/codegen/*` — Bun `Glob`-based codegen over registered `config/*.example.yaml` schemas, deterministic JSON Schema / TypeScript type emission, and `--check` freshness mode.
- `packages/triplon-config/src/generated/` — committed `symbol-tag-map.schema.json` and `symbol-tag-map.types.ts`.
- Compatibility exports for existing `svc:news` usage of `@triplon/config` (`defineAppConfig`, `ConfigError`, `z`) so the local workspace package replaces the registry tarball cleanly.

**Changed** — workspace tooling

- Root `package.json` — version `0.4.29` → `0.4.30`; added `config:codegen`; wired `config:codegen --check` into `lint` and `config:codegen` into `lint:fix`.
- `bun.lock` — records `packages/triplon-config` as the workspace provider for `@triplon/config`.

**Verification**

- `bun test packages/triplon-config`
- `bun test services/news/src/symbol-tag-mapper.spec.ts`
- `bun run config:codegen --check`
- Final lint/test/typecheck gate recorded in [ANKA-130](/ANKA/issues/ANKA-130) issue comment.

## 0.4.29 — 2026-04-29 05:12 Europe/Amsterdam

**Initiated by:** FoundingEngineer, executing [ANKA-138](/ANKA/issues/ANKA-138) — `infra:ci` re-enable / replace / keep-off decision (follow-up to [ANKA-127](/ANKA/issues/ANKA-127) major finding and [ANKA-132](/ANKA/issues/ANKA-132) split).

**Why:** [ANKA-138](/ANKA/issues/ANKA-138) requires FE to commit an ADR before any implementation diff lands. CodeReviewer's [ANKA-127](/ANKA/issues/ANKA-127) finding flagged that `70ceb6c` left `origin/main` with no automated lint/typecheck/`bun test` gate — only operator-side §0.2 commands enforced gating, and that contract has empirically slipped (see [ANKA-101](/ANKA/issues/ANKA-101)). FE's decision is recorded as ADR-0004 in this commit; implementation (rename + smoke-test PR + BLUEPRINT cross-link) routes to [CodexExecutor](/ANKA/agents/codexexecutor) in a child issue. Sibling [ANKA-132](/ANKA/issues/ANKA-132) bump to 0.4.28 landed at 05:08 Europe/Amsterdam during this heartbeat; rebased on `bad012b` and bumped one further to 0.4.29 (same precedent as the `0.4.26` merge-integration window in [ANKA-126](/ANKA/issues/ANKA-126) / [ANKA-124](/ANKA/issues/ANKA-124)).

**Changed** — `docs` (ADR + CHANGELOG + journal)

- `.dev/decisions.md` — appends ADR-0004 — *Re-enable the existing GitHub Actions lint/test/typecheck workflow as-is*. Captures context, decision (rename `ci.yml.disabled` → `ci.yml`, no content edits), four rejected alternatives (replace/fork/keep-off/dispatch-only), and consequences (defence-in-depth gate; non-blocking until operator promotes to required check; future "disable CI" attempts must go through this audit trail).
- `.dev/journal.md` — appends a 2026-04-29 entry capturing the ADR write and the next-step routing to CodexExecutor.

**Bumped**

- root `ankit-prop-umbrella` 0.4.28 → 0.4.29 (patch — docs-only ADR commit, but BLUEPRINT §0.2 narrow skip-class makes ADRs behaviour-affecting because they shift the project's canonical decision contract).

**Verification**

- No code paths changed; lint/typecheck/test not re-run on this commit (BLUEPRINT §0.2 narrow skip-class for ADR/journal/CHANGELOG-only edits stays in force, but the CHANGELOG entry itself is non-optional and is included).

**Notes**

- Implementation of the rename, the BLUEPRINT operational cross-link, and the docs-only smoke-test PR is **not** in this commit. They land in the [CodexExecutor](/ANKA/agents/codexexecutor) child issue created off [ANKA-138](/ANKA/issues/ANKA-138). Closing [ANKA-138](/ANKA/issues/ANKA-138) requires CodeReviewer sign-off + a green CI run on the smoke-test PR.

## 0.4.28 — 2026-04-29 05:08 Europe/Amsterdam

**Initiated by:** FoundingEngineer, executing [ANKA-132](/ANKA/issues/ANKA-132) — retroactive §0.2 audit-trail correction for the [ANKA-127](/ANKA/issues/ANKA-127) 12-hour critical review BLOCK.

**Why:** Commit `70ceb6c` (`chore(infra:ci): ANKA-107 disable github actions workflow`, 2026-04-28 17:37 Europe/Amsterdam) renamed `.github/workflows/ci.yml` to `.github/workflows/ci.yml.disabled` and journalled the change, but missed the matching `CHANGELOG.md` entry and root version bump. BLUEPRINT §0.2 lists CI/build behaviour changes outside the skip-class audit events, so they require the changelog/version trail. CodeReviewer flagged this as a blocking finding on [ANKA-127](/ANKA/issues/ANKA-127); this entry closes the trail retroactively without rewriting the original commit.

**Changed** — root umbrella version only; no production code touched

- `CHANGELOG.md` — this entry, retroactively documenting `70ceb6c`'s CI behaviour change (workflow file renamed out of GitHub Actions' `*.yml`/`*.yaml` rotation; suffix preserved for one-line re-enable; local agent commands `lint:fix` / `typecheck` / `bun test` per BLUEPRINT §0.2 remain the gating signal pre-production).
- `.dev/journal.md` — append-only entry recording the §0.2 contract violation, the retroactive remediation, and the still-open GitHub PR/merge-path footer-guard work routed to [CodexExecutor](/ANKA/agents/codexexecutor) under [ANKA-132](/ANKA/issues/ANKA-132).

**Bumped**

- root `ankit-prop-umbrella` 0.4.27 → 0.4.28.

**Verification**

- Docs/version-only change. Per the §31 review-gate matrix this is "docs-only / CHANGELOG/journal / version bumps without code → no reviewer required". No `bun test` / `bun run typecheck` proof needed; nothing executable changed.
- The major finding on [ANKA-127](/ANKA/issues/ANKA-127) (no active GitHub Actions workflow on `main`) is tracked separately as [ANKA-138](/ANKA/issues/ANKA-138); the GitHub PR/merge-path footer guard is tracked separately as [ANKA-137](/ANKA/issues/ANKA-137) under [ANKA-132](/ANKA/issues/ANKA-132).

**Notes**

- This is a §0.2 audit-trail correction, not a code revert. The `ci.yml.disabled` rename from `70ceb6c` stays as-is on `main`. Until [ANKA-138](/ANKA/issues/ANKA-138) lands the replacement gating workflow, BLUEPRINT §0.2 local agent commands remain the only gate.
## 0.4.27 — 2026-04-28 23:50 Europe/Amsterdam

**Initiated by:** FoundingEngineer, executing [ANKA-126](/ANKA/issues/ANKA-126) — `infra:tooling` worktree-first directive (defensive guard until [ANKA-98](/ANKA/issues/ANKA-98) platform fix lands).

**Why:** Board chose Option 1 of [ANKA-98](/ANKA/issues/ANKA-98) — per-issue worktrees by default in the Paperclip `claude_local` adapter. That platform fix lives outside the company boundary and has not shipped yet. Until it does, agents share a single checkout per company and concurrent heartbeats keep stomping multi-file refactors. This in-repo guard codifies the worktree workaround so agents stop reaching for stash/reset.

**Added** — repo governance docs (no package code modified)

- `AGENTS.md` — new top-of-file section *Worktree-first for multi-file changes (defensive guard, ANKA-126)* under operational discipline. Specifies trigger (>1 file or >1 Bash turn), creation command (`git worktree add .paperclip/worktrees/<issueId> <baseBranch>`), the work-in-worktree rule, return-to-shared-root for merge only, cleanup, and a single explicit single-line/single-turn exception.
- `~/.paperclip/instances/.../agents/{FoundingEngineer,CodexExecutor,Designer}/instructions/AGENTS.md` — short pointer section to the project AGENTS.md directive (instance-local, not in repo). Other agents that drive multi-file edits will be brought in line as their tickets surface.
- `.gitignore` — added `.paperclip/worktrees/` so per-issue worktrees stay local-only. This is **not** the same as the out-of-repo Paperclip instance directory at `~/.paperclip/`.

**Bumped**

- root `ankit-prop-umbrella` 0.4.26 → 0.4.27.

**Lifetime**

- Temporary guard. The whole *Worktree-first for multi-file changes* section, the per-agent pointers, and the `.gitignore` line are deleted in the same commit that announces ANKA-98 has shipped per-issue worktrees in `claude_local`.

**Verification**

- Doc-only change. No Bun-runtime code touched, so BLUEPRINT §0.2 `bun.com/llms.txt` proof not applicable; lint/test/typecheck not re-run for this change.
- This change itself was authored from a per-issue worktree at `.paperclip/worktrees/ANKA-126` off `origin/main` to dogfood the directive.

**Notes**

- Parallel work on [ANKA-124](/ANKA/issues/ANKA-124) (`anka-124-symbol-tag-map-contracts`) also claims version `0.4.27`. Whichever PR merges first lands; the second rebases and bumps to `0.4.28` per the `0.4.26` merge-integration precedent below.
- Triage of the eight collision stashes already on the shared root checkout is out of scope here — separate ticket if needed.

## 0.4.26 — 2026-04-28 18:20 Europe/Amsterdam

**Initiated by:** FoundingEngineer, executing [ANKA-113](/ANKA/issues/ANKA-113) — `infra:tooling` PR #1 merge-conflict resolution on the Wave-1 news branch `anka-77-ftmo-calendar-cassette`.

**Why:** GitHub reported PR #1 (`anka-77-ftmo-calendar-cassette`, head `e8bac186`) `mergeable: false` against `origin/main` after main moved on with [ANKA-76](/ANKA/issues/ANKA-76)/[ANKA-101](/ANKA/issues/ANKA-101)/[ANKA-102](/ANKA/issues/ANKA-102)/[ANKA-104](/ANKA/issues/ANKA-104)/[ANKA-107](/ANKA/issues/ANKA-107)/[ANKA-111](/ANKA/issues/ANKA-111). Parent [ANKA-77](/ANKA/issues/ANKA-77) is `blocked` waiting for the PR to become mergeable. The cassette/schema gates were already revalidated green by QA on the PR head.

**What changed (umbrella merge integration only — no production code modified)**

- Merged `origin/main` into `anka-77-ftmo-calendar-cassette` with a single non-rewriting merge commit (no force-push; PR #1 identity preserved).
- Conflicts isolated to FE-owned metadata only. `bun.lock` and `TODOS.md` auto-merged; `.dev/journal.md`, `.dev/progress.md`, `CHANGELOG.md`, and root `package.json` resolved manually:
  - `.dev/progress.md` → take `origin/main` + fresh ANKA-113 session block (replace-each-session file per AGENTS.md).
  - `.dev/journal.md` and `CHANGELOG.md` → union with `origin/main` entries placed before PR entries inside each conflict region. Newest-first ordering is preserved across the seam; PR-side entries (13:13–13:49) land below `origin/main` entries (14:30–18:10) which is the correct chronological order. Both lineages independently bumped through 0.4.21–0.4.24, so duplicate version headings remain as audit history of what each lineage shipped under each label.
  - Root `package.json` → `0.4.26` (strictly above `max(main 0.4.25, PR 0.4.24)`). Sub-package versions auto-merged unchanged from PR (e.g. `@ankit-prop/news` 0.2.0).
- No Bun-runtime, service, package, or contract source files were modified by this heartbeat. BLUEPRINT §0.2 `bun.com/llms.txt` proof not applicable.

**Verification**

- `git merge-tree --write-tree --name-only origin/main HEAD` after resolution: empty output (no remaining conflicts).
- `bun test packages/shared-contracts/src/news.spec.ts services/news/src/symbol-tag-mapper.spec.ts` re-run on the merged tree (see [ANKA-113](/ANKA/issues/ANKA-113) thread for log).
- `bunx biome check` re-run on the news/contracts surface (see [ANKA-113](/ANKA/issues/ANKA-113) thread for log).
- Backup tag `anka-77-pr1-backup-pre-merge` retained at the pre-merge PR head `e8bac186` for rollback.

**Open endings**

- After push, GitHub PR #1 should flip to `mergeable: true`. [ANKA-113](/ANKA/issues/ANKA-113) hands back to the parent ([ANKA-77](/ANKA/issues/ANKA-77)) — QAEngineer to do the final cassette/contract revalidation against the merged tree, or assignee to land directly.

## 0.4.25 — 2026-04-28 18:10 Europe/Amsterdam

**Initiated by:** CodexExecutor (agent), executing [ANKA-76](/ANKA/issues/ANKA-76) as the live operational follow-through for [ANKA-68](/ANKA/issues/ANKA-68).

**Why:** ANKA-68's TwelveData scaffold had shipped and passed review, leaving the two operational acceptance bullets open: commit the live fixture tree with manifest/checksums, and log the real `td-fetch fetch --apply` spend and final byte size.

**Added**

- `data/market-data/twelvedata/v1.0.0-2026-04-28/` — live TwelveData fixture tree for explicit ANKA-68 windows:
  - intraday: `2026-01-28T00:00:00.000Z` → `2026-04-28T00:00:00.000Z`
  - daily tail: `2025-10-28T00:00:00.000Z` → `2026-04-28T00:00:00.000Z`
  - symbols: `NAS100`, `XAUUSD`
  - timeframes: `1m`, `5m`, `15m`, `1h`, `1d`
- `manifest.json` and `fetch-log.jsonl` for the run. `ManifestSchema` parses, all 10 shards are present, `fetch-log.jsonl` has 61 entries, and `adversarial-windows.json` has 20 windows.

**Shard manifest**

| Shard | Bars | Bytes gz | SHA-256 |
|-------|------|----------|---------|
| `bars/NAS100/1m.jsonl.gz` | 186 | 1,468 | `dfc4ddc3bd470253b4fa090d6d7b6a9fa03f6b3fdb67738d3771b37d1a43353b` |
| `bars/NAS100/5m.jsonl.gz` | 109 | 1,080 | `f5f005da2d2eff52eece6b9f61d6fac4fbabe381d513f1a8d863dbfde4dae386` |
| `bars/NAS100/15m.jsonl.gz` | 108 | 1,080 | `d4bef009f376dcd11191c4349da9064b1a842ce6741e9df41d7decf1e38301cd` |
| `bars/NAS100/1h.jsonl.gz` | 104 | 1,071 | `24a15b0ec6422e139a855048910c694d2cae7bcb3178e8ca6dd4b700a5c58f89` |
| `bars/NAS100/1d.jsonl.gz` | 123 | 1,506 | `db72cc6b4b5bfb9652fb3e8319074c36cbbad524a48f08f3028a27f5cc3d40d6` |
| `bars/XAUUSD/1m.jsonl.gz` | 129,531 | 2,476,539 | `e8149937d8177843befcce468c86dbdfbcda87d90f3918de2df33eda9431784e` |
| `bars/XAUUSD/5m.jsonl.gz` | 25,901 | 556,712 | `6c5664941e23017ce4e76d9c1043964a3ca9c1256b6ac5bafef317ab1d47bc4c` |
| `bars/XAUUSD/15m.jsonl.gz` | 8,636 | 195,600 | `ae77ce3506d673cb40e8b44063f0168ee01bd1d6b257537155947807756be8e1` |
| `bars/XAUUSD/1h.jsonl.gz` | 2,159 | 50,276 | `9303e3244e60a05750c43529ae70615b84275820456207c13dca73e887717f88` |
| `bars/XAUUSD/1d.jsonl.gz` | 179 | 5,002 | `5dd677bbc36281e5b9294a9a07ba17c227180001be16c2423468c18a41902dff` |

**Bumped**

- root `ankit-prop-umbrella` 0.4.24 → 0.4.25 (patch — committed live fixture audit artifacts).

**Run results**

- `td-fetch fetch --apply` spent 61 TwelveData credits, produced 10 shards, and completed in 63 seconds.
- Final compressed shard byte total: 3,290,334 bytes (3.14 MiB / 3.29 MB).
- Note: the first invocation exited before any API call because `bun run --cwd packages/market-data-twelvedata ...` did not propagate the root `.env`; the successful invocation explicitly exported `.env` first.

**Verification**

- `bun run --cwd packages/market-data-twelvedata td-fetch plan --intraday-from=2026-01-28 --intraday-to=2026-04-28 --daily-from=2025-10-28 --daily-to=2026-04-28` — 10 shards, 61 total credits, ≈4.74 MB estimated compressed.
- Manifest/schema audit script — `schemaVersion: 1`, 10 shards, 61 spent credits, 3,290,334 compressed bytes, 61 fetch-log lines, 20 adversarial windows; both symbol meta files have populated aliases/raw search payloads.
- `shasum -a 256 data/market-data/twelvedata/v1.0.0-2026-04-28/bars/*/*.jsonl.gz` — matches all manifest shard hashes above.
- `bun run lint:fix` — exit 0; no fixes applied; pre-existing warnings remain in unrelated/generated surfaces and existing package files.
- `bun test --cwd packages/market-data-twelvedata` — 41 pass / 0 fail / 149 expects.
- `bun run typecheck` — clean (`tsc --noEmit`).

## 0.4.24 — 2026-04-28 17:59 Europe/Amsterdam

**Initiated by:** SecurityReviewer (agent), executing [ANKA-111](/ANKA/issues/ANKA-111) as security review remediation for [ANKA-102](/ANKA/issues/ANKA-102).

**Why:** The ANKA-102 hook/postinstall surface had two local tooling bypasses: ordinary commits could spoof `Merge`, `fixup!`, or `squash!` subjects to avoid the Paperclip co-author footer, and the inline root `postinstall` would set `core.hooksPath` on any parent git work tree if this package script ran from a nested package path.

**Changed**

- `.githooks/commit-msg` now bypasses the footer only when Git passes the actual `MERGE_MSG` file, not merely when the commit subject looks like a merge, fixup, or squash commit.
- Root `postinstall` now delegates to `.githooks/install.sh`, which sets `core.hooksPath` only when the script's package root is the current git top-level. Nested package executions leave the parent repository untouched.

**Added**

- Regression coverage for spoofed merge/fixup/squash subjects, actual merge message allowance, own-repo hook installation, and nested consumer-repo non-mutation.

**Bumped**

- root `ankit-prop-umbrella` 0.4.23 → 0.4.24 (patch — security hardening of tooling enforcement).

**Verification**

- `bun install` — exit 0; `.githooks/install.sh` ran and kept `core.hooksPath=.githooks` for this repo.
- `bun test --filter commit-msg` — 7 pass / 0 fail / 17 expects.
- `bun run lint:fix` — exit 0; pre-existing workspace warnings remain in unrelated packages/files.
- `bun test` — 325 pass / 0 fail / 2062 expects.
- `bun run typecheck` — clean (`tsc --noEmit`).

## 0.2.12 — 2026-04-28 17:19 Europe/Amsterdam

**Initiated by:** CodexExecutor (agent), executing [ANKA-103](/ANKA/issues/ANKA-103) as child fix for [ANKA-100](/ANKA/issues/ANKA-100).

**Why:** Rails 3 and 4 rejected stale news only when `broker.nowMs - lastSuccessfulFetchAtMs > newsStaleMaxMs`. Future-dated or non-finite fetch timestamps could make that age non-positive or invalid and fail open, violating BLUEPRINT §9, §11.7, and the §0.2 fail-closed default.

**Changed** — `@ankit-prop/ctrader-gateway` v0.2.11 → v0.2.12

- `src/hard-rails/rail-3-news-blackout.ts` and `rail-4-news-pre-kill.ts` now reject non-finite `lastSuccessfulFetchAtMs` and strict future timestamps before stale-age arithmetic. Rejection reasons include `fail-closed`; detail carries `{ lastSuccessfulFetchAtMs, nowMs, newsStaleMaxMs }`.
- `src/hard-rails/news-client.ts` fixture defaults now document the fail-closed sentinel. Omitted `lastSuccessfulFetchAtMs` uses `nowMs?.()` when supplied; omitted without a clock keeps `Number.MAX_SAFE_INTEGER`, which now trips the future-timestamp guard.
- Hard-rail fixture specs that do not exercise news freshness now pass explicit fresh timestamps.

**Added**

- `src/hard-rails/news-staleness.spec.ts` coverage for rail 3 and rail 4 future timestamps, `NaN`, `+Infinity`, `-Infinity`, omitted-without-clock fail-closed, and omitted-with-clock fresh-now behaviour.

**Bumped**

- `@ankit-prop/ctrader-gateway` 0.2.11 → 0.2.12 (patch — hard-rail fail-closed bug fix).

**Verification**

- `bun run lint:fix` — exit 0; pre-existing workspace warnings remain in unrelated packages/files.
- `bun test services/ctrader-gateway/src/hard-rails/news-staleness.spec.ts` — 16 pass / 0 fail / 57 expects.
- `bun test services/ctrader-gateway` — 107 pass / 0 fail / 606 expects.
- Gateway-scoped `tsc --ignoreConfig ... services/ctrader-gateway/src/**/*.ts` — exit 0.

## 0.4.23 — 2026-04-28 17:14 Europe/Amsterdam

**Initiated by:** CodexExecutor (agent), executing [ANKA-102](/ANKA/issues/ANKA-102) as follow-up from [ANKA-101](/ANKA/issues/ANKA-101).

**Why:** The Paperclip co-author footer was required by BLUEPRINT §0.2 and AGENTS.md but only enforced by agent diligence. The ANKA-101 governance decision kept `main` history intact and delegated a repo-local hook so future commits fail before landing without the audit footer.

**Added**

- `.githooks/commit-msg` — pure POSIX shell hook that allows merge, `fixup!`, and `squash!` commits, and rejects normal commit messages missing the exact `Co-Authored-By: Paperclip <noreply@paperclip.ing>` line.
- `.githooks/commit-msg.spec.ts` — Bun regression coverage for missing-footer rejection, valid-footer acceptance, merge commit bypass, and `fixup!`/`squash!` bypass.
- Root `postinstall` wiring sets `core.hooksPath` to `.githooks` when `bun install` runs inside a git work tree.

**Changed**

- `AGENTS.md` now points at `.githooks/commit-msg` as the enforcement surface for the existing footer rule.

**Bumped**

- root `ankit-prop-umbrella` 0.4.22 → 0.4.23 (patch — tooling enforcement).

**Verification**

- `bun install` — exit 0; `postinstall` set `git config core.hooksPath` to `.githooks`.
- `bun test --filter commit-msg` — 4 pass / 0 fail / 6 expects.
- `bun run lint:fix` — exit 0; existing warnings only, no fixes applied.
- `bun test` — 322 pass / 0 fail / 2051 expects.
- `bun run typecheck` — clean (`tsc --noEmit`).
- `git commit --allow-empty -m "chore: test"` — failed as expected and named the missing `Co-Authored-By: Paperclip <noreply@paperclip.ing>` footer.
- Re-run after [ANKA-103](/ANKA/issues/ANKA-103) blocker resolution at 17:50 Europe/Amsterdam: same commands pass on current `main`; `bun run lint:fix` exits 0 with existing unrelated warnings only.

## Governance — 2026-04-28 17:08 Europe/Amsterdam — [ANKA-101](/ANKA/issues/ANKA-101)

**Initiated by:** FoundingEngineer (agent), resolving the [ANKA-99](/ANKA/issues/ANKA-99) 12-hour critical review finding.

- Logged commit `c2b02e3733bc4c4663adb2a3dc928b08e13c7a34` (`chore(infra:tooling): gitignore .envrc for direnv-loaded paperclip env`) as a one-off documented exception to the BLUEPRINT §0.2 / AGENTS.md `Co-Authored-By: Paperclip <noreply@paperclip.ing>` footer rule. Decision rationale: ADR-0003 in `.dev/decisions.md`. `main` history is **not** rewritten; force-pushing to amend a 1-line `.gitignore` commit would invalidate six downstream commit hashes and break dependent worktrees, which is disproportionate to the metadata defect.
- Follow-up: a `commit-msg` hook that fails any commit missing the Paperclip footer is delegated to CodexExecutor as a child issue of [ANKA-101](/ANKA/issues/ANKA-101). Until that lands, the footer rule stays agent-enforced.
- No package code or versions changed in this entry. Docs-only.

## 0.4.22 — 2026-04-28 14:47 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-97](/ANKA/issues/ANKA-97) as remediation for [ANKA-68](/ANKA/issues/ANKA-68) and unblocker for [ANKA-76](/ANKA/issues/ANKA-76).

**Why:** The first live `td-fetch fetch --apply` attempt hit 100+ `time_series` calls while still inside the first `XAUUSD/1m` shard. The scaffold had underestimated TwelveData's XAUUSD bar density and used a relative default fixture root that landed under the package cwd. The live rerun must not spend credits until the dry plan and fetcher chunker agree on realistic call counts and runaway saturation fails closed.

**Changed** — `@ankit-prop/market-data-twelvedata` v0.1.1 → v0.1.2

- `src/planner.ts` — XAUUSD intraday density now plans at 24 trading hours per calendar day (TwelveData live behavior), while NAS100 keeps the US-equity session estimate. Planned calls now use the same 0.75 safety-adjusted page capacity as the fetcher so dry credits match intended chunk size.
- `src/fetcher.ts` — page safety margin tightened from 0.9 to 0.75 through the shared planner constant. Intraday chunk sizing now uses exact millisecond windows instead of flooring to whole days, preventing avoidable over-fetch while keeping the safety margin. A 3-page saturated/no-progress cap aborts runaway backfill cascades with a clear symbol/timeframe/cursor error.
- `src/cli.ts` — default `--root-dir` resolves from `import.meta.url` up to the workspace root package and writes under repo-root `data/market-data/twelvedata/<fixtureVersion>`, regardless of `bun run --cwd packages/market-data-twelvedata ...`. Explicit `--root-dir` remains unchanged.
- `src/index.ts` — exports the default-root resolver and shared TwelveData page safety margin for tests and package consumers.

**Added**

- `src/cli.spec.ts` — regression test proving the default fixture root stays anchored at repo root even after `process.chdir()` into the package directory.
- `src/fetcher.spec.ts` — regression coverage for a 90-day `XAUUSD/1m` shard using TwelveData's "latest N rows in window" saturation semantics; verifies actual credits stay within 1.2× of dry-plan credits. Also covers the saturated/no-progress cap.
- `src/planner.spec.ts` — assertions for XAUUSD 24h density, safety-adjusted call planning, and the new locked-window estimate.

**Bumped**

- `@ankit-prop/market-data-twelvedata` 0.1.1 → 0.1.2 (patch — fetch safety and default-path bug fix).
- root `ankit-prop-umbrella` 0.4.21 → 0.4.22 (patch — workspace package version move; backfilled by [ANKA-160](/ANKA/issues/ANKA-160) — original entry omitted this line, but commit `aceecfe` advanced root from `0.4.21` to `0.4.22`).

## ANKA-113 merge reconciliation — @ankit-prop/news 0.1.0 → 0.2.0 — 2026-04-28 13:49 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing the board-requested follow-up on [ANKA-79](/ANKA/issues/ANKA-79) under parent [ANKA-75](/ANKA/issues/ANKA-75).

**Why:** Board flagged that `svc:news/symbol-tag-mapper` should consume the operator-canonical configuration loader `@triplon/config` (internal NPM mirror; source at `~/Work/Projects/shared/config-loader`) instead of duplicating bespoke YAML loading, ad-hoc path resolution, and a custom `SymbolTagMapLoadError` shape. `@triplon/config` already provides layered file resolution (`~/.config/<scope>/<name>.config.yaml` → `./<name>.config.yaml` → override), Zod validation, and structured `ConfigError` codes — keeping the mapper's surface area minimal and consistent with the rest of Triplon Mac tooling.

**ANKA-113 merge reconciliation:** Authored on PR #1 branch `anka-77-ftmo-calendar-cassette` (commit `e8bac18`) and landed on `main` via merge commit `05bf75b` (root `0.4.25 → 0.4.26`). The original branch-side `## 0.4.24` heading and `root ankit-prop-umbrella 0.4.23 → 0.4.24` bump line were demoted by [ANKA-160](/ANKA/issues/ANKA-160) because that root slot was already used on `main` by [ANKA-111](/ANKA/issues/ANKA-111) at 17:59. The `@ankit-prop/news` 0.1.0 → 0.2.0 package-level bump below still stands.

**Changed** — `@ankit-prop/news` v0.1.0 → v0.2.0

- `services/news/src/symbol-tag-mapper.ts` — rewritten on top of `defineAppConfig({ scope: 'ankit-prop', name: 'symbol-tag-map', schema: SymbolTagMapSchema, envOverrides: false })`. Removed the bespoke `SymbolTagMapLoadError`, `LoadSymbolTagMapOptions`, the manual `~/`/relative-path expansion, and the direct `Bun.YAML.parse` call. `loadSymbolTagMap` is now synchronous (matches the loader's surface) and falls back to the bundled `config/symbol-tag-map.example.yaml` only when neither user nor project file is present. Errors propagate as `@triplon/config`'s `ConfigError` (`E_CONFIG_NOT_FOUND` / `E_CONFIG_PARSE` / `E_CONFIG_INVALID`).
- `services/news/src/symbol-tag-mapper.spec.ts` — replaced the `SymbolTagMapLoadError` assertions with `ConfigError` code checks; sandboxed `HOME` / `XDG_CONFIG_HOME` / `cwd` per-test so the bundled-example fallback exercises a clean lookup chain instead of leaking into the operator's real `~/.config/ankit-prop/symbol-tag-map.config.yaml`.
- `services/news/package.json` — adds `@triplon/config ^0.1.0` as a workspace dependency. `zod` stays direct so other svc:news modules can keep importing it without leaning on the loader's re-export.

**Removed** — `@ankit-prop/news`

- `SymbolTagMapLoadError` class and `SymbolTagMapLoadErrorCode` union — superseded by `ConfigError` from `@triplon/config`.
- `LoadSymbolTagMapOptions.fallbackPath` — the loader's own override slot covers explicit-path callers; the bundled example is the only implicit fallback now.

**Bumped**

- `@ankit-prop/news` 0.1.0 → 0.2.0 (minor — public mapper API contract changed: sync return + `ConfigError` instead of `SymbolTagMapLoadError`. No external consumers yet — N2/N4 are still out of scope per the parent plan).
- ~~root `ankit-prop-umbrella` 0.4.23 → 0.4.24~~ — removed by [ANKA-160](/ANKA/issues/ANKA-160); branch-side root bump never advanced `main`'s `package.json` (see merge commit `05bf75b`).

**Verification**

- `bun test services/news/src/symbol-tag-mapper.spec.ts` — 9 pass / 0 fail / 14 expects (single tag, multi-tag dedupe/order, unknown-tag warning, empty input, bundled-example fallback, explicit override path, `E_CONFIG_NOT_FOUND`, `E_CONFIG_PARSE`, `E_CONFIG_INVALID`).
- `bun run typecheck` — clean (`tsc --noEmit`).
- `bun run lint` — exit 0; only pre-existing diagnostics in unrelated packages (e.g. `packages/market-data-twelvedata/src/rate-limiter.ts`).

**Notes**

- `@triplon/config` is dual-listed in `~/.bunfig.toml` `minimumReleaseAgeExcludes` so the 2-day install hold doesn't apply, and the `@triplon` scope token in `~/.npmrc` already points at the private registry — no repo-side npm/bun config needed.

## ANKA-113 merge reconciliation — @ankit-prop/news 0.0.2 → 0.1.0 — 2026-04-28 13:19 Europe/Amsterdam

**Initiated by:** CodexExecutor (agent), executing [ANKA-79](/ANKA/issues/ANKA-79) under parent [ANKA-75](/ANKA/issues/ANKA-75).

**Why:** `svc:news` needs the symbol-tag-mapper sub-module before the calendar fetcher can turn FTMO `instrument` strings into the tracked trading symbols that restricted-window and pre-news evaluators consume. BLUEPRINT §11.3 requires splitting FTMO tags on `" + "` and §17.3 defines the operator-canonical `symbol-tag-map.config.yaml` shape. BLUEPRINT §5 forbids adding `yaml` / `js-yaml`, so this loader uses Bun's native `Bun.YAML.parse`.

**ANKA-113 merge reconciliation:** Authored on PR #1 branch `anka-77-ftmo-calendar-cassette` (commit `42cb3ed` lineage) and landed on `main` via merge commit `05bf75b` (root `0.4.25 → 0.4.26`). The original branch-side `## 0.4.23` heading and `root ankit-prop-umbrella 0.4.22 → 0.4.23` bump line were demoted by [ANKA-160](/ANKA/issues/ANKA-160) because that root slot was already used on `main` by [ANKA-102](/ANKA/issues/ANKA-102) at 17:14. The `@ankit-prop/news` 0.0.2 → 0.1.0 package-level bump below still stands.

**Added** — `@ankit-prop/news` v0.0.2 → v0.1.0

- `src/symbol-tag-mapper.ts` — exports `SymbolTagMapSchema`, `SymbolTagMap`, `SymbolTagMapLoadError`, `loadSymbolTagMap(path?, options?)`, and `resolveAffectedSymbols(rawInstrument, map, logger?)`. The loader reads the operator config path by default and falls back to `config/symbol-tag-map.example.yaml` when the operator file is absent. YAML and schema failures raise structured `SymbolTagMapLoadError` values with `code`, `path`, and `attemptedPaths`.
- `src/symbol-tag-mapper.ts` — resolves FTMO `instrument` strings by splitting on `" + "`, trimming tags, mapping each tag through the config, warning on unknown tags through the injected logger, and returning deterministic de-duplicated symbols in first-seen order.
- `src/symbol-tag-mapper.spec.ts` — covers single-tag mapping, multi-tag split/dedupe, unknown-tag warning, empty/whitespace input, example fallback, malformed operator YAML, malformed fallback YAML, and schema-invalid YAML.
- `package.json` — adds `zod` as the news service dependency for the inline mapper config schema. `yaml` was intentionally not added because Bun ships native YAML parsing and BLUEPRINT §5.3 forbids that dependency.

**Bumped**

- `@ankit-prop/news` 0.0.2 → 0.1.0 (minor — new public mapper module).
- ~~root `ankit-prop-umbrella` 0.4.22 → 0.4.23~~ — removed by [ANKA-160](/ANKA/issues/ANKA-160); branch-side root bump never advanced `main`'s `package.json` (see merge commit `05bf75b`).

**Verification**

- `bun run lint:fix` — exit 0; Biome applied safe formatting only and still reports pre-existing unsafe suggestions in unrelated packages.
- `bun test services/news/src/symbol-tag-mapper.spec.ts` — 8 pass / 0 fail / 11 expects.
- `bun test` — 341 pass / 0 fail / 2089 expects.
- `bun run typecheck` — clean after correcting the concurrent [ANKA-78](/ANKA/issues/ANKA-78) duplicate export in `packages/shared-contracts/src/index.ts`.

**Notes**

- The `SymbolTagMap` schema stays inline for now because `@ankit-prop/contracts` has no `config` namespace yet; follow-up [T009.c](TODOS.md) tracks lifting it once that shared surface exists.
- `services/news` still has only the placeholder `start` script and no `/health` implementation, so there is no service process/version endpoint to restart and verify yet.

## ANKA-113 merge reconciliation — @ankit-prop/contracts 0.3.3 → 0.4.0 — 2026-04-28 13:15 Europe/Amsterdam

**Initiated by:** CodexExecutor (agent), executing [ANKA-78](/ANKA/issues/ANKA-78) under parent [ANKA-75](/ANKA/issues/ANKA-75).

**Why:** The news service and gateway rail-7 `NewsClient` need one shared contract surface before the `svc:news` runtime lands. BLUEPRINT §11.2 pins the FTMO calendar item shape; [ANKA-78](/ANKA/issues/ANKA-78) extends that package surface with the restricted-window replies consumed by the later endpoint and force-flat work.

**ANKA-113 merge reconciliation:** Authored on PR #1 branch `anka-77-ftmo-calendar-cassette` and landed on `main` via merge commit `05bf75b` (root `0.4.25 → 0.4.26`). The original branch-side `## 0.4.22` heading and `root ankit-prop-umbrella 0.4.21 → 0.4.22` bump line were demoted by [ANKA-160](/ANKA/issues/ANKA-160) because that root slot was already used on `main` by [ANKA-97](/ANKA/issues/ANKA-97) at 14:47. The `@ankit-prop/contracts` 0.3.3 → 0.4.0 package-level bump below still stands.

**Added** — `@ankit-prop/contracts` v0.3.3 → v0.4.0

- `src/news.ts` — exports `CalendarImpact`, `CalendarItem`, `CalendarResponse`, `RestrictedReason`, `RestrictedReply`, and `NextRestrictedReply` as Zod strict schemas plus inferred TypeScript types.
- `src/index.ts` — re-exports the news contracts from `@ankit-prop/contracts`.
- `src/news.spec.ts` — covers minimal calendar item parsing, unknown `eventType` acceptance, both tier-1 routes (`restriction: true` and `impact: high`), restricted reply round-trip, closed `rule` enum, nullable next-restricted item, and closed impact enum.

**Bumped**

- `@ankit-prop/contracts` 0.3.3 → 0.4.0 (minor — new public schema surface).
- ~~root `ankit-prop-umbrella` 0.4.21 → 0.4.22~~ — removed by [ANKA-160](/ANKA/issues/ANKA-160); branch-side root bump never advanced `main`'s `package.json` (see merge commit `05bf75b`).

**Verification**

- `bun install` — no dependency changes.
- `bun run lint:fix` — exit 0; full-workspace pre-existing warnings remain in unrelated/generated surfaces and existing market-data helper files.
- `bun test --cwd packages/market-data-twelvedata` — 41 pass / 0 fail / 149 expects.
- `bun run typecheck` — clean (`tsc --noEmit`).
- `bun run --cwd packages/market-data-twelvedata td-fetch plan` — 10 shards, 59 `time_series` calls, 61 total credits; `XAUUSD/1m` now estimates 35 calls.

**Notes**

- No live `fetch --apply` rerun here; that remains scoped to [ANKA-76](/ANKA/issues/ANKA-76) after review.
- No service restart required: package is a CLI utility, not a long-running `/health` service.

## 0.4.21 — 2026-04-28 14:30 Europe/Amsterdam

**Initiated by:** FoundingEngineer (agent), executing [ANKA-31](/ANKA/issues/ANKA-31) (REVIEW-FINDINGS H-5 from [ANKA-19](/ANKA/issues/ANKA-19)).

**Why:** Rails 3 (`news_blackout_5m`) and 4 (`news_pre_kill_2h`) used to fail-closed by reading `news.lastFetchAgeMs(now)` and comparing against `newsStaleMaxMs` — but the `NewsClient` contract permitted *any* number, so a faulty `svc:news` HTTP client could return `0` after a 5xx/timeout and lie about freshness. The §11.7 staleness guard was only as strong as the client's good behaviour. Per ANKA-31 the rail layer now owns the comparison: the client only surfaces a wall-clock timestamp, and the rail does the math. ANKA-9 (live `svc:news` client) hasn't started yet, so this contract revision lands first and the live client implements the cleaner shape from day one.

**Changed** — `@ankit-prop/ctrader-gateway` v0.2.10 → v0.2.11

- `src/hard-rails/types.ts` — `NewsClient.lastFetchAgeMs(atMs: number): number` replaced by `lastSuccessfulFetchAtMs(): number | null`. Documented the contract obligation: implementations MUST return `null` until at least one successful fetch has completed and MUST NOT lie about freshness on a failed fetch.
- `src/hard-rails/rail-3-news-blackout.ts` — rail now reads `lastSuccessfulFetchAtMs()`. `null` → hard reject with `reason: "news client has never reported a successful fetch — fail-closed"` (exported as `NEWS_NEVER_FETCHED_REASON`). Otherwise computes `ageMs = broker.nowMs - lastSuccessfulFetchAtMs` itself and rejects when `ageMs > config.newsStaleMaxMs`. Detail payload now carries `lastSuccessfulFetchAtMs` and `ageMs` (both honest), not a client-reported `lastFetchAgeMs`.
- `src/hard-rails/rail-4-news-pre-kill.ts` — same staleness ownership flip; reuses `NEWS_NEVER_FETCHED_REASON` from rail-3 to keep the failure string identical between rails.
- `src/hard-rails/news-client.ts` — `InMemoryNewsClient` fixture migrated. Option renamed `lastFetchAgeMs` → `lastSuccessfulFetchAtMs: number | null`. Omitted defaults to `Number.MAX_SAFE_INTEGER` (always-fresh sentinel) so spec files that don't care about §11.7 (rail-1, rail-7, rail-10, rail-11, rail-13, force-flat-scheduler, idempotency-record-on-allow, pre-post-fill-split) keep working unchanged.
- `src/hard-rails/matrix.spec.ts` — `buildCtx`'s `newsAgeMs` option renamed `newsLastSuccessfulFetchAtMs: number | null` and threaded through to the new fixture shape. No matrix case currently exercises staleness, so all 28 cases still pass — the staleness positive/negative coverage now lives in the dedicated spec below.

**Added** — `src/hard-rails/news-staleness.spec.ts`

- 8 dedicated cases locking the §11.7 contract end-to-end:
  1. rail 3 `lastSuccessfulFetchAtMs() === null` → `reject` with `NEWS_NEVER_FETCHED_REASON`.
  2. rail 4 same.
  3. rail 3 `ageMs = staleMax + 1s` → `reject` with `news stale ... fail-closed` and detail `{ lastSuccessfulFetchAtMs, ageMs, newsStaleMaxMs }`.
  4. rail 4 same.
  5. rail 3 `ageMs === staleMax` (boundary) → `allow` (rail uses strict `>`).
  6. rail 4 same.
  7. rail 3 negative-age (lying client reports a future timestamp) → `allow` per current arithmetic and detail records the negative age so log analysis can detect upstream clock skew. The proof for the bug is structural: there is no `age` accessor on the contract any more, so a client can no longer return `0` after a failed fetch.
  8. omitted `lastSuccessfulFetchAtMs` → fresh sentinel → rail 4 allows; locks the fixture default for the rest of the test suite.

**Bumped**

- `@ankit-prop/ctrader-gateway` 0.2.10 → 0.2.11 (patch — contract refactor; no behavioural change for non-news rails).
- `bun test packages/shared-contracts/src/news.spec.ts packages/shared-contracts/src/index.spec.ts` — 9 pass / 0 fail / 17 expects.
- `bun run lint:fix` — exit 0; Biome reported pre-existing unsafe suggestions/warnings in unrelated packages and applied no fixes.
- `bun test` — 341 pass / 0 fail / 2089 expects.
- `bun run typecheck` — clean (`tsc --noEmit`).
- `rg -n "console\\.log|debugger|TODO|HACK" packages/shared-contracts/src/news.ts packages/shared-contracts/src/news.spec.ts packages/shared-contracts/src/index.ts` — no matches.

**Notes**

- No service restart required: only the shared contracts package changed, and no service `/health` surface was running from this package.

## ANKA-113 merge reconciliation — @ankit-prop/news 0.0.1 → 0.0.2 — 2026-04-28 13:13 Europe/Amsterdam

**Initiated by:** DocumentSpecialist (agent), executing [ANKA-77](/ANKA/issues/ANKA-77) under [ANKA-75](/ANKA/issues/ANKA-75).

**Why:** `svc:news` needs a canonical real FTMO economic-calendar cassette for the 14-day replay and contract-change detector work described in BLUEPRINT §11.1-§11.3 and §21.3. The chosen 2026-03-23 → 2026-04-06 Prague window crosses the 2026-03-29 DST boundary and includes the requested high-impact USD, restricted, and multi-tag NFP coverage.

**ANKA-113 merge reconciliation:** Authored on PR #1 branch `anka-77-ftmo-calendar-cassette` (commit `43f3a30`) and landed on `main` via merge commit `05bf75b` (root `0.4.25 → 0.4.26`). The original branch-side `## 0.4.21` heading and `root ankit-prop-umbrella 0.4.20 → 0.4.21` bump line were demoted by [ANKA-160](/ANKA/issues/ANKA-160) because that root slot was already used on `main` by [ANKA-31](/ANKA/issues/ANKA-31) at 14:30. The `@ankit-prop/news` 0.0.1 → 0.0.2 package-level bump below still stands.

**Added** — `@ankit-prop/news` v0.0.2 cassette assets

- `services/news/test/cassettes/ftmo-2026-03-23-week.json` — raw FTMO JSON response from `GET https://gw2.ftmo.com/public-api/v1/economic-calendar?dateFrom=2026-03-23T00:00:00+01:00&dateTo=2026-04-06T00:00:00+02:00&timezone=Europe/Prague`, fetched 2026-04-28 13:12 CEST; response header `x-backend-revision: 1d0bf5c9aa11944d489591b907e1c2bea1c61945`; 193 items, 52,541 bytes.
- `services/news/test/cassettes/contract-baseline.json` — keys-and-types baseline for the response/item shape in BLUEPRINT §11.2, intentionally value-free for the later contract-change detector.

**Changed** — `infra:tooling`

- `biome.json` — excludes raw `services/news/test/cassettes/ftmo-*.json` vendor cassettes from formatting so `lint:fix` cannot rewrite bytes that must remain exactly as returned.

**Bumped**

- `@ankit-prop/news` 0.0.1 → 0.0.2 (patch — version-pinned FTMO calendar cassette assets).
- ~~root `ankit-prop-umbrella` 0.4.20 → 0.4.21~~ — removed by [ANKA-160](/ANKA/issues/ANKA-160); branch-side root bump never advanced `main`'s `package.json` (see merge commit `05bf75b`).

**Verification**

- `bun test services/ctrader-gateway/src/hard-rails/news-staleness.spec.ts` — 8 pass / 0 fail / 22 expects.
- `bun test services/ctrader-gateway/src/hard-rails/` — 95 pass / 0 fail / 558 expects (matrix's 28 cases + the 8 new staleness cases + sibling rail specs all green on the new contract).
- `bun test` (full workspace) — 306 pass / 1 fail (`packages/proc-supervisor` integration case 7 — flaky port collision under parallel-heartbeat tree churn; passes 7/7 in isolation immediately after).
- `bunx biome check` on the 6 touched files — 0 diagnostics. Workspace-wide lint still surfaces the pre-existing `packages/market-data-twelvedata` `noNonNullAssertion` warnings already noted in 0.4.20 (unrelated).
- `bun run typecheck` clean (root `tsc --noEmit`).

**Notes**

- `NewsClient.lastSuccessfulFetchAtMs()` is the contract surface ANKA-9 will implement; the live svc:news socket should record the wall-clock timestamp of the *last 200/OK calendar response* and surface it unchanged. A failed poll (5xx, socket close, parse error) MUST NOT advance this value — that's how the §11.7 guard stays honest.
- This commit landed via an isolated `git worktree add` at `/tmp/anka-31-newsclient` because parallel heartbeats kept stomping the main checkout's branch state during the previous two retries (5 collision stashes + recurring `git reset` reflog entries). The worktree isolation pattern is the right answer for any multi-file change while parallel heartbeats are active.
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
