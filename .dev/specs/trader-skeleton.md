# `services/trader` — Phase 4 modular-monolith skeleton

Status: spec, pre-implementation
Owner: FoundingEngineer
Issue: ANKA-123 (parent: ANKA-119 Phase 4 monolith)
Architect review: ANKA-123 comment 6035a456 (port `:9202`, contracts-first, hard-rails-stay-in-gateway)
Last updated: 2026-04-28

This spec is the implementation brief for `services/trader/`. It is
deliberately scoped to the **skeleton** — process model, IPC contract,
stage-pipeline integration points, persistence sketch, health shape, and
test seams — so an implementer (FoundingEngineer or CodexExecutor) can
scaffold against it without re-reading the whole BLUEPRINT.

Authority: where this spec disagrees with `BLUEPRINT.md`, the BLUEPRINT
wins. Any drift discovered during implementation must be raised as a
`DOC-BUG-FIXES.md` entry, not silently reconciled.

---

## 0. Acceptance checklist (from Architect review)

The skeleton is "spec-compliant" only when **all** of these hold:

1. Trader's HTTP server binds **`:9202`** — not `:9301`. Supervisor and
   dashboard already pin this (`BLUEPRINT.md:437`, `BLUEPRINT.md:1984`,
   `BLUEPRINT.md:2381`). Picking a new port silently breaks the
   supervisor health-poller and dashboard SSE proxy.
2. Trader does **not** import gateway internals. The IPC boundary
   (`trader → ctrader-gateway`, `BLUEPRINT.md:471`) is typed via
   `@ankit-prop/contracts` only. If a Zod schema is missing today, it
   gets added to `pkg:contracts/{pipeline,broker,control}` *before*
   `services/trader` imports anything from `services/ctrader-gateway`.
3. Hard rails stay binding in the gateway, not advisory in trader code
   (`BLUEPRINT.md:1061`). Trader generates a stable `clientOrderId` per
   order attempt (ULID, deterministic per `(decision_id, intent.kind)`)
   but treats the gateway verdict + SSE `ProtoOAExecutionEvent` stream
   as the source of truth for fill/state.
4. `/health` matches `HealthSnapshot`
   (`packages/shared-contracts/src/health.ts`) and the trader-specific
   `details` block matches the BLUEPRINT example
   (`BLUEPRINT.md:2302`-2317).
5. Concurrency policy is **decision A** (`BLUEPRINT.md:857`):
   per-instance mutex, drop-on-overlap, increment
   `metrics.tick_skipped_in_flight{instance_id}`. Not a queue.
6. Persistence is **`data/trader.db`** via `bun:sqlite` only — no new
   sqlite client (`BLUEPRINT.md:570`). Every row carries
   `(account_id, envelope_id, instance_id)` per `BLUEPRINT.md:2065`.
7. There is a `MockGatewayClient` test seam that satisfies the same
   `pkg:contracts` interface the live HTTP/SSE client will, so
   bar-replay against `pkg:eval-harness` and offline integration tests
   run with no network.

---

## 1. Process model (decision A)

| Property | Value | Rationale |
|----------|-------|-----------|
| OS process | **One** Bun process | Account isolation is a data-structure boundary, not OS (`BLUEPRINT.md:466`). Supervisor lifecycle stays simple. |
| Account loops | **N parallel** in-process loops | One per `account.enabled === true` row in `accounts.yaml`. v1 has one enabled account (`BLUEPRINT.md:528`). |
| Instance scheduling | Per-instance tick scheduler | Each instance has its own decision cadence; default 5 min uniform (`BLUEPRINT.md:874`). |
| Concurrency control | **Per-instance mutex**, drop-on-overlap (decision A, `BLUEPRINT.md:857`) | A late LLM stage on tick T must not collide with tick T+1. New tick is dropped, metric incremented, no queueing. |
| Envelope coordination | Shared in-process coordinator per envelope | Envelope-wide breakers, daily/overall floors, cost ceilings (`BLUEPRINT.md:542`). |
| Withhold | Instance-scoped `withhold_until` | Set by analyst (`BLUEPRINT.md:863`); other instances on the same envelope continue. |
| Crash blast radius | All accounts on this trader process restart together | Mitigated by gateway force-flat-on-disconnect and supervisor restart policy (`BLUEPRINT.md:495`). |

