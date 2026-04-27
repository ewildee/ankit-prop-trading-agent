# Decisions (ADRs)

_Append-only, newest first. Each ADR captures: context, decision, alternatives, consequences._

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
