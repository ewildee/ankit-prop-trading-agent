# BLUEPRINT — Ankit Prop Trader (`ankit-prop-umbrella`)

> Reconciled implementation blueprint. **Single source of truth where
> the numbered docs disagree.** Synthesised from the full design corpus
> on 2026-04-27.

This document is self-contained: a coding agent (or human team) can
build this system from zero through to a green-lit **FTMO 100k 2-step
Phase 1** without consulting other files, except for the FTMO rule and
cTrader API references called out at point of use. Where this blueprint
contradicts a numbered doc, this blueprint wins; the numbered docs are
to be patched per `DOC-BUG-FIXES.md`.

---

## 0. Reading map

- §0.1: bootstrap onboarding — what to ask the operator before coding starts.
- §0.2: `.dev/` working methodology — how to track work and commit.
- §1–§4: what we're building, decisions made, runtime shape, hierarchy.
- §5: tech stack with pinned versions and Bun-built-in catalogue.
- §6–§9: pipeline, cache, FTMO envelope, hard rails.
- §10–§13: broker, news, controls, personas + scoring.
- §14–§16: eval, autoresearch, dashboard.
- §17–§19: repo layout, config schemas, env vars.
- §20: persistence — SQLite DDL.
- §21–§24: endpoints, observability, testing, phases / run book / checklists.
- §25: module / service catalog (issue-tagging scopes).
- §26: long-running open items.
- §27: glossary.

---

## 0.1 Bootstrap onboarding (run-at-start)

Before any code is written, the implementing agent **must conduct a
single onboarding interview** with Étienne to gather every credential,
account ID, endpoint, and host-specific value the system will need. The
goal: gather everything once, populate `.env` and the user-canonical
config, and **continue autonomously thereafter** — no further "can you
fetch me a token?" interruptions during the build.

The agent presents the prompts below in **one pass** and waits for
Étienne to fill each blank. Store the result in
`~/.config/ankit-prop/accounts.config.yaml` (creds-bearing) and
`./.env` (env-resolved secrets) per `@triplon/config` precedence rules.

### Required answers

```
1. cTrader application credentials (broker socket OAuth)
   - cTrader app client_id:                __________
   - cTrader app client_secret:            __________
   - cTrader app redirect_uri (loopback):  __________

2. FTMO Free Trial account (Phase 2 smoke-test target —
   operator-resettable when guardrails trip)
   - ctidTraderAccountId (numeric):        __________
   - cTrader account login:                __________
   - Initial demo balance (USD):           __________

3. FTMO 100k 2-step #1 — leave blank until paid challenge purchased
   - ctidTraderAccountId (numeric):        ____ (blank ok)
   - Initial balance (USD):                100000  (default; confirm)

4. OpenRouter (LLM provider gateway)
   - OPENROUTER_API_KEY:                   __________
   - Monthly spend cap (soft):             __________

5. Local secrets encryption
   - SECRETS_ENCRYPTION_KEY (32 bytes hex; agent generates if blank)

6. Alerting (optional but recommended)
   - ALERT_WEBHOOK_URL (Slack/Discord/etc.): __________
   - Operator handle to mention on critical alerts: __________

7. Telemetry (optional)
   - OTEL_EXPORTER_OTLP_ENDPOINT:          __________ (blank → disabled)
   - OTEL_SERVICE_NAME prefix:             ankit-prop

8. Operating mode
   - Initial mode (dev | prod):            dev (default)
   - Daily summary delivery time (Europe/Prague): 22:30 (default)
   - Operator timezone for human-readable logs: __________
```

### What the agent does with the answers

1. Generates `~/.config/ankit-prop/accounts.config.yaml` with the right
   `*_env` references (NEVER inlines secrets).
2. Generates `./.env` with the actual secret values.
3. Generates `./.env.example` with the same shape but blank values.
4. Generates `~/.config/ankit-prop/supervisor.config.yaml` from the
   template in §17.2 with the operator's chosen mode.
5. Adds `.env` and `~/.config/ankit-prop/*.config.yaml` to `.gitignore`.
6. If `SECRETS_ENCRYPTION_KEY` was blank, generates one via
   `bun -e "console.log(crypto.randomBytes(32).toString('hex'))"` and
   shows the key to Étienne to copy elsewhere (the agent does NOT save
   it anywhere except `.env`, which is gitignored).
7. Verifies OpenRouter key works: a single 1-token health probe to
   `models/moonshotai/kimi-k2.6` and `models/deepseek/deepseek-v4-flash`.
8. Verifies the cTrader app credentials by completing the OAuth
   `application_auth` flow against the FTMO Free Trial account.

### After this interview

The agent **does not ask Étienne for further credentials** during the
build. New credentials only become required at:

- Phase P1 → buying the paid FTMO 100k 2-step (Étienne does this
  manually, surfaces the new `ctidTraderAccountId`, agent updates the
  config). The Phase 2 / 6.5 / FT smoke + burn-in surface is the FTMO
  Free Trial, which is free and operator-resettable, so no new creds
  are needed in those phases beyond the initial intake.
- Any compliance step that's already out-of-scope (KYC, contract
  signing, payouts).

Anything that the agent thinks it needs but isn't on the list above:
**halt and surface to Étienne with one consolidated batch of questions**;
do not ask one at a time.

---

## 0.2 Working methodology — `.dev/` & commit conventions

The umbrella follows the same `.dev/` methodology used in
`~/Work/Projects/tools/snelstart-cli` and
`~/Work/Projects/tools/invoice-extract`. The implementing agent:

### Mandatory reading before writing Bun code

**Every coding agent that writes Bun-runtime code in this project must
fetch and read https://bun.com/llms.txt at the start of each session.**
That page is the canonical, machine-readable index of Bun's native
features (HTTP server, WebSocket client/server, raw TCP/TLS,
`bun:sqlite`, `Bun.cron`, YAML, Glob, password hashing, shell, etc.).

Why mandatory:

- Adding an npm package for something Bun ships is a red flag (§5.3
  "Forbidden" list).
- Bun ships new natives between releases; today's "use the npm package"
  may be tomorrow's "use the built-in".
- The agent's training-data prior is unreliable here. The llms.txt URL
  is the source of truth.

The agent records the date+time of the last `llms.txt` fetch in
`.dev/progress.md`; re-fetch if the recorded fetch is older than the
current session start.

### Memory file discipline

| File | Question it answers | Write pattern |
|------|---------------------|---------------|
| `TODOS.md` | What should I work on next? | Add items, check off, **prune completed items** within a session or two |
| `.dev/progress.md` | Where are we right now? | **Replace** current section; don't append history; keep ≤ 20 lines |
| `.dev/journal.md` | What happened and what did we learn? | **Append only**, newest entry first; never edit past entries |
| `.dev/decisions.md` | What did we decide and why? | Append new ADRs; don't rewrite history |
| `.dev/discussion/<topic>.md` | Question needing human input | One file per theme |
| `.dev/ideas/<id>.md` | Backlog of mutation/feature ideas | One file per IDEA when it outgrows TODOS.md |
| `CHANGELOG.md` | What was released, when, and why? | Append at top; timestamp each release |

Proof of completion lives in **git history + CHANGELOG.md + journal**.
Don't accumulate a "Completed" section in `TODOS.md`.

### Item ID scheme (`APROP-<TYPE><NNN>`, zero-padded)

| Code | Meaning | Lives in | Use for |
|------|---------|----------|---------|
| `T` | Task | `TODOS.md` | Feature, improvement, enhancement |
| `I` | Issue | `TODOS.md` | Bug, defect, regression |
| `Q` | Question | `TODOS.md` | Needs decision/research/external input |
| `IDEA` | Idea | `TODOS.md` or `.dev/ideas/` | Future exploration |
| `D` | Discussion | `.dev/discussion/` | Extended back-and-forth needing human |
| `ADR` | Decision | `.dev/decisions.md` | Durable architectural decision |
| `SPEC` | Spec | `.dev/specs/` | Contract for an implementable component |

Status markers: `[ ]` open · `[~]` in progress (must match
`.dev/progress.md`) · `[x]` done.

### Dual-tool TODO rule

When the agent's runtime (Claude Code, Cursor, etc.) provides its own
todo-tracking tool — e.g. `TodoWrite` in Claude Code — **the agent uses
both simultaneously**:

- `TODOS.md` is the durable, repo-tracked record (survives across
  sessions, agents, and machines). Always update.
- The runtime's todo tool is the in-session focus aid (visible in the
  agent's UI, often surfaces progress to the operator). Always update.

Neither replaces the other. A new task creates an entry in **both**;
completing a task ticks it off in **both**.

### After every code change (mandatory)

1. Add or update `.spec.ts` tests for changed behaviour.
2. `bun run lint:fix`.
3. `bun test`.
4. `bun run typecheck`.
5. **Bump the version** of every package whose code changed (semver
   matrix below) and append a `CHANGELOG.md` entry with `HH:MM` time.
