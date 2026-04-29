import type { CalendarEvent, CalendarItem } from '@ankit-prop/contracts';

const ISO_DATE_WITH_OFFSET =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?:\.(?<millisecond>\d{1,3}))?)?(?<offset>Z|[+-]\d{2}:?\d{2})$/;

export class CalendarItemMapError extends Error {
  readonly field: string;

  constructor(field: string, reason: string) {
    super(`calendar item ${field}: ${reason}`);
    this.name = 'CalendarItemMapError';
    this.field = field;
  }
}

export function mapCalendarItemToEvent(item: CalendarItem): CalendarEvent {
  const eventTsUtc = parseCalendarDateToUtcIso(item.date);
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

function parseCalendarDateToUtcIso(value: string): string {
  const match = ISO_DATE_WITH_OFFSET.exec(value);
  if (!match?.groups) {
    throw new CalendarItemMapError('date', `invalid date: ${value}`);
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute);
  const second = Number(match.groups.second ?? '0');
  const millisecond = Number((match.groups.millisecond ?? '0').padEnd(3, '0'));

  if (!validDateTimeParts({ year, month, day, hour, minute, second, millisecond })) {
    throw new CalendarItemMapError('date', `invalid date: ${value}`);
  }

  const offsetMs = offsetToMilliseconds(match.groups.offset ?? 'Z');
  const expectedUtcMs =
    Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offsetMs;
  const parsedUtcMs = Date.parse(value);
  if (!Number.isFinite(parsedUtcMs) || parsedUtcMs !== expectedUtcMs) {
    throw new CalendarItemMapError('date', `invalid date: ${value}`);
  }

  return new Date(expectedUtcMs).toISOString();
}

function validDateTimeParts(input: {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}): boolean {
  if (
    input.month < 1 ||
    input.month > 12 ||
    input.hour > 23 ||
    input.minute > 59 ||
    input.second > 59 ||
    input.millisecond > 999
  ) {
    return false;
  }

  const localAsUtc = new Date(
    Date.UTC(
      input.year,
      input.month - 1,
      input.day,
      input.hour,
      input.minute,
      input.second,
      input.millisecond,
    ),
  );
  return (
    localAsUtc.getUTCFullYear() === input.year &&
    localAsUtc.getUTCMonth() === input.month - 1 &&
    localAsUtc.getUTCDate() === input.day &&
    localAsUtc.getUTCHours() === input.hour &&
    localAsUtc.getUTCMinutes() === input.minute &&
    localAsUtc.getUTCSeconds() === input.second &&
    localAsUtc.getUTCMilliseconds() === input.millisecond
  );
}

function offsetToMilliseconds(offset: string): number {
  if (offset === 'Z') {
    return 0;
  }

  const sign = offset.startsWith('-') ? -1 : 1;
  const digits = offset.slice(1).replace(':', '');
  const hours = Number(digits.slice(0, 2));
  const minutes = Number(digits.slice(2, 4));
  if (hours > 23 || minutes > 59) {
    return Number.NaN;
  }
  return sign * ((hours * 60 + minutes) * 60 * 1_000);
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
