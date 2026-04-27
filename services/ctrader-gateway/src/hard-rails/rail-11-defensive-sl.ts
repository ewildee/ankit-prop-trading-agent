// Rail 11 — defensive SL on every order (BLUEPRINT §9, §8.3, §8.5).
// Gateway tightens any trader-supplied SL that is looser than the envelope
// floor permits. Two constraints, both enforced; the tighter wins:
//
//   (a) per-trade cap from envelope.risk.per_trade_pct[phase]:
//         maxLossDollars = INITIAL_CAPITAL × defensiveSlMaxLossPct/100
//   (b) daily-floor headroom (§8.3):
//         maxLossDollars = max(0, equity − internalDailyFloor)
//
// Convert to a price distance via `volume × symbol.dollarsPerPricePerUnit`,
// then enforce side-correct SL placement around `entryPrice`.

import type { RailDecision } from '@ankit-prop/contracts';
import { logDecision } from './log-decision.ts';
import { isoNow, type NewOrderIntent, type RailContext, type RailIntent } from './types.ts';

export interface DefensiveSlMath {
  readonly perTradeCapDollars: number;
  readonly dailyFloorHeadroomDollars: number;
  readonly maxAllowedLossDollars: number;
  readonly requiredSlDistance: number;
  readonly internalDailyFloor: number;
}

export function computeDefensiveSlMath(intent: NewOrderIntent, ctx: RailContext): DefensiveSlMath {
  const { broker } = ctx;
  const internalDailyFloor =
    broker.dayStartBalance - broker.envelopeFloors.internalDailyFloorPct * broker.initialBalance;
  const perTradeCapDollars = broker.initialBalance * (broker.defensiveSlMaxLossPct / 100);
  const dailyFloorHeadroomDollars = Math.max(0, broker.equity - internalDailyFloor);
  const maxAllowedLossDollars = Math.min(perTradeCapDollars, dailyFloorHeadroomDollars);
  const denom = intent.volume * broker.symbol.dollarsPerPricePerUnit;
  const requiredSlDistance = denom > 0 ? maxAllowedLossDollars / denom : 0;
  return {
    perTradeCapDollars,
    dailyFloorHeadroomDollars,
    maxAllowedLossDollars,
    requiredSlDistance,
    internalDailyFloor,
  };
}

export function evaluateDefensiveSl(intent: RailIntent, ctx: RailContext): RailDecision {
  const { broker, config } = ctx;
  const decidedAt = isoNow(broker.nowMs);

  if (intent.kind !== 'NEW') {
    return logDecision(intent, ctx, {
      rail: 'defensive_sl',
      outcome: 'allow',
      reason: `${intent.kind} not subject to defensive SL`,
      detail: { intentKind: intent.kind },
      decidedAt,
    });
  }

  const math = computeDefensiveSlMath(intent, ctx);
  if (math.requiredSlDistance <= 0) {
    return logDecision(intent, ctx, {
      rail: 'defensive_sl',
      outcome: 'reject',
      reason: 'no envelope-floor headroom — cannot open new exposure',
      detail: { ...math, side: intent.side, entryPrice: intent.entryPrice },
      decidedAt,
    });
  }

  // Side-correct placement.
  const wrongSide =
    (intent.side === 'BUY' && intent.stopLossPrice >= intent.entryPrice) ||
    (intent.side === 'SELL' && intent.stopLossPrice <= intent.entryPrice);
  if (wrongSide) {
    return logDecision(intent, ctx, {
      rail: 'defensive_sl',
      outcome: 'reject',
      reason: `SL on wrong side of entry (${intent.side} entry=${intent.entryPrice} sl=${intent.stopLossPrice})`,
      detail: {
        side: intent.side,
        entryPrice: intent.entryPrice,
        stopLossPrice: intent.stopLossPrice,
      },
      decidedAt,
    });
  }

  const traderDistance = Math.abs(intent.entryPrice - intent.stopLossPrice);
  if (traderDistance <= math.requiredSlDistance + config.defensiveSlPriceTolerance) {
    return logDecision(intent, ctx, {
      rail: 'defensive_sl',
      outcome: 'allow',
      reason: `trader SL distance ${traderDistance.toFixed(5)} <= required ${math.requiredSlDistance.toFixed(5)}`,
      detail: { ...math, traderDistance },
      decidedAt,
    });
  }

  const tightenedSlPrice =
    intent.side === 'BUY'
      ? intent.entryPrice - math.requiredSlDistance
      : intent.entryPrice + math.requiredSlDistance;
  return logDecision(intent, ctx, {
    rail: 'defensive_sl',
    outcome: 'tighten',
    reason: `tightened SL ${intent.stopLossPrice.toFixed(5)} → ${tightenedSlPrice.toFixed(5)} (envelope-floor cap)`,
    detail: {
      ...math,
      traderDistance,
      side: intent.side,
      entryPrice: intent.entryPrice,
      originalSlPrice: intent.stopLossPrice,
      tightenedSlPrice,
    },
    decidedAt,
  });
}
