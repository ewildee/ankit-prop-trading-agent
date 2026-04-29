# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-30 00:45 Europe/Amsterdam — [ANKA-285](/ANKA/issues/ANKA-285) full-window replay baselines

- Fetched and read `https://bun.com/llms.txt` at 00:45 Europe/Amsterdam before Bun-runtime edits.
- Generated full-window replay snapshots for `noop_v1` and `open_hold_close_v1` via `packages/eval-harness/src/replay-cli.ts`.
- Two-run byte-stability checks passed for both `*__full.json` snapshots; windows are `1769558400000` → `1777334400000`.
- `replay-baseline.spec.ts` now covers both smoke and full modes using `windowMode` from the baseline table.
- `@ankit-prop/eval-harness` bumped `0.2.0` → `0.2.1`; package changelog created for ANKA-285.
- Verification: `bun run lint:fix` exit 0; `bun run lint` exit 0 (27 pre-existing warnings / 37 infos); `bun run typecheck` clean; `bun test packages/eval-harness/` 71 pass; package-cwd `bun test src/replay-baseline.spec.ts` 4 pass.
- Next: commit, push, then hand [ANKA-285](/ANKA/issues/ANKA-285) to CodeReviewer.
