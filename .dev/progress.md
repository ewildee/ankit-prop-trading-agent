# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 09:38 Europe/Amsterdam — [ANKA-65](/ANKA/issues/ANKA-65) BLUEPRINT §9/§10.4a/§22 rail-7 malformed-fill patches + 0.4.17 forward-fix

- Applied verbatim patches from `DOC-BUG-FIXES.md` ([ANKA-64](/ANKA/issues/ANKA-64) BlueprintAuditor audit) to `BLUEPRINT.md` §9 row (line 1074), §10.4a flow (lines 1166-1170), §22 Phase 2 deliverables (line 2620). All three sites now enumerate the three rail-7 fail-closed branches matching production code at `services/ctrader-gateway/src/hard-rails/rail-7-slippage-guard.ts:21-59`.
- Bumped root `ankit-prop-umbrella` 0.4.16 → 0.4.17 (docs-only, behaviour-affecting per BLUEPRINT §0.2). CHANGELOG 0.4.17 entry explicitly retires the false claim from the 0.4.15 entry / commit `c6c2247` body paragraph 4. Removed [ANKA-64](/ANKA/issues/ANKA-64) entry from `DOC-BUG-FIXES.md`.
- Verification: `bun run typecheck` clean, `bun run lint:fix` clean. Diff confined to `BLUEPRINT.md`, `CHANGELOG.md`, `package.json`, `.dev/journal.md`, `.dev/progress.md`, `DOC-BUG-FIXES.md`.
- Sibling-agent uncommitted edits to `packages/eval-harness/src/ftmo-rules.spec.ts` and `…/prague-day.spec.ts` left for owner per "no leakage" discipline.
- Next: commit + push, reassign [ANKA-65](/ANKA/issues/ANKA-65) to BlueprintAuditor for verification against HEAD and [ANKA-64](/ANKA/issues/ANKA-64) closure.
