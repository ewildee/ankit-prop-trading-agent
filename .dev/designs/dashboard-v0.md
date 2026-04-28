# Dashboard v0 — Design Spec

_BLUEPRINT §16 cockpit: interaction design, wireframes, Tailwind v4 class hints_

**Tech**: React 19 · Tailwind v4 · Bun bundler · SSE live data via dashboard proxy (9204) ← trader (9202) + gateway (9201) + news (9203) + supervisor (9100)
**Author**: Designer (ANKA-120)
**Status**: v0 — engineer scaffold input

---

## 0. Aesthetic direction

| Axis | Decision |
|------|----------|
| Purpose | Single-operator trading cockpit. Read-mostly. Rare, high-stakes writes: halt + phase-advance confirm. |
| Tone | Austere terminal density. Charcoal/zinc backgrounds, monospace numerics, surgical accent colours. Bloomberg meets minimal ops console. |
| Anti-patterns | No white backgrounds. No purple gradients. No three-card hero layout. No Inter at default weight. |
| Typography | `JetBrains Mono` (fallback: `Menlo, Consolas`) for all data values, IDs, timestamps, prices. `Geist` (fallback: `system-ui`) for nav labels only. `font-variant-numeric: tabular-nums` on every numeric column. |
| Colour philosophy | Zinc scale as base. Four semantic colours only: emerald (ok), amber (warn), rose (danger), sky (info). One selection accent: violet, sidebar only. |
| **The one memorable thing** | System state expressed in page chrome: when HALTED, the 4 px top border + left sidebar edge turns `rose-600` and `animate-pulse`s. Operator knows system state before reading a single label. |
| Motion | State badge colour transitions: `transition-colors duration-300`. Kill-switch border: `animate-pulse`. Equity curve SSE updates: smooth SVG path morph. `@media (prefers-reduced-motion: reduce)` eliminates all animation; all badges fall back to `text-*` colour-only cues. |

---

## 1. Global shell

```
┌ top-bar (h-12, bg-zinc-900, border-b border-zinc-800) ─────────────────────────────────────────┐
│ ◈ ANKIT  [version matrix pills ...]                                      [  ⏹ HALT  ]           │
└────────────────────────────────────────────────────────────────────────────────────────────────┘
┌ sidebar (w-60) ──────────────────────────────┬ main (flex-1) ───────────────────────────────────┐
│                                              │                                                  │
│  [live tree]                                 │  [view panel — account / envelope / instance /   │
│                                              │   audit / autoresearch depending on selection]   │
│  ─────────────────────                       │                                                  │
│  TOOLS                                       │                                                  │
│  ⊞  Audit log                                │                                                  │
│  ⊞  Autoresearch                             │                                                  │
│                                              │                                                  │
└──────────────────────────────────────────────┴──────────────────────────────────────────────────┘
```

**Top bar**: `fixed top-0 inset-x-0 z-50 h-12 flex items-center px-4 gap-4 bg-zinc-900 border-b border-zinc-800`

**Sidebar**: `fixed top-12 left-0 bottom-0 w-60 flex flex-col bg-zinc-950 border-r border-zinc-800 overflow-y-auto`

**Main**: `ml-60 mt-12 min-h-[calc(100vh-3rem)] bg-zinc-950 p-6`

### HALTED chrome modifier

When `controlState.system.state === 'halted'`, add `data-system-state="halted"` on `<body>`.
Tailwind v4 `data-*` variants handle the cascade:

```
data-[system-state=halted]:border-t-4
data-[system-state=halted]:border-rose-600
```

- **Top bar**: `data-[system-state=halted]:bg-rose-950`
- **Sidebar left edge**: `border-l-4 data-[system-state=halted]:border-rose-600 data-[system-state=halted]:animate-pulse`
- Default (no data attr): `border-l-4 border-transparent`

### Keyboard nav

| Key | Action |
|-----|--------|
| `⌥H` | Open HALT modal |
| `Esc` | Close any open modal |
| `↑ / ↓` | Move selection in live tree |
| `→ / ←` | Expand / collapse tree node |

---

## 16.0 Version-matrix banner

Lives in the top bar, between the wordmark and the kill-switch button. Always visible.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ◈ ANKIT  supervisor 0.3.1 ●  gateway 0.3.1 ●  trader 0.3.1 ●  news 0.2.4 ●   │
│           dashboard 0.3.0 ⚠ stale                               [  ⏹ HALT  ]  │
└────────────────────────────────────────────────────────────────────────────────┘
```

When all versions match and all health checks pass, banner stays single-row and visually quiet.

### Pill spec

Each pill: `inline-flex items-center gap-1.5 text-xs font-mono text-zinc-300`

Separator between pills: `mx-2 text-zinc-700`

| Condition | Status dot | Classes |
|-----------|-----------|---------|
| version matches HEAD, health ok | `●` | `text-emerald-400` |
| version older than HEAD | `⚠ stale` | `text-amber-400` |
| health `state: 'stopped'` | `●` | `text-rose-400 animate-pulse` |
| health check failing | `●` | `text-rose-400 animate-pulse` |

**Data source**: `GET http://localhost:9100/health` (supervisor `/health.details.services[]`). Poll every 30 s. On any SSE reconnect, refetch immediately.

