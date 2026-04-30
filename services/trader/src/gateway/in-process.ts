import {
  type CalendarItem,
  composeRailVerdict,
  type GatewayDecision,
  type JudgeOutput,
  RailDecision,
  type TraderOutput,
} from '@ankit-prop/contracts';
import { FIVE, SIXTY, THOUSAND, THREE, TWO } from '../analyst/constants.ts';
import type { GatewayStage, GatewayStageInput } from '../pipeline/stages.ts';

const PRAGUE_HOUR_CYCLE = `h${TWO}${THREE}` as Intl.DateTimeFormatOptions['hourCycle'];
const FIVE_MINUTES_MS = FIVE * SIXTY * THOUSAND;

export type ReplayGatewayCalendarContext = {
  readonly calendarLookahead: ReadonlyArray<CalendarItem>;
  readonly calendarUnavailable?: boolean;
};

export type CreateInProcessReplayGatewayOptions = {
  readonly calendarContext?: (input: GatewayStageInput) => ReplayGatewayCalendarContext;
};

const EMPTY_CALENDAR_CONTEXT: ReplayGatewayCalendarContext = {
  calendarLookahead: [],
};

export function createInProcessReplayGateway(
  options: CreateInProcessReplayGatewayOptions = {},
): GatewayStage {
  return {
    decide(input): GatewayDecision {
      return decideInProcess(input, options.calendarContext?.(input) ?? EMPTY_CALENDAR_CONTEXT);
    },
  };
}

function decideInProcess(
  input: GatewayStageInput,
  calendarContext: ReplayGatewayCalendarContext,
): GatewayDecision {
  const { traderOutput, judgeOutput } = input;
  if (traderOutput.action === 'HOLD') {
    return {
      status: 'not_submitted',
      reason: judgeOutput?.verdict !== 'APPROVE' && judgeOutput !== null ? 'judge_reject' : 'hold',
      traderOutput,
      railVerdict: null,
    };
  }

  const railVerdict = composeRailVerdict(
    replayRailDecisions(input, calendarContext),
    input.context.decidedAt,
  );
  if (traderOutput.action === 'OPEN' && railVerdict.outcome === 'reject') {
    return {
      status: 'not_submitted',
      reason: 'rail_block',
      traderOutput,
      railVerdict,
    };
  }

  if (judgeOutput?.verdict !== 'APPROVE' && judgeOutput !== null) {
    return {
      status: 'not_submitted',
      reason: 'judge_reject',
      traderOutput,
      railVerdict: null,
    };
  }
  if (judgeOutput === null) {
    return {
      status: 'not_submitted',
      reason: 'judge_reject',
      traderOutput,
      railVerdict: null,
    };
  }

  if (railVerdict.outcome === 'reject') {
    return {
      status: 'not_submitted',
      reason: 'rail_block',
      traderOutput,
      railVerdict,
    };
  }

  return {
    status: 'submitted',
    traderOutput,
    railVerdict,
    submittedAt: input.context.decidedAt,
  };
}

function replayRailDecisions(
  input: GatewayStageInput,
  calendarContext: ReplayGatewayCalendarContext,
) {
  const { traderOutput, context } = input;
  const decidedAt = context.decidedAt;
  const decisions = [];

  if (traderOutput.action === 'OPEN' && !isInsideActiveWindow(input)) {
    decisions.push(
      RailDecision.parse({
        rail: 'force_flat_schedule',
        outcome: 'reject',
        reason: 'outside_active_window',
        detail: {
          activeStart: input.persona.windowPrague.activeStart,
          activeEnd: input.persona.windowPrague.activeEnd,
          barClosedAt: new Date(input.bar.tsEnd).toISOString(),
        },
        decidedAt,
      }),
    );
  } else {
    decisions.push(
      RailDecision.parse({
        rail: 'force_flat_schedule',
        outcome: 'allow',
        reason: 'inside_active_window_or_non_open',
        detail: { replayOnly: true },
        decidedAt,
      }),
    );
  }

  if (traderOutput.action === 'OPEN' && calendarContext.calendarUnavailable) {
    decisions.push(
      RailDecision.parse({
        rail: 'news_blackout_5m',
        outcome: 'reject',
        reason: 'calendar_unavailable',
        detail: { replayOnly: true, instrument: input.persona.instrument },
        decidedAt,
      }),
    );
  } else {
    const blackoutEvent = matchingCalendarEvent(input, calendarContext.calendarLookahead, (event) =>
      isWithinBlackoutWindow(input.bar.tsEnd, event),
    );
    const preNewsEvent = matchingCalendarEvent(input, calendarContext.calendarLookahead, (event) =>
      isPreNewsEvent(input.bar.tsEnd, event),
    );

    decisions.push(
      RailDecision.parse({
        rail: 'news_blackout_5m',
        outcome: traderOutput.action === 'OPEN' && blackoutEvent ? 'reject' : 'allow',
        reason: blackoutEvent ? 'restricted_event_blackout' : 'no_restricted_event_blackout',
        detail: blackoutEvent ? { event: blackoutEvent } : { replayOnly: true },
        decidedAt,
      }),
    );
    decisions.push(
      RailDecision.parse({
        rail: 'news_pre_kill_2h',
        outcome: traderOutput.action === 'OPEN' && preNewsEvent ? 'reject' : 'allow',
        reason: preNewsEvent ? 'tier_one_pre_news_kill' : 'no_tier_one_pre_news_kill',
        detail: preNewsEvent ? { event: preNewsEvent } : { replayOnly: true },
        decidedAt,
      }),
    );
  }

  decisions.push(
    RailDecision.parse({
      rail: 'idempotency',
      outcome: 'allow',
      reason: 'replay_idempotency_allow',
      detail: { replayOnly: true },
      decidedAt,
    }),
  );

  return decisions;
}

function matchingCalendarEvent(
  input: GatewayStageInput,
  events: ReadonlyArray<CalendarItem>,
  predicate: (event: CalendarItem) => boolean,
): CalendarItem | undefined {
  return events.find(
    (event) => eventMatchesInstrument(event, input.persona.instrument) && predicate(event),
  );
}

function isWithinBlackoutWindow(nowMs: number, event: CalendarItem): boolean {
  if (!event.restriction) return false;
  const eventTime = Date.parse(event.date);
  return Number.isFinite(eventTime) && Math.abs(eventTime - nowMs) <= FIVE_MINUTES_MS;
}

function isPreNewsEvent(nowMs: number, event: CalendarItem): boolean {
  if (!event.restriction && event.impact !== 'high') return false;
  const eventTime = Date.parse(event.date);
  return Number.isFinite(eventTime) && eventTime >= nowMs;
}

function eventMatchesInstrument(event: CalendarItem, instrument: string): boolean {
  return event.instrument
    .split(' + ')
    .map((tag) => tag.trim())
    .includes(instrument);
}

function isInsideActiveWindow(input: GatewayStageInput): boolean {
  const minute = pragueMinuteOfDay(input.bar.tsEnd);
  return isMinuteWithin(
    minute,
    input.persona.windowPrague.activeStart,
    input.persona.windowPrague.activeEnd,
  );
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
