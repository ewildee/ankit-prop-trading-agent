# TODOS

_Durable, repo-tracked task list. Mirror entries into the runtime todo tool while a session is active. Prune completed items within a session or two — proof of completion lives in git + CHANGELOG + journal._

Status markers: `[ ]` open · `[~]` in progress · `[x]` done.

## Phase 0 — Scaffold (ANKA-2, ANKA-5)

- [x] **T001** Bootstrap umbrella monorepo skeleton (workspaces, lint/typecheck/test, .dev/, CHANGELOG, env, gitignore, CI gate). _Closes ANKA-2._
- [~] **T013** Onboarding interview (BLUEPRINT §0.1, ANKA-5). Scaffold + `ask_user_questions` interaction posted; awaiting operator answers + populated `.env` to run OpenRouter probe and cTrader OAuth verification.

## Phase 1 — `@triplon/proc-supervisor`

- [x] **T002** Implement supervisor adopt/replace/refuse semantics with `/health` aggregator on port 9100. Exit gate: `bun run start` brings up fake services with all transitions verified. _Closes ANKA-6._

## Phase 2 — `ctrader-gateway`

- [ ] **T003** Vendor cTrader client + protobuf transport over `wss://*.ctraderapi.com:5035/`.
- [ ] **T004** Implement the 14 hard rails (BLUEPRINT §9), each with a `.spec.ts` regression.
- [ ] **T005** Place + close + reconcile against the FTMO Free Trial account.

## Phase 3 — `eval-harness`

- [ ] **T006** Bar-granularity simulator (decision G).
- [ ] **T007** Walk-forward 12-fold runner (decision H).

## Phase 4 — `trader`

- [ ] **T008** Modular monolith with N account loops (drop-on-overlap concurrency, decision A).

## Phase 5 — `news`

- [ ] **T009** FTMO calendar fetcher with `timezone=Europe%2FPrague`; 2-h staleness blackout.

## Phase 6 — `dashboard`

- [ ] **T010** React 19 + Tailwind 4 cockpit; version matrix, control panel, hard-rail logs.

## Phase 6.5 — Burn-in

- [ ] **T011** 14-day FTMO Free Trial burn-in; meet all §21.7 criteria.

## Phase 7 — `autoresearch`

- [ ] **T012** Suggest-only mutation/eval loop, 30% acceptance threshold.

## Cross-cutting

- [~] **Q001** Choose cTrader Open API app credentials path (operator action — folded into ANKA-5 onboarding interaction).
- [ ] **IDEA-001** Backlog of trading-lab ideas tracked in BLUEPRINT §13.7 (decision CC).