**Why one process and not N:** account isolation in v1 is achieved via
state partitioning (every DB row tagged), per-instance mutexes, and
per-envelope breakers. Splitting into N OS processes adds supervisor
complexity without buying more isolation than the gateway already
provides at the broker boundary. Re-evaluate if/when the live system has
> 1 enabled account *and* one account's pipeline starvation observably
hurts another's tick budget.

### 1.1 State boundaries (per process)

```
TraderProcess
├── EnvelopeCoordinator(envelope_id)        // shared risk + cost budget
│   ├── breakers (4% daily / 8% overall)
│   ├── cost ceiling (daily_usd / monthly_usd)
│   └── instances: Map<instance_id, InstanceLoop>
│       ├── mutex (drop-on-overlap)
│       ├── withhold_until: number | null
│       ├── last_decision_ts
│       ├── llm cache prefix (Layers 1–4) — never shared
│       └── pipeline: Analyst → Trader → Judge → Gateway → Reflector
└── GatewayClient (typed)                   // single shared HTTP+SSE client
    ├── POST  /orders, /orders/:id/amend, /positions/:id/force-close
    ├── GET   /positions, /orders, /throttle
    └── SSE   /events  (ProtoOAExecutionEvent stream — broker truth)
```

No cross-instance state at runtime (`BLUEPRINT.md:535`).

---

## 2. IPC contract — `trader → ctrader-gateway`

The IPC boundary is **typed RPC over local HTTP/SSE via Elysia**
(`BLUEPRINT.md:475`). All request/response/event shapes live in
`@ankit-prop/contracts`; trader **must not** import from
`services/ctrader-gateway/src/...`.

### 2.1 Contract package work that must precede trader scaffolding

`packages/shared-contracts/src/index.ts` currently exports `eval`,
`hard-rails`, `health`, `news`, `obs`, plus a partial `config`
(`SymbolTagMap`). The trader skeleton requires the catalog rows
`pipeline`, `broker`, and `control` (`BLUEPRINT.md:2924`-2933) to be
present (or stubbed) before any `import` from `services/trader`. The
gateway's existing rail-intent types
(`services/ctrader-gateway/src/hard-rails/types.ts:8`) describe the
shape — they are **not** the public boundary; lift the public-facing
fields into `pkg:contracts/broker` and re-import from there in the
gateway.

| Sub-module | Schemas to land before trader imports it |
|------------|------------------------------------------|
| `pipeline` | `AnalystOutput`, `TraderOutput`, `JudgeOutput`, `ReflectorOutput`, `Decision`, `CacheLayerStats` (BLUEPRINT §6) |
| `broker`   | `OrderRequest` (`NEW`/`AMEND`/`CLOSE` discriminated), `OrderAck`, `OpenPosition`, `ExecutionEvent` (the `ProtoOAExecutionEvent` projection trader consumes), `Bar`, `Symbol` |
| `control`  | `ControlState`, `OperatorAction`, `AuditEntry` |

These are split into their own follow-up issues under ANKA-119.
Implementation of the trader is gated on `broker` + `control`; `pipeline`
schemas are non-blocking for the skeleton because stages are stubs at
P4-skeleton time.

### 2.2 Operations the trader calls

