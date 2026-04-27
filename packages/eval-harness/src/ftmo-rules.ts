import type { ClosedTrade, FtmoBreach, SimPosition } from './types.ts';

export type FtmoSimulatorCfg = {
  accountId: string;
  envelopeId: string | null;
  initialCapital: number;
  ftmoMargins: FtmoLineMargins;
  internalMargins: InternalMargins;
  symbols: ReadonlyMap<
    string,
    {
      pipSize: number;
      contractSize: number;
    }
  >;
  newsBlackoutWindows: ReadonlyArray<{
    symbols: ReadonlySet<string>;
    startMs: number;
    endMs: number;
  }>;
  preNewsBlackoutWindows: ReadonlyArray<{
    symbols: ReadonlySet<string>;
    startMs: number;
    endMs: number;
  }>;
  weekendCloseTimestampsMs: ReadonlyArray<number>;
  hftMinHoldShareThreshold: number;
  consistencyMaxShare: number;
  consistencyCheckEnabled: boolean;
  consistencyMinTrades: number;
};

// FTMO floor units: every loss number on this surface is a *fraction* of
// INITIAL_CAPITAL (0.04 = 4%), matching `EnvelopeFloors` in svc:gateway.
// ANKA-30 unified percent vs fraction across rails / matrix / harness.
export type FtmoLineMargins = {
  dailyLossFraction: number;
  overallLossFraction: number;
  newsBlackoutHalfWidthMs: number;
  enforceNewsBlackout: boolean;
  eaRequestsPerDay: number;
};

export type InternalMargins = {
  dailyLossFraction: number;
  overallLossFraction: number;
  newsBlackoutHalfWidthMs: number;
  preNewsBlackoutMs: number;
  minHoldMs: number;
  eaRequestsPerDay: number;
  hftClassificationEnabled: boolean;
  weekendHoldEnabled: boolean;
};

export const FTMO_DEFAULT_LINE: FtmoLineMargins = {
  dailyLossFraction: 0.05,
  overallLossFraction: 0.1,
  newsBlackoutHalfWidthMs: 2 * 60 * 1000,
  enforceNewsBlackout: false,
  eaRequestsPerDay: 2000,
};

