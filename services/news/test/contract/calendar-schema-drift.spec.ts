import { describe, expect, test } from 'bun:test';

import { CalendarItem, CalendarResponse } from '@ankit-prop/contracts';

import cassette from '../cassettes/ftmo-2026-03-23-week.json';

type CalendarPayload = {
  items: Array<Record<string, unknown>>;
};

const CALENDAR_ITEM_KEYS = Object.keys(CalendarItem.shape).sort();

describe('FTMO calendar schema drift detector', () => {
  test('accepts the recorded cassette when its keys match the strict CalendarItem schema', () => {
    expect(() => assertCalendarSchemaKeys(cassette, CALENDAR_ITEM_KEYS)).not.toThrow();
  });

  test('fails with an on-call message when FTMO adds an unknown cassette key', () => {
    const mutated = structuredClone(cassette) as CalendarPayload;
    const first = firstCalendarItem(mutated);
    first.unexpectedFtmoKey = 'new upstream field';

    expect(() => assertCalendarSchemaKeys(mutated, CALENDAR_ITEM_KEYS)).toThrow(
      'FTMO calendar contract drift: item 0 contains key "unexpectedFtmoKey" not allowed by @ankit-prop/contracts CalendarItem schema; review the upstream FTMO change, then update either services/news/test/cassettes or packages/shared-contracts/src/news.ts.',
    );
  });

  test('fails with an on-call message when the schema no longer permits a cassette key', () => {
    const schemaWithoutActual = CALENDAR_ITEM_KEYS.filter((key) => key !== 'actual');

    expect(() => assertCalendarSchemaKeys(cassette, schemaWithoutActual)).toThrow(
      'FTMO calendar contract drift: item 0 contains key "actual" not allowed by @ankit-prop/contracts CalendarItem schema; review the upstream FTMO change, then update either services/news/test/cassettes or packages/shared-contracts/src/news.ts.',
    );
  });

  test('fails with an on-call message when a required cassette key disappears', () => {
    const mutated = structuredClone(cassette) as CalendarPayload;
    const first = firstCalendarItem(mutated);
    delete first.actual;

    expect(() => assertCalendarSchemaKeys(mutated, CALENDAR_ITEM_KEYS)).toThrow(
      'FTMO calendar contract drift: item 0 is missing required key "actual" from the recorded cassette; refresh the cassette only after confirming FTMO really removed the field, or relax packages/shared-contracts/src/news.ts intentionally.',
    );
  });
});

function firstCalendarItem(payload: CalendarPayload): Record<string, unknown> {
  const first = payload.items[0];
  if (!first) throw new Error('cassette fixture unexpectedly empty');
  return first;
}

function assertCalendarSchemaKeys(payload: unknown, schemaKeys: readonly string[]): void {
  const candidate = payload as Partial<CalendarPayload>;
  if (!Array.isArray(candidate.items)) {
    throw new Error('FTMO calendar contract drift: root payload must contain an items array.');
  }

  const allowed = new Set(schemaKeys);
  for (const [index, item] of candidate.items.entries()) {
    const itemKeys = Object.keys(item).sort();
    for (const key of itemKeys) {
      if (!allowed.has(key)) {
        throw new Error(
          `FTMO calendar contract drift: item ${index} contains key "${key}" not allowed by @ankit-prop/contracts CalendarItem schema; review the upstream FTMO change, then update either services/news/test/cassettes or packages/shared-contracts/src/news.ts.`,
        );
      }
    }
    for (const key of schemaKeys) {
      if (!Object.hasOwn(item, key)) {
        throw new Error(
          `FTMO calendar contract drift: item ${index} is missing required key "${key}" from the recorded cassette; refresh the cassette only after confirming FTMO really removed the field, or relax packages/shared-contracts/src/news.ts intentionally.`,
        );
      }
    }
  }

  const parsed = CalendarResponse.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.length ? issue.path.join('.') : '<root>';
    throw new Error(
      `FTMO calendar contract drift: strict @ankit-prop/contracts CalendarResponse rejected the cassette at ${path}; update either the cassette or packages/shared-contracts/src/news.ts after review.`,
    );
  }
}
