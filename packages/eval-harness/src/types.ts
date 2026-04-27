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

export type Bar = {
  symbol: string;
  timeframe: string;
  tsStart: number;
  tsEnd: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type CalendarEvent = {
  id: string;
  timestamp: number;
  symbols: string[];
  impact: 'low' | 'medium' | 'high';
  restricted: boolean;
};

export type SymbolMeta = {
  symbol: string;
  pipSize: number;
  contractSize: number;
  typicalSpreadPips: number;
};

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
