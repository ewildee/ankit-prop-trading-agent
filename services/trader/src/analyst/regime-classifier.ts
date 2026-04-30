import type { CalendarItem, PersonaConfig, RegimeLabel } from '@ankit-prop/contracts';
import type { Bar } from '@ankit-prop/market-data';
import {
  clampUnit,
  EPSILON,
  ONE,
  SIXTY,
  safeDivide,
  THOUSAND,
  THREE,
  TWO,
  ZERO,
} from './constants.ts';

const PRAGUE_HOUR_CYCLE = `h${TWO}${THREE}` as Intl.DateTimeFormatOptions['hourCycle'];

export type RegimeClassifierInput = {
  readonly bar: Bar;
  readonly recentBars: ReadonlyArray<Bar>;
  readonly calendarLookahead?: ReadonlyArray<CalendarItem>;
  readonly params: PersonaConfig;
};

export function classifyRegime(input: RegimeClassifierInput): RegimeLabel {
  const barPragueMinute = pragueMinuteOfDay(input.bar.tsEnd);
  if (
    !isMinuteWithin(
      barPragueMinute,
      input.params.windowPrague.activeStart,
      input.params.windowPrague.activeEnd,
    )
  ) {
    return 'outside_active_window';
  }

  if (hasMacroEventWithinWindow(input)) return 'C_macro_filter';

  const bars = recentWindow(input.recentBars, input.params.analyst.barLookback);
  if (bars.length < input.params.analyst.regime.minSeriesBars) return 'unknown';

  const profile = profileBars(bars);
  const latest = bars.at(-ONE);
  if (!latest) return 'unknown';

  if (isSessionBreakout(input, latest, profile, barPragueMinute)) return 'A_session_break';
  if (isTrendRetrace(input, latest, profile)) return 'B_trend_retrace';
  if (isConsolidationBreak(input, latest, profile)) return 'B_consolidation_break';
  if (isReversal(input, latest, profile)) return 'B_reversal';

  return 'unknown';
}

export type BarProfile = ReturnType<typeof profileBars>;

export function profileBars(bars: ReadonlyArray<Bar>) {
  const first = bars[ZERO];
  if (!first) {
    return {
      firstClose: ZERO,
      high: ZERO,
      low: ZERO,
      averageRange: ZERO,
      direction: ZERO,
      moveAtr: ZERO,
      closePosition: ZERO,
    };
  }

  let high = first.high;
  let low = first.low;
  let rangeTotal = ZERO;
  for (const bar of bars) {
    high = Math.max(high, bar.high);
    low = Math.min(low, bar.low);
    rangeTotal += Math.max(bar.high - bar.low, ZERO);
  }

  const latest = bars.at(-ONE) ?? first;
  const averageRange = safeDivide(rangeTotal, bars.length);
  const move = latest.close - first.close;
  const direction = Math.sign(move);
  const closePosition = clampUnit(safeDivide(latest.close - low, high - low));

  return {
    firstClose: first.close,
    high,
    low,
    averageRange,
    direction,
    moveAtr: safeDivide(Math.abs(move), averageRange),
    closePosition,
  };
}

function hasMacroEventWithinWindow(input: RegimeClassifierInput): boolean {
  const lookaheadMs = input.params.analyst.regime.macroEventLookaheadMinutes * SIXTY * THOUSAND;
  const cutoff = input.bar.tsEnd + lookaheadMs;
  return (input.calendarLookahead ?? []).some((event) => {
    if (!event.restriction && event.impact !== 'high') return false;
    const eventTime = Date.parse(event.date);
    return Number.isFinite(eventTime) && eventTime >= input.bar.tsEnd && eventTime <= cutoff;
  });
}

function isSessionBreakout(
  input: RegimeClassifierInput,
  latest: Bar,
  profile: BarProfile,
  barPragueMinute: number,
): boolean {
  if (!input.params.families.sessionBreakout.enabled) return false;
  if (
    !isMinuteWithin(
      barPragueMinute,
      input.params.families.sessionBreakout.start,
      input.params.families.sessionBreakout.end,
    )
  ) {
    return false;
  }

  const closePosition =
    latest.close >= profile.firstClose ? profile.closePosition : ONE - profile.closePosition;
  return (
    closePosition >= input.params.analyst.regime.breakoutClosePosition &&
    profile.moveAtr >= input.params.analyst.regime.trendMoveAtrMultiple
  );
}

function isTrendRetrace(input: RegimeClassifierInput, latest: Bar, profile: BarProfile): boolean {
  if (!input.params.families.multiTimeframeConfluence.enabled) return false;
  const latestBody = latest.close - latest.open;
  const latestBodyAtr = safeDivide(Math.abs(latestBody), profile.averageRange);
  const retracesAgainstTrend =
    profile.direction !== ZERO && Math.sign(latestBody) === -profile.direction;
  return (
    profile.moveAtr >= input.params.analyst.regime.trendMoveAtrMultiple &&
    latestBodyAtr <= input.params.analyst.regime.retraceBodyAtrMaximum &&
    retracesAgainstTrend
  );
}

function isConsolidationBreak(
  input: RegimeClassifierInput,
  latest: Bar,
  profile: BarProfile,
): boolean {
  const rangeAtr = safeDivide(profile.high - profile.low, profile.averageRange);
  if (rangeAtr > input.params.analyst.regime.consolidationRangeAtrMaximum) return false;
  const closePosition =
    latest.close >= profile.firstClose ? profile.closePosition : ONE - profile.closePosition;
  return closePosition >= input.params.analyst.regime.breakoutClosePosition;
}

function isReversal(input: RegimeClassifierInput, latest: Bar, profile: BarProfile): boolean {
  const body = Math.max(Math.abs(latest.close - latest.open), profile.averageRange * EPSILON);
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;
  const dominantWickBody = safeDivide(Math.max(upperWick, lowerWick), body);
  return (
    profile.moveAtr >= input.params.analyst.regime.trendMoveAtrMultiple &&
    dominantWickBody >= input.params.analyst.regime.reversalWickBodyMultiple
  );
}

function recentWindow<T>(items: ReadonlyArray<T>, limit: number): ReadonlyArray<T> {
  return items.slice(-limit);
}

function isMinuteWithin(current: number, start: string, end: string): boolean {
  const startMinute = parseClockMinute(start);
  const endMinute = parseClockMinute(end);
  if (startMinute <= endMinute) return current >= startMinute && current <= endMinute;
  return current >= startMinute || current <= endMinute;
}

function parseClockMinute(value: string): number {
  const [hour = '00', minute = '00'] = value.split(':');
  return Number(hour) * SIXTY + Number(minute);
}

function pragueMinuteOfDay(timestampMs: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: PRAGUE_HOUR_CYCLE,
  }).formatToParts(new Date(timestampMs));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? '00');
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? '00');
  return hour * SIXTY + minute;
}
