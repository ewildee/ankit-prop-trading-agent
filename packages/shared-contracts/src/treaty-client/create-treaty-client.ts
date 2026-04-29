import { type Treaty, treaty } from '@elysiajs/eden';
import type { AnyElysia } from 'elysia';

export type TreatyClient<App extends AnyElysia> = Treaty.Create<App>;

/**
 * Elysia for serving, Eden/Treaty for consuming.
 *
 * Keep this as a thin typed-client helper. Timeouts, retries, auth, and
 * fail-closed response handling belong at service call sites.
 */
export function createTreatyClient<const App extends AnyElysia>(
  baseUrl: string,
): TreatyClient<App> {
  return treaty<App>(baseUrl);
}
