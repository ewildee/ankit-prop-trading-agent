export type RealizedPnlPoint = {
  readonly closedAt: string;
  readonly realizedPnl: number;
};

export type SortinoSummary = {
  readonly rollingWindowDays: number;
  readonly riskFreeReturn: number;
  readonly sampleCount: number;
  readonly downsideSampleCount: number;
  readonly sortinoRolling60d: number;
};

const ROLLING_WINDOW_DAYS = 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const ZERO_RETURN = 0;

export function computeSortinoRolling60d(
  points: ReadonlyArray<RealizedPnlPoint>,
  options: { readonly riskFreeReturn?: number; readonly asOf?: string } = {},
): SortinoSummary {
  const riskFreeReturn = options.riskFreeReturn ?? ZERO_RETURN;
  const ordered = [...points]
    .filter((point) => Number.isFinite(point.realizedPnl))
    .sort((a, b) => Date.parse(a.closedAt) - Date.parse(b.closedAt));
  const asOfMs = options.asOf
    ? Date.parse(options.asOf)
    : Date.parse(ordered.at(-1)?.closedAt ?? new Date(0).toISOString());
  const cutoffMs = asOfMs - ROLLING_WINDOW_DAYS * MS_PER_DAY;
  const windowed = ordered.filter((point) => {
    const closedAtMs = Date.parse(point.closedAt);
    return closedAtMs > cutoffMs && closedAtMs <= asOfMs;
  });

  if (windowed.length === 0) {
    return {
      rollingWindowDays: ROLLING_WINDOW_DAYS,
      riskFreeReturn,
      sampleCount: 0,
      downsideSampleCount: 0,
      sortinoRolling60d: ZERO_RETURN,
    };
  }

  const returns = windowed.map((point) => point.realizedPnl);
  const excessReturns = returns.map((value) => value - riskFreeReturn);
  const meanExcessReturn =
    excessReturns.reduce((sum, value) => sum + value, ZERO_RETURN) / excessReturns.length;
  const downsideReturns = excessReturns.filter((value) => value < ZERO_RETURN);
  if (downsideReturns.length === 0) {
    return {
      rollingWindowDays: ROLLING_WINDOW_DAYS,
      riskFreeReturn,
      sampleCount: windowed.length,
      downsideSampleCount: 0,
      sortinoRolling60d: Math.max(meanExcessReturn, ZERO_RETURN),
    };
  }

  const downsideDeviation = Math.sqrt(
    downsideReturns.reduce((sum, value) => sum + value ** 2, ZERO_RETURN) / downsideReturns.length,
  );
  return {
    rollingWindowDays: ROLLING_WINDOW_DAYS,
    riskFreeReturn,
    sampleCount: windowed.length,
    downsideSampleCount: downsideReturns.length,
    sortinoRolling60d:
      downsideDeviation === ZERO_RETURN ? ZERO_RETURN : meanExcessReturn / downsideDeviation,
  };
}
