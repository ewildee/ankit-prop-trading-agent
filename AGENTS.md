# AGENTS.md

Operating contract for any agent (human or LLM) writing code in this
repo. Pointer document — `BLUEPRINT.md` remains the single source of
truth. Where this file disagrees with the blueprint, the blueprint
wins.

## Reading map

Before any change: re-read the relevant blueprint section, not memory.

- `BLUEPRINT.md` §0 — reading map
- `BLUEPRINT.md` §0.1 — bootstrap onboarding (run-at-start)
- `BLUEPRINT.md` §0.2 — `.dev/` working methodology and commit conventions
- `BLUEPRINT.md` §17 — repository layout and config schemas
- `BLUEPRINT.md` §22 — build phases (sequential 1→2→3, 4 may overlap 5, 6 after 4, 7 after live data)
- `BLUEPRINT.md` §25 — module / service catalog (issue-tagging scopes)

## Bun-native first (BLUEPRINT §0.2)

Every agent that writes Bun-runtime code in this project must fetch and
read https://bun.com/llms.txt at the start of each session. Adding an
npm package for something Bun already ships is a red flag (§5.3
forbidden list). Record the date+time of the last fetch in
`.dev/progress.md`.

## Worktree-first for multi-file changes (defensive guard, [ANKA-126](/ANKA/issues/ANKA-126))

Until the Paperclip platform fix from [ANKA-98](/ANKA/issues/ANKA-98)
lands (per-issue worktrees by default in the `claude_local` adapter),
agents share a single checkout per company. Concurrent heartbeats have
stomped each other and lost multi-file refactors. To stop reaching for
stash/reset workarounds, the working contract is:

1. **Trigger.** If your change touches more than one file, or will take
   more than one Bash tool turn to complete, do **not** edit the shared
   root checkout. Start with a worktree.