**Tooltip** (hover): `role="tooltip"` positioned `top-full mt-1 z-[60]`. Shows: `state`, `last_restart`, `uptime`. Classes: `px-2 py-1 text-xs font-mono bg-zinc-800 border border-zinc-700 rounded-sm shadow-lg text-zinc-300`.

**Narrow viewport fallback** (< 1024 px): pills collapse to initials (`SV GW TR NW DA`). Status dot remains. Full pill on hover.

---

## 16.1 Live tree (sidebar)

The sidebar is the primary navigation surface. Selecting any node loads that entity's detail view in the main panel.

### Tree structure

```
System  ● running                          ← root, always visible, not collapsible
├── ftmo-2step-100k-1                      ← Account (collapsible)
│   │   $102,340.00                        ← equity, right-aligned
│   └── ftmo-2step-#1                      ← Envelope (collapsible)
│       │   +$340  / -$3,660 to floor      ← day P&L / floor distance
│       ├── xauusd-ankit-classic  ●        ← Instance
│       └── nas100-session-break  ●        ← Instance
└── (future accounts appear here)
─────────────────────────────────
TOOLS
⊞  Audit log
⊞  Autoresearch
```

### Node classes

**System row** (root):
```
flex items-center justify-between px-3 py-1.5
text-xs font-mono text-zinc-400 uppercase tracking-widest
```

**Account row** (collapsible, `▸`/`▾` chevron):
```
flex flex-col px-3 py-2 cursor-pointer rounded-sm
hover:bg-zinc-900 transition-colors duration-150
```
- Account ID: `text-sm font-mono text-zinc-200`
- Equity: `text-xs font-mono text-zinc-500 tabular-nums`

**Envelope row** (`ml-4`):
- Envelope ID: `text-sm font-mono text-zinc-300`
- P&L line: `text-xs font-mono tabular-nums` — positive: `text-emerald-400`, negative: `text-rose-400`
- Floor distance: `text-zinc-600`

**Instance row** (`ml-8`):
- `text-sm font-mono text-zinc-400` + state dot right-aligned
- Last outcome label in tooltip on hover

**Active/selected node** (any level):
```
bg-violet-500/10 border-l-2 border-violet-500 text-zinc-100
```

**Section divider + tools**:
```
mt-auto border-t border-zinc-800 pt-2 pb-3 px-3
text-xs font-mono text-zinc-600 uppercase tracking-widest
```
Tool links: `flex items-center gap-2 px-0 py-1.5 text-sm text-zinc-400 hover:text-zinc-200 cursor-pointer`

### State badge

Rendered as a `<span>` beside each node label.

| `state` | Classes | Animated? |
|---------|---------|-----------|
| `running` | `text-emerald-400` | no |
| `paused` | `text-amber-400` | no |
| `halted` | `text-rose-400 animate-pulse` | yes |
| `ready_for_phase_advance` | `text-amber-300 animate-pulse` | yes |
| `phase_1_active` | `text-sky-400` | no |
| `phase_2_active` | `text-sky-500` | no |
| `funded_active` | `text-emerald-300` | no |
| `phase_*_breached` | `text-rose-500` | no |
| `phase_*_target_hit` | `text-amber-400 animate-pulse` | yes |

`@media (prefers-reduced-motion: reduce)` strips `animate-pulse` from all badges; colour cue alone carries the signal.

### SSE update behaviour

Node values (equity, P&L, state) update via `trader /events` SSE stream. Use `useDeferredValue` to batch rapid ticks and avoid flicker. On state change, apply `transition-colors duration-300`.

---

## 16.2 Per-account view

Loaded when user selects an Account node in the tree.

### Wireframe

