import type { CalendarEvent, CalendarItem } from '@ankit-prop/contracts';

export class CalendarItemMapError extends Error {
  readonly field: string;

  constructor(field: string, reason: string) {
    super(`calendar item ${field}: ${reason}`);
    this.name = 'CalendarItemMapError';
    this.field = field;
  }
}

export function mapCalendarItemToEvent(item: CalendarItem): CalendarEvent {
  const eventTsMs = Date.parse(item.date);
  if (Number.isNaN(eventTsMs)) {
    throw new CalendarItemMapError('date', `invalid date: ${item.date}`);
  }

  const eventTsUtc = new Date(eventTsMs).toISOString();
  const instrumentTags = splitInstrumentTags(item.instrument);
  const currency = instrumentTags[0] ?? item.instrument.trim();
  if (currency.length === 0) {
    throw new CalendarItemMapError('instrument', 'expected a non-empty currency tag');
  }

  return {
    id: stableCalendarEventId({
      eventTsUtc,
      title: item.title,
      instrument: item.instrument,
      eventType: item.eventType,
    }),
    eventTsUtc,
    currency,
    date: item.date,
    title: item.title,
    impact: item.impact,
    instrument: item.instrument,
    instrumentTags,
    restricted: item.restriction,
    eventType: item.eventType,
    forecast: item.forecast,
    previous: item.previous,
    actual: item.actual,
    youtubeLink: item.youtubeLink,
    articleLink: item.articleLink,
  };
}

function splitInstrumentTags(instrument: string): string[] {
  return instrument
    .split(' + ')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function stableCalendarEventId(input: {
  readonly eventTsUtc: string;
  readonly title: string;
  readonly instrument: string;
  readonly eventType: string;
}): string {
  const digest = new Bun.CryptoHasher('sha256')
    .update(`${input.eventTsUtc}|${input.title}|${input.instrument}|${input.eventType}`)
    .digest('hex');
  return `ftmo-${digest.slice(0, 16)}`;
}
