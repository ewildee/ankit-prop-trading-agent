# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 18:17 Europe/Amsterdam — [ANKA-82](/ANKA/issues/ANKA-82) news fetcher

- Wake reason: `issue_blockers_resolved`; blocker [ANKA-78](/ANKA/issues/ANKA-78) is done, so fetcher work resumed.
- Re-read BLUEPRINT §0, §0.1, §0.2, §5, §11.1-§11.8, §17, §22, §25 before editing.
- Fetched `https://bun.com/llms.txt` at 18:06 Europe/Amsterdam before Bun runtime work.
- Current branch: `anka-82-news-fetcher`, stacked on `origin/anka-78-79-81-rebuild` because `main` lacks the contracts/news and calendar-db dependencies.
- Implemented `services/news/src/fetcher.ts` + spec coverage for cassette validation, retry backoff, schema mismatch, and one-shot unhealthy alerts.
- Bumped root 0.4.27 → 0.4.28, `@ankit-prop/news` 0.2.3 → 0.3.0, `@ankit-prop/eval-harness` 0.1.3 → 0.1.4, and `@ankit-prop/contracts` 0.4.0 → 0.4.1.
- Verification: `bun run lint:fix` exit 0 with pre-existing unrelated unsafe suggestions; targeted specs 12 pass / 0 fail / 39 expects; `bun run typecheck` clean; debug grep clean.
- Next: commit with Paperclip footer, push `origin/anka-82-news-fetcher`, update [ANKA-82](/ANKA/issues/ANKA-82).
