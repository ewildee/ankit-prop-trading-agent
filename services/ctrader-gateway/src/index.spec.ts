import { describe, expect, test } from 'bun:test';
import { assertExportsTreaty } from '@ankit-prop/contracts';

describe('ctrader-gateway public surface', () => {
  test('exports a type-only Treaty App type', async () => {
    const sourceText = await Bun.file(new URL('./index.ts', import.meta.url)).text();
    expect(() =>
      assertExportsTreaty({
        modulePath: 'services/ctrader-gateway/src/index.ts',
        sourceText,
      }),
    ).not.toThrow();
  });
});
