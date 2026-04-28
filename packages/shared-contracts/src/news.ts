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