```
┌── Account: ftmo-2step-100k-1 ─────────────────────────────────────────────────┐
│  Phase 1 active · 23.0% toward 10% target  ████░░░░░░░░░░░░░  Day 3 / 4 min  │
│                                                                                │
│  [PHASE-ADVANCE BANNER if ready_for_phase_advance — see §16.5]                │
├─────────────────────────────────────────────┬──────────────────────────────────┤
│  EQUITY CURVE                               │  STATS                           │
│                                             │                                  │
│  $103k ─────────────────────────────────    │  Closed balance   $101,980.00    │
│  $102k ──────╮──────────────────────────    │  Live equity      $102,340.00    │
│              ╰──────────────────────────    │  Daily floor      $98,000.00 ─── │
│  $101k ──────────────────────── (daily)     │  Overall floor    $92,000.00     │
│  $99k  ──────────────────────── (overall)   │  Floor distance   $4,340.00      │
│                                             │                                  │
│  09:00 ──────────────────────── 14:32       │  EA throttle      47 / 1,800     │
│                                             │  Cost today       $2.25          │
├─────────────────────────────────────────────┴──────────────────────────────────┤
│  HARD-RAIL REJECTIONS TODAY                                                    │
│  daily-breaker: 0  overall-breaker: 0  news-blackout: 3  2h-pre-news: 1       │
│  60s-hold: 0  spread: 2  slippage: 0  whitelist: 0  idempotency: 0            │
│  profit-target: 0  force-flat-sched: 2  ea-throttle: 0  amend-sl: 0           │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Equity curve

Inline SVG. Container: `w-full h-40`. `viewBox` recalculated on each SSE tick from `(min - 1%) … (max + 1%)` of today's equity series.

- Equity path: `stroke-emerald-400 stroke-[1.5px] fill-none`. When equity < daily floor at current tick, stroke changes to `stroke-rose-400`.
- Daily floor line: horizontal `stroke-amber-600/60 stroke-[1px] stroke-dasharray-[4,4]`
- Overall floor line: horizontal `stroke-rose-800/50 stroke-[1px] stroke-dasharray-[2,6]`
- Below-daily-floor zone: `fill-rose-900/20` SVG fill area from daily floor down to y-axis bottom
- X axis labels: `text-[10px] font-mono fill-zinc-600`
- Y axis labels: `text-[10px] font-mono fill-zinc-600 text-right`

### Phase progression bar

```
Phase 1 active · 23.0% toward 10% target  ████░░░░░░░░░░  Day 3 / 4 min
```

- Container: `flex items-center gap-3 mb-4 text-xs font-mono text-zinc-400`
- Bar track: `flex-1 h-1.5 rounded-full bg-zinc-800`
- Bar fill: `h-full rounded-full transition-all duration-500`
  - Progress < 50%: `bg-emerald-600`
  - Progress 50–80%: `bg-emerald-500`
  - Progress > 80%: `bg-emerald-400`
- Progress = `(closed_balance - initial_capital) / (initial_capital × target_pct) × 100`

### Stats grid

`grid grid-cols-[auto_1fr] gap-x-8 gap-y-0.5 text-sm font-mono`

Labels: `text-zinc-600`. Values: `text-zinc-100 tabular-nums text-right`.

Floor distance: `text-amber-400` if < 2% of initial capital, else `text-zinc-100`.
EA throttle: `text-amber-400` if > 80% used, else `text-sky-400`.

### Hard-rail rejection bar

`flex flex-wrap gap-x-6 gap-y-1 pt-3 border-t border-zinc-800/50 text-xs font-mono`

Each item: `<span class="text-zinc-600">{rule}: </span><span class="{valueClass} tabular-nums">{count}</span>`

Value class: `text-zinc-500` if zero, `text-amber-400` if > 0. Rail labels match BLUEPRINT §9 names shortened to 2-3 words.

**Data sources**:
- Phase/floor/equity: `GET /control-state` (trader port 9202); then `trader /events` SSE for live updates.
- Hard-rail rejections: `ctrader-gateway /health.details.hard_rail_rejects_today`.
- EA throttle: `ctrader-gateway /health.details.throttle`.

---

## 16.3 Per-envelope view

Loaded when user selects an Envelope node.

### Wireframe

```
┌── Envelope: ftmo-2step-#1 ────────────────────────────────────────────────────┐
│  State: ● running     Phase: phase_1_active                                   │
│                                                                                │
├────────────────────────────────────────┬───────────────────────────────────────┤
│  DAY P&L                               │  COST CEILING                         │
│                                        │                                        │
│  +$340.00                              │  Daily ceiling   $15.00               │
│  ██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │  Used            $2.25 (15%)          │
│  Floor: $98,000 (locked 09:00)         │  ██░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   │
│  Distance: $3,660 remaining            │  Remaining       $12.75               │
│                                        │                                        │
├────────────────────────────────────────┴───────────────────────────────────────┤
│  INSTANCES                                                                      │
│                                                                                 │
│  instance                 state    risk_share  cost today   positions           │
│  ─────────────────────────────────────────────────────────────────────────     │
│  xauusd-ankit-classic     ● run    50%         $1.42        0 open             │
│  nas100-session-break     ● run    50%         $0.83        1 open ↑ long      │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Day P&L display

