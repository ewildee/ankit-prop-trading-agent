# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 10:02 Europe/Amsterdam — [ANKA-66](/ANKA/issues/ANKA-66) daily QA sweep + FTMO pre-news property coverage

- Read BLUEPRINT §0.2, §8, §9, §13.5, §14.3, §22 and fetched `https://bun.com/llms.txt` at 10:00 Europe/Amsterdam before writing Bun test code.
- Audited gateway hard-rail matrix: `services/ctrader-gateway/src/hard-rails/matrix.spec.ts` still has 28 cases (14 rails × breach/permit) and passed with the eval FTMO property baseline.
- Added `packages/eval-harness/src/ftmo-rules.props.spec.ts` seeded invariant for the 2-h pre-news kill-switch: high-impact OR restricted events create a window and opening inside it records `news_blackout_open` / `pre_news_2h`.
- Regression proof: temporarily narrowed `buildPreNewsWindows` to restricted-only; focused pre-news invariant failed at high-impact unrestricted trial 2, then passed after restore.
- Verification: `bun run lint:fix` exit 0 (pre-existing unsafe suggestions only), `bun test` 261 pass / 0 fail / 1839 expects, `bun run typecheck` clean.
- Bumped `@ankit-prop/eval-harness` 0.1.2 → 0.1.3 and root 0.4.17 → 0.4.18; CHANGELOG 0.4.18 added. Sibling WIP in `ftmo-rules.spec.ts` / `prague-day.spec.ts` left unstaged. No service restart required.
