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

The only safe strategy on this repo is therefore a **local
fast-forward push** — never a GitHub-side merge button, never
`gh pr merge`. After CodeReviewer + QAEngineer APPROVE on the
PR's QA-reviewed head SHA `<sha>`:

```sh
git fetch origin
git checkout main && git pull --ff-only origin main
BASE=$(git rev-parse HEAD)            # captured for the §2 post-merge audit below.
git fetch origin pull/<N>/head:pr-<N>
[ "$(git rev-parse pr-<N>)" = "<sha>" ] || { echo "head moved"; exit 1; }

# Mandatory pre-merge range audit (ADR-0009): every commit in
# $BASE..pr-<N> must pass the §2 hard fails before the FF push lands
# it on `main`. A clean PR-head SHA alone is NOT sufficient — `git
# merge --ff-only pr-<N>` lands the entire range, so an earlier
# commit with two parents, committer "GitHub <noreply@github.com>",
# or a missing canonical Paperclip footer would slip in even if the
# head commit is clean.
for c in $(git rev-list --reverse "$BASE..pr-<N>"); do
  parents=$(git rev-list --parents -n 1 "$c" | awk '{print NF-1}')
  author=$(git show --no-patch --format='%an <%ae>' "$c")
  committer=$(git show --no-patch --format='%cn <%ce>' "$c")
  has_footer=$(git log -n 1 --format=%B "$c" \
    | grep -cF 'Co-Authored-By: Paperclip <noreply@paperclip.ing>' || true)
  [ "$parents" = "1" ] \
    && [ "$committer" = "$author" ] \
    && [ "$committer" != "GitHub <noreply@github.com>" ] \
    && [ "$has_footer" -ge 1 ] \
    || { echo "PRE-MERGE AUDIT FAIL on $c (parents=$parents committer=$committer author=$author footer=$has_footer)"; exit 1; }
done

git merge --ff-only pr-<N>
git push origin main
git branch -D pr-<N>
```

Every commit landing on `main` keeps committer = author, so the
local `.githooks/commit-msg` Paperclip-footer guard at author time
is the only commit body that ever lands. No GitHub-side rebase or
synthetic merge body is involved.

If the PR head is not fast-forwardable from current `main`, the
author rebases the PR branch **locally** and re-pushes the PR head;
we never land a server-side rebase. Re-run CodeReviewer +
QAEngineer on the rebased head before re-attempting the FF push.

Forbidden until a future CEO-approved server-side footer + committer
identity guard exists:

- `gh pr merge --squash` and the GitHub UI "Squash and merge" button.
- `gh pr merge --merge` and the GitHub UI "Create a merge commit"
  button.
- `gh pr merge --rebase` and the GitHub UI "Rebase and merge" button
  — GitHub-side rebase rewrites committer to
  `GitHub <noreply@github.com>`, which fails the §2 audit's
  committer-identity check (ADR-0009).

If the PR's stated strategy in its description is any GitHub-side
merge mode, override it to the local fast-forward path above and
note the override in the issue thread. Server-side merge modes
become available again only after a fresh ADR supersedes ADR-0006
with an equivalent server-side footer + committer-identity
validation path.

### 2. Post-merge audit (mandatory, ADR-0007)

PR [#13](https://github.com/ewildee/ankit-prop-trading-agent/pull/13)
landed on `main` as `dbe4d31` via the GitHub-side "Squash and merge"
button despite this protocol forbidding it. The defect was metadata
only — the diff was correct — but the audit trail was wrong: single
parent, `committer GitHub <noreply@github.com>`, missing canonical
Paperclip footer. ADR-0007 logs `dbe4d31` as an exception (no `main`
rewrite) and adds this audit step so a future bypass is caught at
merge time, not weeks later.

After every merge to `main`, the merging agent runs the audit locally
over the **entire landed range** (every commit the FF push put on
`main`, not only the new tip) and pastes the output into the
Paperclip issue thread before closing. `$BASE` is the SHA captured by
the §1 block immediately before the FF push:

```sh
git fetch origin
RANGE="$BASE..origin/main"            # every commit landed by this FF push, oldest first.
git rev-list --reverse "$RANGE" | while read c; do
  echo "=== $c ==="
  git rev-list --parents -n 1 "$c"      # HARD FAIL: must have exactly ONE parent. A two-parent merge commit indicates the GitHub-side "Create a merge commit" path, forbidden under ADR-0007 / ADR-0009.
  git show --no-patch --pretty=fuller "$c"   # HARD FAIL (ADR-0009): committer must equal author and MUST NOT be "GitHub <noreply@github.com>". The GitHub-side rebase / squash / merge buttons all rewrite committer to "GitHub <noreply@github.com>"; only the local fast-forward push path defined in §1 preserves committer identity.
  git log -n 1 --format=%B "$c" | grep -F 'Co-Authored-By: Paperclip <noreply@paperclip.ing>'   # HARD FAIL: canonical Paperclip footer must match exactly (the local .githooks/commit-msg hook enforces this at author time; absence indicates a server-side synthesised commit body).
done
```

Auditing only the head SHA is insufficient: `git merge --ff-only
pr-<N>` lands every commit in `$BASE..pr-<N>`, so a clean head with a
dirty earlier commit in the range still ships a §2-violating shape on
`main`. The §1 pre-merge range audit and this post-merge range audit
are paired: the pre-merge audit fails closed before push, and the
post-merge audit's pasted output is the durable evidence that every
landed commit passed.

Failure on any line means the merge bypassed the local fast-forward
path or the pre-merge range audit was skipped. Open a remediation
issue immediately (template: [ANKA-268](/ANKA/issues/ANKA-268) /
[ANKA-302](/ANKA/issues/ANKA-302)) and route to FoundingEngineer; do
**not** force-push `main` without a fresh CEO-approved ADR.

### 3. PR inspection with `gh`; merge is always local FF

The default agent merge path (MCP `_merge_pull_request` / GitHub App)
returns `403 Resource not accessible by integration` because the App
installation lacks `Pull requests: write` on this repo. Under ADR-0009
this is moot: no GitHub-side merge path is permitted on this repo
regardless of App permissions, and the canonical merge path is the
local fast-forward push block in §1.

Use `gh` (authed as the operator) only to inspect PR state before
running the §1 block:

1. Verify the head: `gh pr view <N> --json headRefOid,mergeable,mergeStateStatus,state`.
2. Confirm it matches the QA-reviewed SHA recorded on the issue.
3. Run the §1 local fast-forward push block against `<sha>`. Do not
   use `gh pr merge` in any mode (`--rebase` / `--squash` / `--merge`
   are all forbidden under ADR-0007 / ADR-0009).
4. Run the §2 audit against the landed SHA and paste the output into
   the Paperclip issue thread before closing.

If `gh` is unavailable, the head SHA can be obtained directly via
`git fetch origin pull/<N>/head:pr-<N> && git rev-parse pr-<N>` and
matched against the QA-reviewed SHA recorded on the issue.

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
