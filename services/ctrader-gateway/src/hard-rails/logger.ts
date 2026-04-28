// Rail logger seam. Production wires a pino instance via `pinoRailLogger()`
// (delegates to `@ankit-prop/contracts` `createPinoLogger`, BLUEPRINT §20.1
// + §23.6 redact list). Tests use `captureLogger()` to assert the structured
// payload shape required by §9 (every rail decision logs `rail`, `symbol`,
// `outcome`, `reason`).

import type { CreatePinoLoggerOptions } from '@ankit-prop/contracts';
import { createPinoLogger } from '@ankit-prop/contracts';

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

// Production rail-logger factory. Wraps the canonical pino factory from
// `@ankit-prop/contracts` (BLUEPRINT §20.1 + §23.6 redact list) and narrows
// the return type to `RailLogger` so the existing rail call-sites stay
// no-op against the seam. The pino `info(obj, msg)` / `warn(obj, msg)`
// signatures already satisfy `RailLogger`; the explicit method shims keep
// the type assignment honest in the face of pino's structural typing
// (pino's `LogFn` overloads accept `(msg: string)` too, which is wider than
// `RailLogger`'s payload-first contract).
export type PinoRailLoggerOptions = Omit<CreatePinoLoggerOptions, 'service'> & {
  readonly service?: string;
};

export function pinoRailLogger(opts: PinoRailLoggerOptions = {}): RailLogger {
  // exactOptionalPropertyTypes: true forbids passing explicit `undefined` for
  // optional fields, so spread the input rather than enumerating the keys.
  const { service, ...rest } = opts;
  const pinoLogger = createPinoLogger({
    ...rest,
    service: service ?? 'ctrader-gateway/hard-rails',
  });
  return {
    info(payload: RailLoggerPayload, msg?: string) {
      if (msg === undefined) {
        pinoLogger.info(payload);
      } else {
        pinoLogger.info(payload, msg);
      }
    },
    warn(payload: RailLoggerPayload, msg?: string) {
      if (msg === undefined) {
        pinoLogger.warn(payload);
      } else {
        pinoLogger.warn(payload, msg);
      }
    },
  };
}
