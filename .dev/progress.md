# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-27 18:35 Europe/Amsterdam — v0.1.0 (ANKA-6 / Phase 1)

- `@triplon/proc-supervisor` v0.1.0 + `@ankit-prop/contracts` v0.1.0 shipped end-to-end (BLUEPRINT §3, §17, §22 phase 1).
- Submodules: topo-sort, restart-policy (3-in-5min circuit-break), health-poller, findproc-adapter (lsof), process-manager (adopt|replace|refuse, Bun.spawn, ring-buffered logs), aggregated-health on `:9100`, config-loader (`Bun.YAML.parse` + Zod), CLI (`start|stop|status|restart|logs|--version`).
- 45 tests / 79 expect() / 0 fails — including all 7 BLUEPRINT §22 phase 1 integration cases (adopt, replace, refuse, restart-policy, topo-order, circuit-break, graceful shutdown).
- `bun run lint`, `bun run typecheck`, `bun test` all green; `zod@4.3.6` pinned per §5.2; everything else Bun-native.
- ANKA-10 (IC demo → FTMO Free Trial) was completed concurrently in the same working tree by a parallel session; its files (BLUEPRINT, README, .env.example, accounts.example.yaml) are left untouched for that commit boundary.
- Next: ANKA-7 / Phase 2 (`svc:gateway` against FTMO Free Trial, 14 hard rails). Pre-condition: cTrader app + FTMO Free Trial creds in `.env` (open via ANKA-5 interaction).
