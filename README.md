# ankit-prop-umbrella

Autonomous LLM-driven FTMO prop-trading agent — umbrella monorepo.

`BLUEPRINT.md` is the single source of truth. Where any other doc disagrees, `BLUEPRINT.md` wins.

## Quick start

```bash
bun install
bun run lint
bun run typecheck
bun test
```

## Layout

See `BLUEPRINT.md` §17 for the canonical layout. Workspaces live under `packages/*` and `services/*`; runtime state and secrets live under `data/` and `~/.config/ankit-prop/` and are gitignored.

| `packages/*` (libraries) | `services/*` (runtimes) |
|--------------------------|-------------------------|
| `proc-supervisor` — `@triplon/proc-supervisor` (lifecycle manager) | `ctrader-gateway` — broker socket + 14 hard rails (port 9201) |
| `eval-harness` — `@ankit-prop/eval-harness` (backtest, paper-replay, FTMO sim) | `trader` — modular monolith with N account loops (port 9202) |
| `shared-contracts` — `@ankit-prop/contracts` (Zod schemas) | `news` — FTMO calendar fetcher + endpoints (port 9203) |
| `ctrader-vendor` — `@ankit-prop/ctrader-vendor` (cTrader client + vendored .proto) | `dashboard` — React 19 + Tailwind 4 cockpit (port 9204) |
|  | `autoresearch` — scheduled mutation/eval loop (suggest-only) |

## Operating contract

- **Bun-native first.** Adding an npm package for something Bun ships is a red flag (`BLUEPRINT.md` §5.1, §5.3). Read `https://bun.com/llms.txt` at session start.
- **No real-money credentials.** FTMO Free Trial demo and FTMO challenge demo only.
- **Audit trail = git history + `CHANGELOG.md` + `.dev/journal.md`.** Every code change ends with version bump + changelog entry + commit + `/health` reflect.
- Operator clock is **Europe/Amsterdam** for human-readable artefacts; service-runtime is **Europe/Prague** (FTMO server clock). Never mix the two.

## Phases

Track progress in `TODOS.md` and the per-phase exit gates in `BLUEPRINT.md` §22.