| Op | HTTP | Request shape (in `pkg:contracts/broker`) | Response | Idempotency |
|----|------|-------------------------------------------|----------|-------------|
| Submit order | `POST /orders` | `OrderRequest{kind:'NEW', clientOrderId, accountId, envelopeId, symbol, side, volume, entryPrice, stopLossPrice, takeProfitPrice?, trailingStop?, intendedAtMs}` | `OrderAck{ accepted: boolean, verdict: RailVerdict, orderId?: string, reason?: string }` | `clientOrderId` (rail 9, `services/ctrader-gateway/src/hard-rails/evaluator.ts:44`) |
| Amend SL/TP/trailing | `POST /orders/:clientOrderId/amend` | `OrderRequest{kind:'AMEND', ..., positionId, prevStopLossPrice, newStopLossPrice}` | `OrderAck` | `clientOrderId` (new ULID per amend attempt) |
| Force-close (operator surface, also used by trader on graceful shutdown) | `POST /positions/:positionId/force-close` | `OrderRequest{kind:'CLOSE', clientOrderId, ..., positionId}` | `OrderAck` | `clientOrderId` |
| Reconcile | `POST /accounts/:accountId/reconcile` | `{}` | `{ reconciledAt: string, openPositions: OpenPosition[] }` | none |
| Read state | `GET /positions`, `GET /orders`, `GET /throttle` | — | typed arrays | n/a |
| Event stream | `GET /events` (SSE) | — | `ExecutionEvent` JSONL | gateway is source of truth; trader rebuilds local state from this stream |

### 2.3 `clientOrderId` discipline

- **Generation:** ULID, derived deterministically from `(decision_id,
  intent.kind, retry_attempt)` — same decision retried after a transient
  HTTP error must reuse the same `clientOrderId` so rail 9 short-circuits
  the second attempt instead of letting two orders through.
- **Storage:** persisted in `orders.order_id` (= `clientOrderId`) at the
  moment trader emits the request, with `state='submitted'`. Updated on
  `OrderAck` (`accepted` → `state='accepted'`, rejection → `'rejected'`
  plus reason).
- **Trader does not pre-check rails.** Trader has its internal sanity
  gates from §6.4, but the gateway verdict in `OrderAck.verdict` is
  authoritative. A trader/judge bug must not produce a side-effect on
  the broker — that is the §9 invariant (`BLUEPRINT.md:1061`).

### 2.4 Force-flat hooks

Trader must *react to* gateway-driven force-flats, not initiate them on
its own. Two surfaces matter:

1. **Pre-news / market-close flatten** — gateway rail 13
   (`rail-13-force-flat-schedule.ts`) emits `ExecutionEvent` of type
   `position_closed` with `closed_by ∈ {pre_news_flatten, market_close,
   friday_close}`. Trader's reflector is triggered as usual; no
   separate code path.
2. **Graceful shutdown** — supervisor SIGTERM → trader: (a) stop
   accepting new ticks (set `controlState='halted', set_by='auto:shutdown'`),
   (b) for each open position, emit `OrderRequest{kind:'CLOSE'}` with a
   freshly minted `clientOrderId`, (c) wait up to 10 s for
   `position_closed` events, (d) exit. If 10 s elapses, log and exit;
   gateway force-flat-on-disconnect is the backup
   (`BLUEPRINT.md:2671`).

---

## 3. Stage pipeline integration points (§6.3–6.6)

The skeleton wires the **boundaries**, not the LLM bodies. Each stage
is a Zod-validated function with a stub implementation in P4-skeleton;
real LLM wiring lands in the §13 strategy-version issue.

```
tick(now) ──┬─► instance.mutex.tryAcquire()  (drop if held)
            │
            ▼
   Stage 1  ANALYST(LLM)        ← cached prefix Layers 1–4 + fresh Layer 5
   Stage 2  TRADER(LLM)         ← analyst output + position state + budgets
            │
            └─► HOLD?  → log decision + release mutex
            ▼
   Stage 3  JUDGE(LLM)          ← typed-only, no cached prefix (Q017)
            │
            └─► REJECT? → log decision + release mutex
            ▼
   Stage 4  GATEWAY (deterministic, no LLM)
            POST /orders → OrderAck (gateway hard rails, broker-side SL/TP/trail)
            │
            ▼
            persist `decisions` row (pipeline_outcome ∈ {placed, failed})
            release mutex
            │
            ▼ (asynchronous, on `ExecutionEvent` of `position_closed`)
   Stage 5  REFLECTOR(LLM, async post-close, +30 s grace)
            └─► append to data/trade-memory/<account_id>.jsonl
                update Layer 4 cache prefix
```