export const INTERNAL_DEFAULT_MARGINS: InternalMargins = {
  dailyLossFraction: 0.04,
  overallLossFraction: 0.08,
  newsBlackoutHalfWidthMs: 5 * 60 * 1000,
  preNewsBlackoutMs: 2 * 60 * 60 * 1000,
  minHoldMs: 60 * 1000,
  eaRequestsPerDay: 1800,
  hftClassificationEnabled: true,
  weekendHoldEnabled: true,
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export class FtmoSimulator {
  private breaches: FtmoBreach[] = [];
  private dayStartBalance: number;
  private dayStartTs: number;
  private eaRequestsToday = 0;
  private dailyPnl = new Map<number, number>();

  constructor(private readonly cfg: FtmoSimulatorCfg) {
    this.dayStartBalance = cfg.initialCapital;
    this.dayStartTs = 0;
  }

  setInitialDay(tsMs: number, dayStartBalance: number): void {
    this.dayStartTs = floorDay(tsMs);
    this.dayStartBalance = dayStartBalance;
  }

  onDayRollover(newDayTsMs: number, newDayStartBalance: number): void {
    this.dayStartTs = floorDay(newDayTsMs);
    this.dayStartBalance = newDayStartBalance;
    this.eaRequestsToday = 0;
  }

  onEquity(tsMs: number, equity: number): void {
    this.checkDailyLoss(tsMs, equity);
    this.checkOverallLoss(tsMs, equity);
  }

  onTradeOpen(tsMs: number, position: SimPosition): void {
    this.recordEaRequest(tsMs);
    if (this.inNewsBlackout(position.symbol, tsMs)) {
      this.push({
        kind: 'news_blackout_open',
        scope: 'internal',
        accountId: this.cfg.accountId,
        envelopeId: this.cfg.envelopeId,
        occurredAt: isoFromMs(tsMs),
        message: `entry on ${position.symbol} during ±${
          this.cfg.internalMargins.newsBlackoutHalfWidthMs / 60000
        }-min news blackout`,
        detail: { positionId: position.id, symbol: position.symbol },
      });
    }
    if (this.inPreNewsBlackout(position.symbol, tsMs)) {
      this.push({
        kind: 'news_blackout_open',
        scope: 'internal',
        accountId: this.cfg.accountId,
        envelopeId: this.cfg.envelopeId,
        occurredAt: isoFromMs(tsMs),
        message: `entry on ${position.symbol} within 2-h pre-news kill-switch`,
        detail: {
          positionId: position.id,
          symbol: position.symbol,
          window: 'pre_news_2h',
        },
      });
    }
  }

  onTradeAmend(tsMs: number, _positionId: string): void {
    this.recordEaRequest(tsMs);
  }

  onTradeClose(tsMs: number, trade: ClosedTrade): void {
    this.recordEaRequest(tsMs);
    const day = floorDay(trade.closedAt);
    this.dailyPnl.set(day, (this.dailyPnl.get(day) ?? 0) + trade.realizedPnl);

    const heldMs = trade.closedAt - trade.openedAt;
    if (heldMs < this.cfg.internalMargins.minHoldMs) {
      this.push({
        kind: 'min_hold',
        scope: 'internal',
        accountId: this.cfg.accountId,
        envelopeId: this.cfg.envelopeId,
        occurredAt: isoFromMs(trade.closedAt),
        message: `hold ${heldMs}ms < min ${this.cfg.internalMargins.minHoldMs}ms`,
        detail: { tradeId: trade.id, heldMs },
      });
    }
    if (this.inNewsBlackout(trade.symbol, trade.closedAt)) {
      this.push({
        kind: 'news_blackout_close',
        scope: 'internal',
        accountId: this.cfg.accountId,
        envelopeId: this.cfg.envelopeId,
        occurredAt: isoFromMs(trade.closedAt),
        message: `close during ±${
          this.cfg.internalMargins.newsBlackoutHalfWidthMs / 60000
        }-min blackout on ${trade.symbol}`,
        detail: { tradeId: trade.id, symbol: trade.symbol },
      });
    }
  }

  onBarClose(
    tsMs: number,
    bar: { symbol: string; high: number; low: number; tsStart: number; tsEnd: number },
    openPositions: ReadonlyArray<SimPosition>,
  ): void {
    for (const pos of openPositions) {
      if (pos.symbol !== bar.symbol) continue;
      if (this.barOverlapsBlackout(bar.symbol, bar.tsStart, bar.tsEnd)) {
        const slHit = bar.low <= pos.stopLoss && pos.stopLoss <= bar.high;
        const tpHit =
          pos.takeProfit !== undefined && bar.low <= pos.takeProfit && pos.takeProfit <= bar.high;
        if (slHit || tpHit) {
          this.push({
            kind: 'news_sl_tp_in_window',
            scope: 'internal',
            accountId: this.cfg.accountId,
            envelopeId: this.cfg.envelopeId,
            occurredAt: isoFromMs(tsMs),
            message: `SL/TP for ${pos.symbol} crossed inside news ±window bar`,
            detail: {
              positionId: pos.id,
              barTsStart: bar.tsStart,
              barTsEnd: bar.tsEnd,
              slHit,
              tpHit,
            },
          });
        }
      }
    }
  }

  checkWeekend(tsMs: number, openPositions: ReadonlyArray<SimPosition>): void {
    if (!this.cfg.internalMargins.weekendHoldEnabled) return;
    const matched = this.cfg.weekendCloseTimestampsMs.some((wt) => Math.abs(wt - tsMs) <= 60_000);
    if (!matched) return;
    for (const pos of openPositions) {
      const already = this.breaches.some(
        (b) => b.kind === 'weekend_hold' && b.detail['positionId'] === pos.id,
      );
      if (already) continue;
      this.push({
        kind: 'weekend_hold',
        scope: 'internal',
        accountId: this.cfg.accountId,
        envelopeId: this.cfg.envelopeId,
        occurredAt: isoFromMs(tsMs),
        message: `position ${pos.id} open at weekend close`,
        detail: { positionId: pos.id, symbol: pos.symbol },
      });
    }
  }

  recordEaRequest(tsMs: number): void {
    if (floorDay(tsMs) !== this.dayStartTs) {
      this.dayStartTs = floorDay(tsMs);
      this.eaRequestsToday = 0;
    }
    this.eaRequestsToday += 1;
    if (this.eaRequestsToday > this.cfg.internalMargins.eaRequestsPerDay) {
      const already = this.breaches.some(
        (b) => b.kind === 'ea_throttle_exceeded' && b.detail['day'] === this.dayStartTs,
      );
      if (!already) {
        this.push({
          kind: 'ea_throttle_exceeded',
          scope: 'internal',
          accountId: this.cfg.accountId,
          envelopeId: this.cfg.envelopeId,
          occurredAt: isoFromMs(tsMs),
          message: `EA requests today ${this.eaRequestsToday} > ${this.cfg.internalMargins.eaRequestsPerDay}`,
          detail: { day: this.dayStartTs, count: this.eaRequestsToday },
        });
      }
    }
  }

  finalize(allTrades: ReadonlyArray<ClosedTrade>): void {
    if (this.cfg.internalMargins.hftClassificationEnabled && allTrades.length > 0) {
      const subMin = allTrades.filter(
        (t) => t.closedAt - t.openedAt < this.cfg.internalMargins.minHoldMs,
      ).length;
      const share = subMin / allTrades.length;
      if (share > this.cfg.hftMinHoldShareThreshold) {
        const lastTs = allTrades.reduce((m, t) => Math.max(m, t.closedAt), 0);
        this.push({
          kind: 'hft_classification',
          scope: 'internal',
          accountId: this.cfg.accountId,
          envelopeId: this.cfg.envelopeId,
          occurredAt: isoFromMs(lastTs),
          message: `${(share * 100).toFixed(1)}% of trades held < min-hold; HFT-class risk`,
          detail: {
            subMinHoldTrades: subMin,
            totalTrades: allTrades.length,
            threshold: this.cfg.hftMinHoldShareThreshold,
          },
        });
      }
    }

    if (!this.cfg.consistencyCheckEnabled || allTrades.length < this.cfg.consistencyMinTrades) {
      return;
    }
    let totalPnl = 0;
    let maxDayPnl = 0;
    let maxDayTs = 0;
    for (const [day, pnl] of this.dailyPnl) {
      totalPnl += pnl;
      if (pnl > maxDayPnl) {
        maxDayPnl = pnl;
        maxDayTs = day;
      }
    }
    if (totalPnl > 0 && maxDayPnl > 0) {
      const share = maxDayPnl / totalPnl;
      if (share > this.cfg.consistencyMaxShare) {
        this.push({
          kind: 'consistency_violation',
          scope: 'internal',
          accountId: this.cfg.accountId,
          envelopeId: this.cfg.envelopeId,
          occurredAt: isoFromMs(maxDayTs + ONE_DAY_MS - 1),
          message: `single day P&L ${(share * 100).toFixed(1)}% of total > ${(
            this.cfg.consistencyMaxShare * 100
          ).toFixed(0)}%`,
          detail: { day: maxDayTs, dayPnl: maxDayPnl, totalPnl, share },
        });
      }
    }
  }

  getBreaches(): ReadonlyArray<FtmoBreach> {
    return this.breaches;
  }

  private checkDailyLoss(tsMs: number, equity: number): void {
    const ftmoFloor =
      this.dayStartBalance - this.cfg.ftmoMargins.dailyLossFraction * this.cfg.initialCapital;
    const internalFloor =
      this.dayStartBalance - this.cfg.internalMargins.dailyLossFraction * this.cfg.initialCapital;
    if (equity < internalFloor) {
      this.pushOnce('daily_loss', 'internal', tsMs, {
        equity,
        internalFloor,
        ftmoFloor,
        dayStartBalance: this.dayStartBalance,
      });
    }
    if (equity < ftmoFloor) {
      this.pushOnce('daily_loss', 'ftmo', tsMs, {
        equity,
        ftmoFloor,
        dayStartBalance: this.dayStartBalance,
      });
    }
  }

  private checkOverallLoss(tsMs: number, equity: number): void {
    const ftmoFloor = this.cfg.initialCapital * (1 - this.cfg.ftmoMargins.overallLossFraction);
    const internalFloor =
      this.cfg.initialCapital * (1 - this.cfg.internalMargins.overallLossFraction);
    if (equity < internalFloor) {
      this.pushOnce('overall_loss', 'internal', tsMs, {
        equity,
        internalFloor,
        ftmoFloor,
      });
    }
    if (equity < ftmoFloor) {
      this.pushOnce('overall_loss', 'ftmo', tsMs, { equity, ftmoFloor });
    }
  }

  private pushOnce(
    kind: FtmoBreach['kind'],
    scope: 'internal' | 'ftmo',
    tsMs: number,
    detail: Record<string, unknown>,
  ): void {
    if (this.breaches.some((b) => b.kind === kind && b.scope === scope)) return;
    this.push({
      kind,
      scope,
      accountId: this.cfg.accountId,
      envelopeId: this.cfg.envelopeId,
      occurredAt: isoFromMs(tsMs),
      message: `${scope} ${kind}`,
      detail,
    });
  }

  private push(b: FtmoBreach): void {
    this.breaches.push(b);
  }

  private inNewsBlackout(symbol: string, tsMs: number): boolean {
    return this.cfg.newsBlackoutWindows.some(
      (w) => w.symbols.has(symbol) && tsMs >= w.startMs && tsMs <= w.endMs,
    );
  }

  private inPreNewsBlackout(symbol: string, tsMs: number): boolean {
    return this.cfg.preNewsBlackoutWindows.some(
      (w) => w.symbols.has(symbol) && tsMs >= w.startMs && tsMs <= w.endMs,
    );
  }

  private barOverlapsBlackout(symbol: string, startMs: number, endMs: number): boolean {
    return this.cfg.newsBlackoutWindows.some(
      (w) => w.symbols.has(symbol) && !(endMs < w.startMs || startMs > w.endMs),
    );
  }
}

export function buildBlackoutWindows(
  events: ReadonlyArray<{ tsMs: number; symbols: ReadonlyArray<string>; restricted: boolean }>,
  halfWidthMs: number,
): { symbols: Set<string>; startMs: number; endMs: number }[] {
  return events
    .filter((e) => e.restricted)
    .map((e) => ({
      symbols: new Set(e.symbols),
      startMs: e.tsMs - halfWidthMs,
      endMs: e.tsMs + halfWidthMs,
    }));
}

export function buildPreNewsWindows(
  events: ReadonlyArray<{ tsMs: number; symbols: ReadonlyArray<string>; restricted: boolean }>,
  preWidthMs: number,
): { symbols: Set<string>; startMs: number; endMs: number }[] {
  return events
    .filter((e) => e.restricted)
    .map((e) => ({
      symbols: new Set(e.symbols),
      startMs: e.tsMs - preWidthMs,
      endMs: e.tsMs,
    }));
}

function floorDay(tsMs: number): number {
  return Math.floor(tsMs / ONE_DAY_MS) * ONE_DAY_MS;
}

function isoFromMs(tsMs: number): string {
  return new Date(tsMs).toISOString();
}
