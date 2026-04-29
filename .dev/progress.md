# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-30 00:51 Europe/Amsterdam — [ANKA-75](/ANKA/issues/ANKA-75) svc:news v0.1 umbrella close-out

- Scoped wake reason: `issue_children_completed`; all Wave-2 children terminal, last blocker [ANKA-170](/ANKA/issues/ANKA-170) merged at `9c7efd7`.
- Rebased the per-issue worktree onto `origin/main`; clean fast-forward.
- Verified umbrella deliverables on `main`: fetcher (§11), symbol-tag map (§22), `/calendar/restricted` + `/calendar/pre-news-2h` + `/health/details` (§19.2), Elysia router + start.ts + metrics + Treaty (§19.1, §19.4), cassette replay + contract drift + Prague DST + native Bun coverage gate (§17), fail-closed defaults (§11.7, §11.8).
- Smallest local verification: `bun install` (worktree symlinks) → `bun test services/news` → 142 pass / 0 fail / 448 expects across 18 specs; workspace `bun run typecheck` clean.
- Unblock chain: [ANKA-31](/ANKA/issues/ANKA-31) already `done`; [ANKA-7](/ANKA/issues/ANKA-7) still blocked on [ANKA-16](/ANKA/issues/ANKA-16) (independent of svc:news) — closing ANKA-75 is the umbrella close-out, not an unblock for ANKA-7.
- Closing ANKA-75 `done` with journal entry + progress refresh; no source change → no version bump or CHANGELOG row.
