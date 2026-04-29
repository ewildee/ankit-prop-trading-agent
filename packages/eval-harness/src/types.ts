import type {
  CostBreakdown,
  EvalMetrics,
  EvalResult,
  FoldResult,
  FtmoBreach,
  StageCost,
  StageName,
  WalkForwardFold,
  WalkForwardSummary,
} from '@ankit-prop/contracts';
// ANKA-69: Bar / SymbolMeta / CalendarEvent are owned by @ankit-prop/market-data
// so providers (cached fixtures today, cTrader live feed tomorrow) and
// consumers (this package, trader, autoresearch) all agree on the wire shape
// without re-encoding. eval-harness keeps re-exporting them under the same
// names so existing call-sites are unaffected.
import type {
  Bar as MdBar,
  CalendarEvent as MdCalendarEvent,
  SymbolMeta as MdSymbolMeta,
} from '@ankit-prop/market-data';

export type {
  CostBreakdown,
  EvalMetrics,
  EvalResult,
  FoldResult,
  FtmoBreach,
  StageCost,
  StageName,
  WalkForwardFold,
  WalkForwardSummary,
};

export type Side = 'long' | 'short';

export type Bar = MdBar;

export type CalendarEvent = MdCalendarEvent;

export type SymbolMeta = MdSymbolMeta;

export type OpenAction = {
  kind: 'open';
  side: Side;
  symbol: string;
  sizeLots: number;
  stopLoss: number;
  takeProfit?: number;
};

export type CloseAction = {
  kind: 'close';
  positionId: string;
};

export type AmendAction = {
  kind: 'amend';
  positionId: string;
  stopLoss: number;
};

export type StrategyAction = OpenAction | CloseAction | AmendAction;

export type SimContext = {
  now: number;
  equity: number;
  balance: number;
  openPositions: ReadonlyArray<SimPosition>;
  symbols: ReadonlyMap<string, SymbolMeta>;
  newsBlackoutActive: (symbol: string, t: number) => boolean;
  preNewsBlackoutActive: (symbol: string, t: number) => boolean;
};

export type SimPosition = {
  id: string;
  symbol: string;
  side: Side;
  sizeLots: number;
  openedAt: number;
  openPrice: number;
  stopLoss: number;
  takeProfit?: number;
};

export type ClosedTrade = {
  id: string;
  symbol: string;
  side: Side;
  sizeLots: number;
  openedAt: number;
  closedAt: number;
  openPrice: number;
  closePrice: number;
  realizedPnl: number;
  initialRisk: number;
  rMultiple: number;
  closeReason: 'sl' | 'tp' | 'strategy' | 'force_flat' | 'eod';
};

export interface BarStrategy {
  readonly name: string;
  onBar(bar: Bar, ctx: SimContext): StrategyAction[];
}

export type AccountConfig = {
  accountId: string;
  envelopeId: string | null;
  initialCapital: number;
  phase: 'phase_1' | 'phase_2' | 'funded';
  weekendCloseTimestamp?: number;
  forceFlatTimestamps?: number[];
};

export type SlippageModelCfg = {
  baseSpreadPipsBySymbol: Record<string, number>;
  newsSpreadMultiplier: number;
  fillLatencyMs: number;
  worstCaseSlippagePips: number;
};

export type DateRange = {
  from: string;
  to: string;
};
