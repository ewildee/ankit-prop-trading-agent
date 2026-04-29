# Decisions (ADRs)

_Append-only, newest first. Each ADR captures: context, decision, alternatives, consequences._

## ADR-0004 — Enforce Paperclip co-author trailers on GitHub PR and merge paths

- **Date:** 2026-04-29 05:16 Europe/Amsterdam
- **Status:** Accepted
- **Context:** [ANKA-137](/ANKA/issues/ANKA-137) follows [ANKA-127](/ANKA/issues/ANKA-127) and [ANKA-132](/ANKA/issues/ANKA-132). The repo-local `.githooks/commit-msg` hook enforces `Co-Authored-By: Paperclip <noreply@paperclip.ing>` for local agent commits, but GitHub PR merge, squash, rebase, merge queue, and web-authored paths do not run local hooks. Commit `31012ff` landed on `origin/main` with `Co-authored-by: Paperclip <noreply@paperclip.ing>`, proving that local enforcement is insufficient.
- **Decision:** Add a GitHub Actions workflow that checks every commit in the event-specific PR, `main` push, or `merge_group` range for the exact canonical Paperclip trailer before the change is accepted server-side.
- **Alternatives considered:**
  - _Rely only on the local hook._ Rejected — it already failed to cover the GitHub merge path.
  - _Rewrite the offending commit._ Rejected for the same reason as ADR-0003: history rewrite is a one-way-door action and would not prevent recurrence.
  - _Use a Node/Bun action or package._ Rejected — bash + git are sufficient, and this guard should not widen the dependency surface.
- **Consequences:** Future GitHub-merged commits fail closed when the Paperclip trailer is missing or has non-canonical casing. The workflow becomes part of the org's merge gate, so the checker stays deliberately small and has pure-bash regression tests for the known acceptance cases.

## ADR-0003 — Do not rewrite `main` to backfill missing Paperclip co-author footer

- **Date:** 2026-04-28 17:08 Europe/Amsterdam
- **Status:** Accepted
- **Context:** [ANKA-101](/ANKA/issues/ANKA-101) (escalated from the [ANKA-99](/ANKA/issues/ANKA-99) 12-hour critical review) flagged commit `c2b02e3` (`chore(infra:tooling): gitignore .envrc for direnv-loaded paperclip env`) on `main` as carrying only `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` and missing the AGENTS.md / BLUEPRINT §0.2 required `Co-Authored-By: Paperclip <noreply@paperclip.ing>` footer. Six commits sit on top of `c2b02e3` on `origin/main` and the offending commit only changes `.gitignore`. Rewriting history would require `git rebase + git push --force-with-lease origin main`, which AGENTS.md classifies as a one-way-door action and which would invalidate any branch already based on those six commits (including the `temp-rebuild-anka-78-79` and QA worktrees referenced in recent journal entries).
- **Decision:** Do not rewrite `main` history. Document `c2b02e3` as a logged exception, keep the commit as-is, and prevent recurrence by adding a repo-local `commit-msg` hook that fails any commit whose message lacks the Paperclip co-author footer. Any corrective commit produced as part of resolving [ANKA-101](/ANKA/issues/ANKA-101) (this ADR, the journal entry, the CHANGELOG note, the future hook itself) carries both the Claude and the Paperclip footers.
- **Alternatives considered:**
  - _Interactive rebase + force-push `main` to amend the missing footer._ Rejected — destructive, requires CEO approval per AGENTS.md, would break six downstream commit hashes and any worktree/branch built on them, and the only thing being fixed is metadata on a 1-line `.gitignore` change. Cost-benefit is clearly negative.
  - _Add a follow-up empty commit referencing `c2b02e3` with both footers._ Rejected — adds noise to `main` without enforcing the rule. The exception log + hook combination is stronger and self-documenting.
  - _Only document, no hook._ Rejected — the violation already happened once; AGENTS.md / BLUEPRINT §0.2 must be machine-enforced, not relied on as a memory rule for a stateless agent.
- **Consequences:** `main` history stays stable for collaborators and worktrees. `c2b02e3` becomes a known logged exception in this ADR and in `.dev/journal.md`. The follow-up `commit-msg` hook (delegated to CodexExecutor in a child issue of [ANKA-101](/ANKA/issues/ANKA-101)) makes future violations a fail-closed pre-commit error rather than a post-hoc operational finding.

## ADR-0001 — Phase 0 scaffold scope

- **Date:** 2026-04-27 18:16 Europe/Amsterdam
- **Status:** Accepted
- **Context:** ANKA-2 asked for "scaffold the umbrella monorepo". Tempting to also stub real package code (supervisor wiring, contracts schemas) so later phases start hot. BLUEPRINT §22 explicitly sequences phases 0 → 1 → 2 → … and the §24 pre-launch checklist treats each phase exit as a separate gate.
- **Decision:** Phase 0 ships **only** the skeleton: workspace plumbing, lint/typecheck/test scripts, .dev/ + CHANGELOG/TODOS, placeholder package.json files, and a green CI gate. No business code.
- **Alternatives considered:**
  - _Stub real supervisor signatures now._ Rejected — couples Phase 0 exit gate to Phase 1 design choices that aren't yet locked.
  - _Skip placeholder packages._ Rejected — `bun install` then needs custom workspace globbing tricks; placeholders are 4 lines each.
- **Consequences:** Phase 0 exit gate (`bun install && bun run lint && bun run typecheck && bun test` clean) is small and repeatable. Each subsequent phase owns its own bump + CHANGELOG entry without inheriting half-built abstractions.

## ADR-0002 — Bun-native first; npm only when Bun does not ship it

- **Date:** 2026-04-27 18:16 Europe/Amsterdam
- **Status:** Accepted (restates BLUEPRINT §5.1/§5.3 as a project-local ADR)
- **Context:** BLUEPRINT §5 freezes the dependency surface. The "forbidden" list (`ws`, `node-cron`, `better-sqlite3`, `js-yaml`, `globby`, `fast-glob`, `dotenv`) collides with common npm reflexes.
- **Decision:** Default to Bun built-ins (`Bun.serve`, `Bun.connect`, `bun:sqlite`, `Bun.cron`, `Bun.Glob`, `Bun.spawn`, `Bun.password`, `bun test`, Bun shell). Add an npm package only when `https://bun.com/llms.txt` confirms Bun does not ship the capability and the package is on the §5.2 pinned list.
- **Consequences:** Smaller dependency surface, faster cold-start, fewer supply-chain surfaces. Cost: agent must re-fetch llms.txt at each session start (recorded in `.dev/progress.md`).
