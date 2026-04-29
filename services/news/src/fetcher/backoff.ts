export const CALENDAR_FETCH_BACKOFF_DELAYS_MS = [1_000, 4_000, 16_000] as const;

export function calendarFetchBackoffDelayMs(failureNumber: number): number | null {
  if (!Number.isInteger(failureNumber) || failureNumber < 1) {
    return null;
  }
  return CALENDAR_FETCH_BACKOFF_DELAYS_MS[failureNumber - 1] ?? null;
}
