# SPEC — Strategy Indicator + Scoring Contracts

Status: draft-to-implement  
Owner: `pkg:contracts/strategy`  
Source: [ANKA-125](/ANKA/issues/ANKA-125), child of [ANKA-122](/ANKA/issues/ANKA-122)  
Blueprint anchors: §13.4, §13.5, §15.1, §21.6, §25.2

## Scope

This spec commits the contract surface for BLUEPRINT §13.4. It does not implement the
indicator engine, scoring engine, or Zod schemas yet.

The implementation target is:

- `packages/shared-contracts/src/strategy/scoring.ts`
- barrel exports from `packages/shared-contracts/src/index.ts`

The contract implementation should follow the existing local style:

- direct `z.strictObject(...)` exports
- same-name inferred TypeScript types
- closed `as const` enum arrays where call sites need exported option lists
- no runtime dependency beyond the existing `zod` dependency

`strategy/v_*/params.yaml` remains the autoresearch-mutable persona surface. Contract
schemas, fixtures, runtime engines, tests, gateway, eval harness, and `strategy/_shared/`
remain frozen to autoresearch per BLUEPRINT §15.1.

## Determinism

The runtime computes indicators and scoring from explicit inputs. LLM stages receive
computed values and evidence only; they must not recompute indicators or scores.

Scoring must not read wall clock time, RNG, broker state, files, network, database state,
environment variables, or LLM output. The only permitted inputs are the parsed persona
indicator/scoring config, the closed-bar market snapshot supplied by trader runtime, and
the runtime-computed indicator values for that snapshot.

Any malformed config, unknown indicator, missing required timeframe, non-finite number, or
unknown predicate field fails closed at schema or scoring time. Scoring diagnostics must
name the failed field and decision path.

## Indicator Catalogue

All indicators are computed independently per declared timeframe in
`indicators.timeframes`. A timeframe result is scoped to the latest closed bar available
for that timeframe at the decision timestamp. The scoring engine must not resample,
interpolate, or peek into incomplete bars.

Numeric outputs are finite `number` values after warm-up and `null` before enough closed
bars exist. Indicator output fields must never contain `undefined`, `NaN`, `Infinity`, or
`-Infinity`. A scoring predicate that depends on `null` evidence evaluates false and emits
a diagnostic.

### `ma`

Params:

- `periods`: non-empty array of unique positive integers

Output fields per timeframe:

```ts
{
  ma: {
    values: Record<string, number | null>; // key is the decimal period, e.g. "20"
  };
}
```

Each value is the simple moving average of close prices over the period. Before warm-up,
the period key is present with `null`.

### `macd`

Params:

- `fast`: positive integer
- `slow`: positive integer greater than `fast`
- `signal`: positive integer

Output fields per timeframe:

```ts
{
  macd: {
    line: number | null;
    signal: number | null;
    histogram: number | null;
  };
}
```

All three fields are `null` until the slow EMA and signal EMA are warmed up.

### `rsi`

Params:

- `period`: positive integer

Output fields per timeframe:

```ts
{
  rsi: {
    value: number | null; // bounded 0..100 after warm-up
  };
}
```

`value` is `null` before warm-up. After warm-up it must be finite and clamped by formula
semantics to `0 <= value <= 100`.

### `stochastic`

Params:

- `k_period`: positive integer
- `d_period`: positive integer

Output fields per timeframe:

```ts
{
  stochastic: {
    k: number | null; // bounded 0..100 after warm-up
    d: number | null; // bounded 0..100 after warm-up
  };
}
```

`k` warms up from the high/low range over `k_period`; `d` warms up from the smoothing
period over `k`. Before warm-up, both fields are present and `null` as appropriate.

### `atr`

Params:

- `period`: positive integer

Output fields per timeframe:

```ts
{
  atr: {
    value: number | null;
  };
}
```

`value` is average true range in instrument price units. It is `null` before warm-up and
finite non-negative after warm-up.

## Common Scoring Input

The scoring contract should accept one parsed scoring config and one deterministic market
state:

```ts
type StrategyScoringInput = {
  strategyVersion: string;
  evaluatedAt: string; // explicit ISO string carried as data, not read from clock
  timeframes: Record<
    string,
    {
      bar: {
        open: number;
        high: number;
        low: number;
        close: number;
      };
      indicators: IndicatorFrameValues;
    }
  >;
  scoring: StrategyScoringConfig;
};
```

All timeframe keys must be a subset of the persona-declared `indicators.timeframes`.
Missing configured timeframes fail closed unless a later implementation deliberately adds
an explicit optional-timeframe flag.

## Scoring Output

Every scoring scheme returns the same top-level evidence envelope:

```ts
type StrategyScoringOutput = {
  scheme: 'v1_continuous_confluence' | 'v2_discrete_buckets';
  direction: 'long' | 'short' | 'neutral';
  score: number; // 0..100 for v1, normalized 0..100 for v2 evidence display
  rawScore: number; // v1 score or v2 weighted bucket points
  threshold: number; // v1 threshold or v2 minScore
  passed: boolean;
  timeframes: Record<string, TimeframeScoreEvidence>;
  components: ScoreComponentEvidence[];
  buckets: BucketEvidence[];
  diagnostics: ScoreDiagnostic[];
  inputHash: string;
};
```

