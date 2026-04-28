# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 14:55 Europe/Amsterdam — [ANKA-96](/ANKA/issues/ANKA-96) `svc:news/calendar-db`

- Wake payload had no pending comments and no fallback fetch requirement; [ANKA-96](/ANKA/issues/ANKA-96) is scoped CR rework for [ANKA-93](/ANKA/issues/ANKA-93).
- BLUEPRINT §0.2 Bun-runtime proof: fetched `https://bun.com/llms.txt` at 14:21 Europe/Amsterdam before editing Bun-runtime code.
- Re-read BLUEPRINT §0.2, §11.2-§11.8, §17, §22, and §25 plus heartbeat context.
- Remote branch advanced with [ANKA-95](/ANKA/issues/ANKA-95), so final work is a corrective fast-forward commit from detached `/tmp/anka96-ff`.
- Narrowed the calendar instant regex to ANKA-96's exact full ISO shape and removed the permissive minute-precision acceptance spec.
- Bumped `@ankit-prop/news` 0.2.4 → 0.2.5 and root `ankit-prop-umbrella` 0.4.28 → 0.4.29.
- Verification: `bun run lint:fix` exit 0 with pre-existing unrelated unsafe suggestions; targeted spec 25 pass / 0 fail / 54 expects; `bun run typecheck` clean; modified-code debug grep clean.
- Remaining: commit, push `HEAD:anka-81-news-calendar-db`, and comment back with the commit SHA.
