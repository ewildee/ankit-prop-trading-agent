import { Elysia } from 'elysia';
import type { FreshnessMonitor, FreshnessReason } from './freshness/index.ts';

export interface NewsMetricsOptions {
  readonly freshness: FreshnessMonitor;
}

export class NewsMetrics {
  readonly #freshness: FreshnessMonitor;
  readonly #unhealthyTransitions = new Map<FreshnessReason, number>();
  #previousFresh: boolean | null = null;

  constructor(options: NewsMetricsOptions) {
    this.#freshness = options.freshness;
  }

  render(): string {
    const snapshot = this.#freshness.currentSnapshot();
    if (this.#previousFresh === true && !snapshot.fresh) {
      this.#unhealthyTransitions.set(
        snapshot.reason,
        (this.#unhealthyTransitions.get(snapshot.reason) ?? 0) + 1,
      );
    }
    this.#previousFresh = snapshot.fresh;

    const age = Number.isFinite(snapshot.ageSeconds) ? snapshot.ageSeconds : 0;
    const lines = [
      '# HELP ankit_news_fetch_age_seconds Age of the latest successful FTMO calendar fetch.',
      '# TYPE ankit_news_fetch_age_seconds gauge',
      `ankit_news_fetch_age_seconds ${formatMetricNumber(age)}`,
      '# HELP ankit_news_unhealthy Calendar freshness transitions from fresh to unhealthy.',
      '# TYPE ankit_news_unhealthy counter',
    ];

    for (const reason of ['stale_calendar', 'never_fetched', 'fetch_unhealthy'] as const) {
      lines.push(
        `ankit_news_unhealthy{reason="${reason}"} ${this.#unhealthyTransitions.get(reason) ?? 0}`,
      );
    }

    return `${lines.join('\n')}\n`;
  }
}

export function metricsRoute(metrics: NewsMetrics) {
  return new Elysia().get('/metrics', () => new Response(metrics.render(), { headers }));
}

const headers = {
  'content-type': 'text/plain; version=0.0.4; charset=utf-8',
} as const;

function formatMetricNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }
  return value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
