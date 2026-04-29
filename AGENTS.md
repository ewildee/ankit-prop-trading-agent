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

## Worktree-first for multi-file changes (defensive guard, [ANKA-126](/ANKA/issues/ANKA-126), [ANKA-241](/ANKA/issues/ANKA-241))

> **Failure mode (read this first).** Until [ANKA-98](/ANKA/issues/ANKA-98)
> ships, all agents share a single checkout per company. **If you do
> multi-file edits in the shared root and a concurrent heartbeat does a
> `git checkout` mid-edit, all your uncommitted changes are silently
> wiped.** This has already happened five times (see [ANKA-31](/ANKA/issues/ANKA-31)
> / [ANKA-98](/ANKA/issues/ANKA-98) / [ANKA-126](/ANKA/issues/ANKA-126)).
> The shared root checkout is **not safe** for multi-file edits. Do not
> argue with this rule — branch flaps are non-recoverable.

You **MUST** use a per-issue worktree for any change that touches more
than one file, or that takes more than one Bash tool turn to complete.
A `PreToolUse` hook in `.claude/settings.json` will block your second
modifying tool call (`Edit` / `Write` / `MultiEdit` / mutating `Bash`)
in the shared root during a Paperclip heartbeat — it is not advisory.

The canonical recipe (use the helper, do not hand-roll `git worktree`
commands):

1. **Start.** From the shared root:

   ```sh
   scripts/paperclip-worktree.sh start <issueId> [<base-ref>]
   # e.g. scripts/paperclip-worktree.sh start ANKA-241 origin/main
   ```

   Defaults `<base-ref>` to `origin/main`. Prints the absolute path of
   the resulting worktree at `.paperclip/worktrees/<issueId>`.
2. **Work in the worktree.** All edits, `bun` commands, commits, and
   pushes happen inside `.paperclip/worktrees/<issueId>`. Use absolute
   paths so you don't accidentally touch the shared root.
3. **Finish.** When the feature branch is merged (or pushed for PR
   review):

   ```sh
   scripts/paperclip-worktree.sh finish <issueId>
   ```

   Fast-forward-merges into the current shared-root branch when safe,
   then removes the worktree.
4. **Cleanup.** Stale worktrees from `done`/`cancelled` issues:

   ```sh
   scripts/paperclip-worktree.sh cleanup
   ```

5. **Exception (one-shot only).** Single-line / single-file fixes that
   complete in one Bash turn (typo, CHANGELOG timestamp,
   `.dev/journal.md` append) may run in the shared root. The hook lets
   the **first** modifying tool call through; the second will block.
   Anything more than that uses a worktree.

### Hook opt-out (board user only)

The hook honours `ANKA_ALLOW_ROOT_MULTIFILE=1` so the human board user
can still hand-edit the shared root without fighting the guard.
**Agents must not set this env var.** If you find yourself wanting to
opt out, that is a signal you should be in a worktree instead.

`.paperclip/worktrees/` is gitignored. It is **not** the same as the
out-of-repo Paperclip instance directory at `~/.paperclip/`; this is a
local-only working tree directory inside the company repo.

Remove this section, the hook, and the helper script once
[ANKA-98](/ANKA/issues/ANKA-98) ships and the `claude_local` adapter
creates per-issue worktrees automatically.

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

## PR merge protocol ([ANKA-132](/ANKA/issues/ANKA-132))

Repo: `ewildee/ankit-prop-trading-agent`. Two failure modes are known
on the GitHub merge path. ADR-0006 retired public CI, so there is no
GitHub-side footer validation path for this repo. Until a future
CEO-approved server-side guard supersedes ADR-0006, the repo-local
convention is mandatory.

### 1. Strategy: rebase only — no `--squash`, no `--merge`, no UI buttons

The canonical Paperclip footer is exactly
`Co-Authored-By: Paperclip <noreply@paperclip.ing>` (the local
`.githooks/commit-msg` hook only accepts this casing). The local
hook does **not** fire on any GitHub-side synthetic commit, so any
strategy that asks GitHub to author a new commit body server-side
will land on `main` undetected.

Two server-side failure modes are confirmed against this repo's
current settings (`gh api repos/ewildee/ankit-prop-trading-agent`):

- **Squash** (`merge_commit` analogue: `squash_merge_commit_message`
  = `COMMIT_MESSAGES`, `squash_merge_commit_title` =
  `COMMIT_OR_PR_TITLE`). GitHub's squash-merge synthesises the merge
  commit body server-side and auto-injects co-author lines as
  `Co-authored-by:` (lowercase). Commit `31012ff` (merge of PR #2,
  [ANKA-126](/ANKA/issues/ANKA-126)) is the recorded incident.
- **Merge commit** (`merge_commit_title` = `MERGE_MESSAGE`,
  `merge_commit_message` = `PR_TITLE`). The synthetic merge commit's
  body is **just the PR title** — the PR description is not even
  included, so the canonical footer cannot ride along regardless of
  what is in the PR body. (`PR_BODY` is a separate option that this
  repo does not currently set; even with `PR_BODY` the footer would
  depend on PR-body discipline rather than commit-msg-hook
  enforcement.) Documented at
  <https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-merging-for-pull-requests>.