Rules:

- `passed` is true only when `direction` is `long` or `short` and the scheme gate passes.
- `direction: neutral` always implies `passed: false`.
- `score` must be deterministic for the same canonical input.
- `diagnostics` is an ordered array sorted by timeframe, component, then field path.
- `inputHash` is `sha256` over canonical JSON containing the scoring config, sorted
  timeframe bars, sorted indicator values, and scheme version. Canonical JSON means stable
  object key ordering and no insignificant whitespace.

## `v1_continuous_confluence`

Default for `v_ankit_classic`.

Config:

```yaml
scoring:
  scheme: v1_continuous_confluence
  threshold: 50
  weights:
    timeframeAgreement: 0.7
    indicatorAlignment: 0.3
  timeframeWeights: { "1d": 4, "4h": 3, "1h": 2, "5m": 1 }
```

Validation:

- `threshold`: finite number in `0..100`
- `weights.timeframeAgreement`: finite non-negative number
- `weights.indicatorAlignment`: finite non-negative number
- at least one scoring weight is greater than zero
- `timeframeWeights`: positive finite weights for every configured timeframe

Normalize `timeframeWeights` by dividing each weight by the sum. For the default
`v_ankit_classic` weights, normalized weights are:

| Timeframe | Raw | Normalized |
|-----------|-----|------------|
| `1d` | 4 | 0.4 |
| `4h` | 3 | 0.3 |
| `1h` | 2 | 0.2 |
| `5m` | 1 | 0.1 |

For each candidate direction (`long`, `short`), compute:

```text
timeframeAgreementPct = 100 * weightedSum(directionVoteMatches)
indicatorAlignmentPct = 100 * weightedSum(indicatorBundleMatches)
score = round4(
  normalizedScoreWeight.timeframeAgreement * timeframeAgreementPct +
  normalizedScoreWeight.indicatorAlignment * indicatorAlignmentPct
)
```

`normalizedScoreWeight.*` is the corresponding scoring weight divided by the sum of
scoring weights.

### Direction Vote

The v1 directional vote for a timeframe is derived from close and MA structure:

- `long`: `close > ma.values["20"]` and `ma.values["20"] > ma.values["50"]`
- `short`: `close < ma.values["20"]` and `ma.values["20"] < ma.values["50"]`
- `neutral`: any tie, equality, missing MA key, or `null` MA value

A neutral vote contributes zero to both `long` and `short` agreement and records a
diagnostic when caused by missing/null indicator evidence.

### Indicator Bundle

For `long`, a timeframe indicator bundle matches only when all are true:

- `macd.histogram > 0`
- `rsi.value > 50`
- `stochastic.k > 50`

For `short`, the mirror matches only when all are true:

- `macd.histogram < 0`
- `rsi.value < 50`
- `stochastic.k < 50`

Equality is neutral and does not match either side. Missing/null/non-finite evidence fails
the bundle and records diagnostics. `atr` is computed and surfaced to the LLM, but v1 does
not include ATR in the default score formula.

### Direction Selection

Compute long and short scores independently.

- If both scores are below `threshold`, return `direction: neutral`, `passed: false`, and
  `score: max(longScore, shortScore)`.
- If exactly one score is greater than or equal to `threshold`, return that direction.
- If both pass, return the higher score's direction.
- If both pass with equal scores, return `direction: neutral`, `passed: false`, and a
  `tie` diagnostic.

### Worked Example

Given default `v_ankit_classic` weights:

| Timeframe | Vote | Bundle | Normalized weight |
|-----------|------|--------|-------------------|
| `1d` | long | false | 0.4 |
| `4h` | long | true | 0.3 |
| `1h` | long | true | 0.2 |
| `5m` | short | false | 0.1 |

Long calculation:

```text
timeframeAgreementPct = 100 * (0.4 + 0.3 + 0.2) = 90
indicatorAlignmentPct = 100 * (0.3 + 0.2) = 50
score = 0.7 * 90 + 0.3 * 50 = 78
```

With threshold `50`, output is `direction: long`, `score: 78`, `passed: true`.

## `v2_discrete_buckets`

The v2 contract must not evaluate arbitrary executable strings. Human-friendly string
predicates may be accepted only as source syntax that is parsed into the bounded predicate
AST below before evaluation. The persisted contract form is the AST.

Config:

```ts
type V2DiscreteBucketsConfig = {
  scheme: 'v2_discrete_buckets';
  buckets: Array<{
    name: string;
    weight: number;
    appliesTo: 'long' | 'short' | 'both';
    predicate: PredicateNode;
  }>;
  minScore: number;
};
```

`weight` must be finite and positive. `minScore` is finite and non-negative. Bucket names
are unique within the scheme.

### Predicate AST

Allowed nodes:

