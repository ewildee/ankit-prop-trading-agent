import { useEffect, useState } from 'react';
import type { VersionMatrixSnapshot } from '../version-matrix.ts';
import { type DashboardEvent, subscribeToMockFeed } from './sse.ts';

const POLL_MS = 5_000;

export function App() {
  const [matrix, setMatrix] = useState<VersionMatrixSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<readonly DashboardEvent[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function refresh(): Promise<void> {
      try {
        const res = await fetch('/api/version-matrix');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const snapshot = (await res.json()) as VersionMatrixSnapshot;
        if (!cancelled) {
          setMatrix(snapshot);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    return subscribeToMockFeed((event) => {
      setEvents((current) => [event, ...current].slice(0, 5));
    });
  }, []);

  return (
    <main className="app-shell">
      <VersionBanner matrix={matrix} error={error} />
      <section className="workspace-grid">
        <section className="system-tree-panel" aria-label="System tree">
          <header>
            <p className="eyebrow">System</p>
            <h1>Operator Cockpit</h1>
          </header>
          <div className="tree-placeholder">
            <div className="tree-node tree-node-root">system</div>
            <div className="tree-branch">
              <div className="tree-node">account</div>
              <div className="tree-node">envelope</div>
              <div className="tree-node">instance</div>
            </div>
          </div>
        </section>
        <section className="feed-panel" aria-label="Event stream seam">
          <header>
            <p className="eyebrow">SSE</p>
            <h2>Event Feed</h2>
          </header>
          <div className="event-feed">
            {events.map((event) => (
              <article className="event-row" key={event.id}>
                <span>{event.source}</span>
                <p>{event.message}</p>
                <time dateTime={event.receivedAt}>
                  {new Date(event.receivedAt).toLocaleTimeString()}
                </time>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function VersionBanner(props: { matrix: VersionMatrixSnapshot | null; error: string | null }) {
  return (
    <section className="version-banner" aria-label="Version matrix">
      <div className="version-banner-header">
        <span>Version Matrix</span>
        <time dateTime={props.matrix?.generatedAt}>
          {props.matrix ? new Date(props.matrix.generatedAt).toLocaleTimeString() : 'loading'}
        </time>
      </div>
      {props.error ? (
        <p className="version-error">version matrix unavailable: {props.error}</p>
      ) : null}
      <div className="version-grid">
        {(props.matrix?.rows ?? []).map((row) => (
          <article className={`version-chip version-chip-${row.state}`} key={row.name}>
            <span className="service-name">{row.name}</span>
            <strong>{row.runningVersion ?? 'offline'}</strong>
            <small>HEAD {row.expectedVersion}</small>
          </article>
        ))}
      </div>
    </section>
  );
}
