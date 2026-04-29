import { describe, expect, test } from 'bun:test';
import type { FreshnessMonitor, FreshnessSnapshot } from './freshness/index.ts';
import { metricsRoute, NewsMetrics } from './metrics.ts';

describe('NewsMetrics', () => {
  test('renders fetch-age gauge and increments unhealthy counters only on fresh-to-unhealthy transitions', () => {
    const freshness = sequenceFreshness([
      { ageSeconds: 12, fresh: true, lastFetchAtUtc: '2026-04-29T10:00:00.000Z', reason: 'fresh' },
      {
        ageSeconds: 7_201,
        fresh: false,
        lastFetchAtUtc: '2026-04-29T08:00:00.000Z',
        reason: 'stale_calendar',
      },
      {
        ageSeconds: 7_260,
        fresh: false,
        lastFetchAtUtc: '2026-04-29T08:00:00.000Z',
        reason: 'stale_calendar',
      },
      { ageSeconds: 5, fresh: true, lastFetchAtUtc: '2026-04-29T10:10:00.000Z', reason: 'fresh' },
      {
        ageSeconds: 6,
        fresh: false,
        lastFetchAtUtc: '2026-04-29T10:10:00.000Z',
        reason: 'fetch_unhealthy',
      },
    ]);
    const metrics = new NewsMetrics({ freshness });

    expect(metrics.render()).toContain('ankit_news_fetch_age_seconds 12');
    const staleOnce = metrics.render();
    expect(staleOnce).toContain('ankit_news_fetch_age_seconds 7201');
    expect(staleOnce).toContain('ankit_news_unhealthy{reason="stale_calendar"} 1');

    const stillStale = metrics.render();
    expect(stillStale).toContain('ankit_news_unhealthy{reason="stale_calendar"} 1');

    metrics.render();
    const fetchUnhealthy = metrics.render();
    expect(fetchUnhealthy).toContain('ankit_news_unhealthy{reason="stale_calendar"} 1');
    expect(fetchUnhealthy).toContain('ankit_news_unhealthy{reason="fetch_unhealthy"} 1');
  });

  test('GET /metrics returns Prometheus text', async () => {
    const app = metricsRoute(
      new NewsMetrics({
        freshness: sequenceFreshness([
          {
            ageSeconds: 42,
            fresh: true,
            lastFetchAtUtc: '2026-04-29T10:00:00.000Z',
            reason: 'fresh',
          },
        ]),
      }),
    );

    const res = await app.handle(new Request('http://news.test/metrics'));
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toContain('ankit_news_fetch_age_seconds 42');
  });
});

function sequenceFreshness(snapshots: readonly FreshnessSnapshot[]): FreshnessMonitor {
  let index = 0;
  return {
    currentSnapshot() {
      const snapshot = snapshots[Math.min(index, snapshots.length - 1)];
      index += 1;
      if (!snapshot) throw new Error('freshness test sequence is empty');
      return snapshot;
    },
  };
}
