# Decisions (ADRs)

_Append-only, newest first. Each ADR captures: context, decision, alternatives, consequences._

## ADR-0006 — No public CI

- **Date:** 2026-04-29 13:18 Europe/Amsterdam
- **Status:** Accepted (supersedes ADR-0004)
- **Context:** CEO directive on [ANKA-147](/ANKA/issues/ANKA-147) comment `4d83598b` retired public CI for this repo. The package graph is intentionally private: `npm-registry-mirror.triplon.io` and `npm-registry.triplon.io` are internal Triplon hosts, are not sustainable public-runner dependencies, and the project does not plan to publish packages publicly. ADR-0004's GitHub Actions re-enable path is therefore dead; keeping the disabled workflow file would imply public CI remains a dormant option.
- **Decision:** Do not use GitHub Actions, third-party hosted CI, or automated public-runner pipelines for this repo. Delete the inert `.github/workflows/ci.yml.disabled` file instead of preserving a one-line re-enable path. The verification gate is BLUEPRINT §0.2 local checks (`bun run lint`, `bun run typecheck`, `bun test`) run by the appropriate agent for the change and pasted into the issue thread before sign-off. The repo-local `.githooks/commit-msg` Paperclip-footer guard stays in place; it is a local hook, not public CI.
- **Alternatives considered:**
  - _Keep ADR-0004 dormant._ Rejected because a disabled workflow file and accepted re-enable ADR imply public CI remains a future option, contrary to CEO policy.
  - _Use a self-hosted runner inside the Triplon network._ Rejected for the current phase because it adds operational surface for no current benefit. Reintroducing any automated runner requires a fresh ADR that supersedes this one.
- **Consequences:** §0.2 local-check evidence is the only automated gate before merge. CodexExecutor, CodeReviewer, QAEngineer, and FoundingEngineer sign-offs must include actual command output for their role's check. Any future proposal to reintroduce public CI must explicitly supersede ADR-0006 and address the private-registry and credential-surface constraints.

## ADR-0005 — Adopt Elysia + Eden/Treaty as the workspace HTTP foundation

- **Date:** 2026-04-29 07:43 Europe/Amsterdam
- **Status:** Accepted (implemented by [ANKA-131](/ANKA/issues/ANKA-131))
- **Context:** CEO Q-A on [ANKA-75](/ANKA/issues/ANKA-75) selected Elysia as the workspace HTTP framework and Eden/Treaty as the typed client. BLUEPRINT §3.3 and §19 expect local HTTP/SSE via Elysia and shared schemas/contracts through `packages/shared-contracts`. [ANKA-134](/ANKA/issues/ANKA-134) pinned `elysia@1.4.28` and `@elysiajs/eden@1.4.9`; [ANKA-135](/ANKA/issues/ANKA-135) constrained the shape to a thin Treaty helper plus static local service catalog; [ANKA-136](/ANKA/issues/ANKA-136) conditionally approved the supply-chain risk for exact pins only.
- **Decision:** Add the exact approved root dependencies and introduce `pkg:contracts/treaty-client` with `createTreatyClient<App>(baseUrl)` as a direct wrapper over Eden/Treaty's `treaty<App>(baseUrl)`, a static BLUEPRINT §19 `SERVICES` catalog, and a source-convention `assertExportsTreaty(source)` guard for type-only service `App` exports. Keep runtime concerns (timeouts, retries, auth, observability, config-derived URLs, service orchestration) out of the shared helper.
- **Alternatives considered:**
  - _Use current-docs `@elysia/eden@1.4.10` instead of `@elysiajs/eden@1.4.9`._ Rejected for this issue: the DocumentSpecialist and SecurityReviewer approvals were explicitly for `@elysiajs/eden@1.4.9`; changing package names would require a fresh security pass or CTO scope change.
  - _Build a richer service client layer with retries/timeouts/config loading._ Rejected per [ANKA-135](/ANKA/issues/ANKA-135); generic retry/normalization would blur fail-closed ownership for gateway rails and turn `pkg:contracts` into orchestration infrastructure.
  - _Runtime-assert a service module exports `App`._ Rejected because `export type { App }` is erased by TypeScript. The guard checks source convention and service migrations must still rely on `tsc` for type-level validation.
- **Consequences:** Services get a shared Treaty client entry point and canonical local defaults without a service migration in this ticket. Future service migrations can re-export type-only `App` and call `createTreatyClient<App>(resolvedBaseUrl)`. Any auth/cookie/CORS/upload/OpenAPI/order-path Elysia usage needs separate SecurityReviewer review.

## ADR-0004 — Re-enable the existing GitHub Actions lint/test/typecheck workflow as-is