Large value: `text-3xl font-mono tabular-nums` — `text-emerald-400` if ≥ 0, `text-rose-400` if < 0.

Progress bar toward floor breach: track `h-2 rounded-full bg-zinc-800`; fill width = `distance_to_floor / daily_loss_allowance × 100%`.

Fill colour:
- > 60% remaining: `bg-emerald-600`
- 30–60% remaining: `bg-amber-500`
- < 30% remaining: `bg-rose-600`

### Cost ceiling bar

Same bar component. Fill: `bg-sky-500`. Value: `text-sky-400`.

### Instances table

`w-full text-sm font-mono`

Header: `text-xs text-zinc-600 uppercase tracking-wider pb-1.5 border-b border-zinc-800`

Rows: `py-2 border-b border-zinc-900/60 hover:bg-zinc-900/40 cursor-pointer transition-colors`

Clicking a row navigates to that Instance view (sidebar selection updates synchronously).

Column classes:
- `instance`: `text-zinc-300`
- `state`: state dot + label per state table above
- `risk_share`: `text-zinc-500 tabular-nums`
- `cost today`: `text-sky-400 tabular-nums`
- `positions`: `text-zinc-500` / `text-emerald-400` if long open / `text-rose-400` if short open

**Data sources**: `trader /control-state` + `trader /events` SSE. Instance costs from `trader /health.details.instances[]`.

---

## 16.4 Per-instance view

Loaded when user selects an Instance node.

### Wireframe

```
┌── Instance: xauusd-ankit-classic ─────────────────────────────────────────────┐
│  State: ● running   Envelope: ftmo-2step-#1   Last tick: 14:32:07             │
│                                                                                │
├────────────────────────────────────────┬───────────────────────────────────────┤
│  OPEN POSITIONS (0)                    │  METRICS                              │
│                                        │  Cost today         $1.42            │
│  (none)                                │  Avg cost / tick    $0.047           │
│                                        │  Cache hit — analyst  71%  ████░     │
│                                        │  Cache hit — trader   68%  ███░░     │
│                                        │  Ticks today          30             │
│                                        │  Withheld until       —              │
├────────────────────────────────────────┴───────────────────────────────────────┤
│  DECISION FEED                                                        [last 20] │
│  ─────────────────────────────────────────────────────────────────────────────  │
│  14:32:07  HOLD     analyst: no Family-A trigger · judge: held  cost: $0.047  │
│  14:30:03  BUY  ▸                                                              │
│  ├── analyst:  pre-session break confirmed, 1.8R target, Family-B entry       │
│  ├── trader:   sizing 0.5% equity · SL 18,442 · TP 18,891                    │
│  └── judge:    approved — no rail conflicts, spread $0.011                    │
│  14:28:01  HOLD     analyst: spread elevated · judge: held  cost: $0.039      │
│  14:26:55  HOLD     ...                                                        │
│                                                                   [load more]  │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Open positions panel

When position(s) exist:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  LONG 0.10  NAS100   entry: 18,650.0   SL: 18,442.0   TP: 18,891.0          │
│  Unrealised: +0.4R  ($82.00)   trail: —    since: 14:30:03                  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Direction badge: `px-2 py-0.5 text-xs rounded-sm font-semibold`
- LONG: `bg-emerald-900 text-emerald-300`
- SHORT: `bg-rose-900 text-rose-300`

Values: entry `text-zinc-200`, SL `text-rose-400`, TP `text-emerald-400`, unrealised `text-emerald-400` / `text-rose-400`.

Data from `ctrader-gateway /positions?account_id=...` — poll every 5 s or update via `gateway /events` SSE.

### Metrics panel

`grid grid-cols-[auto_1fr] gap-x-8 gap-y-0.5 text-sm font-mono`

Cache hit rate rendered as inline micro-bar: `w-16 h-1 bg-zinc-800 rounded-full` + fill `bg-sky-500 rounded-full` at `{rate}%` width.

`withheld_until`: shown in `text-amber-400 tabular-nums` if non-null, otherwise `—` in `text-zinc-700`.

### Decision feed

Container: `space-y-px text-xs font-mono`

**Collapsed row** (default):

`flex gap-3 items-baseline py-1.5 px-2 rounded-sm hover:bg-zinc-900 cursor-pointer transition-colors group`

- Timestamp: `text-zinc-600 w-20 shrink-0 tabular-nums`
- Outcome badge:
  - HOLD: `text-zinc-500 w-16 shrink-0`
  - BUY: `text-emerald-400 font-semibold w-16 shrink-0`
  - SELL: `text-rose-400 font-semibold w-16 shrink-0`
  - REJECTED: `text-amber-400 w-16 shrink-0`
- Summary (truncated): `text-zinc-500 truncate`
- Cost: `text-zinc-700 ml-auto tabular-nums`
- Expand chevron: `text-zinc-700 group-hover:text-zinc-500`

**Expanded row** (click same row to toggle):

`mt-0.5 mb-1 ml-[5.5rem] pl-2 border-l border-zinc-800 space-y-0.5`

Three sub-rows (`analyst`, `trader`, `judge`):

`flex gap-2 text-zinc-400`

Prefix: `text-zinc-700 shrink-0 w-14` (e.g. `analyst:`)  
Body: `text-zinc-300 whitespace-pre-wrap`

Expand/collapse animation: `max-h-0 overflow-hidden transition-[max-height] duration-200 ease-out` → `max-h-64`.

"Load more" link: `text-xs text-zinc-600 hover:text-zinc-400 font-mono cursor-pointer`. Loads next 20 decisions via `GET /decisions/recent?instance_id={id}&limit=20&before={oldest_decision_id}`.

**Data sources**: `GET /decisions/recent?instance_id={id}&limit=20` (initial); `trader /events` SSE for live prepend. Position data: `ctrader-gateway /positions`.

---

## 16.5 Phase-advance UI

Rendered as a contextual banner **at the top of the per-account view** when `envelope.state === 'ready_for_phase_advance'`. Not a modal unless operator clicks CTA.

### Banner

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ ⚠  ftmo-2step-#1 reached phase-1 profit target ($110,000). Positions          │
│    flattened. Waiting for FTMO acknowledgement email before advancing.         │
│    Confirm phase advance once FTMO email received.           [Confirm advance›] │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Banner classes**: `rounded-md border border-amber-600/50 bg-amber-950/50 px-4 py-3 flex items-start justify-between gap-4 mb-6`

Icon: `text-amber-400 text-base mt-0.5 shrink-0`
Body: `text-sm text-amber-200`
CTA: `px-4 py-2 text-sm font-semibold rounded-sm bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black transition-colors shrink-0 whitespace-nowrap`

### Confirm modal

```
┌── Confirm Phase Advance ───────────────────────────────────────────────────────┐
│                                                                                │
│  Envelope    ftmo-2step-#1                                                     │
│  Transition  Phase 1  →  Phase 2                                               │
│                                                                                │
│  Risk-knob changes taking effect:                                              │
│  per_trade_pct     0.5%  →  0.4%                                               │
│  profit_target    10.0%  →  5.0%                                               │
│                                                                                │
│  All positions are already flat. Trader loop resumes on confirmation.          │
│                                                                                │
│  FTMO acknowledgement received?                                                │
│  ● Yes — I have the FTMO email confirming phase advance.                       │
│  ○ Not yet — cancel.                                                           │
│                                                                                │
│                                              [Cancel]   [Confirm phase advance] │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Dialog**: `<dialog>` element, `::backdrop { background: rgba(0,0,0,0.7) }`. Box: `w-[480px] max-w-[90vw] bg-zinc-900 border border-zinc-700 rounded-md p-6 shadow-2xl`

