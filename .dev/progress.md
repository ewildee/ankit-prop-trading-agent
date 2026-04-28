# Progress

_Replace this section every session — keep ≤ 20 lines._

## 2026-04-28 13:15 Europe/Amsterdam — [ANKA-78](/ANKA/issues/ANKA-78) shared news calendar contracts

- BLUEPRINT §0.2 Bun-runtime proof: fetched `https://bun.com/llms.txt` at 13:14 Europe/Amsterdam (33,157 bytes) before editing Bun-runtime TypeScript.
- Re-read BLUEPRINT §0.2, §5.1–§5.3, §11.2, §17, and §25 before changing `pkg:contracts`.
- Implemented `packages/shared-contracts/src/news.ts` with calendar schemas from §11.2 plus issue-scoped `RestrictedReply` / `NextRestrictedReply`.
- Added `news.spec.ts` parse coverage for minimal item, unknown `eventType`, tier-1 routes, restricted replies, closed rule enum, next-restricted nullable item, and impact enum.
- Bumped `@ankit-prop/contracts` to v0.4.0 and root to v0.4.22; verification passed and no service restart is required.