- **Date:** 2026-04-29 05:12 Europe/Amsterdam
- **Status:** Superseded by ADR-0006 (2026-04-29)
- **Context:** Commit `70ceb6c` (`chore(infra:ci): ANKA-107 disable github actions workflow`) renamed `.github/workflows/ci.yml` → `.github/workflows/ci.yml.disabled`. GitHub Actions only schedules `*.yml`/`*.yaml`, so `origin/main` has had **no active CI gate** for lint, typecheck, or `bun test` since 2026-04-28 17:37 Europe/Amsterdam. The original ANKA-107 rationale was "local agent commands per BLUEPRINT §0.2 (`bun run lint:fix` / `bun run typecheck` / `bun test`) remain the gating signal pre-production." [ANKA-127](/ANKA/issues/ANKA-127) (CodeReviewer 12-h critical review, 2026-04-28 23:08 Europe/Amsterdam) flagged this as a **major finding**: with multiple agents (FE, CodexExecutor, Debugger, QAEngineer) writing to a shared `main` and PR #1 already merged, the operator-only contract relies on per-heartbeat discipline that has empirically slipped at least once already (footer audit trail in [ANKA-101](/ANKA/issues/ANKA-101)). [ANKA-132](/ANKA/issues/ANKA-132) split the follow-up into the commit-footer guard ([ANKA-137](/ANKA/issues/ANKA-137)) and this CI re-enable ([ANKA-138](/ANKA/issues/ANKA-138)); they must not be bundled. The disabled workflow file (`.github/workflows/ci.yml.disabled`) is 30 lines: `actions/checkout@v4` → `oven-sh/setup-bun@v2` (`bun-version: 1.3.13`) → `bun install --frozen-lockfile` → `bun run lint` → `bun run typecheck` → `bun test`. It uses zero forbidden-list (§5.3) packages, adds no new npm dependency surface, and exactly mirrors the §0.2 local gate.
- **Decision:** Re-enable the workflow **as-is** by renaming `.github/workflows/ci.yml.disabled` → `.github/workflows/ci.yml`. No content changes. Triggers stay `push: [main]` and `pull_request:`. Implementation routes to [CodexExecutor](/ANKA/agents/codexexecutor) as a single-commit diff that (a) performs the rename, (b) adds the §22 cross-link in `BLUEPRINT.md` operational section pointing at this ADR and at [ANKA-138](/ANKA/issues/ANKA-138), (c) bumps root + appends CHANGELOG + journal under FE-curated wording, (d) opens a docs-only smoke-test PR against `main` to confirm the workflow runs ≤ 5 minutes on a clean `bun install --frozen-lockfile`, and (e) closes [ANKA-138](/ANKA/issues/ANKA-138) only after CodeReviewer signs the diff and the smoke-test PR's `lint + typecheck + test` job is green. Branch-protection rules that elevate this CI gate to "required" are out of scope per the issue (operator-owned, escalate to CEO if/when desired).
- **Alternatives considered:**
  - _Replace with a hand-rolled Bun-native runner / self-hosted setup._ Rejected — `ci.yml.disabled` is already the minimal Bun-only lane (no Node, no npm, no extra actions beyond checkout + setup-bun). Replacing it adds work for zero gain and widens the supply-chain surface.
  - _Fork into multiple jobs (lint / typecheck / test on a matrix of bun versions)._ Rejected — premature optimisation. Phase 0–6 single-job gating is sufficient; matrix expansion can be a separate `infra:ci` follow-up if and when a second runtime target is in scope.
  - _Keep CI off and codify the operator-only gating contract in `BLUEPRINT.md`._ Rejected — this is what `70ceb6c` effectively did, and [ANKA-127](/ANKA/issues/ANKA-127) showed it fails. Phase 4 (`svc:trader`) and the upcoming Phase 6 (`svc:dashboard`) raise the regression cost sharply: a missed `bun test` between heartbeats can ship a hard-rail or FTMO-rule semantic break onto `main`. Defence-in-depth (operator commands AND CI) is the project default for safety-critical paths (BLUEPRINT §0 / §9 fail-closed); CI is the cheaper of the two redundancies and must not be off.
  - _Re-enable behind a `workflow_dispatch`-only trigger so it only runs when an operator clicks._ Rejected — that re-creates the operator-only failure mode under a different name. The point of CI gating is automatic execution on every push and PR.
- **Consequences:**
  - PRs targeting `main` and pushes to `main` regain an automated lint + typecheck + `bun test` gate identical to the §0.2 local gate. CodeReviewer can rely on the green check before approving diffs instead of trusting agent self-reports.
  - GitHub-Actions minutes are spent on every push and PR. The repo is private and the workflow runs on a small monorepo with `bun install --frozen-lockfile`; expected wall-clock is well under the 5-minute budget the issue calls out. If observed runtime drifts above that, follow-up issue can carve out a Bun cache step.
  - The workflow does **not** become a hard "required check" until the operator updates branch-protection rules. Until then, CI failure is loud but non-blocking. ANKA-138's exit gate is "workflow active and green on a smoke-test PR"; gating-rule promotion is a separate operator-owned step.
  - The §0.2 operator-side gate stays the source of truth for local development; CI is the redundant safety net. Future agents must run both.
  - `BLUEPRINT.md` operational section now carries an explicit cross-link to this ADR + [ANKA-138](/ANKA/issues/ANKA-138), so any future "disable CI again" attempt has to go through this audit trail rather than landing as a quiet rename.

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
