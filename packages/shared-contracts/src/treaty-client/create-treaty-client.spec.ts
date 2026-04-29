import { describe, expect, test } from 'bun:test';
import { Elysia } from 'elysia';
import { createTreatyClient } from './create-treaty-client.ts';

describe('createTreatyClient', () => {
  test('round-trips a toy Elysia app through app.handle', async () => {
    const app = new Elysia().get('/x', () => 'ok');
    type App = typeof app;

    const originalFetch = globalThis.fetch;
    const handledRequests: string[] = [];
    globalThis.fetch = ((input, init) => {
      const request = new Request(input, init);
      handledRequests.push(new URL(request.url).pathname);
      return app.handle(request);
    }) as typeof fetch;

    try {
      const client = createTreatyClient<App>('http://treaty-smoke.test');
      const result = await client.x.get();

      expect(result.status).toBe(200);
      expect(result.error).toBeNull();
      expect(result.data).toBe('ok');
      expect(handledRequests).toEqual(['/x']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