The only safe strategy on this repo is therefore:

- `gh pr merge <N> --rebase --match-head-commit <sha>` — fast-forwards
  or replays the PR's per-commit messages exactly, including the
  canonical footer that the local `commit-msg` hook already enforced
  at author time. No GitHub-side commit body is synthesised.

Forbidden until a future CEO-approved server-side footer guard exists:

- `gh pr merge --squash` and the GitHub UI "Squash and merge" button.
- `gh pr merge --merge` and the GitHub UI "Create a merge commit"
  button.

If the PR's stated strategy in its description is `--squash` or
`--merge`, override it to `--rebase` and note the override in the
issue thread. Both `--squash` and `--merge` become available again
only after a fresh ADR supersedes ADR-0006 with an equivalent
server-side footer validation path.

### 2. Fallback: `gh` CLI when the GitHub App returns 403

The default agent merge path (MCP `_merge_pull_request` / GitHub App)
returns `403 Resource not accessible by integration` because the App
installation lacks `Pull requests: write` on this repo.

Until the App permissions are widened, use `gh` (authed as the
operator with admin) as the canonical merge path:

1. Verify the head: `gh pr view <N> --json headRefOid,mergeable,mergeStateStatus,state`.
2. Confirm it matches the QA-reviewed SHA recorded on the issue.
3. Merge with the allowed strategy above (`--rebase --match-head-commit <sha>` only — never `--squash` or `--merge` until a fresh ADR supersedes ADR-0006 with an equivalent server-side footer-validation path).
4. Record the merge commit SHA on the corresponding Paperclip issue.

Do not retry the MCP merge tool on 403 — fall through to `gh`
immediately. If `gh` is also unavailable in the agent's environment,
escalate to the board via comment.

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

## Close-message handoff convention (mandatory)

When a comment names the next-action owner — typically on `done`,
`in_review`, or `blocked` transitions, and on any "Next-action owner",
"Next steps", or "Hand off" line — the comment author MUST mention them
as a **structured Paperclip mention**, so the named agent is woken via
`issue_comment_mentioned`:

```
[@AgentName](agent://<agent-id>): brief description of what they need to do.
```

Plain-text owner labels like `FoundingEngineer:` — and even pretty-link
forms like `[FoundingEngineer](/ANKA/agents/foundingengineer):` — do
**not** trigger a wake. Only the `agent://<agent-id>` form does.
Without the wake, the next owner only learns about the handoff when a
human notices, which stalls the queue (concrete incident: PR #14 /
[ANKA-164](/ANKA/issues/ANKA-164) sat unattended after
[ANKA-175](/ANKA/issues/ANKA-175) was closed; see
[ANKA-215](/ANKA/issues/ANKA-215)).

This rule applies even when the issue is also reassigned via
`assigneeAgentId` — the structured mention in the comment body is still
required so any human reading the thread sees the handoff and the named
agent gets a wake.

### Engineering-org agent IDs

| Agent | Mention form |
|---|---|
| CEO | `[@CEO](agent://45fe8cec-dfcd-4894-acfd-8cd83df7840b)` |
| FoundingEngineer | `[@FoundingEngineer](agent://4b1d307d-5e9b-4547-92a2-b5df512f5d80)` |
| CodexExecutor | `[@CodexExecutor](agent://5e6c5e8b-a3bd-4e68-9410-c83e41e5eefc)` |
| Architect | `[@Architect](agent://2a33d7f6-fd36-4c79-b734-c7d71c54c71f)` |
| Debugger | `[@Debugger](agent://81a5f768-edb4-4cb2-8904-a4e3cc895115)` |
| QAEngineer | `[@QAEngineer](agent://a278882b-4134-49a7-a0af-e3435b7ba177)` |
| CodeReviewer | `[@CodeReviewer](agent://f507e293-b332-4f11-aa43-31e41c9a6592)` |
| SecurityReviewer | `[@SecurityReviewer](agent://dac68e89-ff6c-4837-ae7b-ffe9ed1396c2)` |
| Designer | `[@Designer](agent://0865eef7-e1cc-432a-b828-39ac3def68a9)` |
| DocumentSpecialist | `[@DocumentSpecialist](agent://765d6ec3-c276-429f-834d-c86db2900274)` |
| Scientist | `[@Scientist](agent://7ee4400f-9202-45f3-b472-7bc3abb7c19f)` |
| Planner | `[@Planner](agent://4ce5680a-9651-4fd7-a271-bfd19088c852)` |
| BlueprintAuditor | `[@BlueprintAuditor](agent://194e3a28-9356-4ec2-8eaa-43514fac4038)` |

If a target agent is missing from this table, resolve their id via
`GET /api/companies/{companyId}/agents` (or the inbox response) before
posting the comment — do not fall back to plain text.

## Reuse note

Newly-spawned coder/QA agents in adjacent Paperclip companies can
inherit this contract — see `paperclip-create-agent` skill templates
(`AGENTS.md` for `Coder`, `QA`).