2. **Create.** From the shared root, run:

   ```sh
   git worktree add .paperclip/worktrees/<issueId> <baseBranch>
   # e.g. git worktree add .paperclip/worktrees/ANKA-126 origin/main
   ```

   where `<issueId>` is the Paperclip issue id (e.g. `ANKA-126`) and
   `<baseBranch>` is the branch you would otherwise check out (typically
   `origin/main`, or the parent feature branch when the work explicitly
   continues someone else's PR). Add `-b <branch-name>` if you also need
   a fresh feature branch.
3. **Work in the worktree.** All edits, `bun` commands, commits, and
   pushes happen inside `.paperclip/worktrees/<issueId>`. Use absolute
   paths so you don't accidentally touch the shared root.
4. **Return for merge only.** Only return to the shared root checkout
   for a final fast-forward merge into `main` (or for a no-op when
   you've already pushed the feature branch and a PR will land it).
5. **Cleanup.** On success: `git worktree remove .paperclip/worktrees/<issueId>`.
   If the work needs another heartbeat, leave the worktree in place —
   the next heartbeat resumes there directly. Stale worktrees are
   acceptable; they will be pruned wholesale once [ANKA-98](/ANKA/issues/ANKA-98)
   lands.
6. **Exception.** Single-line / single-file fixes that complete in one
   Bash turn (typo, CHANGELOG timestamp, `.dev/journal.md` append) may
   run in the shared root. Anything else uses a worktree.

`.paperclip/worktrees/` is gitignored. It is **not** the same as the
out-of-repo Paperclip instance directory at `~/.paperclip/`; this is a
local-only working tree directory inside the company repo.

Remove this section once [ANKA-98](/ANKA/issues/ANKA-98) ships and the
`claude_local` adapter creates per-issue worktrees automatically.

## Working methodology (BLUEPRINT §0.2)

Memory file discipline:

- `TODOS.md` — durable task list. Mirror entries into the runtime todo
  tool while a session is active. Prune completed items; proof of
  completion lives in git + CHANGELOG + journal.
- `.dev/progress.md` — replace current section, ≤ 20 lines.
- `.dev/journal.md` — append only, newest first; never edit past entries.
- `.dev/decisions.md` — append new ADRs.
- `CHANGELOG.md` — append at top per release with `HH:MM` Europe/Amsterdam.

After every code change (mandatory):

1. Add or update `.spec.ts` tests for changed behaviour.
2. `bun run lint:fix`.
3. `bun test`.
4. `bun run typecheck`.
5. Bump the version of every package whose code changed and append a
   `CHANGELOG.md` entry with the real `HH:MM` timestamp from `date`
   (Europe/Amsterdam).
6. Commit (small, descriptive, scoped).
7. Restart any service whose package changed and confirm `/health`
   reports the new version.

Never overwrite `AGENTS.md`, `BLUEPRINT.md`, `TODOS.md`,
`.dev/journal.md`, or `.dev/progress.md` from memory. Re-read first,
then targeted edits.

Commits include `Co-Authored-By: Paperclip <noreply@paperclip.ing>`.
The repo-local `.githooks/commit-msg` hook enforces this footer.
Never skip pre-commit hooks (`--no-verify`) without explicit operator
permission. Never commit secrets or `*.config.yaml` files containing
credentials.

## Build phases (BLUEPRINT §22)

Move strictly in order. Phases 1→2→3 are sequential; phase 4 may
overlap with phase 5 once contracts are mergeable; phase 6 follows
phase 4; phase 7 cannot start before live data exists.

| Phase | Deliverable | Exit gate |
|-------|-------------|-----------|
| 0 | Scaffold, specs, ADRs | Foundation commit |
| 1 | `@triplon/proc-supervisor` | `bun run start` brings up fake services with all transitions verified |
| 2 | `ctrader-gateway` (FTMO Free Trial) | Place + close + reconcile against the trial demo, all 14 hard rails enforced |
| 3 | `eval-harness` + FTMO simulator | Library published, regression CI green |
| 4 | `trader` (modular monolith) | End-to-end through gateway against FTMO Free Trial for 1 hour |
| 5 | `news` (FTMO calendar) | Endpoints green; 2-h staleness blackout fires |
| 6 | `dashboard` | All views render against running stack |
| 6.5 | 14-day FTMO Free Trial burn-in | All §21.7 criteria met |
| FT | FTMO Free Trial | 14 days zero breaches |
| P1 | FTMO Phase 1 paid challenge | Phase 1 target hit, breach-free |
| 7 | `autoresearch` (suggest-only) | 30 days paper-live + ≥40 trades |

## Module catalog (BLUEPRINT §25)

Use these scopes as commit-message prefixes and issue tags
(e.g. `fix(svc:gateway/hard-rails): tighten defensive SL when ATR < 1.0`).

Top scopes:

- `pkg:supervisor` → `packages/proc-supervisor` (`@triplon/proc-supervisor`)
- `pkg:eval-harness` → `packages/eval-harness` (`@ankit-prop/eval-harness`)
- `pkg:contracts` → `packages/shared-contracts` (`@ankit-prop/contracts`)
- `pkg:ctrader-vendor` → `packages/ctrader-vendor` (`@ankit-prop/ctrader-vendor`)
- `svc:gateway` → `services/ctrader-gateway` (broker socket + 14 hard rails)
- `svc:trader` → `services/trader` (modular monolith)
- `svc:news` → `services/news` (FTMO calendar fetcher + endpoints)
- `svc:autoresearch` → `services/autoresearch` (mutation/eval loop)
- `svc:dashboard` → `services/dashboard` (operator cockpit)

Cross-cutting: `infra:config`, `infra:db`, `infra:secrets`, `infra:obs`,
`infra:alerts`, `infra:tooling`, `infra:ci`. Repo-level docs: `docs`.

Sub-modules per scope are listed in BLUEPRINT §25.2; add a new
sub-module rather than overload an existing one when scope ambiguity
appears.

## Hard guardrails

The 14 hard rails (BLUEPRINT §9) live in
`services/ctrader-gateway/src/hard-rails/`. Any gateway change touching
rail logic ships with explicit `.spec.ts` regression coverage. Default
for any uncertainty: **fail closed**. No trades > wrong trades.

## Bounds (CEO-approval gates)

- No real-money credentials anywhere — FTMO Free Trial demo and FTMO
  challenge demo only.
- No widening the npm dependency surface beyond §5.2; reach for a Bun
  built-in first.
- No starting phase work whose pre-conditions are unmet
  (e.g. autoresearch before live data exists).
- Treat non-reversible operations (force push, schema-destructive
  migration, deleting `data/*`) as one-way doors and ask first.

## Reuse note

Newly-spawned coder/QA agents in adjacent Paperclip companies can
inherit this contract — see `paperclip-create-agent` skill templates
(`AGENTS.md` for `Coder`, `QA`).
