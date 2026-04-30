export const ZERO = Number(false);
export const ONE = Number(true);
export const TWO = ONE + ONE;
export const THREE = TWO + ONE;
export const FOUR = TWO + TWO;
export const FIVE = FOUR + ONE;
export const TEN = FIVE + FIVE;
export const SIXTY = TEN * (FIVE + ONE);
export const HUNDRED = TEN * TEN;
export const THOUSAND = HUNDRED * TEN;
export const EPSILON = Number.EPSILON;

export function clampUnit(value: number): number {
  if (value < ZERO) return ZERO;
  if (value > ONE) return ONE;
  return value;
}

export function safeDivide(numerator: number, denominator: number): number {
  return Math.abs(denominator) <= EPSILON ? ZERO : numerator / denominator;
}