6. Commit (small, descriptive, scoped — see §0.2 commit conventions).
7. Restart any service whose package changed — every `/health`
   endpoint exposes the running `version` field (§19.0); after restart,
   confirm the new version is live by `curl localhost:9100/health |
   jq '.services[].version'` (or via the dashboard's version-matrix).

Do not commit with failing lint / tests / typecheck unless explicitly
instructed.

Per ADR-0006, this local §0.2 sequence is the verification gate for
the repository. Do not add GitHub Actions, third-party hosted CI, or
automated public-runner pipelines; agents paste the local command
output into the issue thread before sign-off.

The version bump + changelog + commit + `/health` reflect cycle is
**not optional bookkeeping** — it is the audit trail. If a regression
appears in production, the operator can grep the changelog by date,
match it to the version on `/health`, and bisect to the commit. Past
incidents that this discipline solves: stale process running pre-fix
code, unclear "is this the new build?" question, no audit trail of
what changed when.

### CHANGELOG skip-class (narrow)

The CHANGELOG entry is **mandatory for every behaviour-affecting
commit**. The only commits that may skip the CHANGELOG entry are
**pure lint chores that mutate no behaviour** — e.g. a `bun run
lint:fix` reformat, whitespace-only diff, comment-only edit, or an
import-order shuffle. Even in that case the commit must carry a
`.dev/journal.md` cross-reference (one-line entry naming the chore
and the lint rule applied) so the audit trail stays unbroken.

If the commit changes any code path, public surface, schema,
contract, doc semantic, test assertion, configuration default, or
build/CI behaviour, the CHANGELOG entry is **non-optional** — see
step 5 above. "Docs-only" diffs to `BLUEPRINT.md` / `AGENTS.md` /
`TODOS.md` count as behaviour-affecting because they shift the
canonical contract; they take a CHANGELOG entry like any other
change. When in doubt, write the entry.

### Session journal (mandatory at session end)

Append to `.dev/journal.md`, newest first. Each entry must include:

- **Date, time (HH:MM, 24-h, Europe/Amsterdam), version** — run `date`
  for the real timestamp (this machine's local time is Europe/Amsterdam);
  never guess. Format: `## 2026-04-27 16:42 — v0.3.1`.
- **What was done** — concise list of changes.
- **Findings** — anything discovered that wasn't known before.
- **Contradictions** — docs/assumptions/prior decisions that turned
  out to be wrong, with resolution.
- **Decisions** — technical decisions made, with reasoning.
- **Unexpected behaviour** — bugs, surprises, edge cases.
- **Adaptations** — how the plan changed in response.
- **Open endings** — what's left unfinished; every actionable open
  ending must also live in `TODOS.md`.

### Editing markdown files

Never overwrite `AGENTS.md`, `BLUEPRINT.md`, `TODOS.md`,
`.dev/journal.md`, or `.dev/progress.md` from memory. Re-read the file
first, then apply targeted edits.

### Commit & version

- **Commit autonomously.** Small, descriptive commits after tests pass.
- Conventional Commits prefix when natural (`feat:`, `fix:`, `docs:`,
  `refactor:`, `test:`, `chore:`).
- Git trailers for decisions:
  - `Constraint:` — active constraint shaping the decision.
  - `Rejected:` — alternative considered + reason.
  - `Confidence:` — `high` | `medium` | `low`.
  - `Scope-risk:` — `narrow` | `moderate` | `broad`.
  - `Spec:` — the spec file the change implements.
  - `Not-tested:` — known verification gap.
- Never skip pre-commit hooks (`--no-verify`) without explicit user
  permission.
- Never commit secrets or `*.config.yaml` files containing creds.
- **Push after every successful commit on a tracked branch.** Run
  `git push` (or `git push -u origin <branch>` for a new branch) to
  `origin` (`git@github.com:ewildee/ankit-prop-trading-agent.git`)
  immediately after each commit lands. Do not batch commits without
  pushing — local-only commits are not durable progress. If the push
  fails (network, auth, non-fast-forward), surface the failure in the
  task thread; do not silently leave commits local. This rule applies
  to every engineering agent that writes code (FoundingEngineer,
  CodexExecutor, Debugger, and any future code-writing agent). Branch
  protection / PR gating is out of scope for this rule — push the
  branch, even when the workflow later moves to PRs.

**How to choose the version increment** (CHANGELOG + `package.json#version`):

| Change | Bump |
|--------|------|
| Bug fix, config tweak, doc change | patch |
| New feature, command, behaviour change | minor |
| Breaking surface or schema change | major |

**CHANGELOG entries must include:**

- Who initiated the change (Étienne / agent / autoresearch).
- Context — the *why*, not just the *what*.
- Timestamp from `date`, never guessed. Format:
  `## 0.3.1 — 2026-04-27 16:42 Europe/Amsterdam`. Time is **HH:MM 24-h**
  in **Europe/Amsterdam** (operator's local time, also this machine's
  local time); never round to the hour, never guess.

### Timezone discipline (read carefully)

Two timezones live in this project; **never mix them**:

| Where | Timezone | Reason |
|-------|----------|--------|
| `CHANGELOG.md`, `.dev/journal.md`, `.dev/progress.md`, `TODOS.md`, commit messages, ad-hoc operator notes, audit-log human-readable timestamps | **Europe/Amsterdam** | Operator's local time (Étienne); this machine's local time. The artifacts are read by humans operating from this clock. |
| Service runtime (gateway, trader, news, autoresearch, supervisor): all FTMO logic, daily-floor lock, persona windows, force-flat schedule, news-calendar URL `timezone=Europe%2FPrague`, daily summary cron, phase state machine, internal log timestamps | **Europe/Prague** | FTMO server clock. Mismatching by even one DST transition can cause a daily-floor breach. |

When the two zones happen to coincide (most of the year), **still
write the IANA zone explicitly** — never elide. The operator must be
able to read a journal entry from a Czech-DST-edge day and know
unambiguously which clock it's on.

### Skill / tool overrides

If the agent's environment loads a skill that conflicts with the
project's own version-bump or commit conventions (e.g. a generic
`/release` skill, `/version-check`), **the project conventions win**.
The skill is informational; this section is normative.

---

## 1. System definition

### 1.1 Mission

An **autonomous LLM-driven trading agent** that trades **FTMO prop-firm
capital** via the **cTrader Open API**. Every market tick runs through
a 5-stage pipeline (Analyst → Trader → Judge → Gateway → Reflector)
inside hard guardrails. The system self-improves by mutating a bounded
prompt/parameter surface (`strategy/v_*/`) under canonical FTMO-rule
gating.

**Primary target:** **FTMO 2-Step Challenge, USD 100,000 account
(Standard)**, equivalent to EUR 80,000.

### 1.2 Success criteria

| # | Criterion | Target |
|---|-----------|--------|
| 1 | Survives FTMO Free Trial without rule breach | 14 trading days, zero `ftmoBreaches` |
| 2 | Positive Sortino-rolling-60d on ≥1 persona | ≥ 8 / 12 walk-forward folds |
| 3 | Cost / session bounded | < USD 5 / session / account at default lineup |
| 4 | Cache cost reduction is real | DeepSeek ≥ 30×, Kimi ≥ 3×, blended ≥ 8× |
| 5 | Autoresearch produces ≥ 1 promoted improvement / month | After Phase 7 launch |
| 6 | Multi-account isolation holds | One account's crash never affects another |
| 7 | Never autonomously moves money | Code audit; no live-cash credential paths |
| 8 | Comprehensive monitoring through Phase 1 | Alerts firing, daily summary delivered, no silent failures |

### 1.3 Out of scope (invariant)

- FTMO contract signing, KYC, tax, insurance, payouts.
- Real-money cash account credentials.
- Options, futures, real-share equities, crypto.
- Windows runtime (untested; not supported).

### 1.4 Operating mode

**As autonomous as possible.** Étienne is *not* assumed to be at the
keyboard during the day. The system:

- auto-pauses on safety triggers,
- auto-halts on breach proximity,
- auto-flattens before scheduled news (per decision M.2),
- auto-flattens on profit target hit + min-days complete (per decision N),
- delivers a **daily summary** + alerts on any anomaly.

Operator action is required for: phase progression confirmation
(after FTMO acknowledges), kill-switch resume, force-close at will,
prompt/persona promotion past suggest-only.

---

## 2. Reconciled decisions (A–BB)

This is the single resolution table. Every previously-open question
that affects implementation is decided here. Cross-references in §
sections below.

| ID | Decision | Source |
|----|----------|--------|
| **A** | **Drop-on-overlap concurrency.** One in-flight pipeline per `instance`; new ticks while one is in flight are dropped and counted as `tick_skipped_in_flight`. Reflectors run async post-close and do not block. | §6, §23 |
| **B** | **Reflector: separate calls per close.** No batching. | §6.7 |
| **C** | **XAUUSD action cadence = 5-min bar close.** Persona may use 1h/15m bars internally for regime classification. | §6.10, §13 |
| **D** | **`withholdMinutes` scope = instance only.** | §6.3, §13 |
| **E** | **Drop `'TRAIL'` from `TraderOutput.action`.** Add `'AMEND'` with `{ amendType: 'sl' \| 'tp' \| 'trailing_distance', newValue }`. SL-loosening is a gateway invariant (rejected). | §6.4 |
| **F** | **Backtest data:** on-the-fly cTrader pulls + a **separate local SQLite** of historical bars (`packages/eval-harness/data/bars.db`). | §14 |
| **G** | **Bar-granularity simulator** for v1, with documented downsides; tick replay deferred until autoresearch signal demands it. | §14 |
| **H** | **Walk-forward 12 folds**, rolling 6m train / 1m score. | §14, §27 |
| **I** | **Autoresearch acceptance threshold = 30%** (ATLAS prior). Reduce to 20% if signal sparse. | §15 |
| **J** | **Mutation generator = Kimi K2.6 exacto** with full strategy-version + 30-day trade log + reflector lessons + `ideas.md`. | §15 |
| **K** | **Cost-share within envelope tied to `risk_share_pct`.** `instance.daily_cost_share = envelope.cost_ceiling.daily_usd × (risk_share_pct / 100)`. | §4, §16 |
| **L.1** | **`force_flat_lead_min: 5` mandatory default.** Schema requires this field on every instrument; no instrument may omit it. Gateway hard rail #13. | §9 |
| **L.2** | **Persona `activeEnd*` is soft** (judge rejects new entries; open positions continue to natural exit / SL / TP). Force-flat at market-close is the hard rail. | §13 |
| **M.1** | **Apply news blackout on all phases** (Phase 1+2 over-cautious; Funded FTMO-required). | §11 |
| **M.2** | **Pre-flatten at T-6 min** (option a). Gateway closes all positions on the affected instrument(s) 6 min before each restricted event. | §9, §11 |
| **N** | **Phase advance Option 2: auto-flatten** when `closed_balance ≥ INITIAL_CAPITAL × (1 + target + buffer)` AND `min_trading_days_completed`. Operator confirms phase flip post-FTMO-ack via dashboard. | §8.4, §16 |
| **O** | **EA throttle moves to account level** in YAML. Per-account 1,800/day budget; per-envelope share visible but enforced at account. | §17.4, §19 |
| **P** | **Phase-aware risk per trade lives on the envelope.** `envelope.risk.per_trade_pct.{phase_1,phase_2,funded}` = `0.5, 0.4, 0.4`. Persona may declare `risk.maxPerTradePct` as a cap; runtime uses `min(env, persona)`. | §4, §13 |
| **Q** | **Configurable scoring per persona.** Default `v_ankit_classic` = `v1_continuous_confluence` over `[1d, 4h, 1h, 5m]` with threshold 50. Spec in §13.4. | §13.4 |
| **R** | **`v_floor_trail` is a behaviour mode**, not a standalone persona. Wired via `params.yaml.trail.*` on any persona; gateway enforces monotone SL invariant. | §13 |
| **S** | **Persona-window timezone = `Europe/Prague`** (FTMO server clock). All `*Ce` / `*Cest` labels rewrite to `*Prague`. | §13 |
| **T** | **One `@triplon/config` schema per file** (accounts / supervisor / recovery / symbol-tag-map). | §17 |
| **U** | **Profit-target hard rail uses closed balance** + all positions flat + min-days complete. | §8.4, §9 |
| **V** | **Cache key composition:** `hash(strategy_version, prompt_hash, params_hash, _shared_hash, stage_name, model, variant)`. Mutating params invalidates cache. | §7 |
| **W** | **cTrader transport: `wss://*.ctraderapi.com:5035/`** for both demo and live (protobuf-over-WSS). 5036 (JSON) is not used. | §10 |
| **X** | **Slippage guard tolerance = `max(2 × typical_spread, 0.5 × ATR(14))`.** Configurable per envelope. | §9 |
| **Y** | **"Tier-1" event = `impact === 'high' OR restriction === true`.** | §11 |
| **Z** | **`strategy/_shared/` is frozen** w.r.t. autoresearch (human-edited only). | §15 |
| **AA** | **Crash recovery: hold + alert** open positions. Broker-side SL/TP keep protecting; operator decides flatten/resume. `recovery.on_orphan_position`: dev `auto_adopt`, prod `manual_approve`. | §26 |
| **BB** | **Trailing-stop activation managed by gateway** via `ProtoOAAmendPositionSLTPReq` after `activateAtR` is hit; never widens (monotone). | §10.4 |
| **CC** | **Idea backlog kept** in `06-strategy-personas.md` §10 (V1 trading-lab ideas). | §13.7 |

---

## 3. Runtime architecture

### 3.1 Process map

**5 long-running processes + 1 supervisor.** `eval-harness` is a
library, not a process.

```
                 ┌─────────────────────────────────────┐
                 │   @triplon/proc-supervisor          │
                 │   adopt | replace | refuse          │
                 │   /health aggregator (port 9100)    │
                 └──────────────┬──────────────────────┘
                                │ owns lifecycle of:
       ┌────────────────────────┼────────────────────────┐
       │                        │                        │
┌──────▼──────┐    ┌────────────▼─────────────┐   ┌──────▼──────┐
│    news     │    │     ctrader-gateway      │   │   trader    │
│  (calendar) │◀───│  (broker socket, hard    │◀─▶│ (modular    │
│   port 9203 │    │   rails) port 9201       │   │  monolith)  │
└─────────────┘    └────────────┬─────────────┘   │  port 9202  │
       ▲                        │ broker truth    └──────┬──────┘
       │                        │ protobuf/WSS:5035       │
       │                  ┌─────▼─────┐                   │
       │                  │ cTrader   │                   │
       │                  │ Open API  │                   │
       │                  └───────────┘                   │
       │                                                   │
┌──────┴──────┐                                    ┌──────▼──────┐
│autoresearch │ (scheduled, not at boot)           │  dashboard  │
│  port 9205  │                                    │  port 9204  │
└─────────────┘                                    └─────────────┘
       ▲ uses
       │
┌──────┴───────┐
│ eval-harness │ (library; consumed by trader + autoresearch)
└──────────────┘
```

### 3.2 Roles & rationale

| Process | Role | Why separate |
|---------|------|--------------|
| `proc-supervisor` | Lifecycle manager, `/health` aggregator | Single operator entry point; isolates restart semantics |
| `ctrader-gateway` | Broker socket, hard guardrails | Isolates broker I/O from LLM bugs; rails outside LLM-controlled code |
| `trader` | N account loops, LLM pipeline, decision DB | Account isolation is data-structure, not OS-process |
| `news` | Calendar gate, sentiment | Different reliability profile (third-party HTTP) |
| `dashboard` | Read-mostly cockpit | Restarts don't touch trading |
| `autoresearch` | Scheduled mutation/eval loop | Should not run continuously |

### 3.3 IPC

| Direction | Protocol |
|-----------|----------|
| `trader → ctrader-gateway` | Local HTTP/SSE, **Elysia** (typed RPC) |
| `trader → news` | Local HTTP, Elysia |
| `ctrader-gateway ↔ broker` | Protobuf-over-WSS, `wss://*.ctraderapi.com:5035/` |
| `dashboard ↔ services` | Pull + SSE; never push |
| `supervisor → managed` | POSIX signals + `/health` polling |

### 3.4 Bootstrap order (topo-sorted, parallel waves)

1. `news` (no deps; warm slow I/O early).
2. `ctrader-gateway` (broker reachability).
3. `trader` (depends on gateway + news healthy).
4. `dashboard` (independent; parallel with the above).
5. `autoresearch` (cron-scheduled, not at boot).

### 3.5 Failure-mode defaults (fail-closed)

| Component fails | Default |
|-----------------|---------|
| Calendar feed | **Blackout**: judge rejects all directional entries |
| LLM provider 5xx | Skip the tick; no blind orders |
| Gateway socket | Halt that account's instances; reconnect with reconciliation |
| DB unreachable | Dev: in-memory fallback. Prod: halt account, alert |
| News service | Trader refuses to start; supervisor surfaces error |
| Dashboard | Trading continues; observability degraded |
| Autoresearch | Trading unaffected; retries next scheduled run |
| Supervisor | Services keep running; no auto-restart until supervisor up |
| Rail dispatcher returns empty decision list | **Reject** synthesised at the contract surface (`composeRailVerdict([], decidedAt)`); reason `'no rails evaluated — fail-closed'` (`NO_RAILS_EVALUATED_REASON`). Defence in depth against dispatcher rewrites or feature-flag short-circuits ([ANKA-32](/ANKA/issues/ANKA-32); CHANGELOG 0.4.10). |

**Default for any uncertainty: fail closed. No trades > wrong trades.**

---

## 4. Account / Envelope / Instance hierarchy

```
system
└── account A (one cTrader connection, one ctidTraderAccountId, one OAuth)
    ├── envelope A1 (one risk container — breakers, phase, cost ceiling)
    │   ├── instance A1.1 (XAUUSD + v_ankit_classic)
    │   └── instance A1.2 (NAS100 + v_session_break)
    └── (more envelopes only when post-funded scaling needs it)
```

| Level | Definition | Key state |
|-------|------------|-----------|
| **Account** | One broker connection | Socket, credentials, currency, initial balance, **phase state machine**, per-account EA-throttle bucket |
| **Envelope** | One risk container | Daily/overall floors, profit target, exposure caps, cost ceiling, active/paused/halted, per-phase risk knob |
| **Instance** | One (instrument, strategy) pipeline | Cached LLM prefix, tick history, per-instance cost share, health, withhold-until |

### 4.1 Starting deployment (v1)

| Account | Envelope | Instance | Instrument | Strategy |
|---------|----------|----------|------------|----------|
| `ftmo-2step-100k-1` | `ftmo-2step-#1` | `xauusd-ankit-classic` | XAUUSD | `v_ankit_classic` |
| `ftmo-2step-100k-1` | `ftmo-2step-#1` | `nas100-session-break` | NAS100 | `v_session_break` |

Two instances active on **one** enabled account. Disabled accounts may
exist in `accounts.yaml` to exercise the loader, but they are not part
of v1 deployment.

### 4.2 Isolation invariants

1. No shared LLM context between instances.
2. No shared trade DB rows (every row carries `account_id`, `envelope_id`, `instance_id`).
3. No cross-instance state at runtime; offline autoresearch may read across.
4. **One socket per account** at v1 (multiplexing deferred until M > 1).

### 4.3 Shared-envelope coordination

- Breakers are **envelope-wide** (account-wide equity, not per-instance P&L).
- Judge sees the **envelope's** remaining budget.
- If envelope daily loss approaches 4% breaker, **all instances on that envelope pause new entries**. Position management (AMEND, partial close, full close) remains allowed.
- `sum(risk_share_pct) === 100` per envelope, validated at supervisor start.
- `instance.daily_cost_share = envelope.cost_ceiling.daily_usd × (risk_share_pct / 100)` (decision K).

---

## 5. Tech stack (frozen, pinned)

All versions verified live on npm 2026-04-27. The implementer must use
**these exact versions or higher patch** and not fall back to internal
priors. **Before reaching for any npm package, the implementing agent
MUST read https://bun.com/llms.txt** (mandatory; see §0.2 "Mandatory
reading before writing Bun code"). Adding a package for something Bun
ships is a red flag.

### 5.1 Use Bun built-ins (no npm dependency required)

| Need | Bun native | Notes |
|------|-----------|-------|
| HTTP server | `Bun.serve()` | Used by all services |
| WebSocket server | `Bun.serve({ websocket })` | Dashboard SSE proxy / future agent push |
| WebSocket client | global `new WebSocket(url)` | Standard browser-compatible API; **used for cTrader's `wss://*.ctraderapi.com:5035/`** — no `ws` package needed |
| Raw TCP / TLS sockets | `Bun.connect()` | Fallback for hand-rolled cTrader client (length-prefix framing path); replaces `net` + `tls` |
| HTTP fetch | global `fetch` | For news calendar GET, OpenRouter (where AI SDK isn't used) |
| SQLite | `bun:sqlite` | All persistence — replaces `better-sqlite3` |
| YAML | Bun built-in | Used by `@triplon/config` internally; do not add `yaml`/`js-yaml` |
| Glob | `Bun.Glob` | File matching; do not add `globby`/`fast-glob` |
| Cron | `Bun.cron` | Autoresearch nightly tick, daily summary 22:30 Prague, calendar-fetcher 30-min — **do not add `node-cron`** |
| Child process | `Bun.spawn` / `Bun.spawnSync` | Supervisor process management |
| Shell scripting | `$\`...\`` (Bun shell) | Backups, migrations, secrets-rotate scripts |
| Env vars | `Bun.env` (auto `.env`) | All env loading goes through `@triplon/config` which uses this |
| Password / hashing | `Bun.password`, `Bun.hash`, `crypto` (Web Crypto) | Refresh-token encryption (AES-GCM via Web Crypto) |
| Test runner | `bun test` | Co-located `*.spec.ts` |
| Workers | `Worker` global | Reserved for future heavy indicator jobs if needed |
| Tar | `Bun.archive` | Backup tarballs |

### 5.2 npm packages (Bun does not ship these — pin exact versions)

| Layer | Choice | Pinned version |
|-------|--------|----------------|
| Runtime | **Bun** (never Node) | **1.3.13** |
| Language | TypeScript strict | **6.0.3** |
| Validation | Zod v4 | **4.3.6** |
| Config loader | `@triplon/config` (private Triplon registry) | latest from registry |
| Lint/format | Biome | **2.4.13** |
| Workspaces | Bun workspaces (`packages/*`, `services/*`) | n/a |
| Frontend | React + Tailwind v4 | React **19.2.5**, Tailwind **4.2.4** |
| Service framework (typed RPC) | Elysia | **1.4.28** |
| LLM client | `ai` + `@openrouter/ai-sdk-provider` | **6.0.168** + **2.8.1** |
| Broker adapter | `ctrader-ts` (vendored) | **1.0.1** |
| Protobuf decoder | `protobufjs` (in-house client fallback) | **8.0.1** |
| Timezone math | `@date-fns/tz` (`Europe/Prague`) | **1.4.1** |
| Date math | `date-fns` | **4.1.0** |
| Structured logging | `pino` + `pino-pretty` (dev) | **10.3.1** / **13.1.3** — Bun has `console.log` but no levelled, redacted, JSON-line logger |
| ID generation | `ulid` (sortable client UUIDs) | **3.0.2** |
| Tracing | `@opentelemetry/api` + `@opentelemetry/sdk-node` | **1.9.1** / **0.215.0** — **Bun does not ship native OTLP** (verified via [Bun discussion #7185](https://github.com/oven-sh/bun/discussions/7185), [issue #3775](https://github.com/oven-sh/bun/issues/3775), [issue #26536](https://github.com/oven-sh/bun/issues/26536) Jan-2026). Use these via **programmatic initialisation** (NOT `--require`) per §22.4 |
| HTTP test mocking | `msw` | **2.13.6** |

### 5.3 Forbidden

- `node` binary in any script.
- Real-money cash account credentials anywhere.
- Skipping pre-commit hooks.
- Hard-coded API keys; all via env vars resolved by `@triplon/config`.
- Adding `ws`, `node-cron`, `better-sqlite3`, `js-yaml`, `globby`,
  `fast-glob`, `dotenv` — Bun ships all of these natively.
- `node:net` / `node:tls` direct imports for new sockets — use
  `Bun.connect`. (Vendored libraries that already use them may keep
  their internals.)

---

## 6. Multi-stage LLM pipeline

Per **instance**, every **5 minutes** (decision cadence, uniform
across the system to keep cache warm):

```
[cache prefix: L1 framework + L2 instrument + L3 session + L4 history]
                            ↓
         Stage 1 — ANALYST (LLM)        — thesis, bias, confidence, key levels, regime, withholdMinutes
                            ↓
         Stage 2 — TRADER (LLM)         — action (BUY|SELL|HOLD|CLOSE|AMEND), size, SL, TP, trailingStop, rationale
                            ↓                                                     ▲
                  HOLD? → log + wait                                              │ decision E
                            ↓                                                     │
         Stage 3 — JUDGE (LLM)          — APPROVE | REJECT + rejectedRules[]     │
                            ↓
                  REJECT? → log + wait
                            ↓
         Stage 4 — GATEWAY (deterministic) — hard rails, broker-side SL/TP/trail, place
                            ↓
                  [trade lifecycle in broker]
                            ↓
         Stage 5 — REFLECTOR (LLM, async post-close) — lesson, outcomeCategory, contributingFactors
```

### 6.1 Variants and escalation (Q021 thresholds)

| Variant | Meaning | Default |
|---------|---------|---------|
| `nitro` | Fast, no thinking, smaller model | judge, reflector |
| `exacto` | Slow, thinking on, max-quality model | analyst, trader |

**Runtime escalates `nitro → exacto`** when any:

- Within **30 s** of bar close (per active timeframe).
- Last **3** stage outputs disagree (confidence drop or bias flip).
- Envelope at **> 50%** of daily risk budget consumed.

Thresholds live in `params.yaml.escalation`; mutable by autoresearch.

### 6.2 Default model lineup

| Stage | Model slug | Variant | Thinking |
|-------|-----------|---------|----------|
| Analyst | `moonshotai/kimi-k2.6` | `exacto` | ON |
| Trader | `deepseek/deepseek-v4-flash` | `exacto` | ON |
| Judge | `deepseek/deepseek-v4-flash` | `nitro` | OFF |
| Reflector | `deepseek/deepseek-v4-flash` | `nitro` | OFF |
| Autoresearch generator | `moonshotai/kimi-k2.6` | `exacto` | ON |

Both providers via OpenRouter (`@openrouter/ai-sdk-provider`).

### 6.3 Stage 1 — Analyst

**Input** (Layers 1–4 cached + Layer 5 fresh): framework prompt,
instrument structural context, daily session context (with calendar),
rolling 24-h history (last 24 h or last 10 decisions, whichever more,
plus reflector lessons and indicator values per §13.4), current 3–5
bars at the persona's timeframe, current spread, current open
position state, the question prompt.

**Output (Zod-validated):**

```ts
const AnalystOutput = z.strictObject({
  thesis:            z.string().min(20).max(800),       // 2–6 sentences
  bias:              z.enum(['long','short','neutral']),
  confidence:        z.number().min(0).max(1),
  keyLevels:         z.array(z.strictObject({
                       name: z.string(),
                       price: z.number(),
                       timeframe: z.string().optional(),
                     })),
  regimeNote:        z.string().max(80),
  reasoningSummary:  z.string().max(200).optional(),    // present iff thinking-mode used
  withholdMinutes:   z.number().int().min(0).max(60).optional(),
  freshnessLag:      z.number().int().min(0).optional(), // ms behind real-time
  cacheStats:        CacheLayerStats,                    // §7
});
```

**Failure modes:** timeout (`30 s` nitro / `120 s` exacto), JSON-parse
failure (retry once stricter), provider 5xx (retry once after 2 s).
On any failure → return `bias: 'neutral'` with synthetic thesis
`"<reason>"` and log.

`withholdMinutes > 0` ⇒ runtime sets `instance.withhold_until = now + N
min` (decision D, **instance-scoped**); skips ticks until expiry.

### 6.4 Stage 2 — Trader

**Input:**

```ts
const TraderInput = z.strictObject({
  analystOutput:        AnalystOutput,
  positionState:        OpenPosition.nullable(),
  riskBudgetRemaining:  z.strictObject({
                          dailyPct: z.number(),
                          overallPct: z.number(),
                        }),
  currentBar:           Bar,
  currentSpread:        z.number(),
  strategyParams:       StrategyParams,
  recentDecisions:      z.array(Decision).max(10),       // includes previous trader output (Q015)
  minutesToMarketClose: z.number().int(),                // decision L
  upcomingRestrictedEvents: z.array(CalendarItem).max(5),// next 2h
  indicators:           IndicatorPayload,                // §13.4
  scoringScore:         z.number().nullable(),           // computed by runtime
});
```

**Output:**

```ts
const TraderOutput = z.strictObject({
  action: z.enum(['BUY','SELL','HOLD','CLOSE','AMEND']),  // decision E
  size:   z.strictObject({ lots: z.number(), pctEquity: z.number() }).optional(),
  entry:  z.strictObject({
            type: z.enum(['market','limit']),
            price: z.number().optional(),
            expiresInBars: z.number().int().optional(),
          }).optional(),
  stopLoss:     z.number().optional(),
  takeProfit:   z.number().optional(),
  trailingStop: z.strictObject({
                  activateAtR: z.number(),
                  distanceDollars: z.number(),
                }).optional(),
  amend: z.strictObject({                                  // present iff action === 'AMEND'
           amendType: z.enum(['sl','tp','trailing_distance']),
           newValue:  z.number(),
         }).optional(),
  rationale:   z.string().max(200),
  expectedRR:  z.number().optional(),
  cacheStats:  CacheLayerStats,
});
```

**Internal sanity gates** (trader rejects → returns HOLD with reason):

| Condition | Behaviour |
|-----------|-----------|
| Analyst `bias: neutral` | Trader allowed to propose HOLD only |
| BUY/SELL with no SL | Internal reject → HOLD |
| SL beyond risk budget | Internal reject → HOLD |
| AMEND that loosens SL | Internal reject → HOLD (gateway also rejects, defence in depth) |
| Schema-validation failure | Retry once; second failure → HOLD |

### 6.5 Stage 3 — Judge

**Input** (typed only — no cached prefix per Q017):

```ts
const JudgeInput = z.strictObject({
  traderOutput:    TraderOutput,
  analystOutput:   AnalystOutput,
  riskBudgetRemaining: z.strictObject({ dailyPct: z.number(), overallPct: z.number() }),
  openExposure:    z.strictObject({ totalPct: z.number(), sameDirectionPct: z.number() }),
  recentDecisions: z.array(Decision).max(10),
  calendarLookahead: z.array(CalendarItem),
  spreadStats:     z.strictObject({ current: z.number(), typical: z.number() }),
  strategyParams:  StrategyParams,
});
```

**Output:**

```ts
const JudgeOutput = z.strictObject({
  verdict: z.enum(['APPROVE','REJECT']),
  reason:  z.string().max(200),
  rejectedRules: z.array(RejectionRule).optional(),
  cacheStats: CacheLayerStats,
});
```

**Standard rejection criteria** (priority order, first match short-circuits):

1. `rr_below_floor` — `expectedRR < strategyParams.risk.minRR` (default 1.5).
2. `size_above_soft_rail` — `size.pctEquity > strategyParams.risk.maxPerTradePct`.
3. `daily_budget_insufficient` — `riskBudgetRemaining.dailyPct < 1.5 × proposed risk`.
4. `calendar_event_proximity` — restricted event in next 5 min on this instrument.
5. `spread_above_threshold` — `current > typical × maxSpreadMultiplier`.
6. `open_exposure_at_cap` — `(open + proposed) > softCap`.
7. `recent_whipsaw` — ≥ 2 stop-outs in same direction in last 60 min.
8. `thesis_self_contradiction` — analyst neutral but trader proposes directional entry.
9. `stale_thesis` — analyst reasoning older than `staleThresholdMin`.

Persona-specific extensions in §13.

**Fail-closed default:** missing required input → REJECT. Calendar feed
unhealthy → REJECT all directional entries; AMEND/CLOSE allowed.

### 6.6 Stage 4 — Gateway (deterministic, no LLM)

The gateway:

1. Receives APPROVED proposal (carries SL, TP, optionally trailing-stop).
2. Re-checks **hard rails** (§9 — full list).
3. Tightens SL to envelope-defensive minimum if trader proposed looser.
4. Translates to `ProtoOANewOrderReq` with broker-side SL + TP set.
5. Submits with **client-generated ULID** as `clientOrderId`.
6. Awaits `ProtoOAExecutionEvent`; emits typed lifecycle events back.

Trailing-stop activation (decision BB): the gateway watches in-profit
excursion; once `currentR ≥ activateAtR`, issues
`ProtoOAAmendPositionSLTPReq` to set the trailing distance. Subsequent
amendments are **monotone** — never widen SL.

### 6.7 Stage 5 — Reflector (async)

Triggered by `position_closed` event + 30 s grace. **One call per
close** (decision B). Output appended to
`data/trade-memory/<account_id>.jsonl` and rolled into Layer 4 of the
cached prefix.

```ts
const ReflectorOutput = z.strictObject({
  lesson: z.string().max(400),
  outcomeCategory: z.enum([
    'thesis_correct_target_hit',
    'thesis_correct_stopped_early',
    'thesis_wrong_stopped_loss',
    'thesis_wrong_lucky_win',
    'noise',
  ]),
  contributingFactors: z.array(z.string()),
  suggestedParamReview: z.string().optional(),
  cacheStats: CacheLayerStats,
});
```

If `outcomeCategory ∈ {thesis_correct_stopped_early,
thesis_wrong_lucky_win}`, flag for manual review (P&L misleads).

The reflector is the **only stage allowed to fail without halting the
pipeline**. Trading continues; learning is delayed.

### 6.8 Concurrency policy (decision A)

Each instance has a **per-instance mutex**. If a tick fires while a
previous pipeline is still in flight, the new tick is **dropped**.
`metrics.tick_skipped_in_flight{instance_id}` increments.

### 6.9 Withhold semantics (decision D)

`withholdMinutes` from analyst → runtime sets
`instance.withhold_until = now + N`. The trader scheduler skips this
instance's ticks until the timestamp passes. Other instances on the
same envelope/account continue normally.

### 6.10 Cadence summary

| Concept | Default |
|---------|---------|
| Decision cadence | 5 min, uniform |
| Action cadence (XAUUSD) | **5-min bar close**, min hold 60 s |
| Action cadence (NAS100) | 5-min bar close, min hold 60 s |
| Reflector trigger | `position_closed` + 30 s |
| Layer-4 cache refresh | Hourly (wall-clock hour) |
| Layer-3 cache refresh | Daily (08:00 Europe/Prague) |

---

## 7. Prompt cache layering

```
Layer 1 [cache]   System + framework + persona prompts          ~5–10K tokens   days-stable
Layer 2 [cache]   Instrument structural context                  ~5–10K tokens   daily refresh
Layer 3 [cache]   Daily session context (calendar, macro)        ~5–10K tokens   daily refresh
Layer 4 [cache]   Rolling history (24h bars, last decisions,     ~30–60K tokens  hourly refresh
                  reflector lessons, indicator snapshots)
Layer 5 [no cache] Fresh suffix (current bars + question)        ~1–2K tokens   per call
```

### 7.1 Provider mechanics (verified 2026-04-27)

| Provider | Cache type | Read multiplier | Write multiplier | TTL |
|----------|-----------|-----------------|-------------------|-----|
| `moonshotai/kimi-k2.6` | Auto prefix | **~0.20×** | 1.0× (no surcharge) | best-effort minutes |
| `deepseek/deepseek-v4-flash` | Auto prefix | **~0.02×** | 1.0× (no surcharge) | best-effort up to ~1 h |
| `anthropic/claude-sonnet-4.6` | Explicit `cache_control` | 0.10× | 1.25× (5m) / 2.0× (1h) | 5m, 1h |

Implementer must abstract provider mechanics behind a unified
`assemblePrompt(layers: PromptLayers): ProviderRequest` adapter. The
Kimi/DeepSeek adapters emit prompts in layer order and let the provider
auto-cache; the Anthropic adapter (if used) sets explicit breakpoints
between L1↔L2, L2↔L3, L3↔L4, L4↔L5.

### 7.2 Cache key composition (decision V)

```
key = SHA-256(JSON.stringify({
  strategy_version,            // e.g. "v_ankit_classic"
  prompt_hash,                 // hash of strategy/<v>/{analyst,trader,judge,reflector}.md
  params_hash,                 // hash of strategy/<v>/params.yaml
  shared_hash,                 // hash of strategy/_shared/**
  stage_name,                  // "analyst" | "trader" | "judge" | "reflector"
  model,                       // OpenRouter slug
  variant,                     // "nitro" | "exacto"
}))
```

Any change to strategy files triggers a fresh write at next session
open. One extra write per mutation; acceptable.

### 7.3 Per-call cost telemetry

Each LLM call records:

```ts
{
  input_cached:     number,   // tokens served from cache
  input_fresh:      number,   // tokens billed at 1× input
  input_cache_write: number,  // Anthropic only
  output:           number,
  thinking:         number,   // when applicable
  usd_input_cached: number,
  usd_input_fresh:  number,
  usd_output:       number,
  usd_total:        number,
}
```

Aggregated by `account/envelope/instance/stage/model/hour/day`.

### 7.4 Cost expectation (2026-04-27 prices)

| Provider | Steady-state cost reduction vs uncached |
|----------|------------------------------------------|
| DeepSeek V4 Flash | ~30–40× (read = 0.02× input) |
| Kimi K2.6 | ~3–4× (read = 0.20× input) |
| Default blended (analyst Kimi + rest DeepSeek) | **~8–10× overall** |

Anchored steady-state per-tick cost:
- DeepSeek warm: ~$0.0006 / tick
- Kimi warm: ~$0.008 / tick (output dominates — keep responses short)

---

## 8. FTMO product, internal margins, daily-floor mechanics

### 8.1 Target product

| Field | Value |
|-------|-------|
| Product | **FTMO 2-Step Challenge — Standard** |
| Account currency | **USD** |
| Initial capital | $100,000 |
| Phase 1 profit target | **10%** ($10,000) |
| Phase 2 profit target | **5%** ($5,000) |
| Max daily loss | **5%** ($5,000), balance-anchored |
| Max overall loss | **10%** ($10,000), static |
| Min trading days | 4 per phase |
| Trading period | Unlimited |
| Refund | 100% on first profit split |
| Profit split (funded) | up to 90% |

### 8.2 Internal margins (tighter than FTMO)

| Rule | Internal | FTMO line | Reason |
|------|----------|-----------|--------|
| Daily loss | **4% ($4,000)** | 5% | Slippage, swap, news spike |
| Overall loss | **8% ($8,000)** | 10% | Cumulative drift, cross-midnight |
| News blackout | **±5 min, all phases** | ±2 min funded only | Clock skew, calendar lag |
| Pre-news kill-switch | **2 h** | 2 h | Same |
| Pre-news pre-flatten | **T-6 min** (decision M.2) | n/a | Eliminate SL-in-window risk |
| Min hold | **60 s** | "no HFT" | Avoid HFT classification |
| Profit-target buffer | **+1.0%** | exact | Don't rush phase advance |
| EA request rate | **1,800 / day / account** | 2,000 / day | Local rate limit |
| Force-flat lead time | **5 min** before market close | n/a | Liquidity buffer |

### 8.3 Daily-floor mechanics (read carefully)

```
day_start_balance      := balance at 00:00 Europe/Prague (or INITIAL_CAPITAL on day 1)
ftmo_daily_floor       := day_start_balance − 0.05 × INITIAL_CAPITAL
internal_daily_floor   := day_start_balance − 0.04 × INITIAL_CAPITAL
ftmo_overall_floor     := 0.90 × INITIAL_CAPITAL
internal_overall_floor := 0.92 × INITIAL_CAPITAL

check: equity (= balance + floating P&L ± swap − commission) < internal_daily_floor at any tick
       → halt envelope
check: equity < internal_overall_floor at any tick
       → halt envelope
```

The floor is **locked at midnight from balance**, not equity. The 5%
allowance is denominated in `INITIAL_CAPITAL`, not current balance. A
3% morning gain does **not** raise the floor.

### 8.4 Phase state machine

```
challenge_signed
    ↓
phase_1_active
    ├─ phase_1_target_hit         → auto-flatten (decision N) → operator confirms phase advance after FTMO ack
    │      ↓
    │   phase_2_active
    │      ├─ phase_2_target_hit   → auto-flatten → operator confirms
    │      │      ↓
    │      │   funded_active       → no target chase; payout consistency
    │      └─ phase_2_breached     → terminal
    └─ phase_1_breached            → terminal

Any phase can transition to: paused (operator) | halted (auto/operator).
```

**Auto-flatten trigger (decision N + U):**

```
WHEN closed_balance >= INITIAL_CAPITAL × (1 + target + buffer)
 AND min_trading_days_completed
 AND envelope state == running
THEN
  1. Pause new entries on the envelope.
  2. For each open position on the envelope: ProtoOAClosePositionReq.
  3. Wait for all positions flat.
  4. Set envelope state to "ready_for_phase_advance".
  5. Surface dashboard banner; emit alert.
  6. Operator confirms phase flip post-FTMO-ack via dashboard.
```

### 8.5 Phase-aware risk per trade (decision P)

Lives on the **envelope**:

```yaml
envelope:
  risk:
    per_trade_pct:
      phase_1: 0.5
      phase_2: 0.4
      funded:  0.4
```

Persona may declare `risk.maxPerTradePct` (cap); runtime uses
`min(envelope.per_trade_pct[current_phase], persona.maxPerTradePct)`.

---

## 9. Hard guardrails (gateway-side)

Checked **twice** — once by Judge (advisory), once by Gateway
(binding). A bug in trader/judge cannot bypass.

| # | Rail | Check |
|---|------|-------|
| 1 | **4% daily breaker** | envelope-wide equity vs locked-at-midnight floor |
| 2 | **8% overall breaker** | envelope-wide equity from initial balance |
| 3 | **±5-min news blackout (all phases)** | re-queries `services/news` per instrument |
| 4 | **2-h pre-news kill-switch** | no new entries within 2 h of tier-1 event on instrument |
| 5 | **60-s min hold** | vs previous trade on same symbol |
| 6 | **Spread guard** | per-symbol multiplier vs typical |
| 7 | **Slippage guard** | post-fill: close immediately if filled beyond `max(2 × typical_spread, 0.5 × ATR(14))` (decision X). **Fail-closed defence in depth** — three branches reject before the cap math: (a) non-NEW intent kind, (b) no fill report (`broker.fill === undefined`), (c) malformed fill report whose `filledPrice` / `intendedPrice` is missing or non-finite. All surface in the structured verdict log as `slippage_guard / reject` ([ANKA-40](/ANKA/issues/ANKA-40), [ANKA-58](/ANKA/issues/ANKA-58)) |
| 8 | **Symbol whitelist** | only enabled instruments per `accounts.yaml` |
| 9 | **Idempotency** | `clientOrderId` (ULID) not previously seen |
| 10 | **Phase-aware profit target** | auto-flatten at `closed_balance ≥ target+buffer` AND min-days complete (decision N + U) |
| 11 | **Defensive SL on every order** | if trader's SL is looser than envelope-floor permits, gateway tightens |
| 12 | **EA throttle** | 1,800/day per **account** token-bucket (decision O) |
| 13 | **Force-flat schedule** | per-instrument: market-close - 5 min, Friday close - 5 min, restricted-event - 6 min (decision L.1 + M.2) |
| 14 | **AMEND monotone-SL invariant** | reject any AMEND that loosens SL (decision E + BB) |

**Two-phase gateway evaluation (binding axis).** Gateway dispatches
rails in two phase-scoped passes: `evaluatePreSubmitRails` runs rails
1–6 and 8–14 before any `ProtoOANewOrderReq`; `evaluatePostFillRails`
runs **rail 7 only** after the broker reports a fill on the same
`clientOrderId`. Rail 9 records its ULID slot only on a non-`reject`
composite verdict from the pre-submit pass; the post-fill pass does
not consume idempotency or throttle tokens. See
`services/ctrader-gateway/src/hard-rails/evaluator.ts` header for the
dispatcher contract.

Force-flat schedule (rail 13) operates as:

```
on every tick:
  for each instrument:
    next_event = min(market_close, friday_close, next_restricted_event)
    if (now + lead_min) >= next_event:
      for each open position on instrument:
        if not already in flatten queue:
          enqueue ProtoOAClosePositionReq
```

`force_flat_lead_min` is **mandatory** in the `accounts.yaml` schema —
no symbol may omit it; default 5 min for market close, 6 min for
restricted events.

---

## 10. cTrader broker integration

### 10.1 Transport (decision W)

- **Both demo and live**: `wss://demo.ctraderapi.com:5035/` /
  `wss://live.ctraderapi.com:5035/`. Protobuf-over-WSS.
- Heartbeat: send `ProtoHeartbeatEvent` every 10 s; treat 30 s of
  silence as dead.
- Auto-reconnect with exponential backoff (1 s → 30 s cap, ±20% jitter).

### 10.2 Authentication

- OAuth 2.0 (`authorization_code` + `client_credentials`).
- Two-phase: `ProtoOAApplicationAuthReq` → `ProtoOAAccountAuthReq` per
  `ctidTraderAccountId`.
- Refresh token persisted **encrypted** on disk under
  `data/secrets/<account_id>/refresh_token.enc`.

### 10.3 Adapter strategy (ADR-012)

1. **Smoke-test `ctrader-ts@1.0.1`** on the FTMO Free Trial account via
   the 7-step gate (auth, accounts, symbols, spot, place+close,
   reconnect, protobuf coverage).
2. If any step fails, build the in-house client on `protobufjs@8.0.1` +
   Spotware's `openapi-proto-messages` (vendored at pinned commit).

Either way, **vendor the chosen dependency tree** under
`packages/ctrader-vendor/`. Single-maintainer supply-chain risk
mitigated.

### 10.4 Broker-side primitives (first-class, ADR-014 + decision BB)

Every order carries:
- `stopLoss` (mandatory; gateway tightens if needed).
- `takeProfit` (when trader specifies).
- Trailing-stop is **gateway-managed**: order placed with fixed SL;
  once `currentR ≥ activateAtR`, gateway issues
  `ProtoOAAmendPositionSLTPReq` to set the trailing distance.
  Subsequent amendments are **monotone** — never widen.
- `clientOrderId = ULID`.

### 10.4a Post-fill remediation flow

When the post-fill rail pass (§9 two-phase evaluation) returns a
`slippage_guard / reject` verdict, the gateway must translate that
verdict into a `ProtoOAClosePositionReq` for the just-filled position
on the same `clientOrderId`. The translation contract:

- The `reject` verdict is the trigger; no operator action is
  required. A post-fill `allow` verdict is a no-op.
- Rail 7
  (`services/ctrader-gateway/src/hard-rails/rail-7-slippage-guard.ts`)
  produces the verdict; the close-emitter path consumes it. Rail 7
  itself never emits a broker request — it only computes the
  outcome.
- All rail-7 reject branches map to the same close request: cap
  exceeded (decision X), non-NEW intent kind, missing fill report
  (`broker.fill === undefined`), and malformed fill report (non-finite
  `filledPrice` / `intendedPrice`, [ANKA-58](/ANKA/issues/ANKA-58)).
  The close-emitter does not branch on the rail-7 reason; the
  structured verdict log preserves the reason for audit.
- The close request reuses the same close-emitter pipeline used by
  rail 13 force-flat (§9 + `services/ctrader-gateway/src/hard-rails/force-flat-scheduler.ts`),
  so a position cannot be enqueued for close twice and an in-flight
  close de-dupes naturally.
- Rail 7 does **not** consume rail-9 idempotency or rail-12 throttle
  tokens — the post-fill pass is dispatcher-isolated from the
  pre-submit pass (see §9 two-phase evaluation note). The
  remediation close therefore cannot be blocked by the daily EA cap.

### 10.5 Reconciliation

On connect: query open positions and pending orders from the broker;
diff against local DB. **Broker wins on conflict.** Emit
`reconcile.{position_added, position_removed, sl_diff, tp_diff}` events
to the trader, which decides whether to halt or adopt.

### 10.6 Rate limits

| Limit | Value |
|-------|-------|
| cTrader general | ~50 req/sec/connection (gateway throttles to ~5 to be safe) |
| cTrader historical bars | ~5 req/sec |
| FTMO EA cap | 2,000 / day / account |
| Local cap (token bucket) | **1,800 / day / account** |

Typical load (5-min cadence × 2 instances) = ~60 req/day per account.

---

## 11. News calendar

### 11.1 Source (ADR-011)

```
GET https://gw2.ftmo.com/public-api/v1/economic-calendar
    ?dateFrom=YYYY-MM-DDTHH:MM:SS+TZ
    &dateTo=YYYY-MM-DDTHH:MM:SS+TZ
    &timezone=Europe%2FPrague
```

No auth. Returns `application/json`. **No browser. No LLM. No HTML
scraping.**

### 11.2 Schema (Zod)

```ts
const CalendarItem = z.strictObject({
  title:       z.string(),
  impact:      z.enum(['low','medium','high','holiday']),
  instrument:  z.string(),                      // single ticker or " + "-joined tags
  restriction: z.boolean(),
  eventType:   z.string(),                      // observed only "normal"; log unknowns
  date:        z.string(),                      // ISO 8601 with offset
  forecast:    z.string().nullable(),
  previous:    z.string().nullable(),
  actual:      z.string().nullable(),
  youtubeLink: z.string().nullable(),
  articleLink: z.string().nullable(),
});
const CalendarResponse = z.strictObject({ items: z.array(CalendarItem) });
```

### 11.3 Fetch & store

A `news-calendar-fetcher` runs **inside** `services/news/`:

1. Every **30 min**, GET the next **14-day** window in `Europe/Prague`.
2. Validate with Zod; surface unknown values via metrics.
3. Parse `instrument` — `split(' + ')` and trim — into tag array.
4. Map tags via `services/news/symbol-tag-map.yaml` to tracked
   instruments (XAUUSD, NAS100).
5. Upsert into `data/calendar.db` keyed by `hash(date, title, instrument)`.

### 11.4 Endpoints (Elysia, typed)

```ts
GET /health                                     → HealthSnapshot
GET /calendar/window?from&to&instruments[]      → CalendarItem[]
GET /calendar/restricted?at&instruments[]       → RestrictedReply
GET /calendar/pre-news-2h?at&instruments[]      → RestrictedReply
GET /calendar/next-restricted?at&instrument     → { item: CalendarItem | null, eta_seconds: number }

// `RestrictedReply` is the canonical machine-consumable shape used by
// gateway rails 7 and 13: `{ restricted: bool, reasons: { event, eta_seconds }[] }`.
// Schema is defined in `pkg:contracts/news` and pinned in §19.2.
```

### 11.5 Two distinct rules — both enforced

1. **±5-min internal blackout** (decision M.1, all phases).
   `/calendar/restricted` returns `true` when `now ∈ [event - 5m, event + 5m]`
   and the event's `restriction === true` and the instrument matches.
2. **2-h pre-news kill-switch.** `/calendar/pre-news-2h` returns `true`
   when `now ∈ [event - 2h, event]` and the event is **tier-1** (decision Y:
   `impact === 'high' OR restriction === true`).

### 11.6 Pre-flatten scheduler (decision M.2)

Inside the **gateway** (rail 13):

```
on every tick (or every 1s timer):
  for each instrument with open positions:
    next_restricted = next event where (restriction == true && instrument matches)
    if next_restricted exists AND (next_restricted.date - now) <= pre_news_flatten_lead_min:
      for each open position on instrument:
        if not already enqueued:
          enqueue ProtoOAClosePositionReq with reason="pre_news_flatten"
```

`pre_news_flatten_lead_min: 6` (default). Mandatory schema field per
envelope; no instrument may omit it.

### 11.7 Health & freshness

- `last_successful_fetch_at` exposed in `/health`.
- If older than **2 h** → gateway forces blackout
  (`/calendar/restricted` always returns `true`).

### 11.8 Failure modes

| Condition | Behaviour |
|-----------|-----------|
| 5xx | Backoff up to 3×; if persistent, mark unhealthy |
| Non-JSON / 4xx | Mark unhealthy + alert (contract change) |
| Schema mismatch | Mark unhealthy + alert |
| Empty `items` on populated window | Mark unhealthy + alert |
| Local DB unwriteable | News refuses to start; supervisor surfaces |
| 2 h since last fetch | Gateway forces blackout |

---

## 12. Operator controls

### 12.1 Three states

| State | New entries | Position mgmt (AMEND/CLOSE) | Reflector | Hard rails | Force-close |
|-------|-------------|-----------------------------|-----------|------------|-------------|
| `running` | yes | yes | yes | yes | yes |
| `paused` | no | yes | yes | yes | yes |
| `halted` | no | yes (gateway-only) | no | yes | yes |

### 12.2 Scope

`system / account / envelope / instance`. Pause/halt cascades downward;
running on a child is overridden by halted/paused on a parent.

### 12.3 Auto-pause triggers

| Condition | Scope |
|-----------|-------|
| Cost ceiling reached | Envelope |
| `closed_balance ≥ target + buffer` (decision N) | Envelope (then auto-flatten) |
| Daily breaker approached (within 0.5 pp) | Envelope |
| Calendar feed unhealthy | All affected instances |
| LLM provider 5xx for > 10 consecutive ticks | Affected instance(s) |

### 12.4 Auto-halt triggers

| Condition | Scope |
|-----------|-------|
| Daily breaker breached (4%) | Envelope |
| Overall breaker breached (8%) | Envelope |
| `phase_*_breached` | Account |
| DB unreachable in prod | All accounts |
| Reconciliation fails | All accounts |

### 12.5 Force-close & kill switch

- **Force-close** (per position): `POST /gateway/positions/<id>/force-close`. Always allowed.
- **Kill switch** (top-bar): "Halt all (keep positions)" or "Halt all + flatten everything". Both require typing `HALT`. Flatten-everything walks **accounts sequentially** for reconciliation safety.

### 12.6 Audit

Every operator action logged to `data/audit-log/<account_id>.jsonl`
with operator id, timestamp, action, scope, reason text.

---

## 13. Strategy personas

### 13.1 Registry

| Version | Instrument | Cadence | Status |
|---------|------------|---------|--------|
| `v_ankit_classic` | XAUUSD | 5-min | **active** |
| `v_session_break` | NAS100 | 5-min | **active** |
| `v_macro_trend` | XAUUSD | 15-min decisions, 4h bias | drafted |
| `v_mean_reversion` | NAS100, XAUUSD | 5–15 min | placeholder |
| `v_news_driven` | NAS100, XAUUSD | event | placeholder |
| `v_volatility_breakout` | NAS100 | 5-min | placeholder |
| `v_carry_macro` | FX (future) | 4h–daily | placeholder |
| `v_correlation_pairs` | NAS100 + XAUUSD | 15-min | placeholder |

(`v_floor_trail` is **not a persona** — see 13.6.)

### 13.2 `v_ankit_classic` (XAUUSD)

Active windows (all `Europe/Prague`, decision S):

```yaml
windowPrague:
  macroSynthesis:    "08:00"
  preSessionStart:   "13:00"
  preSessionEnd:     "14:30"
  activeStart:       "14:00"
  activeEnd:         "21:30"        # SOFT — judge rejects entries; force-flat is at market-close
```

Three families, regime-gated:

- **Family A — Session breakout** (14:25–15:30 Prague): break of
  pre-session range with confirmation; stop at midpoint; target ≥ 1.5R.
- **Family B — Multi-timeframe confluence** (15:30–21:30): scoring per §13.4.
- **Family C — Macro filter** (always-on gate): refreshed 08:00 daily;
  produces `{long, short, neutral}` with confidence; enforce when
  `confidence ≥ 0.6`; 4-h cooldown after flip.

Persona-specific judge rejections (in addition to the standard 9):

- `macro_bias_violation`
- `confluence_too_weak` (uses §13.4 scoring)
- `anticipation_breakout`
- `stop_inside_noise` (stop closer than 1× ATR(14))
- `pattern_regime_mismatch`
- `outside_active_window`

### 13.3 `v_session_break` (NAS100)

Single pattern, single window:

```yaml
preSessionWindowPrague:
  start: "13:00"
  end:   "14:30"
activeWindowPrague:
  start: "14:30"
  end:   "17:00"
  forcedFlat: "21:30"               # SOFT — gateway hard-rail handles real flat
entry:
  breakoutBufferPips: 8
  confirmationBars: 1
  rejectFadeWithinBars: 2
risk:
  maxPerTradePct: 0.5               # cap; envelope wins via min()
  rrTarget: 1.8
  stopAtRangeMidpoint: true
filters:
  maxSpreadMultiplier: 1.5
  minPreSessionRangePips: 30
  maxPreSessionRangePips: 200
```

Standard 9 rejections only — no persona extensions (intentional simplicity).

### 13.4 Indicator + scoring contract (decision Q)

Persona declares its own indicator pipeline and scoring scheme. The
runtime computes indicators deterministically; the score is
deterministic; the LLM sees the values and the score, doesn't
recompute.

```yaml
# strategy/v_ankit_classic/params.yaml
indicators:
  timeframes: [1d, 4h, 1h, 5m]
  enabled:
    - name: ma
      params: { periods: [20, 50] }
    - name: macd
      params: { fast: 12, slow: 26, signal: 9 }
    - name: rsi
      params: { period: 14 }
    - name: stochastic
      params: { k_period: 14, d_period: 3 }
    - name: atr
      params: { period: 14 }

scoring:
  scheme: v1_continuous_confluence            # default for v_ankit_classic
  threshold: 50
  weights:
    timeframeAgreement: 0.7
    indicatorAlignment: 0.3
  timeframeWeights: { "1d": 4, "4h": 3, "1h": 2, "5m": 1 }
```

Two schemes ship at v1:

- **`v1_continuous_confluence`**: 0–100 score combining timeframe
  directional agreement (weighted) + per-timeframe indicator alignment
  (`MACD hist > 0 AND RSI > 50 AND Stoch K > 50` for long; mirror for
  short). Adopted from V1 codebase. **Default for `v_ankit_classic`.**
- **`v2_discrete_buckets`**: explicit bucket list with `minScore`
  threshold. Useful for personas that want a simpler categorical gate.

```yaml
# alternative scheme example
scoring:
  scheme: v2_discrete_buckets
  buckets:
    - { name: ma_structure, weight: 1, predicate: "price > MA20 AND price > MA50" }
    - { name: macd_agree,   weight: 1, predicate: "macd.histogram > 0" }
    - { name: rsi_in_zone,  weight: 1, predicate: "rsi > 50 AND rsi < 75" }
    - { name: stoch_agree,  weight: 1, predicate: "stoch.k > stoch.d AND stoch.k < 80" }
  minScore: 3
```

**Scoring is mutable by autoresearch.** A mutation may switch scheme
(`v1` ↔ `v2`), adjust weights/thresholds, or add new indicators per
the registered indicator catalogue.

### 13.5 Behavioural anchors (verification matrix — see §24)

| Setup | Persona | Expected |
|-------|---------|----------|
| Clean pre-session range + decisive 14:30 break (NAS100) | `v_session_break` | BUY/SELL |
| Clean pre-session range + decisive 14:30 break (XAUUSD) | `v_ankit_classic` | `A_session_break` |
| 1h bullish trend + 5-min retrace to MA20 (XAUUSD) | `v_ankit_classic` | `B_trend_retrace`, BUY |
| 1h consolidation + sustained break (XAUUSD) | `v_ankit_classic` | `B_consolidation_break` |
| 1h RSI > 80 + bearish divergence + bearish engulfing (5m) | `v_ankit_classic` | `B_reversal`, SELL |
| Macro bias `short@0.8` + 5-min trend retrace long (XAUUSD) | `v_ankit_classic` | judge: `macro_bias_violation` |
| FOMC ±5 min (any) | both | judge: `calendar_event_proximity` |
| FOMC scheduled in 6 min (any) | both | gateway force-close + reject new |

### 13.6 `v_floor_trail` — behaviour mode (decision R)

Wired via params on **any** persona:

```yaml
trail:
  enabled: true
  mode: ratchet
  stepDollars: 2.0
  maxTrailPct: 0.05
  activateAtR: 0.5
  monotoneEnforced: true     # gateway invariant — reject loosening AMENDs
```

Implementation: gateway watches in-profit excursion; when
`currentPrice − floor ≥ maxTrailPct × currentPrice + stepDollars`,
amend the broker-side SL upward to `currentPrice × (1 − maxTrailPct)`.

### 13.7 Idea backlog (from V1 trading-lab.md, decision CC)

Captured here so we don't forget. None are committed to v1; each is a
candidate for autoresearch promotion or a future persona.

| Idea | Sketch |
|------|--------|
| **Partial profit taking** | Close 50% at 1× R, remainder rides with trailing stop |
| **Higher-frequency variant** | 3-min decision cadence; needs cost+spread validation |
| **Double-down on high confidence** | Allow 2 same-direction positions at conf > 0.75; relax anti-straddle in same-direction-only |
| **News-driven entry timing** | Post-event momentum after blackout — graduates `v_news_driven` |
| **Spike-watcher agent** | Background price-anomaly detector → ad-hoc LLM call → judge gate |
| **Sector-correlation awareness** | Reduce exposure when NAS100/XAUUSD/SPX move together |
| **Earlier profit taking vs trail comparison** | A/B trailing stops vs fixed TP |

---

## 14. Eval harness (library)

Path: `packages/eval-harness/`. **Library, not a process.** Consumed
by `services/trader` and `services/autoresearch`.

### 14.1 Three entry points

```ts
backtest(strategyVersion, instrument, dateRange, opts?): EvalResult
paperReplay(strategyVersion, decisionLog): EvalResult
liveScore(account, sinceTimestamp): EvalResult
```

### 14.2 EvalResult contract

```ts
const EvalResult = z.strictObject({
  metrics: z.strictObject({
    sortinoRolling60d: z.number(),
    maxDrawdownPct:    z.number(),
    profitFactor:      z.number(),
    tradeCount:        z.number().int(),
    winRate:           z.number(),
    averageRR:         z.number(),
  }),
  ftmoBreaches: z.array(FtmoBreach),    // any breach kills the candidate
  costBreakdown: z.strictObject({
    perStage: z.record(StageName, z.strictObject({
      input: z.number(), output: z.number(), cached: z.number(),
    })),
    totalUsd: z.number(),
  }),
  diagnostics: z.record(z.string(), z.unknown()),
  walkForward: z.object({                // when 12-fold rolling is run
    folds: z.array(FoldResult).length(12),
    passingFolds: z.number().int(),
  }).optional(),
});
```

### 14.3 FTMO rule simulator

`packages/eval-harness/src/ftmo-rules.ts` is the canonical offline
semantics source. Breach types:

```ts
type FtmoBreachKind =
  | 'daily_loss' | 'overall_loss' | 'min_hold'
  | 'news_blackout_hold' | 'news_blackout_open' | 'news_blackout_close'
  | 'news_sl_tp_in_window' | 'weekend_hold' | 'hft_classification'
  | 'ea_throttle_exceeded' | 'consistency_violation';
```

The simulator enforces both the FTMO line and internal margins. A
breach of internal-only is reported as `internal_blackout` style and
fails the autoresearch gate the same as a real FTMO breach.

**Authority order:**
1. Gateway wins at runtime (real money).
2. Simulator is canonical for offline eval.
3. FTMO docs are regulatory truth; simulator is corrected to match.
4. On disagreement, gateway wins; simulator is updated to match.

### 14.4 Promotion gates (mechanical)

```ts
promote = (
  ftmoBreaches.length === 0 &&
  metrics.sortinoRolling60d >= baseline * 1.05 &&    // ≥5% relative
  metrics.tradeCount >= 40 &&
  metrics.maxDrawdownPct <= baseline_dd &&
  passingFolds >= 8                                  // 12-fold (decision H)
)
```

### 14.5 Bar data infra (decision F + G)

- `packages/eval-harness/data/bars.db` — separate SQLite, **not the
  trader's decision DB**.
- Schema: `(symbol, timeframe, ts_start, open, high, low, close,
  volume)`, primary key `(symbol, timeframe, ts_start)`.
- Fetch on miss from cTrader Open API historical
  (`ProtoOAGetTrendbarsReq`); store; serve future reads from cache.
- Daily refresh job adds yesterday's bars at 02:00 Prague.

### 14.6 Bar-granularity simulator (decision G — documented downsides)

**v1 simulator runs at bar granularity** (no tick replay). Trade-offs:

- **Pro:** ~10× faster eval; ~10× cheaper LLM cost in backtest.
- **Pro:** Aligns with action cadence (we don't trade sub-bar).
- **Con:** Min-hold breaches (sub-60s holds) are inferable but not
  perfectly modelled if bars don't span the close.
- **Con:** News-blackout SL/TP-in-window detection uses bar OHLC
  approximation: if a bar overlaps the ±5-min window AND crosses the
  SL/TP price, treat as `news_sl_tp_in_window` breach.
- **Con:** Slippage/spread spikes during news are approximated; may
  understate worst-case loss.

**Spread/slippage model** (configurable):

```ts
type SimSlippageModel = {
  baseSpreadPipsBySymbol: Record<symbol, number>;   // calibrated against FTMO Free Trial + paid-challenge live data
  newsSpreadMultiplier: number;                     // default 5.0 inside ±5min of high-impact
  fillLatencyMs: number;                            // FTMO simulates "up to 200 ms"
  worstCaseSlippagePips: number;                    // default 3
};
```

**Mitigation policy:** revisit tick-replay after 30 days of live data
if eval-vs-live disagrees on Sortino by > 20%.

### 14.7 Walk-forward (decision H)

12-fold rolling: 6-month train window slid by 1 month / 1-month score
window. Each fold yields its own `EvalResult`. Passing fold = all four
gate criteria met. Promotion requires `passingFolds ≥ 8`.

### 14.8 Cost ceilings

- Backtest cost ceiling: **USD 50 / run** suggest-only, **USD 200 /
  run** prod (Q027/Q030).
- Per-mutation autoresearch ceiling: **USD 50** (Q030).

### 14.9 Test corpus

Ship a **golden fixture suite** at `packages/eval-harness/fixtures/`:

- 3 known-bad strategies (force daily-loss breach, force news-window
  hit, force min-hold breach) — must trip the simulator.
- 1 known-flat strategy (HOLD always) — must yield zero trades, zero
  breaches.
- 1 known-trivial strategy (BUY at fixed time daily, exit at next
  bar) — must yield deterministic metrics.

These fixtures are CI-gated; any change to the simulator that breaks
them requires a fresh ADR.

---

## 15. Autoresearch loop

### 15.1 Editable surface

```
strategy/
├── v_ankit_classic/
│   ├── analyst.md
│   ├── trader.md
│   ├── judge.md
│   ├── reflector.md
│   └── params.yaml
├── v_session_break/   ...
└── _shared/           # FROZEN w.r.t. autoresearch (decision Z)
```

**Frozen** w.r.t. autoresearch (per decision Z):
- Everything outside `strategy/v_*/`.
- `strategy/_shared/` (human-edited only).
- All `*.spec.ts` files.
- Gateway, runtime, eval harness, supervisor, tests.

### 15.2 Loop (nightly cron)

```
autoresearch tick (cron 03:00 Europe/Prague):
  1. Read recent paper + live trade logs (30 days).
  2. Read autoresearch.{md,jsonl,checks.sh,ideas.md} for the persona.
  3. Mutation generator (Kimi K2.6 exacto, decision J) proposes ONE mutation
     to a strategy/v_*/... file. Diff ≤ 30 lines OR ≤ 5 param values (Q031).
  4. autoresearch.checks.sh runs (lint, typecheck, schema validate).
  5. eval-harness.backtest() over 6-month window.
  6. If pass, eval-harness.paperReplay() over last 30 days.
  7. If pass, eval-harness.liveScore() over last 30 days.
  8. Walk-forward 12-fold over 12-month window.
  9. If passingFolds ≥ 8 AND breaches == 0 AND Sortino ≥ baseline × 1.05:
       write to proposals/<date>-<mutation-id> branch.
  10. First month: suggest-only (human merges). After: auto-merge if Δ ≥ 2× threshold.
  11. Append result to .dev/autoresearch/<persona>/autoresearch.jsonl.
```

### 15.3 Promotion ladder (post-merge)

```
proposals branch
  → 5-day FTMO Free Trial paper window
  → human-promote (mandatory in suggest-only month)
  → 14-day live burn-in @ 5% capital
  → human-promote
  → full deployment
```

### 15.4 Acceptance threshold (decision I)

Start at **30%** of proposals accepted (ATLAS prior). If signal is
sparse (< 3 acceptances in 30 days), drop to **20%**. Re-evaluate after
60 days.

### 15.5 Pre-conditions (Q032)

Autoresearch is **Phase 7**. Cannot start before:
- ≥ 30 days of paper-live data on `v_ankit_classic`.
- ≥ 40 trades on `v_ankit_classic`.

### 15.6 Cross-persona protection

Mutations in one persona never cross-apply to another. Promoted
mutations may write **proposal notes** for cross-pollination, but each
persona requires its own independent eval pass.

---

## 16. Dashboard

Read-mostly cockpit + operator-control surface. Tech: Bun bundler +
React 19 + Tailwind v4. Static assets served by `Bun.serve()`; live
data via SSE from `trader` and `ctrader-gateway`.

### 16.0 Version matrix (top-of-page)

A persistent banner shows every running service's version side-by-side,
read from each service's `/health.version` (which is loaded from
`package.json` at runtime per §19.0). Mismatches across services are
highlighted in yellow; a service whose version is older than the
current `git rev-parse HEAD`'s `package.json` is highlighted in red.

```
┌──────────────────────────────────────────────────────────────────┐
│ supervisor 0.3.1 │ gateway 0.3.1 │ trader 0.3.1 │ news 0.2.4 │  │
│ dashboard 0.3.0 ⚠ stale (HEAD = 0.3.1)                           │
└──────────────────────────────────────────────────────────────────┘
```

This view exists because past incidents have been caused by stale
processes running pre-fix code unnoticed. The banner makes "is the new
build live?" a one-glance question.

### 16.1 Live views

**Tree (system → account → envelope → instance):**

```
System: [running | paused | halted]
└── Account ftmo-2step-100k-1: [state]   USD 102,340 / target 110,000
    └── Envelope ftmo-2step-#1: [state]  day P&L +$340 / floor -$3,660
        ├── Instance xauusd-ankit-classic: [state]
        │   ├── last decision: 14:32 → HOLD (no Family-A trigger)
        │   ├── open positions: 0
        │   └── cost today: $1.42 / $7.50 ceiling-share
        └── Instance nas100-session-break: [state]
            ├── last decision: 14:30 → BUY (pre-session break + 1.8R target)
            ├── open positions: 1 (long, +0.4R, SL @ 18,442)
            └── cost today: $0.83 / $7.50 ceiling-share
```

### 16.2 Per-account views

- Live equity curve (SSE) with daily floor + overall floor overlaid.
- Phase progression bar (% of profit target, closed balance).
- Days-traded counter; min-days status.
- Account-wide cost line.
- Hard-rail check counts (rejections by rule).
- EA-throttle remaining (per-account, decision O).

### 16.3 Per-envelope views

- Daily P&L vs floor.
- Open-exposure breakdown by instance.
- `risk_share_pct` allocation.
- Cost ceiling consumption (per-instance share = `risk_share_pct`).

### 16.4 Per-instance views

- Decision feed with reasoning expansion (analyst thesis + trader
  rationale + judge verdict).
- Per-stage cost per tick.
- Cache hit/miss rate.
- Open position(s) with broker-side SL/TP/trail visible.

### 16.5 Phase-advance UI (decision N)

When envelope state = `ready_for_phase_advance`:
- Banner (yellow, prominent).
- "Confirm phase advance after FTMO acknowledges" button.
- Operator clicks → state transitions to next phase; risk knobs swap.

### 16.6 Kill switch

Top-bar red button. Two options:
- "Halt all (keep positions)".
- "Halt all + flatten everything" — sequential per account.

Both require typing `HALT` to confirm.

### 16.7 Audit log viewer

`data/audit-log/<account_id>.jsonl` rendered with operator id,
timestamp, action, reason.

### 16.8 Autoresearch experiment viewer

`.dev/autoresearch/<persona>/autoresearch.jsonl` rendered as a sortable
table; each row links to the diff and the EvalResult JSON.

---

## 17. Repository layout

```
ankit-prop-umbrella/
├── AGENTS.md                         # operating contract for agents
├── BLUEPRINT.md                      # this file (synced from design-docs/)
├── README.md
├── CHANGELOG.md
├── TODOS.md
├── package.json                      # bun workspaces root
├── biome.json                        # Biome 2.4+ config
├── tsconfig.json                     # TS 6 strict
├── bunfig.toml                       # Bun config
├── .env.example
├── .gitignore
├── .dev/
│   ├── decisions.md                  # ADRs
│   ├── specs/                        # contract-level specs
│   ├── designs/                      # cross-cutting designs
│   ├── discussion/                   # extended back-and-forth
│   ├── autoresearch/<persona>/       # autoresearch state files
│   ├── progress.md
│   └── journal.md
├── packages/
│   ├── proc-supervisor/              # @triplon/proc-supervisor
│   ├── eval-harness/                 # @ankit-prop/eval-harness  (LIBRARY)
│   ├── ctrader-vendor/               # vendored ctrader-ts or in-house
│   └── shared-contracts/             # @ankit-prop/contracts (Zod schemas)
├── services/
│   ├── ctrader-gateway/              # broker socket + hard rails
│   ├── trader/                       # modular monolith with N account loops
│   │   └── strategy/                 # editable Layer 2
│   │       ├── v_ankit_classic/
│   │       ├── v_session_break/
│   │       └── _shared/              # frozen w.r.t. autoresearch
│   ├── news/                         # FTMO calendar fetcher + endpoints
│   ├── autoresearch/                 # scheduled mutation/eval loop
│   └── dashboard/                    # React + Tailwind cockpit
├── config/
│   ├── accounts.example.yaml
│   ├── supervisor.example.yaml
│   ├── recovery.example.yaml
│   └── symbol-tag-map.example.yaml
└── data/                             # gitignored runtime state
    ├── trader.db                     # decisions, trades, orders, executions, costs
    ├── audit-log/<account_id>.jsonl
    ├── trade-memory/<account_id>.jsonl
    ├── calendar.db
    ├── bars.db                       # eval-harness historical bars cache
    ├── secrets/<account_id>/refresh_token.enc
    └── state/control-state.json
```

### 17.1 `accounts.config.yaml` (per decision O, P, K)

```yaml
accounts:
  - id: ftmo-2step-100k-1
    enabled: true
    broker:
      provider: ftmo-2step
      ctrader_account_id_env: BROKER_ACCT_FTMO_1
      credentials_env: BROKER_CREDS_FTMO_1
    currency: USD
    initial_balance: 100000
    request_throttle:               # decision O — moved here from envelope
      per_account_per_day: 1800

    envelopes:
      - id: ftmo-2step-#1
        enabled: true
        risk:
          daily_breaker_pct: 4.0
          overall_breaker_pct: 8.0
          profit_target_pct:
            phase_1: 10.0
            phase_2: 5.0
          profit_target_buffer_pct: 1.0
          per_trade_pct:            # decision P — phase-aware on envelope
            phase_1: 0.5
            phase_2: 0.4
            funded:  0.4
          min_trading_days: 4
          max_open_positions: 4
          max_same_direction_exposure_pct: 4.0
          slippage_tolerance:       # decision X
            mode: max_of
            multipliers: { typical_spread: 2.0, atr14: 0.5 }

        cost_ceiling:
          daily_usd: 15.00
          alert_at_pct_of_ceiling: 80
          # per-instance share computed as risk_share_pct (decision K)

        force_flat:                  # decision L.1 — mandatory
          market_close_lead_min: 5
          friday_close_lead_min: 5
          pre_news_flatten_lead_min: 6

        instances:
          - id: xauusd-ankit-classic
            enabled: true
            instrument: XAUUSD
            bar_timeframe: 5m
            decision_cadence: 5m
            action_cadence: bar_close      # decision C
            min_hold_seconds: 60
            strategy_version: v_ankit_classic
            risk_share_pct: 50              # decision K — drives cost share too
            pipeline:
              analyst:    { model: moonshotai/kimi-k2.6,       variant: exacto, thinking: true }
              trader:     { model: deepseek/deepseek-v4-flash, variant: exacto, thinking: true }
              judge:      { model: deepseek/deepseek-v4-flash, variant: nitro,  thinking: false }
              reflector:  { model: deepseek/deepseek-v4-flash, variant: nitro,  thinking: false }

          - id: nas100-session-break
            enabled: true
            instrument: NAS100
            bar_timeframe: 5m
            decision_cadence: 5m
            action_cadence: bar_close
            min_hold_seconds: 60
            strategy_version: v_session_break
            risk_share_pct: 50
            pipeline: { ...same default lineup... }
```

### 17.2 `supervisor.config.yaml`

```yaml
mode: dev                        # dev | prod
port: 9100
services:
  - name: news
    cmd: bun run --cwd services/news start
    onExisting: refuse
    health: { url: http://localhost:9203/health, timeoutMs: 30000, runningPollIntervalMs: 5000 }
    restart: { policy: on-failure, maxCrashes: 3, windowMs: 300000 }
    shutdown: { timeoutMs: 10000 }

  - name: ctrader-gateway
    cmd: bun run --cwd services/ctrader-gateway start
    health: { url: http://localhost:9201/health, timeoutMs: 30000 }
    restart: { policy: on-failure, maxCrashes: 3, windowMs: 300000 }

  - name: trader
    cmd: bun run --cwd services/trader start
    dependsOn: [ctrader-gateway, news]
    health: { url: http://localhost:9202/health, timeoutMs: 60000 }
    shutdown: { timeoutMs: 30000 }   # trader flatten before exit

  - name: dashboard
    cmd: bun run --cwd services/dashboard start
    health: { url: http://localhost:9204/health }

recovery:
  on_orphan_position:
    dev: auto_adopt
    prod: manual_approve         # decision AA
  on_missing_position:
    dev: auto_close_local
    prod: halt_and_alert
  on_db_unreachable:
    dev: in_memory_fallback
    prod: halt
```

### 17.3 `symbol-tag-map.config.yaml`

```yaml
mappings:
  USD:                              { affects: [NAS100, XAUUSD] }
  "USD + US Indices + XAUUSD + DXY": { affects: [NAS100, XAUUSD] }
  "US Indices":                     { affects: [NAS100] }
  NAS100:                           { affects: [NAS100] }
  Gold:                             { affects: [XAUUSD] }
  XAUUSD:                           { affects: [XAUUSD] }
  EUR:                              { affects: [] }
  GBP:                              { affects: [] }
  CAD:                              { affects: [] }
  AUD:                              { affects: [] }
  NZD:                              { affects: [] }
  CHF:                              { affects: [] }
  "Crude Oil":                      { affects: [] }
```

### 17.4 `recovery.config.yaml` — schema only

```ts
const RecoveryCfg = z.strictObject({
  on_orphan_position:   z.enum(['auto_adopt','manual_approve','halt']),
  on_missing_position:  z.enum(['auto_close_local','halt_and_alert','adopt_broker_truth']),
  on_db_unreachable:    z.enum(['in_memory_fallback','halt']),
  on_calendar_stale:    z.enum(['blackout','halt']),
});
```

### 17.5 Env vars (`.env.example`)

```
# OpenRouter
OPENROUTER_API_KEY=

# Broker (per account)
BROKER_ACCT_FTMO_1=             # ctidTraderAccountId numeric
BROKER_CREDS_FTMO_1=            # JSON path or kms-ref to encrypted creds

# Telemetry
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_SERVICE_NAME=

# Encryption key for refresh_token.enc (per-host, regen if rotated)
SECRETS_ENCRYPTION_KEY=

# Optional: alerting
ALERT_WEBHOOK_URL=               # generic webhook (Slack/Discord/etc.)
```

`@triplon/config` derives env-var names from schema paths; the
example above shows the canonical names.

---

## 18. Persistence — SQLite DDL

All trader-side persistence in **`data/trader.db`** (Bun's `bun:sqlite`).
Per Q007: single shared SQLite, every row tagged with
`(account_id, envelope_id, instance_id)`.

### 18.1 Tables

```sql
-- Decisions: every analyst → trader → judge cycle
CREATE TABLE decisions (
  decision_id        TEXT PRIMARY KEY,             -- ULID
  account_id         TEXT NOT NULL,
  envelope_id        TEXT NOT NULL,
  instance_id        TEXT NOT NULL,
  ts                 TEXT NOT NULL,                -- ISO 8601, Europe/Prague
  analyst_output     JSON NOT NULL,
  trader_output      JSON NOT NULL,
  judge_output       JSON,                         -- null if HOLD before judge
  pipeline_outcome   TEXT NOT NULL,                -- 'hold'|'rejected'|'approved'|'placed'|'failed'
  cache_stats        JSON NOT NULL,
  cost_usd           REAL NOT NULL
);
CREATE INDEX idx_decisions_instance_ts ON decisions(instance_id, ts);

-- Orders: every gateway-submitted order
CREATE TABLE orders (
  order_id           TEXT PRIMARY KEY,             -- = clientOrderId (ULID)
  decision_id        TEXT NOT NULL REFERENCES decisions(decision_id),
  account_id         TEXT NOT NULL,
  envelope_id        TEXT NOT NULL,
  instance_id        TEXT NOT NULL,
  ts_submitted       TEXT NOT NULL,
  symbol             TEXT NOT NULL,
  side               TEXT NOT NULL,                -- 'buy'|'sell'
  type               TEXT NOT NULL,                -- 'market'|'limit'|'stop'
  size_lots          REAL NOT NULL,
  size_pct_equity    REAL NOT NULL,
  sl_price           REAL,
  tp_price           REAL,
  trailing_stop      JSON,                         -- {activateAtR, distanceDollars}
  state              TEXT NOT NULL                 -- 'submitted'|'accepted'|'filled'|'cancelled'|'rejected'|'expired'
);

-- Executions: ProtoOAExecutionEvent stream
CREATE TABLE executions (
  exec_id            TEXT PRIMARY KEY,             -- broker event id
  order_id           TEXT REFERENCES orders(order_id),
  position_id        TEXT,                         -- broker position id
  ts                 TEXT NOT NULL,
  type               TEXT NOT NULL,                -- 'order_accepted'|'order_filled'|'order_rejected'|'order_cancelled'|'order_expired'|'order_replaced'|'position_modified'|'position_closed'
  fill_price         REAL,
  fill_size          REAL,
  raw                JSON NOT NULL                 -- full ProtoOAExecutionEvent for audit
);

-- Trades: closed positions, one row per close
CREATE TABLE trades (
  trade_id           TEXT PRIMARY KEY,
  position_id        TEXT NOT NULL,
  account_id         TEXT NOT NULL,
  envelope_id        TEXT NOT NULL,
  instance_id        TEXT NOT NULL,
  symbol             TEXT NOT NULL,
  side               TEXT NOT NULL,
  entry_ts           TEXT NOT NULL,
  exit_ts            TEXT NOT NULL,
  entry_price        REAL NOT NULL,
  exit_price         REAL NOT NULL,
  size_lots          REAL NOT NULL,
  pnl_usd            REAL NOT NULL,
  r_multiple         REAL NOT NULL,
  closed_by          TEXT NOT NULL,                -- 'sl'|'tp'|'trader_close'|'gateway_force_close'|'operator_force_close'|'pre_news_flatten'|'phase_advance_flatten'
  reflector_output   JSON                          -- populated post-reflector
);

-- Costs: per-LLM-call telemetry
CREATE TABLE costs (
  cost_id            TEXT PRIMARY KEY,
  decision_id        TEXT REFERENCES decisions(decision_id),
  ts                 TEXT NOT NULL,
  account_id         TEXT NOT NULL,
  envelope_id        TEXT NOT NULL,
  instance_id        TEXT NOT NULL,
  stage              TEXT NOT NULL,                -- 'analyst'|'trader'|'judge'|'reflector'|'autoresearch_generator'
  model              TEXT NOT NULL,
  variant            TEXT NOT NULL,
  input_cached       INTEGER NOT NULL,
  input_fresh        INTEGER NOT NULL,
  input_cache_write  INTEGER NOT NULL DEFAULT 0,
  output             INTEGER NOT NULL,
  thinking           INTEGER NOT NULL DEFAULT 0,
  usd_total          REAL NOT NULL
);

-- Phase state (per account)
CREATE TABLE phase_state (
  account_id         TEXT PRIMARY KEY,
  phase              TEXT NOT NULL,                -- 'phase_1_active'|'phase_1_target_hit'|'ready_for_phase_advance'|'phase_2_active'|...
  entered_at         TEXT NOT NULL,
  closed_balance     REAL NOT NULL,
  min_days_completed INTEGER NOT NULL DEFAULT 0,
  notes              TEXT
);

-- Control state (per scope)
CREATE TABLE control_state (
  scope              TEXT NOT NULL,                -- 'system'|'account'|'envelope'|'instance'
  scope_id           TEXT NOT NULL,                -- '*'|account_id|envelope_id|instance_id
  state              TEXT NOT NULL,                -- 'running'|'paused'|'halted'
  reason             TEXT,
  set_by             TEXT NOT NULL,                -- 'operator:<id>'|'auto:<trigger>'
  set_at             TEXT NOT NULL,
  PRIMARY KEY (scope, scope_id)
);

-- Experiments (autoresearch)
CREATE TABLE experiments (
  experiment_id      TEXT PRIMARY KEY,
  ts                 TEXT NOT NULL,
  persona            TEXT NOT NULL,
  mutation_diff      TEXT NOT NULL,
  proposer_model     TEXT NOT NULL,
  eval_result        JSON NOT NULL,
  outcome            TEXT NOT NULL,                -- 'rejected_gate'|'proposed'|'merged'|'reverted'
  notes              TEXT
);

-- Calendar (in services/news/data/calendar.db)
CREATE TABLE calendar (
  calendar_id        TEXT PRIMARY KEY,             -- hash(date, title, instrument)
  fetched_at         TEXT NOT NULL,
  date               TEXT NOT NULL,                -- ISO 8601 with offset
  title              TEXT NOT NULL,
  impact             TEXT NOT NULL,
  instrument_raw     TEXT NOT NULL,
  instrument_tags    JSON NOT NULL,                -- string[]
  restriction        INTEGER NOT NULL,             -- bool
  event_type         TEXT NOT NULL,
  forecast           TEXT,
  previous           TEXT,
  actual             TEXT,
  youtube_link       TEXT,
  article_link       TEXT
);
CREATE INDEX idx_calendar_date_restriction ON calendar(date, restriction);

-- Bars (in packages/eval-harness/data/bars.db)
CREATE TABLE bars (
  symbol             TEXT NOT NULL,
  timeframe          TEXT NOT NULL,                -- '1m'|'5m'|'15m'|'1h'|'4h'|'1d'
  ts_start           TEXT NOT NULL,                -- ISO 8601, UTC stored
  open               REAL NOT NULL,
  high               REAL NOT NULL,
  low                REAL NOT NULL,
  close              REAL NOT NULL,
  volume             REAL,
  PRIMARY KEY (symbol, timeframe, ts_start)
);
```

### 18.2 Backups

- `data/trader.db` — backed up on every supervisor stop and every
  hour during `running`. Rolling 7-day retention under
  `data/backups/<date>/`.
- `data/audit-log/*.jsonl` and `data/trade-memory/*.jsonl` — append-only;
  archived weekly.

---

## 19. Service endpoint contracts

All HTTP endpoints are typed via Elysia (consumed by dashboard's
React client). Schemas live in `packages/shared-contracts/`.

### 19.0 `HealthSnapshot` — every service's `/health` shape

`/health` is **mandatory** on every service and the supervisor. The
shape is shared across all services, defined once in
`packages/shared-contracts/health.ts`, and **always includes the
service's current version, read at runtime from its own
`package.json`** (never typed in as a string literal — past incidents
have been caused by stale hard-coded version strings hiding which
build was actually running).

```ts
// packages/shared-contracts/health.ts
import { z } from 'zod';

export const HealthSnapshot = z.strictObject({
  service:        z.string(),                                  // e.g. 'ctrader-gateway'
  version:        z.string(),                                  // semver from package.json (runtime-loaded)
  build_sha:      z.string().optional(),                       // git rev-parse HEAD if available at build time
  bun_version:    z.string(),                                  // Bun.version
  status:         z.enum(['healthy', 'degraded', 'unhealthy']),
  started_at:     z.string(),                                  // ISO 8601, Europe/Prague
  uptime_seconds: z.number().int(),
  pid:            z.number().int(),
  details:        z.record(z.string(), z.unknown()),           // service-specific
  checked_at:     z.string(),                                  // ISO 8601, Europe/Prague
});

// Canonical version-loader — every service uses this:
//   import pkg from '../package.json' with { type: 'json' };
//   export const SERVICE_VERSION = pkg.version;
//
// At service start: HealthSnapshot.parse({ ..., version: SERVICE_VERSION })
//
// NEVER do: const VERSION = '0.3.1';      // forbidden — hard-coded version
```

Why this is non-negotiable:

1. The supervisor's aggregated `/health` (§19.4) shows every service's
   version side-by-side. Operator can spot a stale process that didn't
   pick up a code change.
2. The implementing agent uses the version field in CI / smoke checks
   to validate that the running stack matches the just-committed source.
3. Because the version is loaded from `package.json` at runtime, the
   version-bump workflow (§0.2) ties every code change to a version
   bump → CHANGELOG entry → commit → re-deploy → `/health` reflects
   it. This produces a naturally-evolving, auditable history of what
   was running when.

The `details` field is service-specific. Examples per service:

```ts
// ctrader-gateway /health.details
{
  broker_socket: { state: 'connected', last_heartbeat_ms_ago: 4321, reconnects: 2 },
  accounts: [
    { account_id: 'ftmo-2step-100k-1', ctidTraderAccountId: '12345', authed: true,
      last_reconcile_ts: '2026-04-27T16:30:00+02:00', open_positions: 1 },
  ],
  throttle: { 'ftmo-2step-100k-1': { used: 47, cap: 1800 } },
  hard_rail_rejects_today: { calendar: 3, spread: 2, daily_budget: 2 },
  force_flats_today: { pre_news: 2, market_close: 0, friday_close: 0 },
}

// trader /health.details
{
  instances: [
    { instance_id: 'xauusd-ankit-classic', state: 'running',
      last_decision_ts: '...', last_outcome: 'HOLD', cost_today_usd: 1.42,
      withhold_until: null },
    { instance_id: 'nas100-session-break', state: 'running',
      last_decision_ts: '...', last_outcome: 'BUY', cost_today_usd: 0.83,
      withhold_until: null },
  ],
  envelopes: [
    { envelope_id: 'ftmo-2step-#1', state: 'running', day_pnl_usd: 340,
      daily_floor_distance_usd: 3660 },
  ],
  ll_provider_health: { 'moonshotai/kimi-k2.6': 'healthy', 'deepseek/deepseek-v4-flash': 'healthy' },
}

// news /health.details
{
  last_successful_fetch_at: '2026-04-27T16:30:00+02:00',
  fetch_age_seconds: 870,
  item_count_14d: 142,
  contract_changes_alerted_today: 0,
  next_restricted: { instrument: 'XAUUSD', title: 'Federal Funds Rate', eta_seconds: 12000 },
}

// supervisor /health.details
{
  mode: 'prod',
  services: [
    { name: 'ctrader-gateway', version: '0.3.1', state: 'running', health: { ... } },
    { name: 'trader',          version: '0.3.1', state: 'running', health: { ... } },
    { name: 'news',            version: '0.2.4', state: 'running', health: { ... } },
    { name: 'dashboard',       version: '0.3.0', state: 'running', health: { ... } },
    { name: 'autoresearch',    version: '0.1.0', state: 'stopped', scheduled_for: '...' },
  ],
}
```

### 19.0.1 Aggregated `/health` (supervisor)

The supervisor's `/health` aggregates each managed service's `/health`
**including the version field**. The dashboard renders a "version
matrix" view (§16.1) so operators can see at a glance whether all
services are on the latest version, or whether a stale process is
still running. CI / smoke tests assert
`all-services-version === git rev-parse HEAD's package version` before
marking a deploy successful.



### 19.1 `ctrader-gateway` (port 9201)

```
GET  /health                          → HealthSnapshot
GET  /positions                       → OpenPosition[]
GET  /orders                          → Order[]
GET  /events                          → SSE: ProtoOAExecutionEvent stream
GET  /throttle                        → { account_id: string, used: int, cap: int }[]
POST /orders                          → submit (trader-only)
POST /orders/<id>/amend               → amend SL/TP/trailing
POST /positions/<id>/force-close      → force-close (operator)
POST /accounts/<id>/reconcile         → trigger reconciliation
```

### 19.2 `news` (port 9203)

```
GET /health                           → HealthSnapshot { last_successful_fetch_at, item_count_14d, contract_changes_count }
GET /calendar/window?from&to&instruments[]  → CalendarItem[]
GET /calendar/restricted?at&instruments[]   → RestrictedReply  // { restricted: bool, reasons: { event, eta_seconds }[] }
GET /calendar/pre-news-2h?at&instruments[]  → RestrictedReply  // same shape
GET /calendar/next-restricted?at&instrument → { item: CalendarItem | null, eta_seconds: number }

// Canonical `RestrictedReply` schema lives in `pkg:contracts/news` (added in N1).
// `reasons[]` is an array of objects (not strings) so gateway rails 7 and 13 can
// render the blocking event(s) and time-to-event without re-querying news.
```

### 19.3 `trader` (port 9202)

```
GET  /health                          → HealthSnapshot
GET  /metrics                         → Prometheus exposition format
GET  /decisions/recent?limit&instance_id   → Decision[]
GET  /control-state                   → ControlState
PUT  /control/system                  → { state: 'running'|'paused'|'halted', reason?: string }
PUT  /control/account/<id>            → ditto
PUT  /control/envelope/<id>           → ditto
PUT  /control/instance/<id>           → ditto
GET  /events                          → SSE: decision + control + auto-pause/halt
```

### 19.4 `supervisor` (port 9100)

```
GET /health                           → AggregatedHealth
GET /services                         → ServiceStatus[]
```

### 19.5 `dashboard` (port 9204)

Static assets + SSE proxy to trader/gateway/news. No write endpoints
of its own.

---

## 20. Observability

### 20.1 Structured logging (pino)

Every log line carries: `time, level, service, account_id?,
envelope_id?, instance_id?, decision_id?, msg, ...details`.

```ts
const log = logger.scope({ service: 'trader' });
log.info({ instance_id, decision_id, stage: 'analyst', cost_usd, latency_ms }, 'analyst tick');
```

`pino-pretty` in dev. JSON to stdout in prod (collected by host log
shipper).

### 20.2 Metrics (Prometheus exposition; OpenTelemetry meter optional)

Each service exposes `GET /metrics`. Counters and gauges:

```
ankit_trader_tick_total{instance_id,outcome}              counter   outcome ∈ hold|approved|rejected|placed|failed|skipped_in_flight
ankit_trader_decision_latency_ms{instance_id,stage}       histogram
ankit_trader_llm_cost_usd_total{instance_id,stage,model}  counter
ankit_trader_cache_hit_ratio{instance_id,stage,layer}     gauge
ankit_gateway_order_total{account_id,outcome}             counter
ankit_gateway_hard_rail_reject_total{rule}                counter
ankit_gateway_force_flat_total{reason}                    counter   reason ∈ market_close|friday_close|pre_news|phase_advance|operator
ankit_gateway_throttle_used{account_id}                   gauge
ankit_news_fetch_age_seconds                              gauge
ankit_news_unhealthy{reason}                              gauge
ankit_envelope_equity_usd{envelope_id}                    gauge
ankit_envelope_daily_pnl_usd{envelope_id}                 gauge
ankit_envelope_distance_to_floor_pct{envelope_id}         gauge
ankit_account_phase_state{account_id,phase}               gauge   1.0 for current phase
```

### 20.3 Traces (OpenTelemetry, optional but pre-wired)

Each pipeline tick is a trace `tick.<instance_id>` with spans:
`analyst → trader → judge → gateway.place → reflector` plus
`cache.{read,write}` child spans.

**Bun-specific initialisation (mandatory pattern).** Bun does not ship
native OTLP and is incompatible with Node's `--require` /
`--experimental-loader` auto-instrumentation hook. Use **programmatic
initialisation** instead: each service imports a tiny
`infra:obs/otel-bootstrap.ts` module **as the first import in its
entrypoint** (before any service code) and calls `start()`
synchronously.

```ts
// packages/shared-contracts/obs/otel-bootstrap.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export function start(serviceName: string, serviceVersion: string) {
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT) return;     // disabled when no endpoint
  const sdk = new NodeSDK({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,                // ties traces to running version
    }),
    traceExporter: new OTLPTraceExporter(),
    // do NOT use auto-instrumentations here — broken on Bun (issue #26536, Jan 2026)
  });
  sdk.start();
}

// services/ctrader-gateway/index.ts (entrypoint)
import pkg from '../package.json' with { type: 'json' };
import { start } from '@ankit-prop/contracts/obs/otel-bootstrap';
start(pkg.name, pkg.version);                                 // FIRST line of real work

// ...rest of the service
```

**Known limits (track in `TODOS.md` as `APROP-I###` until upstream resolves):**

- **Auto-instrumentation is unreliable** on Bun. Manual span creation
  via `@opentelemetry/api` works fine; HTTP-server auto-instrument
  produces high-cardinality span names with no override hook (Bun
  issue #26536, open Jan-2026). Workaround: wrap each Elysia handler
  manually with explicit span names.
- **`--require` flag**: Bun supports it but the OpenTelemetry hook
  doesn't load (Bun issue #3775). Always programmatic init.
- **Discussion #7185**: tracking issue for an "official Bun OTel
  provider"; no ETA. Re-check at every Bun minor bump.

The `serviceVersion` passed in is the same value the service publishes
on `/health` — every span in a trace is tagged with the version that
emitted it, so a regression triaged from a trace can be tied to the
exact code commit.

### 20.4 Alerts (webhook to `ALERT_WEBHOOK_URL`)

Triggers (all auto-resolving where possible):

| Event | Severity |
|-------|----------|
| Hard-rail reject of a directional entry | INFO |
| Force-flat triggered | INFO |
| Auto-pause | WARN |
| Auto-halt | CRITICAL |
| FTMO breach detected (any) | CRITICAL |
| Calendar feed stale > 2 h | WARN |
| LLM provider 5xx > 10 consecutive | WARN |
| Cost ceiling at 80% | WARN |
| Cost ceiling reached | CRITICAL |
| Phase advance ready | INFO |
| Reconciliation failure | CRITICAL |
| Supervisor circuit-broken | CRITICAL |

Alert payload includes scope (`account_id`, `envelope_id`,
`instance_id`), reason, dashboard link.

### 20.5 Daily summary (cron 22:30 Europe/Prague)

A `services/trader` job emits a daily summary to `ALERT_WEBHOOK_URL`:

```
Day 12 / Phase 1 / ftmo-2step-100k-1
  Equity:      $102,340 (+0.34%)   Floor: −$3,660    Overall: $-1,500 / -$8,000
  Trades:      4 (3 win, 1 loss)   Sortino-60d: 1.42
  Cost:        $4.12 / $15.00 ceiling
  Hard-rail rejects: 7 (calendar=3, spread=2, daily_budget=2)
  Force-flats: 2 (pre_news=2)
  Notable:     Phase advance progress 23% / target 11%
```

---

## 21. Test strategy

### 21.1 Test pyramid

```
e2e (FTMO Free Trial burn-in)       → 14-day continuous run, golden anchors
integration (services up)           → cross-service contracts, gateway+news+trader
eval-replay (deterministic)         → backtest+paperReplay vs golden fixtures
unit (Bun test)                     → schemas, simulators, indicators, config
```

### 21.2 Unit tests (`*.spec.ts`)

Per package and service. Coverage targets:

| Package/Service | Lines / branches |
|-----------------|------------------|
| `eval-harness` (FTMO simulator) | 95% / 90% |
| `proc-supervisor` | 90% / 85% |
| `shared-contracts` (Zod schemas) | 100% schema parse paths |
| `trader` runtime | 80% / 70% |
| `ctrader-gateway` (rails) | 95% / 90% |
| `news` | 90% / 85% |
| `dashboard` | smoke + visual regression |

### 21.3 Integration tests

- **Supervisor + fake services**: 7 cases per `08-process-supervisor.md` §11.
- **Gateway + news + trader stub**: hard-rail enforcement matrix; one case per rail; one case per fail-closed default.
- **News fetcher + Zod validator**: cassette-replay of FTMO JSON over 14-day window; contract-change detector.
- **`ctrader-ts` smoke test on FTMO Free Trial**: 7-step gate (auth, accounts, symbols, spot, place+close, reconnect, protobuf coverage).

### 21.4 LLM-pipeline tests with VCR cassettes

`packages/llm-cassettes/` stores `(provider, request_hash) → response`
recordings per stage per persona. Tests:

- Assert deterministic Zod parsing of recorded responses.
- Assert escalation triggers (`nitro → exacto`) fire when expected.
- Assert cache key mutation invalidates the prefix (decision V).
- Cost telemetry matches the recorded token tier.

Cassettes are CI-cheap; live LLM calls are gated to `bun run test:live`
and not run by default.

### 21.5 Eval-replay regression suite

Run `eval-harness.backtest()` against the golden fixture suite (§14.9)
on every commit. Fixed strategies must produce **identical** numbers
to those committed; any drift fails CI.

### 21.6 Behavioural anchors (§13.5 matrix)

Each row is an integration test with a synthetic bar stream that drives
the persona to the expected output. Asserted at the trader output and
at the judge verdict.

### 21.7 FTMO Free Trial burn-in (Phase 4 → Phase 5 gate)

14 calendar days of continuous operation:

- Zero `ftmoBreaches` from the live simulator.
- Cost ceiling never exceeded.
- Daily summary delivered every day.
- Reconciliation drift = 0.
- All hard-rail rejects logged and reviewed.
- `eval-harness.liveScore()` over 14 days returns positive Sortino.

### 21.8 Chaos / failure-injection

Before promoting to FTMO Free Trial, exercise:

- Gateway socket drop mid-tick → reconnect, reconcile, no breach.
- News service crash → judge defaults to blackout, no entries.
- LLM 5xx storm (15 consecutive) → instance auto-pauses, no blind orders.
- DB unwriteable for 60 s → in-memory fallback (dev) / halt (prod).
- Force-close during open position → broker confirms, P&L locked.
- Restricted-event scheduler → pre-flatten triggers at T-6 min.

---

## 22. Build phases

| Phase | Deliverable | Key tests | Exit gate |
|-------|-------------|-----------|-----------|
| **0** | Scaffold, specs, ADRs (DONE) | n/a | Foundation commit |
| **1** | `@triplon/proc-supervisor` | Unit + 7 integration cases | `bun run start` brings up fake services with all transitions verified |
| **2** | `ctrader-gateway` (FTMO Free Trial) | `ctrader-ts` smoke-test 7 steps; rails matrix | **Offline-runnable deliverables** (no live broker): 14 rails matrix, `ctrader-vendor` scaffold, `/health` endpoint, `pkg:contracts` surface, two-phase pre-submit / post-fill evaluator, fail-closed contract surface (`composeRailVerdict([], …)`), rail-7 fail-closed branches (non-NEW intent / missing fill / malformed fill), FTMO simulator semantics (Tier-1 pre-news, Europe/Prague day bucket, strategy-close balance accumulation). **Live-broker-gated trio** ([ANKA-16](/ANKA/issues/ANKA-16)): place + close + reconcile against the FTMO trial demo with all 14 hard rails enforced. |
| **3** | `eval-harness` + FTMO simulator | Golden fixture suite trips simulator on bad strategies; 12-fold walk-forward harness functional | Library published, regression CI green |
| **4** | `trader` (modular monolith) | Behavioural anchors §13.5; cassette-replay LLM tests; multi-instance loader test (1 enabled + 3 disabled) | End-to-end through gateway against FTMO Free Trial for 1 hour |
| **5** | `news` (FTMO calendar JSON) | Cassette replay + contract-change detector | Endpoints green; 2-h staleness blackout fires |
| **6** | `dashboard` | Smoke + visual regression | All views render against running stack |
| **6.5** | **14-day FTMO Free Trial burn-in** | §21.7 | All §21.7 criteria met |
| **FT** | **FTMO Free Trial** | Re-run §21.7 against FTMO sim | 14 days zero breaches |
| **P1** | **FTMO Phase 1 paid challenge** | Live monitoring + daily summary | Phase 1 target hit, breach-free, FTMO-acknowledged |
| **7** | `autoresearch` (suggest-only) | Mutation generator + golden eval pass | Pre-condition: 30 days paper-live + ≥40 trades |

Phases 1–3 sequential; phase 4 may overlap with phase 5 once contracts
mergeable. Phase 6 after 4. Phase 7 cannot start before live data
exists.

---

## 23. Run book

### 23.1 First-run setup

```bash
git clone <repo>
cd ankit-prop-umbrella
bun install
cp .env.example .env                # fill OPENROUTER_API_KEY etc.
cp config/accounts.example.yaml ~/.config/ankit-prop/accounts.config.yaml
# Edit ~/.config/ankit-prop/accounts.config.yaml with broker creds env vars

bun run db:migrate                  # creates trader.db, calendar.db, bars.db
bun run typecheck && bun run lint && bun test
bun run start                       # supervisor brings up all services
```

### 23.2 Day-to-day operations

- `bun run start` — supervisor boots stack.
- `bun run status` — `supervisor status` (or curl `localhost:9100/health`).
- `bun run logs <service>` — supervisor logs passthrough.
- Dashboard at `http://localhost:9204/`.

### 23.3 Graceful shutdown

`bun run stop` (or `Ctrl-C` to supervisor):
1. Supervisor signals services in reverse-dependency order.
2. Trader receives SIGTERM → flatten all positions → exit (10 s grace; gateway force-flatten as backup).
3. Gateway closes broker socket cleanly.
4. News persists final calendar fetch.
5. Dashboard shuts down.
6. Supervisor exits.

### 23.4 Crash recovery (decision AA)

Supervisor restarts crashed service (per restart policy). On
**reconnection**:

- Gateway reconciles open positions from broker (broker truth wins).
- Orphan positions (broker has, trader doesn't) → **hold + alert**;
  operator decides via dashboard.
- Missing positions (trader has, broker doesn't) → in dev, auto-close
  local; in prod, halt + alert.
- Three crashes in 5 min → `circuit-broken`; manual `supervisor restart
  <name>` is the only exit.

### 23.5 Backup / restore

```bash
bun run backup                      # snapshots data/* under data/backups/<date>/
bun run restore <date>              # halts supervisor, restores files, restarts
```

Daily backup automatic at 03:30 Europe/Prague.

### 23.6 Secrets handling

- All secrets via env vars resolved by `@triplon/config`.
- cTrader refresh tokens encrypted on disk (`SECRETS_ENCRYPTION_KEY`).
- Never log secret values; pino redact list configured for
  `BROKER_CREDS_*`, `OPENROUTER_API_KEY`, `*token*`, `*secret*`.

### 23.7 Rotating credentials

```bash
bun run secrets:rotate              # prompts for new values, re-encrypts refresh tokens
```

### 23.8 Operator cheatsheet

| Action | Path |
|--------|------|
| Pause envelope | dashboard → envelope → "Pause" |
| Halt account | dashboard → account → "Halt" |
| Force-close position | dashboard → position row → confirm |
| Kill switch | top-bar red button → type `HALT` |
| Confirm phase advance (post-FTMO ack) | dashboard banner → "Confirm" |
| View reasoning | dashboard → instance → decision feed → expand |
| Inspect autoresearch experiment | dashboard → autoresearch tab → click row |
| Retry failed eval | `bun run autoresearch:retry <experiment_id>` |

---

## 24. Pre-launch checklists

### 24.1 Phase 4 done (trader running against FTMO Free Trial)

- [ ] All 14 hard rails enforced in gateway (§9 matrix tests pass).
- [ ] Behavioural anchors all green (§13.5 matrix tests pass).
- [ ] `1 enabled + 3 disabled` accounts loader test passes.
- [ ] Multi-instance shared envelope: cost-share enforced; risk-budget shared.
- [ ] Cache hit/miss telemetry visible per stage.
- [ ] Daily summary fires at 22:30 Prague.
- [ ] All alerts route to webhook.
- [ ] No `node` invocations anywhere (`grep -r "^node " | wc -l == 0`).

### 24.2 14-day FTMO Free Trial burn-in (Phase 6.5)

- [ ] 14 calendar days of continuous operation.
- [ ] Zero `ftmoBreaches`.
- [ ] Daily summary delivered every day.
- [ ] Reconciliation drift = 0 across all reconnects.
- [ ] Force-flats fire on schedule for all weeks (Friday close, market close, every restricted event).
- [ ] `eval-harness.liveScore()` returns positive Sortino over 14 days.
- [ ] Cost daily ≤ $5 / session (success criterion 3).
- [ ] No silent failures (every degradation alerted).
- [ ] At least 1 chaos test of each type (§21.8) executed.

### 24.3 FTMO Free Trial gate (FT)

- [ ] §24.2 complete on FTMO Free Trial.
- [ ] All decisions A–CC verified in code (audit checklist).
- [ ] No real-money credentials anywhere (`grep`-based audit clean).
- [ ] FTMO Free Trial reset & re-armed for the FT 14-day window
      (operator action — same trial slot, fresh equity).
- [ ] Internal margins re-verified (4% / 8% / ±5min / 60s / +1% / 1800/day).
- [ ] Daily-floor math verified against `references/ftmo-rules-comprehensive.md`.

### 24.4 FTMO Phase 1 paid challenge (P1)

- [ ] §24.3 complete; 14-day Free Trial breach-free.
- [ ] Operator briefed on phase-advance UX (decision N).
- [ ] Phase 1 risk-per-trade (0.5%) configured.
- [ ] Min-trading-days counter wired to `phase_state` table.
- [ ] Daily summary alert delivered to operator's preferred channel.
- [ ] Kill-switch tested live.

---

## 25. Module / service catalog (issue-tagging scopes)

This is the canonical scope tree for tagging issues, PRs, autoresearch
experiments, and journal entries. **Use these tags as GitHub labels and
in commit messages** (e.g.
`fix(svc:gateway/hard-rails): tighten defensive SL when ATR < 1.0`).

The tree is two-level: top scope (`pkg:` or `svc:`) + sub-module. Add a
new sub-module rather than overload an existing one when scope ambiguity
appears.

### 25.1 Top scopes

| Tag | Type | Path | Public name | Purpose |
|-----|------|------|-------------|---------|
| `pkg:supervisor` | Library (graduate-able) | `packages/proc-supervisor` | `@triplon/proc-supervisor` | Lifecycle manager for the process tree |
| `pkg:eval-harness` | Library | `packages/eval-harness` | `@ankit-prop/eval-harness` | Backtest, paper-replay, FTMO rule simulator |
| `pkg:contracts` | Library | `packages/shared-contracts` | `@ankit-prop/contracts` | Zod schemas shared across services |
| `pkg:ctrader-vendor` | Library | `packages/ctrader-vendor` | `@ankit-prop/ctrader-vendor` | Vendored `ctrader-ts` or in-house client |
| `svc:supervisor` | Service runtime | `services/...` (none — supervisor is `pkg:` only) | — | (alias of `pkg:supervisor` runtime; reserved) |
| `svc:gateway` | Service | `services/ctrader-gateway` | `@ankit-prop/ctrader-gateway` | Broker socket + hard guardrails |
| `svc:trader` | Service | `services/trader` | `@ankit-prop/trader` | Modular monolith with N account loops |
| `svc:news` | Service | `services/news` | `@ankit-prop/news` | FTMO calendar fetcher + endpoints |
| `svc:autoresearch` | Service (scheduled) | `services/autoresearch` | `@ankit-prop/autoresearch` | Mutation/eval loop |
| `svc:dashboard` | Service | `services/dashboard` | `@ankit-prop/dashboard` | Operator cockpit |
| `infra:config` | Cross-cutting | (uses `@triplon/config`) | — | Config loading, env-var resolution, schema emission |
| `infra:db` | Cross-cutting | `bun:sqlite` migrations + DDL under each consumer | — | Schemas, migrations, backups |
| `infra:secrets` | Cross-cutting | `data/secrets/`, `.env` | — | Refresh-token encryption, key rotation |
| `infra:obs` | Cross-cutting | logger + metrics + tracing | — | Pino, Prometheus exposition, OTel SDK |
| `infra:alerts` | Cross-cutting | webhook router | — | Alert routing to `ALERT_WEBHOOK_URL` |
| `infra:tooling` | Cross-cutting | repo root | — | Biome, tsconfig, bunfig, lint/test scripts |
| `infra:ci` | Cross-cutting | `.github/workflows/` (or chosen CI) | — | CI pipelines |
| `docs` | Repo | `*.md`, `.dev/` | — | This directory + per-repo docs |

### 25.2 Sub-modules per scope

#### `svc:gateway/...`

| Sub-module | Purpose |
|------------|---------|
| `transport` | WSS connection, heartbeat, reconnect/backoff |
| `oauth` | Application + account OAuth, refresh-token rotation |
| `order-manager` | Place / amend / close primitives |
| `execution-stream` | `ProtoOAExecutionEvent` ingest + persistence |
| `reconciliation` | Connect-time diff, broker-wins resolution |
| `hard-rails` | The 14 rails (rail #1 daily breaker through #14 monotone-SL invariant) |
| `force-flat-scheduler` | Rail #13 — market-close, Friday-close, pre-news pre-flatten |
| `throttle` | Rail #12 — token bucket, per-account, 1,800/day |
| `defensive-sl` | Rail #11 — SL tightening policy |
| `idempotency` | Rail #9 — ULID `clientOrderId` registry |
| `health` | `/health` aggregator, connection-state surface |

#### `svc:trader/...`

| Sub-module | Purpose |
|------------|---------|
| `account-loader` | Reads `accounts.config.yaml`; validates `risk_share_pct` sums |
| `envelope-coordinator` | Shared-budget arithmetic; auto-pause cascading |
| `instance-pipeline` | The 5-stage decision pass per instance |
| `instance-pipeline/cache-builder` | Layer 1–5 prompt assembly + cache key |
| `instance-pipeline/llm-client` | Kimi + DeepSeek adapters via OpenRouter |
| `instance-pipeline/analyst-stage` | Stage 1 |
| `instance-pipeline/trader-stage` | Stage 2 |
| `instance-pipeline/judge-stage` | Stage 3 |
| `instance-pipeline/reflector-stage` | Stage 5 (async) |
| `instance-pipeline/withhold-controller` | `withholdMinutes` instance-scoped suspension |
| `instance-pipeline/concurrency` | Per-instance mutex; drop-on-overlap |
| `indicator-engine` | Bar-fed indicator computation per persona declaration |
| `scoring-engine` | `v1_continuous_confluence`, `v2_discrete_buckets`, future schemes |
| `decision-db` | Writes to `decisions`, `orders`, `executions`, `trades`, `costs` |
| `cost-telemetry` | Per-call accounting; ceiling alerting |
| `control-state-manager` | Pause / halt across system/account/envelope/instance |
| `phase-state-manager` | Phase machine; auto-flatten trigger |
| `daily-summary` | 22:30 Prague cron; alert payload builder |
| `risk-allocator` | Static `risk_share_pct` v1; dynamic future |
| `health` | `/health` |

#### `svc:news/...`

| Sub-module | Purpose |
|------------|---------|
| `calendar-fetcher` | 30-min HTTP fetch of FTMO JSON endpoint |
| `calendar-validator` | Zod schema; unknown-value alerting |
| `symbol-tag-mapper` | `instrument` tag → tracked symbols, via `symbol-tag-map.config.yaml` |
| `restricted-window-evaluator` | `/calendar/restricted` — ±5 min check |
| `pre-news-evaluator` | `/calendar/pre-news-2h` — 2-h check |
| `next-restricted-locator` | Provides ETA for `force-flat-scheduler` |
| `calendar-db` | SQLite write/read for `data/calendar.db` |
| `freshness-monitor` | 2-h staleness → unhealthy → blackout |
| `health` | `/health` |

#### `svc:autoresearch/...`

| Sub-module | Purpose |
|------------|---------|
| `cron` | Nightly tick scheduler |
| `corpus-builder` | Pulls 30-day trade log + reflector lessons + ideas backlog |
| `mutation-generator` | Kimi K2.6 exacto proposer |
| `diff-validator` | ≤ 30 lines OR ≤ 5 param values gate |
| `eval-runner` | Calls `pkg:eval-harness/backtest` + `paper-replay` |
| `walk-forward-runner` | 12-fold orchestration |
| `promotion-gate` | All four gates check |
| `proposal-writer` | Writes to `proposals/<date>` branch |
| `experiment-log` | Append to `.dev/autoresearch/<persona>/autoresearch.jsonl` |
| `cost-ceiling` | Per-mutation USD 50 cap |

#### `svc:dashboard/...`

| Sub-module | Purpose |
|------------|---------|
| `views/system-tree` | Top-level state tree |
| `views/account` | Equity curve, phase progression, days-traded |
| `views/envelope` | Daily P&L vs floor, exposure, risk-share |
| `views/instance` | Decision feed, cost-per-tick, cache stats, open positions |
| `controls/pause-halt` | PUT `/control/{scope}/{id}` |
| `controls/force-close` | POST `/gateway/positions/<id>/force-close` |
| `controls/kill-switch` | Sequential flatten-everything |
| `controls/phase-advance` | Operator confirm post-FTMO-ack |
| `audit-log-viewer` | `data/audit-log/*.jsonl` |
| `autoresearch-log-viewer` | `.dev/autoresearch/*/autoresearch.jsonl` |
| `sse-client` | Subscribes to trader, gateway, news event streams |

#### `pkg:eval-harness/...`

| Sub-module | Purpose |
|------------|---------|
| `backtest` | Historical replay with full LLM calls |
| `paper-replay` | Replay recorded decisions; no LLM |
| `live-score` | Real-trade-history metrics |
| `ftmo-rule-simulator` | Canonical offline rule semantics |
| `bar-data-cache` | `data/bars.db` fetcher + reader |
| `slippage-model` | `max(2 × spread, 0.5 × ATR(14))` model |
| `walk-forward` | 12-fold rolling orchestrator |
| `metrics` | Sortino, drawdown, profit factor, win rate, avg RR |
| `golden-fixtures` | CI-gated bad/flat/trivial strategies |

#### `pkg:supervisor/...`

| Sub-module | Purpose |
|------------|---------|
| `cli` | `start | stop | restart | status | logs` |
| `config-loader` | YAML → typed schema |
| `process-manager` | adopt / replace / refuse, spawn, signal |
| `health-poller` | Per-service `/health` polling |
| `restart-policy` | Backoff + circuit-break |
| `topo-sort` | Dependency-ordered startup |
| `findproc-adapter` | External `findproc` / `killproc` integration |
| `aggregated-health` | Port 9100 `/health` |

#### `pkg:contracts/...`

| Sub-module | Purpose |
|------------|---------|
| `pipeline` | `AnalystOutput`, `TraderOutput`, `JudgeOutput`, `ReflectorOutput`, `Decision`, `CacheLayerStats` |
| `broker` | `OpenPosition`, `Order`, `ExecutionEvent`, `Bar`, `Symbol` |
| `risk` | `RiskBudget`, `Envelope`, `PhaseState`, `Breach` |
| `news` | `CalendarItem`, `CalendarResponse`, restricted-window I/O |
| `eval` | `EvalResult`, `FtmoBreach`, `WalkForwardFold`, `FoldResult` |
| `control` | `ControlState`, `OperatorAction`, `AuditEntry` |
| `config` | `AccountConfig`, `EnvelopeConfig`, `InstanceConfig`, `SupervisorConfig`, `RecoveryCfg`, `SymbolTagMap` |
| `health` | `HealthSnapshot` shared schema + `loadVersionFromPkgJson()` helper (§19.0) |
| `obs/otel-bootstrap` | `start(serviceName, serviceVersion)` programmatic OTel init (§20.3). Bootstrap *file* lives under `pkg:contracts`; `infra:obs` (§25.1) remains the cross-cutting issue tag for the OTel SDK init concept. |

#### `pkg:ctrader-vendor/...`

| Sub-module | Purpose |
|------------|---------|
| `ctrader-ts` | Vendored adapter (if smoke-test passes) |
| `inhouse` | Hand-rolled protobuf client (fallback path) |
| `proto` | Vendored `Spotware/openapi-proto-messages` at pinned commit |
| `framing` | 4-byte length prefix vs WSS-frame variants |
| `smoke-test` | The 7-step gate harness |

#### Cross-cutting (`infra:*`) sub-modules

| Tag | Sub-modules |
|-----|-------------|
| `infra:config` | `schema`, `precedence`, `env-derivation`, `schema-emit` |
| `infra:db` | `migrations`, `backups`, `restore`, `journal-mode` |
| `infra:secrets` | `aes-gcm-encryptor`, `key-rotation`, `redact-list` |
| `infra:obs` | `logger`, `metrics-exposition`, `otel-sdk`, `trace-spans` |
| `infra:alerts` | `webhook-router`, `payload-builder`, `dedupe`, `severity-routing` |
| `infra:tooling` | `biome-config`, `tsconfig`, `bunfig`, `scripts` |
| `infra:ci` | `lint-gate`, `test-gate`, `eval-replay-gate`, `live-llm-gate` |

### 25.3 Tag examples

```
fix(svc:gateway/hard-rails): tighten defensive SL when ATR(14) < 1.0
feat(svc:news/symbol-tag-mapper): handle "+ EUR + GBP" multi-tag strings
test(pkg:eval-harness/ftmo-rule-simulator): add news-SL-in-window fixture
refactor(svc:trader/scoring-engine): extract v2_discrete_buckets evaluator
chore(infra:tooling): bump biome to 2.4.13
docs(docs): apply BLUEPRINT-derived B1–B32 doc-bug fixes
ops(infra:secrets): rotate cTrader refresh token encryption key
```

GitHub labels: create one per top scope (`svc:gateway`, `pkg:eval-harness`, etc.)
plus orthogonal labels for issue type (`bug`, `enhancement`, `question`,
`autoresearch-mutation`, `hard-rail`, `compliance`, `cost`, `observability`,
`docs-only`).

---

## 26. Long-running open items (reviewed at phase boundaries)


These do not block initial build; they are continuously re-evaluated.

- Acceptance threshold for autoresearch (overfit vs no-improvement).
- FTMO rule simulator drift vs actual FTMO behaviour.
- Spread / slippage assumptions vs live fills.
- Cost ceiling realism vs actual cost.
- Multi-account correlation risk (when M > 1 becomes real).
- Whether reflector lessons add value vs noise.
- Whether `v_ankit_classic` Family B's continuous confluence outperforms a discrete bucket scheme.
- `APROP-Q040` (dynamic risk-share allocator) — pick after Phase 4 has data.
- `APROP-Q041` (`ctrader-ts` smoke-test outcome) — answered in Phase 2.
- `APROP-Q042` (FTMO server time vs Europe/Amsterdam) — answered at first FTMO Free Trial connection.
- `APROP-Q043` (multiplexed broker accounts) — only when M > 1.
- `APROP-Q032b` — collapsed by decision N (auto-flatten).

---

## 27. Glossary

- **Account** — one cTrader connection (one `ctidTraderAccountId`, one OAuth, one socket).
- **AMEND** — Stage-2 trader action that requests an SL/TP/trail modification (replaces the deprecated `TRAIL` action).
- **APROP** — project ID code; format `APROP-<TYPE><NNN>`.
- **Bar close** — finalisation of an OHLC interval; action cadence anchor.
- **Closed balance** — realised balance with no open positions; FTMO's profit-target reference.
- **Confluence** — multi-timeframe directional + indicator alignment score; persona-configurable per §13.4.
- **Envelope** — risk container (breakers, phase, cost ceiling).
- **Equity** — balance + floating P&L ± swap − commission. FTMO breach reference.
- **`exacto` / `nitro`** — pipeline-stage variants; `exacto` thinking-on, `nitro` cheap.
- **Family A / B / C** — `v_ankit_classic`'s three behaviour families (session breakout, multi-TF confluence, macro filter).
- **Force-flat** — gateway-issued auto-close on schedule (market close, Friday close, pre-news).
- **Hard rail** — gateway-enforced rule the LLM cannot bypass.
- **Instance** — one `(instrument, strategy)` pipeline; cached LLM prefix per instance.
- **Internal margin** — our breaker tighter than FTMO's nominal limit.
- **Layer 1–5** — prompt cache layering tiers (framework → instrument → session → history → fresh).
- **`Europe/Prague`** — FTMO server clock and the system's canonical timezone.
- **Persona / Strategy version** — directory under `strategy/` (e.g. `v_ankit_classic`); editable surface for autoresearch.
- **Pre-flatten** — gateway-issued close at T-6 min before each restricted event (decision M.2).
- **Restricted event** — calendar event with `restriction === true`; triggers ±5-min blackout + 2-h pre-news gate.
- **Rolling-60d Sortino** — primary metric for promotion gate.
- **Tick** — one decision pass through the pipeline (5-min cadence).
- **Tier-1 event** — `impact === 'high' OR restriction === true` (decision Y).
- **ULID** — sortable client UUID used as `clientOrderId`.
- **Withhold** — analyst's ability to suspend pipeline calls for N min (max 60), instance-scoped (decision D).

---

*Blueprint last reconciled 2026-04-27.*

*Where this file disagrees with the numbered docs, this file wins.
Apply `DOC-BUG-FIXES.md` to bring the numbered docs into alignment.*
