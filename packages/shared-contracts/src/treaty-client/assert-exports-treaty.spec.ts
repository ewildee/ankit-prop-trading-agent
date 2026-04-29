import { describe, expect, test } from 'bun:test';
import { assertExportsTreaty } from './assert-exports-treaty.ts';

describe('assertExportsTreaty', () => {
  test('accepts a service index with a type-only App re-export', () => {
    expect(() =>
      assertExportsTreaty({
        modulePath: 'services/example/src/index.ts',
        sourceText: "export type { App } from './app.ts';\n",
      }),
    ).not.toThrow();
  });

  test('accepts an inline type-only App re-export', () => {
    expect(() => assertExportsTreaty("export { type App } from './app.ts';\n")).not.toThrow();
  });

  test('accepts a local exported App type alias', () => {
    expect(() => assertExportsTreaty('export type App = typeof app;\n')).not.toThrow();
  });

  test('throws when the service index does not export an App Treaty type', () => {
    expect(() =>
      assertExportsTreaty({
        modulePath: 'services/example/src/index.ts',
        sourceText: "export { start } from './start.ts';\n",
      }),
    ).toThrow('services/example/src/index.ts must export a type-only Treaty App type');
  });

  test('does not count commented-out App exports', () => {
    expect(() => assertExportsTreaty("// export type { App } from './app.ts';\n")).toThrow(
      'service index.ts must export a type-only Treaty App type',
    );
  });
});