Header: `text-base font-semibold text-amber-300 mb-4`

Risk-change rows: `grid grid-cols-[auto_auto_auto] gap-x-6 py-1 text-sm font-mono text-center`
- Key: `text-zinc-500 text-left`
- Before: `text-zinc-600 line-through tabular-nums`
- After: `text-amber-300 font-semibold tabular-nums`

Radio inputs: `accent-amber-500`

**Confirm button**:
- Disabled (radio not "Yes"): `opacity-40 cursor-not-allowed bg-zinc-800 text-zinc-600 border border-zinc-700`
- Active: `bg-amber-500 hover:bg-amber-400 text-black font-semibold`
- Loading: spinner replaces text; `pointer-events-none`

**Action on confirm**: `PUT /control/envelope/{id}` with the phase-advance payload. On success: close modal, show toast `Phase advance confirmed. Phase 2 is now active.` in `bg-emerald-900 text-emerald-300`. On error: inline error in `text-rose-400` inside modal.

> **Open question OQ-2**: Confirm exact field name — `{ state: 'phase_2_active' }` or `{ advance_phase: true }` — with FoundingEngineer during scaffold.

---

## 16.6 Kill switch

### Top-bar button (always visible, always `ml-auto` rightmost)

```
Normal:   [  ⏹ HALT  ]
Halted:   [  ● HALTED  ]
```

**Normal**: `flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-sm border border-rose-800 text-rose-400 hover:border-rose-500 hover:text-rose-300 hover:bg-rose-950/50 transition-all`

**Halted**: `flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-sm bg-rose-600 text-white border border-rose-400 animate-pulse`

