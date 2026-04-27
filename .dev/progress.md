# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-27 22:45 Europe/Amsterdam — Phase 2 offline scope complete (ANKA-7)

- v0.3.0 → v0.4.2 across 5 commits closed every offline-runnable item in ANKA-7's scope: §9 contract surface (`4979fdd`), 14 hard rails + dispatcher + matrix (`2218862`), ctrader-vendor scaffold + codec fix (`74913ed`), lint cleanup (`49596ee`), §19.1 /health endpoint (`b13cdfa`).
- `services/ctrader-gateway` now runs as a real Bun process: `bun run --cwd services/ctrader-gateway start` opens `:9201` with a `HealthSnapshot` responder; supervisor's `health.url: http://localhost:9201/health` line in `config/supervisor.example.yaml` finally has a responder behind it.
- 195 tests / 0 fails / 728 expects across the workspace. `bun run typecheck` clean. `bun run lint` is 1 warning + 10 infos (codec / eval-harness `useLiteralKeys`, owning PRs).
- ANKA-14 marked `done`. ANKA-7 stays `in_progress` per CEO direction; broker-dependent legs (ANKA-12 / 13 / 15) chain through [ANKA-16](/ANKA/issues/ANKA-16) (Spotware KYC + browser OAuth code-grant).
- Next wake (`issue_blockers_resolved` when ANKA-16 lands): start ANKA-12 — run `bun run --cwd packages/ctrader-vendor smoke` live against the FTMO Free Trial socket, capture step-by-step evidence into `SmokeReport`, lock ADR-012 verdict.