| Stage | Lives in | LLM? | Where the boundary is in the skeleton |
|-------|----------|------|---------------------------------------|
| Analyst (§6.3) | `services/trader/src/pipeline/analyst.ts` | Yes (deferred) | Returns a `AnalystOutput` Zod-validated shape; skeleton stub returns `bias:'neutral'` constantly. |
| Trader (§6.4) | `.../pipeline/trader-stage.ts` | Yes (deferred) | Returns `TraderOutput`; stub returns `action:'HOLD'`. Internal sanity gates (§6.4 table) live here, not in gateway. |
| Judge (§6.5) | `.../pipeline/judge.ts` | Yes (deferred) | Returns `JudgeOutput`; stub returns `verdict:'REJECT', reason:'skeleton'`. Standard rejection criteria (1–9) wired here. |
| Gateway (§6.6) | `.../pipeline/dispatch-to-gateway.ts` | **No** | Pure deterministic adapter: `JudgeOutput` + position state + envelope context → `OrderRequest`, then `gatewayClient.submit()`. **No rail logic here.** |
| Reflector (§6.7) | `.../pipeline/reflector.ts` | Yes (deferred) | Subscribes to `ExecutionEvent` SSE; stub no-ops. |

**Failure-isolation rule:** the reflector is the **only** stage allowed
to fail without halting the pipeline (`BLUEPRINT.md:854`). All others —
including the gateway adapter — surface failures up to the instance
loop, which logs and releases the mutex.

---

## 4. Persistence — `data/trader.db` (sketch)

Use `bun:sqlite` only (`BLUEPRINT.md:570`). Schema follows
`BLUEPRINT.md:2068`-2188 verbatim; the skeleton creates the tables and
indexes but only `decisions`, `orders`, `executions`, `costs`, and
`control_state` get write traffic at P4-skeleton time. `trades`,
`phase_state`, `experiments` are created empty.

| Table | First writer in skeleton | Notes |
|-------|--------------------------|-------|
| `decisions` | `dispatch-to-gateway.ts` (writes one row per decision cycle, including HOLD/REJECT) | `pipeline_outcome ∈ {hold, rejected, approved, placed, failed}` |
| `orders` | `dispatch-to-gateway.ts` (writes on submit, updates on `OrderAck`) | `order_id = clientOrderId` |
| `executions` | SSE consumer in `gateway-client/sse-reader.ts` | append-only; `raw` is full event body for audit |
| `costs` | each LLM stage (stubbed for skeleton; real numbers when LLM lands) | one row per LLM call |
| `control_state` | `/control/*` endpoints + auto-pause/halt triggers | upsert by `(scope, scope_id)` |
| `trades` | reflector trigger reconstructs from `executions` + `orders` | empty in skeleton |
| `phase_state` | phase state machine (§8) | empty in skeleton |
| `experiments` | autoresearch (Phase 7) | empty in skeleton |

DDL lives in `services/trader/src/db/migrations/0001_initial.sql`,
applied by an idempotent runner at boot (no migration framework — use a
hand-rolled `runIfMissing(sql)` against `sqlite_master`). Migrations
beyond 0001 are out of scope for the skeleton.

WAL mode and `synchronous=NORMAL` are set by the runner per
`infra:db/journal-mode` (`BLUEPRINT.md:2953`).

---

## 5. Health endpoint shape (port `:9202`)

```
GET /health → HealthSnapshot
```

`HealthSnapshot` is the canonical schema in
`packages/shared-contracts/src/health.ts`. The trader-specific `details`
block matches `BLUEPRINT.md:2302`-2317:

```ts
details: {
  instances: Array<{
    instance_id: string;
    state: 'running' | 'paused' | 'halted';
    last_decision_ts: string | null;
    last_outcome: 'HOLD' | 'BUY' | 'SELL' | 'CLOSE' | 'AMEND' | 'REJECTED';
    cost_today_usd: number;
    withhold_until: string | null;
  }>;
  envelopes: Array<{
    envelope_id: string;
    state: 'running' | 'paused' | 'halted';
    day_pnl_usd: number;
    daily_floor_distance_usd: number;
  }>;
  ll_provider_health: Record<string, 'healthy' | 'degraded' | 'unhealthy'>;
}
```