Minimum touch target: `min-w-[44px] min-h-[44px]` (CSS). Button is also the entry point to **resume** when already halted.

---

### HALT modal (when system is running)

```
┌── HALT ALL TRADING ────────────────────────────────────────────────────────────┐
│                                                                                │
│  This will halt all trading decisions immediately.                             │
│  Gateway will reject all new order submissions.                                │
│                                                                                │
│  Open positions:                                                               │
│  ● Keep positions open (gateway halts; existing broker positions held)         │
│  ○ Flatten everything   (close all positions sequentially; ~10–30 s)           │
│                                                                                │
│  Type HALT to confirm                                                          │
│  ┌─────────────────────────────────────────────┐                              │
│  │                                             │                              │
│  └─────────────────────────────────────────────┘                              │
│                                                                                │
│  [  Cancel  ]                               [  HALT ALL TRADING  ]            │
└────────────────────────────────────────────────────────────────────────────────┘
```

**Dialog box**: same as phase-advance but `border-rose-900`.

Header: `text-lg font-semibold text-rose-300 mb-3`

Descriptive text: `text-sm text-zinc-400 mb-5`

Radio group: `flex flex-col gap-3 mb-5 text-sm text-zinc-300`. `accent-rose-500`.

HALT text input:
```
w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-sm
font-mono text-sm text-zinc-100 placeholder-zinc-600
focus:outline-none focus:border-rose-600 focus:ring-1 focus:ring-rose-900
```
Placeholder: `type HALT`

**HALT button**:
- Disabled (input ≠ `'HALT'` or no radio): `opacity-40 cursor-not-allowed bg-zinc-800 text-zinc-600 border border-zinc-700 rounded-sm px-4 py-2 text-sm`
- Active: `bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white border-0 rounded-sm px-4 py-2 text-sm font-bold`
- Loading: spinner + `Halting…` label; `pointer-events-none`

**Action**:
1. `PUT http://localhost:9202/control/system` body `{ "state": "halted", "reason": "operator_halt" }`
2. If "flatten everything" selected: issue per-account force-close calls (confirm exact endpoint with FoundingEngineer — see OQ-1).

> **Open question OQ-1**: Does `PUT /control/system { state: 'halted' }` auto-cascade a flatten to all envelopes, or does the dashboard need to call a separate flatten endpoint per account after halt? BLUEPRINT §19.3 shows only `state` field — clarify before scaffold.

---

### HALTED modal (when system is already halted — opened by clicking the pulsing button)

```
┌── SYSTEM HALTED ───────────────────────────────────────────────────────────────┐
│                                                                                │
│  Trading halted since 14:42:03 (operator, reason: manual_halt).               │
│                                                                                │
│  Open positions: 0                                                             │
│                                                                                │
│  [ Cancel ]                                        [ Resume trading ]          │
└────────────────────────────────────────────────────────────────────────────────┘
```

Resume button: `bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-4 py-2 rounded-sm`. No HALT-text confirmation required for resume (low-risk direction).

Action: `PUT /control/system { "state": "running", "reason": "operator_resume" }`. On success: close modal, clear HALTED chrome modifier, show toast.

---

## 16.7 Audit-log viewer

Accessed from sidebar "⊞ Audit log" link. Replaces main panel content entirely.

### Wireframe

