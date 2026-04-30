import type { PersonaConfig, RegimeLabel } from '@ankit-prop/contracts';
import type { Bar } from '@ankit-prop/market-data';
import { clampUnit, HUNDRED, ONE, safeDivide, ZERO } from './constants.ts';
import { profileBars } from './regime-classifier.ts';

export type ConfluenceScoreInput = {
  readonly regimeLabel: RegimeLabel;
  readonly recentBars: ReadonlyArray<Bar>;
  readonly params: PersonaConfig;
};

export type ConfluenceScore = {
  readonly score: number;
  readonly confidence: number;
  readonly timeframeAgreement: number;
  readonly indicatorAlignment: number;
  readonly regimeNote: string;
};

export function scoreConfluence(input: ConfluenceScoreInput): ConfluenceScore {
  if (input.regimeLabel === 'outside_active_window' || input.regimeLabel === 'unknown') {
    return buildScore(input.regimeLabel, ZERO, ZERO, input.params);
  }

  const bars = input.recentBars.slice(-input.params.analyst.barLookback);
  const profile = profileBars(bars);
  const timeframeAgreement = clampUnit(
    safeDivide(profile.moveAtr, input.params.analyst.regime.trendMoveAtrMultiple),
  );
  const indicatorAlignment = inferIndicatorAlignment(input.regimeLabel, profile.closePosition);

  return buildScore(input.regimeLabel, timeframeAgreement, indicatorAlignment, input.params);
}

function inferIndicatorAlignment(regimeLabel: RegimeLabel, closePosition: number): number {
  if (regimeLabel === 'B_reversal') return clampUnit(ONE - Math.abs(closePosition - ONE));
  if (regimeLabel === 'B_trend_retrace') return clampUnit(ONE - closePosition);
  return clampUnit(closePosition);
}

function buildScore(
  regimeLabel: RegimeLabel,
  timeframeAgreement: number,
  indicatorAlignment: number,
  params: PersonaConfig,
): ConfluenceScore {
  const weighted =
    params.scoring.weights.timeframeAgreement * timeframeAgreement +
    params.scoring.weights.indicatorAlignment * indicatorAlignment;
  const score = clampUnit(weighted) * HUNDRED;
  const roundedScore = Math.round(score);
  return {
    score: roundedScore,
    confidence: roundedScore / HUNDRED,
    timeframeAgreement,
    indicatorAlignment,
    regimeNote: `${regimeLabel}; tf=${Math.round(timeframeAgreement * HUNDRED)} ind=${Math.round(indicatorAlignment * HUNDRED)}`,
  };
}
