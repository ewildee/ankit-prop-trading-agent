// Europe/Prague day-bucket helpers. FTMO rule semantics (daily-loss reset, EA
// throttle reset, daily-PnL grouping for consistency) all key off the FTMO
// server clock = Europe/Prague (BLUEPRINT §0 timezone matrix). Using UTC
// instead causes rollovers to drift by 1–2 hours and can mask same-day
// breaches into the next bucket. Implemented with built-in Intl to keep zero
// extra deps (BLUEPRINT §0.2 Bun-built-in-first rule).

const PRAGUE_TZ = 'Europe/Prague';

const PRAGUE_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: PRAGUE_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

export type PragueParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function pragueParts(tsMs: number): PragueParts {
  const parts = PRAGUE_PARTS.formatToParts(new Date(tsMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const v = parts.find((p) => p.type === type)?.value ?? '0';
    return Number(v);
  };
  let hour = get('hour');
  if (hour === 24) hour = 0;
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

// Stable per-Prague-calendar-day key. Returns the UTC ms of the Prague Y-M-D
// represented as if it were UTC midnight — unique per Prague day, monotonic
// across days, and DST-safe because the bucket carries no offset semantics.
export function pragueDayBucket(tsMs: number): number {
  const p = pragueParts(tsMs);
  return Date.UTC(p.year, p.month - 1, p.day);
}

export function pragueIsoWithOffset(tsMs: number): string {
  const p = pragueParts(tsMs);
  const tsSecondMs = Math.floor(tsMs / 1000) * 1000;
  const offsetMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - tsSecondMs;
  const offsetMinutes = Math.trunc(offsetMs / 60_000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHours = Math.trunc(absMinutes / 60);
  const offsetRemainder = absMinutes % 60;

  return `${pad4(p.year)}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(
    p.minute,
  )}:${pad2(p.second)}${sign}${pad2(offsetHours)}:${pad2(offsetRemainder)}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function pad4(n: number): string {
  return String(n).padStart(4, '0');
}
