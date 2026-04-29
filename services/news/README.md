# News Service

The news service owns the FTMO economic-calendar fetcher, SQLite-backed
calendar store, freshness monitor, and Elysia `/calendar/*` endpoints.

## Test Gates

Run the focused Wave-2 gate locally with:

```sh
bun test services/news/test/integration services/news/test/contract packages/shared-contracts/src/news.spec.ts
```

Run the workspace coverage gate with:

```sh
bun test --coverage
```

The root `bunfig.toml` keeps coverage scoped to `services/news/**` plus
`packages/shared-contracts/src/news.ts` by ignoring unrelated workspaces,
and rejects coverage below 90% line / statement or 85% function coverage.
Bun 1.3 exposes line, statement, and function thresholds natively; it does
not expose a separate branch-threshold key, so the 85% branch gate is pinned
to the closest native executable-decision signal until Bun adds branch
thresholds.

The Prague DST integration intentionally honors the explicit offset in FTMO
payload dates. A spring-forward payload such as `2026-03-29T02:30:00+01:00`
is stored and evaluated at the real UTC instant `2026-03-29T01:30:00.000Z`;
the service does not reinterpret the wall time through host-local timezone
rules.
