export interface DashboardEvent {
  readonly id: string;
  readonly source: 'mock';
  readonly message: string;
  readonly receivedAt: string;
}

export type EventFeedUnsubscribe = () => void;

export function subscribeToMockFeed(
  onEvent: (event: DashboardEvent) => void,
): EventFeedUnsubscribe {
  queueMicrotask(() => {
    onEvent({
      id: 'mock-feed-waiting',
      source: 'mock',
      message: 'trader/gateway/news SSE contracts pending',
      receivedAt: new Date().toISOString(),
    });
  });

  return () => undefined;
}
