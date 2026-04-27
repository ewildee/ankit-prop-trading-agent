// BLUEPRINT §9 — broker-side contract surface the 14 hard rails consult.
// Pure data types; no transport coupling. Live socket wiring lands in ANKA-15.

import type { HardRailKey, RailDecision, RailOutcome } from '@ankit-prop/contracts';

export type OrderSide = 'BUY' | 'SELL';

export interface NewOrderIntent {
  readonly kind: 'NEW';
  readonly clientOrderId: string;
  readonly accountId: string;
  readonly envelopeId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly volume: number;
  readonly entryPrice: number;
  readonly stopLossPrice: number;
  readonly takeProfitPrice?: number;
  readonly intendedAtMs: number;
}

export interface AmendOrderIntent {
  readonly kind: 'AMEND';
  readonly clientOrderId: string;
  readonly accountId: string;
  readonly envelopeId: string;
  readonly symbol: string;
  readonly positionId: string;
  readonly side: OrderSide;
  readonly prevStopLossPrice: number;
  readonly newStopLossPrice: number;
  readonly intendedAtMs: number;
}

export interface CloseOrderIntent {
  readonly kind: 'CLOSE';
  readonly clientOrderId: string;
  readonly accountId: string;
  readonly envelopeId: string;
  readonly symbol: string;
  readonly positionId: string;
  readonly intendedAtMs: number;
}

export type RailIntent = NewOrderIntent | AmendOrderIntent | CloseOrderIntent;

export interface OpenPosition {
  readonly positionId: string;
  readonly symbol: string;
  readonly side: OrderSide;
  readonly volume: number;
  readonly entryPrice: number;
  readonly stopLossPrice: number;
  readonly openedAtMs: number;
}

export interface SymbolMeta {
  readonly symbol: string;
  readonly enabled: boolean;
  readonly typicalSpread: number;
  readonly atr14: number;
  readonly spreadGuardMultiplier: number;
  readonly forceFlatLeadMin: number;
  readonly preNewsFlattenLeadMin: number;
  // dollars of P&L per 1.0 price unit per 1.0 volume — keeps SL math broker-agnostic.
  readonly dollarsPerPricePerUnit: number;
}

export type Phase = 'phase_1' | 'phase_2' | 'funded';

export interface ProfitTarget {
  readonly fractionOfInitial: number;
  readonly bufferDollars: number;
  readonly minDaysComplete: boolean;
}

export interface EnvelopeFloors {
  // Both expressed as positive fractions of INITIAL_CAPITAL per BLUEPRINT §8.3.
  readonly internalDailyFloorPct: number;
  readonly internalOverallFloorPct: number;
}

export interface FillReport {
  readonly intendedPrice: number;
  readonly filledPrice: number;
}

export interface BrokerSnapshot {
  readonly nowMs: number;
  readonly accountId: string;
  readonly envelopeId: string;
  readonly initialBalance: number;
  readonly dayStartBalance: number;
  readonly closedBalance: number;
  readonly equity: number;
  readonly positions: readonly OpenPosition[];
  readonly lastTradeBySymbol: Readonly<Record<string, { closedAtMs: number }>>;
  readonly symbol: SymbolMeta;
  readonly bid?: number;
  readonly ask?: number;
  readonly fill?: FillReport;
  readonly phase: Phase;
  readonly profitTarget: ProfitTarget;
  readonly envelopeFloors: EnvelopeFloors;
  // Per-trade loss cap from §8.5 (envelope.risk.per_trade_pct[phase]).
  readonly defensiveSlMaxLossPct: number;
  readonly marketCloseAtMs?: number;
  readonly fridayCloseAtMs?: number;
}

export interface RailLoggerPayload {
  readonly rail: HardRailKey;
  readonly symbol: string;
  readonly outcome: RailOutcome;
  readonly reason: string;
  readonly accountId: string;
  readonly envelopeId: string;
  readonly clientOrderId: string;
  readonly detail?: Readonly<Record<string, unknown>>;
}

// Pino-compatible signature (logger.info(obj, msg)). Wired to a real pino
// instance in ANKA-15; tests use captureLogger() from ./logger.ts.
export interface RailLogger {
  info(payload: RailLoggerPayload, msg?: string): void;
  warn(payload: RailLoggerPayload, msg?: string): void;
}

export interface NewsClient {
  // Rail 3: ±5-min internal blackout (decision M.1, all phases).
  isInBlackout(symbol: string, atMs: number): { blocked: boolean; reason?: string };
  // Rail 4: 2-h pre-news kill (tier-1 events).
  isInPreNewsKill(symbol: string, atMs: number): { blocked: boolean; reason?: string };
  // Rail 13: pre-flatten scheduler peeks the next restricted event.
  nextRestrictedEvent(symbol: string, atMs: number): { eventAtMs: number } | null;
  // BLUEPRINT §11.7 — staleness fail-closed.
  lastFetchAgeMs(atMs: number): number;
}

export interface IdempotencyStore {
  has(clientOrderId: string): boolean;
  record(clientOrderId: string, decidedAtMs: number): void;
}

export interface ThrottleStore {
  // Token bucket per accountId with `capacity` tokens refilled over `windowMs`.
  // Returns whether a single token consumption is permitted; on `allowed: true`
  // the consumption is recorded.
  consume(args: { accountId: string; atMs: number; capacity: number; windowMs: number }): {
    allowed: boolean;
    remaining: number;
  };
}

export interface RailConfig {
  // Rail 5
  readonly minHoldSeconds: number;
  // Rail 7
  readonly slippageSpreadMultiplier: number;
  readonly slippageMinAtrFraction: number;
  // Rail 11 — small absolute price tolerance to avoid float-noise tightening.
  readonly defensiveSlPriceTolerance: number;
  // Rail 12
  readonly throttleCapacity: number;
  readonly throttleWindowMs: number;
  // Rail 3 / §11.7 — newsStale → fail-closed blackout.
  readonly newsStaleMaxMs: number;
}

export const DEFAULT_RAIL_CONFIG: RailConfig = {
  minHoldSeconds: 60,
  slippageSpreadMultiplier: 2,
  slippageMinAtrFraction: 0.5,
  defensiveSlPriceTolerance: 1e-6,
  throttleCapacity: 1800,
  throttleWindowMs: 24 * 60 * 60 * 1000,
  newsStaleMaxMs: 2 * 60 * 60 * 1000,
};

export interface RailContext {
  readonly broker: BrokerSnapshot;
  readonly news: NewsClient;
  readonly idempotency: IdempotencyStore;
  readonly throttle: ThrottleStore;
  readonly logger: RailLogger;
  readonly config: RailConfig;
}

export type RailEvaluator = (intent: RailIntent, ctx: RailContext) => RailDecision;

export function isoNow(ms: number): string {
  return new Date(ms).toISOString();
}