```ts
type PredicateNode =
  | {
      kind: 'comparison';
      left: Operand;
      op: '>' | '>=' | '<' | '<=' | '==' | '!=';
      right: Operand;
    }
  | { kind: 'all'; nodes: PredicateNode[] }
  | { kind: 'any'; nodes: PredicateNode[] }
  | { kind: 'not'; node: PredicateNode }
  | { kind: 'exists'; operand: Operand };

type Operand =
  | { kind: 'field'; path: string[] }
  | { kind: 'number'; value: number };
```

Allowed field roots:

- `bar.open`, `bar.high`, `bar.low`, `bar.close`
- `ma.values.<period>`
- `macd.line`, `macd.signal`, `macd.histogram`
- `rsi.value`
- `stochastic.k`, `stochastic.d`
- `atr.value`

String source examples such as `price > MA20 AND price > MA50` must be normalized to AST
using a limited grammar:

- `AND`, `OR`, `NOT`, and parentheses
- comparison operators listed above
- numeric literals
- field aliases mapped to allowed paths, e.g. `price -> bar.close`,
  `MA20 -> ma.values.20`, `stoch.k -> stochastic.k`

Unknown fields, unsupported operators, function calls, property wildcards, array access,
regex, arithmetic, ternaries, assignments, or imports are invalid and must fail closed
before evaluation.

### Gate Semantics

Evaluate buckets separately for `long` and `short`.

- A bucket applies when `appliesTo` is the candidate direction or `both`.
- A true predicate contributes `bucket.weight` to `rawScore`.
- A false predicate contributes zero and still appears in bucket evidence.
- Unknown field, null evidence, or unsupported operand makes that bucket false and records
  a diagnostic.
- Candidate direction passes when `rawScore >= minScore`.
- `score` is normalized for display as `100 * rawScore / sum(applicable weights)`, capped
  at `100`, with `0` when no buckets apply.

Direction selection follows the v1 tie rules using `rawScore` first and normalized `score`
as a display value.

## Fixture Corpus For Eval Replay

Eval-harness replay fixtures should be line-oriented JSON records so fixed strategies can
assert identical scoring output over time:

```json
{
  "schemaVersion": 1,
  "fixtureId": "v_ankit_classic-trend-retrace-long-001",
  "strategyVersion": "v_ankit_classic",
  "scoringConfig": {},
  "bars": {
    "1d": [{ "time": "2026-04-27T00:00:00Z", "open": 0, "high": 0, "low": 0, "close": 0 }],
    "4h": [],
    "1h": [],
    "5m": []
  },
  "expected": {
    "inputHash": "sha256:...",
    "scheme": "v1_continuous_confluence",
    "direction": "long",
    "score": 78,
    "passed": true,
    "components": [],
    "diagnostics": []
  }
}
```

The implementation may store fixture corpora under eval-harness, trader, or shared
contract tests, but replay must compare the complete scoring output envelope except for
fields explicitly marked diagnostic-order-insensitive by the eventual test helper.

## Behavioural Anchor Verification Seed

These seed expectations map BLUEPRINT §13.5 rows to scoring evidence. They do not replace
the later integration tests required by §21.6.

| Setup | Persona | Expected scoring evidence |
|-------|---------|---------------------------|
| Clean pre-session range + decisive 14:30 break (NAS100) | `v_session_break` | v2 bucket fixture passes a session-break bucket set; direction matches break direction; no arbitrary string predicate evaluation. |
| Clean pre-session range + decisive 14:30 break (XAUUSD) | `v_ankit_classic` | v1 score passes in the break direction with multi-timeframe agreement evidence; output label can feed `A_session_break`. |
| 1h bullish trend + 5-min retrace to MA20 (XAUUSD) | `v_ankit_classic` | v1 long score passes; 1h vote is long, 5m pullback evidence does not create a short tie; expected downstream action BUY. |
| 1h consolidation + sustained break (XAUUSD) | `v_ankit_classic` | v2 or future persona-specific bucket evidence may pass consolidation-break predicates; unknown fields fail closed. |
| 1h RSI > 80 + bearish divergence + bearish engulfing (5m) | `v_ankit_classic` | short-side evidence passes only if configured reversal buckets or mirrored v1 evidence support it; equality/neutral readings do not pass. |
| Macro bias `short@0.8` + 5-min trend retrace long (XAUUSD) | `v_ankit_classic` | scoring may pass long, but fixture must preserve evidence so judge can emit `macro_bias_violation`; scoring itself does not read macro bias unless provided as a future explicit input. |
| FOMC ±5 min (any) | both | scoring output remains deterministic from bars; judge/gateway calendar rejection is asserted separately with scoring evidence attached. |
| FOMC scheduled in 6 min (any) | both | scoring output remains deterministic from bars; gateway force-close/reject expectations are separate hard-rail fixtures. |

## Open Implementation Notes

- Runtime code should reject configs that omit indicators required by the selected scheme,
  e.g. v1 without `ma`, `macd`, `rsi`, or `stochastic`.
- The initial implementation should prefer explicit AST configs for v2. String predicate
  parsing can be a later compatibility layer if needed.
- Any future indicator added by autoresearch must first be registered in the contract
  catalogue with params, output fields, nullability, and replay fixtures.
