# Treaty Client

Elysia for serving, Eden/Treaty for consuming.

This module is the workspace HTTP foundation from BLUEPRINT §11.4 / §19:

- `createTreatyClient<App>(baseUrl)` is a thin wrapper over Eden/Treaty's `treaty<App>(baseUrl)`.
- `SERVICES` is a static local-default catalog for the §19 service ports and `/health` paths.
- `assertExportsTreaty(source)` checks service `index.ts` source text for a type-only `App` export convention.

The helper intentionally does not own retries, timeouts, auth, observability, config loading, or service orchestration. Those choices stay with the caller or with later service-specific tickets.

Treaty `App` exports are type-only. TypeScript erases them at runtime, so service migration tickets should re-export them with:

```ts
export type { App } from './app.ts';
```
