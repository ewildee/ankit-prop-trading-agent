# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 23:35 Europe/Amsterdam — [ANKA-121](/ANKA/issues/ANKA-121) dashboard shell

- Scoped wake on [ANKA-121](/ANKA/issues/ANKA-121); no pending comments, harness already checked it out.
- Fetched `https://bun.com/llms.txt` at 23:30 Europe/Amsterdam before Bun-runtime edits.
- Re-read BLUEPRINT §0, §0.1, §0.2, §5, §16, §17, §19, §22, §25 plus issue heartbeat context.
- Primary checkout gained unrelated ANKA-124 edits mid-heartbeat; isolated this work in `../anka-121-dashboard-shell-clean` from `origin/main`.
- Added `services/dashboard` Bun build/start scripts, React 19 + Tailwind 4 deps, and `@ankit-prop/contracts` workspace dependency.
- Implemented Bun-served `/`, `/assets/*`, `/api/version-matrix`, and `/health` on default `:9601`.
- Added version comparison/probe logic with stale vs mismatch states and tests.
- Added shell UI for §16.1 tree and SSE seam; live view/control wiring remains out of scope.
- Verification: `bun run lint:fix` exit 0 with pre-existing unrelated warnings; dashboard specs 6 pass; asset build clean; `bun run typecheck` clean.
- Smoke: `bun run --cwd services/dashboard dev`; `curl :9601/health` returned dashboard v0.1.0; `/api/version-matrix` showed gateway/dashboard current and unavailable services as unreachable.
- Next: commit with Paperclip footer, push, update [ANKA-121](/ANKA/issues/ANKA-121) for review/close.