Skeleton constraints:
- `version` is loaded from `services/trader/package.json` at runtime via
  `loadVersionFromPkgJson()` (`BLUEPRINT.md:2244`). No string literal.
- `bun_version` from `Bun.version`.
- `status` rolls up: any instance `halted` → `unhealthy`; any `paused`
  → `degraded`; else `healthy`.
- `ll_provider_health` is `{}` in the skeleton (LLM not wired).
- Health response is recomputed on each request (cheap), not cached.

Other endpoints from §19.3 land in this skeleton as **registered but
stubbed** unless trivial:

| Endpoint | Skeleton state |
|----------|----------------|
| `GET /metrics` | empty Prometheus exposition (process metrics only) |
| `GET /decisions/recent?limit&instance_id` | reads `decisions` table — implement (cheap) |
| `GET /control-state` | reads `control_state` table — implement |
| `PUT /control/{system,account,envelope,instance}` | implement; writes `control_state`, audits |
| `GET /events` (SSE) | implement; emits decision + control events; broker `position_closed` rebroadcast |

---

## 6. Test seams

### 6.1 `MockGatewayClient`

Lives in `services/trader/src/gateway-client/mock.ts`. Implements the
**same `GatewayClient` interface** the live HTTP/SSE client implements —
trader code does not branch on `mock` vs `live`.

- `submit(req: OrderRequest): Promise<OrderAck>` — programmable
  per-test: queue of prepared `OrderAck`s, plus a default that returns
  `{ accepted: true, orderId: ulid() }`.
- `events: AsyncIterable<ExecutionEvent>` — backed by an in-memory
  channel; tests push events to drive reconciliation paths.
- `reconcile(accountId)` — returns programmable `OpenPosition[]`.

### 6.2 Bar-replay against `pkg:eval-harness`

`services/trader/src/replay/bar-replay-driver.ts` consumes
`pkg:eval-harness/bar-data-cache` (`BLUEPRINT.md:2905`) and feeds bars
into a single `InstanceLoop` running on a virtual clock. Wiring:

- Inject a `Clock` interface into `InstanceLoop` (`now(): number`,
  `sleep(ms): Promise<void>`); production uses `Date.now()` + setTimeout,
  replay uses a `VirtualClock`.
- Inject `MockGatewayClient`; replay generates synthetic `ExecutionEvent`
  fills based on bar OHLC for SL/TP touches (slippage model
  `pkg:eval-harness/slippage-model`).
- Replay does **not** call real LLMs; stage bodies use the deterministic
  stubs from §3.

This same harness is what `paper-replay` mode (`BLUEPRINT.md:2902`)
consumes; the skeleton just exposes the seam.

### 6.3 Hard-rail integration

The trader's tests **do not** redo rail coverage — that lives in
`services/ctrader-gateway/src/hard-rails/*.spec.ts`. The trader-side
expectation is only:

- Given `MockGatewayClient.submit()` returns `{ accepted: false, verdict:
  RailVerdict{outcome:'reject', railKey:'rail-3'} }`, the trader records
  `decisions.pipeline_outcome='failed'`, `orders.state='rejected'`, and
  emits a `decision` SSE event with the rail key.
- No order is retried with a different `clientOrderId` after a hard-rail
  reject.

---

## 7. Files / layout (skeleton diff sketch)

