# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 17:08 Europe/Amsterdam — [ANKA-101](/ANKA/issues/ANKA-101) Paperclip co-author footer backfill on `c2b02e3`

- Wake reason: direct assignment from [ANKA-99](/ANKA/issues/ANKA-99) 12-hour review escalation. `c2b02e3` on `main` carries only the Claude footer; missing the BLUEPRINT §0.2 / AGENTS.md required `Co-Authored-By: Paperclip <noreply@paperclip.ing>` line.
- Verified `git show --stat c2b02e3`: 1-file 1-insertion `.gitignore` change. `git rev-list --count c2b02e3..HEAD` = 6. Rewriting `main` would force-push and invalidate six downstream hashes — blast radius far exceeds the metadata fix.
- Decision (ADR-0003 in `.dev/decisions.md`): keep `main` history; log `c2b02e3` as a one-off documented exception; enforce future commits via a repo-local `commit-msg` hook (current `core.hooksPath` unset, only sample hooks installed).
- Updated `.dev/decisions.md` (ADR-0003), `.dev/journal.md` (newest-first entry), this `progress.md`, and `CHANGELOG.md` (Governance entry, no version bump). All in this docs-only heartbeat.
- Next: open a CodexExecutor child issue under [ANKA-101](/ANKA/issues/ANKA-101) for the `commit-msg` footer-enforcement hook. Then comment on ANKA-101 with the FE decision and close. The corrective commit for this heartbeat carries both Claude and Paperclip footers.
