import { z } from 'zod';

export const CalendarImpact = z.enum(['low', 'medium', 'high', 'holiday']);
export type CalendarImpact = z.infer<typeof CalendarImpact>;

export const CalendarItem = z.strictObject({
  title: z.string(),
  impact: CalendarImpact,
  instrument: z.string(),
  restriction: z.boolean(),
  eventType: z.string(),
  date: z.string(),
  forecast: z.string().nullable(),
  previous: z.string().nullable(),
  actual: z.string().nullable(),
  youtubeLink: z.string().nullable(),
  articleLink: z.string().nullable(),
});
export type CalendarItem = z.infer<typeof CalendarItem>;

export const CalendarResponse = z.strictObject({
  items: z.array(CalendarItem),
});
export type CalendarResponse = z.infer<typeof CalendarResponse>;

const UtcIsoInstant = z.string().refine(
  (value) => {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
      return false;
    }
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString() === value;
  },
  { message: 'Expected an ISO-8601 UTC instant with millisecond precision' },
);

export const CalendarEvent = z.strictObject({
  id: z.string().min(1),
  eventTsUtc: UtcIsoInstant,
  currency: z.string().min(1),
  date: z.string().min(1),
  title: z.string().min(1),
  impact: CalendarImpact,
  instrument: z.string().min(1),
  instrumentTags: z.array(z.string().min(1)),
  restricted: z.boolean(),
  eventType: z.string().min(1),
  forecast: z.string().nullable(),
  previous: z.string().nullable(),
  actual: z.string().nullable(),
  youtubeLink: z.string().nullable(),
  articleLink: z.string().nullable(),
});
export type CalendarEvent = z.infer<typeof CalendarEvent>;

export const RestrictedReason = z.strictObject({
  event: z.string(),
  eta_seconds: z.number().int(),
  rule: z.enum(['blackout_pm5', 'pre_news_2h', 'stale_calendar']),
});
export type RestrictedReason = z.infer<typeof RestrictedReason>;

export const RestrictedReply = z.strictObject({
  restricted: z.boolean(),
  reasons: z.array(RestrictedReason),
});
export type RestrictedReply = z.infer<typeof RestrictedReply>;

export const NextRestrictedReply = z.strictObject({
  item: CalendarItem.nullable(),
  eta_seconds: z.number().int(),
});
export type NextRestrictedReply = z.infer<typeof NextRestrictedReply>;