```
services/trader/
├── package.json                        // version-bumped on every code change
├── tsconfig.json
├── src/
│   ├── server.ts                       // Bun.serve / Elysia, binds :9202
│   ├── health.ts                       // HealthSnapshot builder
│   ├── env.ts                          // @triplon/config schema slice
│   ├── trader-process.ts               // wires EnvelopeCoordinator(s) + GatewayClient
│   ├── envelope-coordinator.ts
│   ├── instance-loop.ts                // per-instance scheduler + mutex
│   ├── pipeline/
│   │   ├── analyst.ts                  // stub
│   │   ├── trader-stage.ts             // stub
│   │   ├── judge.ts                    // stub
│   │   ├── dispatch-to-gateway.ts      // pure deterministic; calls GatewayClient
│   │   └── reflector.ts                // stub
│   ├── gateway-client/
│   │   ├── interface.ts                // re-exports from pkg:contracts/broker
│   │   ├── http-client.ts              // live (deferred to ANKA-15-adjacent)
│   │   ├── sse-reader.ts               // SSE consumer; persists to executions
│   │   └── mock.ts                     // MockGatewayClient (test seam)
│   ├── persistence/
│   │   ├── db.ts                       // bun:sqlite open + WAL setup
│   │   ├── migrations/
│   │   │   └── 0001_initial.sql
│   │   └── repos/                      // decisions, orders, executions, costs, control
│   ├── control/
│   │   ├── api.ts                      // PUT /control/*; writes control_state
│   │   └── auto-triggers.ts            // breaker → halt, etc.
│   ├── replay/
│   │   └── bar-replay-driver.ts        // pkg:eval-harness driver (test seam)
│   └── *.spec.ts                       // co-located bun:test
└── data/                               // gitignored; trader.db lives under workspace data/
```

---

## 8. Out of scope (do not implement in the skeleton)

- Real LLM calls (analyst/trader/judge/reflector bodies) — §13 strategy-version issues.
- Layer 1–4 LLM cache prefix construction — §7 of BLUEPRINT.
- Phase state machine transitions — §8 of BLUEPRINT (skeleton table is empty).
- Autoresearch experiment writer — Phase 7.
- Live HTTP/SSE wiring against a real gateway running against IC demo —
  blocked by ANKA-16 operator KYC; until then `MockGatewayClient` is
  authoritative for tests, and the live `http-client.ts` stays
  unexercised behind the same interface.
- Indicator computation (§13.4) — strategy-version concern.
- Audit JSONL surface (`data/audit-log/*.jsonl`) — separate issue under
  §17.7 if not already covered.

---

## 9. Residual risks to watch when scaffolding

1. **Elysia is allowed but not yet a dependency** (`BLUEPRINT.md:593`,
   `package.json:33`). Adding it routes through the
   "before any new npm dep" gate in `AGENTS.md` (DocumentSpecialist for
   version + Bun-built-in alternative; SecurityReviewer for
   supply-chain). If Elysia is rejected at that gate, fall back to a
   thin `Bun.serve()` + Zod-validated handler shim with the same public
   shape — the boundary is the schema, not the framework.
2. **Live broker still gated by ANKA-16.** Anything in `http-client.ts`
   that talks to a real `localhost:9201` is currently dead code; PRs
   adding it must include a CHANGELOG note that it is *unverified
   against IC demo* until KYC clears.
3. **Schema drift between `pkg:contracts/broker` and the gateway's
   internal `RailIntent` types** is the highest-blast-radius footgun:
   if the public `OrderRequest.NEW` shape ever diverges from
   `services/ctrader-gateway/src/hard-rails/types.ts`'s `NewOrderIntent`,
   the gateway must adapt internally — not the trader. A test in the
   gateway should assert structural equivalence at compile time.
4. **`decisions.pipeline_outcome='hold'` writes can flood SQLite** at
   5-min cadence × N instances. Acceptable for v1 (≤ 4 instances) but
   add an index on `(instance_id, ts DESC)` (`BLUEPRINT.md:2085`) and
   re-evaluate retention if instance count grows.

---

## 10. Implementation routing (after this spec is committed)

- This spec stays under `.dev/specs/` — non-production, FE-owned.
- Implementation issues split off ANKA-119:
  1. `pkg:contracts/{broker,control}` — Zod schemas verbatim from this
     spec + BLUEPRINT §6 / §19. **Blocks** trader skeleton.
  2. `pkg:contracts/pipeline` — non-blocking; can land in parallel.
  3. `services/trader` skeleton itself — scaffolds §1–§7 against the
     `MockGatewayClient`. CodexExecutor target.
  4. `services/trader` live HTTP gateway client — dependent on (3) and
     ANKA-16.

Reviewer routing per AGENTS.md §"Mandatory pre-close review gate":

- (1)/(2) — CodeReviewer (contract reshape).
- (3) — Architect for the cross-service pattern, then CodeReviewer.
- (4) — SecurityReviewer (broker credentials path) + CodeReviewer.

---

End of spec.
