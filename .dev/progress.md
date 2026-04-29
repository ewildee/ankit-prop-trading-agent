# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-29 22:05 Europe/Amsterdam — [ANKA-121](/ANKA/issues/ANKA-121) banner Designer fixes ready for re-verdict

- Designer [ANKA-277](/ANKA/issues/ANKA-277) `CHANGES_REQUESTED`: `.version-chip-current` missing (dashboard self-row not green) and `.version-chip-stale` shared red with `unreachable`. QAEngineer [ANKA-278](/ANKA/issues/ANKA-278) approved separately (health 200, fail-closed correct, `gateway` row flipped `current` against running peer, no JS errors, 12 specs + flake check green).
- Applied Designer's pre-written CSS verbatim to `services/dashboard/src/client/styles.css`: added `.version-chip-current` (green `#3a8f5c` / `#edf7f1`); split compound rule so `stale` is amber (`#d97706` / `#fffbeb`) and `unreachable` keeps red (`#e05252` / `#fff1f1`). No structural changes.
- Bumps: `@ankit-prop/dashboard` `0.1.2` → `0.1.3`; root umbrella `0.4.44` → `0.4.46` (initial cut took `0.4.45` but [ANKA-201](/ANKA/issues/ANKA-201) DBF-002 landed on `main` mid-flight at `3217fc0` and consumed `0.4.45`; rebumped during conflict resolution rather than reordering history). CHANGELOG entry written.
- Verification: `bun test services/dashboard/src` 12 pass, `bun run typecheck` clean, `bun x biome check services/dashboard` 1 pre-existing shim warning. Live `bun run --cwd services/dashboard start`: `GET :9204/health` → `0.1.3 healthy`, `GET :9204/api/version-matrix` → dashboard `state:current`, peers `state:unreachable`, bundled `main.css` contains all three distinct selectors.
- Worktree was on `9668dd0`; fast-forwarded to `48e0d81`, committed, then rebased onto `3217fc0` after ANKA-201 landed on `main`. CHANGELOG / progress / journal conflicts resolved by ordering newest-first by timestamp; root version rebumped to `0.4.46`.
- Next: rebase-merge PR (per the convention used by ANKA-201 PR #30 today, replacing the older direct-trunk-push convention used for `bda12a3`); reassign ANKA-121 to Designer with `in_review` for focused re-verdict; close after APPROVE.
