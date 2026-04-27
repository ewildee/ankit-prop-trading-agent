// Rail logger seam. Production wires a pino instance in ANKA-15; tests use
// captureLogger() to assert the structured payload shape required by §9
// (every rail decision logs `rail`, `symbol`, `outcome`, `reason`).

import type { RailLogger, RailLoggerPayload } from './types.ts';

export interface LoggedRailEvent {
  readonly level: 'info' | 'warn';
  readonly payload: RailLoggerPayload;
  readonly msg?: string;
}

export interface CaptureLogger extends RailLogger {
  readonly events: readonly LoggedRailEvent[];
  reset(): void;
}

export function captureLogger(): CaptureLogger {
  const events: LoggedRailEvent[] = [];
  return {
    info(payload, msg) {
      events.push(msg === undefined ? { level: 'info', payload } : { level: 'info', payload, msg });
    },
    warn(payload, msg) {
      events.push(msg === undefined ? { level: 'warn', payload } : { level: 'warn', payload, msg });
    },
    get events(): readonly LoggedRailEvent[] {
      return events;
    },
    reset() {
      events.length = 0;
    },
  };
}

export const silentLogger: RailLogger = {
  info() {},
  warn() {},
};