```
┌── Audit Log ────────────────────────────────────────────────────────────────────┐
│  Account [all ▾]     From [──────────]  To [──────────]        [↻ refresh]     │
│                                                                                 │
│  timestamp               operator    action                   reason            │
│  ─────────────────────────────────────────────────────────────────────────────  │
│  2026-04-28 14:42:03  operator    halt                    manual_halt           │
│  2026-04-28 14:42:05  operator    flatten_all             halt_flatten          │
│  2026-04-28 12:00:00  system      phase_advance_flatten   profit_target_hit     │
│  2026-04-28 09:00:12  system      lock_daily_floor        midnight_lock         │
│  ...                                                                            │
│                                                                                 │
│                                                         [← prev]   [next →]    │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Filter bar

`flex items-center gap-4 mb-4 text-sm`

Account selector: `<select class="bg-zinc-800 border border-zinc-700 rounded-sm px-3 py-1.5 text-zinc-200 text-sm focus:border-zinc-500 focus:outline-none">`. Options: "all" + each account ID.

Date inputs: `<input type="date">` — same classes as select. Apply `color-scheme: dark` via CSS so native date picker uses dark chrome.

Refresh: `text-zinc-500 hover:text-zinc-300 text-sm font-mono cursor-pointer`

### Table

`w-full text-xs font-mono`

Header: `text-zinc-600 uppercase tracking-wider pb-1.5 border-b border-zinc-800 text-left`

Row: `py-2 border-b border-zinc-900/50 hover:bg-zinc-900/30 cursor-pointer transition-colors`

Column classes:
- Timestamp: `text-zinc-500 w-48 shrink-0 tabular-nums`
- Operator: `text-zinc-400 w-24 shrink-0` — operator-initiated: `text-amber-400`; system-initiated: `text-zinc-500`
- Action: `text-zinc-200 w-52 shrink-0`
- Reason: `text-zinc-500`

**Expanded row** (click): full JSONL entry as `<pre class="mt-1 mb-2 px-4 py-3 bg-zinc-950 rounded-sm text-xs text-zinc-300 overflow-x-auto">`. Click same row to collapse.

**Pagination**: 100 rows per page. `text-sm text-zinc-500 tabular-nums`. Prev/next links: `text-zinc-400 hover:text-zinc-200 font-mono`.

**Data source**: Dashboard proxy `GET /audit-log?account_id={id|all}&from={iso}&to={iso}&page={n}&per_page=100`. Engineer implements JSONL reader reading from `data/audit-log/<account_id>.jsonl`, sorted reverse-chronological, with page offset.

---

## 16.8 Autoresearch experiment viewer

Accessed from sidebar "⊞ Autoresearch" link.

### Wireframe

```
┌── Autoresearch Experiments ────────────────────────────────────────────────────┐
│  Persona [all ▾]    Outcome [all ▾]                            [↻ refresh]    │
│                                                                                │
│  ↕ run_id (trunc)    persona          timestamp          outcome  Δprofit  cost│
│  ─────────────────────────────────────────────────────────────────────────────  │
│  01HXYZ…a0  ankit-classic    2026-04-28 03:15    ✓ promo   +2.1%   $3.21     │
│  01HXYZ…a1  ankit-classic    2026-04-28 03:10    ✗ rej     -0.3%   $2.87     │
│  01HXYZ…a2  session-break    2026-04-27 03:14    ✓ promo   +1.5%   $4.10     │
│  01HXYZ…a3  session-break    2026-04-27 03:09    ○ pend    —       $1.02     │
│  ...                                                                           │
│                                                         [← prev]   [next →]   │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Filter bar

Same pattern as audit-log filter bar. Persona list: derived from distinct `persona` values across all JSONL files. Outcome: `all | promoted | rejected | pending`.

### Table

`w-full text-xs font-mono`

Columns:
| Column | Classes |
|--------|---------|
| `run_id` | `text-zinc-600 w-28 truncate` (full ULID on hover tooltip) |
| `persona` | `text-zinc-300 w-40` |
| `timestamp` | `text-zinc-500 w-40 tabular-nums` |
| `outcome` | see below |
| `Δprofit` | positive: `text-emerald-400 tabular-nums`; negative: `text-rose-400 tabular-nums`; nil: `text-zinc-700` |
| `cost` | `text-sky-400 tabular-nums text-right` |

Outcome badge classes:
- promoted: `text-emerald-400 font-semibold` — `✓ promo`
- rejected: `text-rose-400` — `✗ rej`
- pending: `text-amber-400` — `○ pend`

**Sort**: clicking column header cycles none → asc → desc. Active: `text-zinc-200 underline underline-offset-2 decoration-zinc-600`. Indicator: `↑` / `↓` in `text-zinc-600`.

**Expanded row** (click):

```
├── Diff    [view diff →]
└── EvalResult
    { "persona": "ankit-classic", "run_id": "01HXYZ…", "outcome": "promoted",
      "delta_profit_pct": 2.1, "cost_usd": 3.21, "promoted_at": "…",
      "eval_result": { ... } }
```

Diff link: `<a class="text-sky-400 hover:underline">view diff →</a>` (rendered only if `diff_ref` field present in JSONL).

EvalResult: `<pre>` same style as audit log.

**Data source**: Dashboard proxy `GET /autoresearch/experiments?persona={name|all}&outcome={filter}&sort={col}&dir={asc|desc}&page={n}&per_page=50`. Engineer implements JSONL scanner reading `.dev/autoresearch/<persona>/autoresearch.jsonl` for each persona, merging rows, applying filters, sorting, paging.

> **Open question OQ-6**: Confirm `diff_ref` field name in `autoresearch.jsonl` — BLUEPRINT §15 shows the append schema but does not list a diff path field explicitly. If absent, omit the diff link from the initial implementation.

---

## A. Colour + type token reference

```css
/* Tailwind v4 — place in main.css under @layer base or @theme */
@theme {
  --font-family-mono: 'JetBrains Mono', 'Menlo', 'Consolas', ui-monospace, monospace;
  --font-family-sans: 'Geist', system-ui, -apple-system, sans-serif;
}

@layer base {
  body {
    @apply bg-zinc-950 text-zinc-100 antialiased;
    font-family: var(--font-family-sans);
  }

  [data-mono], .font-mono {
    font-family: var(--font-family-mono);
    font-variant-numeric: tabular-nums;
  }
}
```

