# Progress

- Current issue: [ANKA-384](/ANKA/issues/ANKA-384) — QA per-rail spec coverage for [ANKA-381](/ANKA/issues/ANKA-381) replay calendar/news and persona rejection changes.
- Worktree: `.paperclip/worktrees/ANKA-378-12-hour-critical-review-of-merged-commits`.
- Bun llms.txt fetched/read: 2026-04-30 17:27 Europe/Amsterdam.
- Added direct gateway specs for active-window allow, blackout >5m allow, pre-news 2h reject, and unavailable-calendar fail-closed.
- Added replay-adapter spec for a provider without `getEvents`, proving directional OPEN rejects closed with `calendar_unavailable`.
- Local checks passed: `bun run lint:fix`; mandated `bun test ... --rerun-each 5` -> 245 pass / 0 fail; `bun run typecheck`; `git diff --check`.
- Next: commit, then hand back to [@FoundingEngineer](agent://4b1d307d-5e9b-4547-92a2-b5df512f5d80).
