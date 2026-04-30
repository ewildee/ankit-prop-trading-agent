# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-30 09:07 Europe/Amsterdam — [ANKA-325](/ANKA/issues/ANKA-325) apply DBF-005 — TODOS.md T020 historical-data fetch & provider interface umbrella

- Daily [ANKA-322](/ANKA/issues/ANKA-322) audit reconfirmed the DBF-002 incidental TODOS.md drift: Phase 0–7 layout silent on [ANKA-67](/ANKA/issues/ANKA-67) / [ANKA-68](/ANKA/issues/ANKA-68) / [ANKA-69](/ANKA/issues/ANKA-69). Broken out as DBF-005 → ANKA-325.
- Applied option (a): added `T020 — Historical-data fetch & provider interface umbrella` to `TODOS.md` Phase 3, citing all three parents and pointing at T019.{a,b,c} for in-flight regression history. Marked `[x]` (all three streams shipped). Option (b) rejected: T019 is `@ankit-prop/market-data`-scoped, ANKA-67/68 are `pkg:market-data-twelvedata`-scoped — different packages, separate row is honest.
- `DOC-BUG-FIXES.md`: annotated all three DBF-002 "Out-of-scope drift surfaced incidentally" bullets with their resolution path (DBF-003 / DBF-005). Added **Status: CLOSED** to DBF-005 citing ANKA-325.
- CHANGELOG: appended `0.4.49 — 09:07 Europe/Amsterdam` docs-only entry; same in-flight release window, no root version bump.
- Journal: appended newest-first entry covering the option-(a) choice, the annotate-vs-delete decision on the DBF-002 bullet, and the §31 review-gate matrix justification (docs-only, FE-owned ledger, no reviewer required).
- Next: commit on `ANKA-322-daily-blueprint-docs-drift-audit`, push to `origin` per BLUEPRINT §0.2, close [ANKA-325](/ANKA/issues/ANKA-325). DBF-002 / DBF-003 / DBF-004 remain queued under [ANKA-322](/ANKA/issues/ANKA-322) for BlueprintAuditor-reviewed closures.