Load `JetBrains Mono` via `@font-face` from `/fonts/` (bundled). Weight range 400–600 only. Subset to ASCII + extended Latin.

---

## B. State → colour canonical table

| Entity state | Text class | Animated |
|--------------|-----------|---------|
| `running` | `text-emerald-400` | — |
| `paused` | `text-amber-400` | — |
| `halted` | `text-rose-400` | `animate-pulse` |
| `ready_for_phase_advance` | `text-amber-300` | `animate-pulse` |
| `phase_1_active` | `text-sky-400` | — |
| `phase_2_active` | `text-sky-500` | — |
| `funded_active` | `text-emerald-300` | — |
| `phase_1_target_hit` | `text-amber-400` | `animate-pulse` |
| `phase_2_target_hit` | `text-amber-400` | `animate-pulse` |
| `phase_1_breached` | `text-rose-500` | — |
| `phase_2_breached` | `text-rose-500` | — |
| `stopped` (service) | `text-rose-400` | `animate-pulse` |
| `stale` (version) | `text-amber-400` | — |
| `down` (health) | `text-rose-500` | `animate-pulse` |

`animate-pulse` stripped globally under `@media (prefers-reduced-motion: reduce)`. Colour alone remains sufficient for WCAG 1.4.1 (non-colour fallback: badge text label always present).

---

## C. Contrast audit (WCAG AA)

| Foreground | Background | Ratio | Result |
|-----------|-----------|-------|--------|
| `zinc-100` (#f4f4f5) | `zinc-950` (#09090b) | ~17:1 | ✓ AAA |
| `zinc-200` (#e4e4e7) | `zinc-900` (#18181b) | ~12:1 | ✓ AAA |
| `emerald-400` (#34d399) | `zinc-950` (#09090b) | ~8.5:1 | ✓ AAA |
| `amber-400` (#fbbf24) | `zinc-950` (#09090b) | ~10:1 | ✓ AAA |
| `rose-400` (#fb7185) | `zinc-950` (#09090b) | ~5.1:1 | ✓ AA |
| `sky-400` (#38bdf8) | `zinc-950` (#09090b) | ~7.2:1 | ✓ AA |
| `zinc-600` (#52525b) | `zinc-950` (#09090b) | ~3.5:1 | ✓ (large text / UI) |
| Black (#000) | `amber-500` (#f59e0b) | ~10.8:1 | ✓ AAA |

All interactive elements ≥ 44×44 px touch target (Fitts's Law; WCAG 2.5.5).

---

## D. Open questions for engineer scaffold

| # | Question | Who answers |
|---|----------|------------|
| OQ-1 | Does `PUT /control/system { state: 'halted' }` cascade to all envelopes/instances automatically, or must the dashboard issue per-account calls? Does "flatten everything" require a separate endpoint? | FoundingEngineer |
| OQ-2 | Phase-advance confirm: is the body `{ state: 'phase_2_active' }` or `{ advance_phase: true }`? Does it also transition `phase_state` table automatically? | FoundingEngineer |
| OQ-3 | SSE event types on `trader /events`: what event subtypes carry equity updates and control-state changes? Minimum needed: `decision`, `control_state_change`, `equity_update`. Confirm schema. | FoundingEngineer |
| OQ-4 | Dashboard proxy scope: does 9204 proxy full CRUD to trader/gateway/news (same-origin pattern), or SSE only? BLUEPRINT says "SSE proxy" but write endpoints (HALT, phase advance) also need a single origin to avoid CORS. | FoundingEngineer |
| OQ-5 | Audit log and autoresearch JSONL reader endpoints — are these part of dashboard proxy, trader, or supervisor? Confirm port and route prefix. | FoundingEngineer |
| OQ-6 | `autoresearch.jsonl` schema — does a `diff_ref` or `diff_path` field exist for linking to git diff? If not, omit diff link from initial build. | FoundingEngineer |

---

_Design lenses applied: **Cognitive Load** (dense but structured — hierarchy surfaces primary signals, details progressive-disclosed); **Hick's Law** (two primary write paths: HALT + Phase Advance; all else read-only); **Fitts's Law** (HALT always top-right, ≥44px target, max motor distance from any view); **Von Restorff** (HALT button the only rose element in the top bar — isolation principle); **Peak-End Rule** (system HALTED state dominates page chrome — unmissable at session end); **Norman affordances** (HALT red, Confirm amber, resume green — mapping to semantic meaning); **Tesler's Law** (complexity absorbed into design: operator sees clean state, system handles the multi-step cascade)._
